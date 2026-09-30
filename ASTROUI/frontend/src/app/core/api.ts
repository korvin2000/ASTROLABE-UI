import { Injectable } from '@angular/core';
import { ApiError, ErrorInfo } from './model';

/** An error answered by the Studio: a code of the catalog, parameters for its sentence and the raw reason. */
export class StudioError extends Error {
  constructor(public readonly status: number, public readonly error: ApiError) {
    super(error.message);
  }
  get code(): string { return this.error.code; }
  get info(): ErrorInfo { return { code: this.error.code, params: this.error.params ?? {}, detail: this.error.detail ?? this.error.message, retryable: this.error.retryable }; }
}

/** The error of any failure as the message catalog needs it; an unknown failure is `agent_error` with its text. */
export function errorInfo(e: unknown): ErrorInfo {
  if (e instanceof StudioError) return e.info;
  return { code: 'agent_error', params: {}, detail: e instanceof Error ? e.message : String(e) };
}

function cookie(name: string): string | null {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

let counter = 0;

/** A command id per user intent (the idempotency key of §27.5). */
export function commandId(): string {
  const r = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return `c-${r}-${++counter}`;
}

/**
 * REST client (§28). Mutations carry the double-submit CSRF header (§30.1). Bodies are JSON; errors throw
 * [StudioError] with the harness or SDK message verbatim.
 */
@Injectable({ providedIn: 'root' })
export class Api {
  readonly base = '/api/v1';

  async get<T = any>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T = any>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async put<T = any>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  async delete<T = any>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  async text(path: string): Promise<string> {
    const res = await fetch(this.base + path, { credentials: 'same-origin' });
    if (!res.ok) throw await this.error(res);
    return res.text();
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET') {
      const csrf = cookie('studio_csrf');
      if (csrf) headers['X-Studio-CSRF'] = csrf;
    }
    let res: Response;
    try {
      res = await fetch(this.base + path, { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (e) {
      throw new StudioError(0, { code: 'connection_lost', message: 'The backend is not reachable.' });
    }
    if (!res.ok) throw await this.error(res);
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  private async error(res: Response): Promise<StudioError> {
    let err: ApiError = { code: 'internal', message: `${res.status} ${res.statusText}` };
    try {
      const j = await res.json();
      if (j && typeof j === 'object' && 'code' in j) err = j as ApiError;
      else if (j && j.detail) err = { code: 'internal', message: j.detail };
    } catch { /* keep the status line */ }
    return new StudioError(res.status, err);
  }

  /** `POST /commands` fallback (the same dispatcher as WebSocket `cmd`). */
  async command<T = any>(name: string, args: unknown, target: Record<string, unknown> = {}, expected: Record<string, unknown> = {}, confirm = false, id = commandId()): Promise<T> {
    const res = await this.post<{ status: string; result: T }>('/commands', { v: 1, t: 'cmd', id, name, target, expected, confirm, args });
    if (res.status !== 'succeeded') throw new StudioError(409, { code: res.status || 'agent_error', message: 'command ' + res.status });
    return res.result;
  }
}
