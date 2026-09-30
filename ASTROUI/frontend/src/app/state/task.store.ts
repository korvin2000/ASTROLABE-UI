import { Injectable, OnDestroy, computed, effect, inject, signal, untracked } from '@angular/core';
import { Api, errorInfo } from '../core/api';
import { ErrorInfo, OutputEntry, Progress, StudioItem, Task, TaskChanges } from '../core/model';
import { StudioSocket } from '../core/ws';
import { FlowModel } from '../features/panel/flow/flow-model';
import { I18n, Text } from '../i18n/i18n';
import { Timeline } from '../timeline/timeline';
import { AppStore } from './app.store';

/** Seconds without an event after which the status line says so, and after which the user is asked (section 7.7). */
export const QUIET_AFTER_S = 90;
export const ASK_AFTER_S = 300;
export const START_TIMEOUT_S = 30;

/**
 * One open task (Studio 2 section 13): its runs, the timeline and the Flow model built from their events, and the
 * data of the side panel. History is replayed without motion; what arrives afterwards is live.
 */
@Injectable()
export class TaskStore implements OnDestroy {
  private readonly api = inject(Api);
  private readonly socket = inject(StudioSocket);
  private readonly app = inject(AppStore);
  private readonly i18n = inject(I18n);

  readonly taskId = signal<string | null>(null);
  readonly task = signal<Task | null>(null);
  readonly loading = signal(false);
  readonly failure = signal<ErrorInfo | null>(null);
  readonly changes = signal<TaskChanges | null>(null);
  readonly progress = signal<Progress | null>(null);
  readonly output = signal<OutputEntry[]>([]);
  /** Bumped when the timeline or the Flow model changed; they are mutable and read through this signal. */
  readonly version = signal(0);
  /** The clock of the task view: one tick per second while the task works. */
  readonly now = signal(Date.now());
  /** The user chose "Keep waiting" at this time. */
  readonly keptWaitingAt = signal(0);

  timeline = new Timeline();
  flow = new FlowModel();

  private unsubscribe: (() => void)[] = [];
  private subscribed = new Set<string>();
  private clock: ReturnType<typeof setInterval> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private lastRefresh = 0;
  private generation = 0;

  /** The state the server reports; a card that waits in the conversation says "Needs you" before the server does. */
  readonly state = computed(() => {
    this.version();
    const state = this.task()?.state ?? this.timeline.state;
    return state === 'working' && this.timeline.pending().length ? 'needs_you' : state;
  });
  readonly working = computed(() => this.state() === 'working' || this.state() === 'needs_you');

  /** The status line above the composer: what the agent does now and for how long. */
  readonly status = computed<{ text: Text; seconds: number } | null>(() => {
    this.version();
    if (this.state() !== 'working') return null;
    const now = this.now();
    const quiet = this.quietSeconds();
    if (quiet >= QUIET_AFTER_S) return { text: { key: 'now.still_working', params: { minutes: Math.max(1, Math.round(quiet / 60)) } }, seconds: Math.floor(quiet) };
    const s = this.timeline.status;
    if (!s) return { text: { key: 'now.working' }, seconds: 0 };
    return { text: s.text, seconds: Math.max(0, Math.floor((now - s.since) / 1000)) };
  });

  readonly quietSeconds = computed(() => {
    this.version();
    const last = this.timeline.lastEventAt;
    return last ? Math.max(0, (this.now() - last) / 1000) : 0;
  });

  /** After five quiet minutes the user is offered "Keep waiting" and "Stop". */
  readonly askToWait = computed(() => this.state() === 'working' && this.quietSeconds() >= ASK_AFTER_S && this.now() - this.keptWaitingAt() > ASK_AFTER_S * 1000);

  /** E-15: the start was not acknowledged within 30 seconds. */
  readonly startTimedOut = computed(() => {
    this.version();
    return this.state() === 'working' && !this.timeline.acknowledged && this.timeline.requestedAt > 0 && this.now() - this.timeline.requestedAt > START_TIMEOUT_S * 1000;
  });

  constructor() {
    // The task list is kept current by the `app` topic; the open task follows it and picks up new runs.
    effect(() => {
      const id = this.taskId();
      const listed = this.app.tasks().find(t => t.id === id);
      if (!id || !listed) return;
      untracked(() => this.onListed(listed));
    });
    effect(() => {
      if (this.socket.reconnects() > 0) untracked(() => void this.refreshTask());
    });
  }

  /**
   * The server knows an end that no event told: a run that was cut off by a restart is paused with its reason.
   * The conversation and the Flow hear it as if the event had come.
   */
  private reconcile(task: Task): void {
    const ended = task.state === 'paused' || task.state === 'failed' || task.state === 'stopped';
    const open = this.timeline.state === 'working' || this.timeline.state === 'needs_you';
    if (!ended || !open) return;
    const item: StudioItem = { at: task.updatedAt || new Date().toISOString(), source: 'studio', kind: 'studio.task_state', ids: { work: task.lastRun ?? '' }, data: { state: task.state, reason: task.reason ?? null } };
    this.timeline.apply(item);
    this.flow.apply(item, false);
  }

