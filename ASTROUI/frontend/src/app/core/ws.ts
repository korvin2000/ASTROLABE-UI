import { Injectable, NgZone, inject, signal } from '@angular/core';
import { Api, StudioError, commandId } from './api';
import { AppItem, StudioItem } from './model';

export type ConnectionState = 'connecting' | 'open' | 'reconnecting' | 'offline';

type Handler = (item: StudioItem | AppItem, replay: boolean) => void;

/** A command without a terminal result after this long is reported as failed; it is never sent again by itself. */
export const COMMAND_TIMEOUT_MS = 30_000;

interface Topic {
  handlers: Set<Handler>;
  cursor: number;
  subscribed: boolean;
}

interface PendingCommand { resolve: (v: any) => void; reject: (e: unknown) => void; timer: ReturnType<typeof setTimeout>; }

/**
 * ASTRO-WS/1 client (§27): one socket per tab, `hello` with resume cursors, per-topic de-duplication by `seq`
 * (at-least-once delivery), heartbeat, jittered exponential reconnect (0.5 s → 15 s), commands with idempotent ids and a
 * REST fallback while disconnected. Components never open their own sockets (§32.1).
 */
@Injectable({ providedIn: 'root' })
export class StudioSocket {
  private readonly api = inject(Api);
  private readonly zone = inject(NgZone);
  private socket: WebSocket | null = null;
  private readonly topics = new Map<string, Topic>();
  private readonly pending = new Map<string, PendingCommand>();
  private backoff = 500;
  private heartbeat: any = null;
  private lastMessage = 0;
  private stopped = false;

  readonly state = signal<ConnectionState>('connecting');
  readonly epoch = signal<string | null>(null);
  readonly lastSync = signal<number>(Date.now());
  /** Counts the times the connection came back; what was loaded before may be out of date then. */
  readonly reconnects = signal(0);
  private wasOpen = false;

  connect(): void {
    this.stopped = false;
    this.open();
  }