  async open(taskId: string): Promise<void> {
    this.close();
    const generation = ++this.generation;
    this.taskId.set(taskId);
    this.loading.set(true);
    this.failure.set(null);
    try {
      const [task, runs] = await Promise.all([
        this.api.get<Task>('/tasks/' + encodeURIComponent(taskId)),
        this.api.get<{ workId: string; items: StudioItem[]; head: number }[]>('/tasks/' + encodeURIComponent(taskId) + '/events'),
      ]);
      if (generation !== this.generation) return;
      this.task.set(task);
      this.showModel(task);
      for (const run of runs) {
        for (const item of run.items) this.apply(item, false);
        this.follow(run.workId, run.head);
      }
      for (const run of task.runs ?? []) this.follow(run.workId, 0);
      this.reconcile(task);
      this.bump();
      this.startClock();
      void this.refreshPanel(true);
    } catch (e) {
      if (generation === this.generation) this.failure.set(errorInfo(e));
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }

  close(): void {
    this.generation++;
    this.unsubscribe.forEach(u => u());
    this.unsubscribe = [];
    this.subscribed.clear();
    if (this.clock) clearInterval(this.clock);
    this.clock = null;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    this.timeline = new Timeline();
    this.flow = new FlowModel();
    this.task.set(null);
    this.taskId.set(null);
    this.changes.set(null);
    this.progress.set(null);
    this.output.set([]);
    this.keptWaitingAt.set(0);
    this.bump();
  }

  ngOnDestroy(): void { this.close(); }

  /** The Model node names the model as the picker does, with the effort in the user's language. */
  private showModel(task: Task): void {
    const known = this.app.models().find(m => m.ref === task.model.ref);
    const effort = task.model.effort && (!known || known.efforts.includes(task.model.effort)) ? this.i18n.t('effort.' + task.model.effort) : null;
    this.flow.setModel(known?.name ?? task.model.name, effort);
  }

  private follow(workId: string, sinceSeq: number): void {
    if (this.subscribed.has(workId)) return;
    this.subscribed.add(workId);
    const generation = this.generation;
    this.unsubscribe.push(this.socket.subscribe('campaign:' + workId, item => {
      if (generation !== this.generation) return;
      this.apply(item as StudioItem, true);
      this.bump();
      this.onLive(item as StudioItem);
    }, sinceSeq));
  }

  private apply(item: StudioItem, live: boolean): void {
    if (item.ephemeral) {
      // Progress of a model call is not recorded; it only keeps the picture alive.
      this.flow.apply({ ...item, seq: undefined }, live);
      this.timeline.lastEventAt = Math.max(this.timeline.lastEventAt, Date.parse(item.at) || 0);
      return;
    }
    // Both models ignore what they have seen, so each gets its own copy of the sequence number to judge.
    this.timeline.apply(item);
    this.flow.apply(item, live);
  }

  private bump(): void { this.version.update(v => v + 1); }

  private startClock(): void {
    if (this.clock) return;
    this.clock = setInterval(() => {
      if (this.working() || this.timeline.status) this.now.set(Date.now());
    }, 1000);
  }

  private onListed(listed: Task): void {
    // While the history loads, nothing is followed: what arrives live would come before what was earlier.
    if (this.loading()) return;
    const current = this.task();
    const changed = !current || current.state !== listed.state || current.lastRun !== listed.lastRun || current.pending.length !== listed.pending.length || current.title !== listed.title;
    if (current) this.task.set({ ...current, ...listed, runs: current.runs, changes: current.changes, usage: current.usage, skipped: current.skipped });
    if (listed.lastRun) this.follow(listed.lastRun, 0);
    if (changed) void this.refreshTask();
  }

  async refreshTask(): Promise<void> {
    const id = this.taskId();
    if (!id) return;
    const generation = this.generation;
    try {
      const task = await this.api.get<Task>('/tasks/' + encodeURIComponent(id));
      if (generation !== this.generation) return;
      this.task.set(task);
      this.showModel(task);
      if (task.changes) this.flow.setChanged(task.changes.files);
      for (const run of task.runs ?? []) this.follow(run.workId, 0);
      this.reconcile(task);
      this.bump();
    } catch { /* the list keeps the task current; a failed refresh is tried again with the next event */ }
  }

  /** What an event means for the side panel; refreshed at most once per second (section 8.1). */
  private onLive(item: StudioItem): void {
    const kind = item.kind;
    const ended = kind === 'studio.run_ended' || kind === 'studio.task_state' || kind === 'studio.error';
    if (ended) {
      void this.refreshTask();
      void this.refreshPanel(true);
      return;
    }
    if (kind === 'journal.result' || kind === 'journal.edit-outcome' || kind === 'cell.register_patched' || kind === 'journal.check' || kind === 'studio.policy_decision') {
      void this.refreshPanel(false);
    }
  }

  async refreshPanel(force: boolean): Promise<void> {
    const id = this.taskId();
    if (!id) return;
    const wait = 1000 - (Date.now() - this.lastRefresh);
    if (!force && wait > 0) {
      if (!this.refreshTimer) this.refreshTimer = setTimeout(() => { this.refreshTimer = null; void this.refreshPanel(true); }, wait);
      return;
    }
    this.lastRefresh = Date.now();
    const generation = this.generation;
    const path = '/tasks/' + encodeURIComponent(id);
    const [changes, progress, output] = await Promise.all([
      this.api.get<TaskChanges>(path + '/changes').catch(() => null),
      this.api.get<Progress>(path + '/progress').catch(() => null),
      this.api.get<OutputEntry[]>(path + '/output').catch(() => null),
    ]);
    if (generation !== this.generation) return;
    if (changes) this.changes.set(changes);
    if (progress) {
      this.progress.set(progress);
      const last = [...progress.checks].reverse().find(c => c.acceptance) ?? progress.checks[progress.checks.length - 1];
      if (last) this.flow.setChecks(last.passed, last.failed);
    }
    if (output) this.output.set(output);
    this.bump();
  }

  keepWaiting(): void { this.keptWaitingAt.set(Date.now()); }
}