  private url(): string {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/api/v1/ws`;
  }

  private open(): void {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) return;
    const ws = new WebSocket(this.url());
    this.socket = ws;
    ws.onopen = () => {
      this.backoff = 500;
      this.lastMessage = Date.now();
      const resume = [...this.topics.entries()].filter(([, t]) => t.handlers.size > 0).map(([topic, t]) => ({ topic, sinceSeq: t.cursor }));
      this.topics.forEach(t => (t.subscribed = t.handlers.size > 0));
      this.send({ v: 1, t: 'hello', data: { clientId: 'web', protocols: [1], resume } });
      this.state.set('open');
      this.lastSync.set(Date.now());
      if (this.wasOpen) this.reconnects.update(n => n + 1);
      this.wasOpen = true;
      this.startHeartbeat();
    };
    ws.onmessage = (ev) => {
      this.lastMessage = Date.now();
      let frame: any;
      try { frame = JSON.parse(ev.data); } catch { return; }
      this.onFrame(frame);
    };
    ws.onclose = () => this.onClosed();
    ws.onerror = () => { /* onclose follows */ };
  }

  private onClosed(): void {
    this.stopHeartbeat();
    this.socket = null;
    this.topics.forEach(t => (t.subscribed = false));
    // A command whose answer can no longer arrive is rejected, so no caller waits forever.
    this.pending.forEach(p => { clearTimeout(p.timer); p.reject(new StudioError(0, { code: 'connection_lost', message: 'The connection closed before the command was answered.' })); });
    this.pending.clear();
    if (this.stopped) return;
    this.state.set(this.state() === 'connecting' ? 'offline' : 'reconnecting');
    const delay = Math.min(15000, this.backoff) * (0.7 + Math.random() * 0.6);
    this.backoff = Math.min(15000, this.backoff * 2);
    setTimeout(() => this.open(), delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      if (Date.now() - this.lastMessage > 45000) {
        this.socket?.close();
        return;
      }
      this.send({ v: 1, t: 'ping' });
    }, 15000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private send(frame: unknown): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(frame));
    return true;
  }

  private onFrame(f: any): void {
    switch (f.t) {
      case 'welcome':
        if (this.epoch() && f.data?.epoch && this.epoch() !== f.data.epoch) {
          // A new backend epoch: campaign cursors stay valid (durable log); app items restart.
          const app = this.topics.get('app');
          if (app) app.cursor = 0;
        }
        this.epoch.set(f.data?.epoch ?? null);
        break;
      case 'subbed':
        this.lastSync.set(Date.now());
        break;
      case 'evt': {
        const topic = this.topics.get(f.topic);
        if (!topic) return;
        const item = f.data;
        const seq: number | undefined = typeof f.seq === 'number' ? f.seq : item?.seq;
        if (typeof seq === 'number') {
          if (seq <= topic.cursor) return; // de-duplicate (at-least-once, §27.7)
          topic.cursor = seq;
        }
        topic.handlers.forEach(h => h(item, false));
        break;
      }
      case 'result': {
        const p = this.pending.get(f.id);
        if (!p) return;
        const d = f.data ?? {};
        if (d.status === 'succeeded') { this.settle(f.id); p.resolve(d.result); }
        else if (d.status === 'rejected' || d.status === 'unknown') { this.settle(f.id); p.reject(new StudioError(409, d.error ?? { code: d.status, message: 'command ' + d.status })); }
        break;
      }
      case 'err': {
        const p = f.id ? this.pending.get(f.id) : undefined;
        if (p) { this.settle(f.id); p.reject(new StudioError(400, f.data)); }
        break;
      }
      case 'resync':
        this.topics.get(f.topic)?.handlers.forEach(h => h({ kind: 'studio.resync', data: f.data, source: 'studio', at: new Date().toISOString(), ids: { work: '' } }, false));
        break;
    }
  }

  /**
   * Subscribes [handler] to [topic] from [sinceSeq]; returns an unsubscribe function. A topic is subscribed on the
   * wire once; later handlers receive new items only.
   */
  subscribe(topic: string, handler: Handler, sinceSeq = 0): () => void {
    let t = this.topics.get(topic);
    if (!t) {
      t = { handlers: new Set(), cursor: sinceSeq, subscribed: false };
      this.topics.set(topic, t);
    }
    t.handlers.add(handler);
    if (!t.subscribed && this.send({ v: 1, t: 'sub', id: 'sub-' + topic, topic, sinceSeq: t.cursor })) t.subscribed = true;
    return () => {
      const cur = this.topics.get(topic);
      if (!cur) return;
      cur.handlers.delete(handler);
      if (cur.handlers.size === 0) {
        this.send({ v: 1, t: 'unsub', topic });
        this.topics.delete(topic);
      }
    };
  }

  cursor(topic: string): number { return this.topics.get(topic)?.cursor ?? 0; }

  private settle(id: string): void {
    const p = this.pending.get(id);
    if (p) clearTimeout(p.timer);
    this.pending.delete(id);
  }

  /**
   * A command (§27.5) over the socket when open, else over REST with the same idempotency key; the promise settles on
   * the terminal status. Never re-sent automatically after an uncertain outcome.
   */
  command<T = any>(name: string, args: unknown, target: Record<string, unknown> = {}, expected: Record<string, unknown> = {}, confirm = false): Promise<T> {
    const id = commandId();
    const frame = { v: 1, t: 'cmd', id, name, target, expected, confirm, args };
    if (this.state() === 'open' && this.socket?.readyState === WebSocket.OPEN) {
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new StudioError(0, { code: 'command_timeout', message: 'The command was not answered in time.' }));
        }, COMMAND_TIMEOUT_MS);
        this.pending.set(id, { resolve, reject, timer });
        if (!this.send(frame)) {
          this.settle(id);
          this.api.command<T>(name, args, target, expected, confirm, id).then(resolve, reject);
        }
      });
    }
    return this.api.command<T>(name, args, target, expected, confirm, id);
  }
}

export type { StudioItem, AppItem };
