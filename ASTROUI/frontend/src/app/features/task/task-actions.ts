import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Api, errorInfo } from '../../core/api';
import { Approach, Card, Effort, ErrorInfo, Limits, Mode, Task } from '../../core/model';
import { AppStore } from '../../state/app.store';
import { TaskStore } from '../../state/task.store';
import { AcceptanceDecision, ReviewDecision, acceptanceBody, reviewBody } from './acceptance';

export type PanelTab = 'changes' | 'progress' | 'output';

/** What the task view is asked to show: the side panel at a tab, a file or an output, or a dialog. */
export interface ViewRequest { panel?: PanelTab; file?: string; output?: string; dialog?: 'commit' | 'undo' | 'model' | 'limits'; compose?: 'rework'; }

/**
 * What the user can do with the open task (sections 7.5 to 7.8, 10). Every action answers with the task as the
 * backend sees it; a failure becomes a line in the conversation, never silence.
 */
@Injectable()
export class TaskActions {
  private readonly api = inject(Api);
  private readonly app = inject(AppStore);
  private readonly store = inject(TaskStore);
  private readonly router = inject(Router);

  readonly busy = signal(false);
  /** The last action failed; shown above the composer until the next action. */
  readonly failure = signal<ErrorInfo | null>(null);
  readonly request = signal<ViewRequest | null>(null);
  /** The model, effort, mode, approach and limits chosen in the composer for the next message (C4: limits per run). */
  readonly next = signal<{ model?: string; effort?: Effort; mode?: Mode; preset?: Approach; limits?: Limits }>({});

  private path(): string { return '/tasks/' + encodeURIComponent(this.store.taskId() ?? ''); }

  private async run<T>(work: () => Promise<T>): Promise<T | null> {
    this.busy.set(true);
    this.failure.set(null);
    try {
      return await work();
    } catch (e) {
      this.failure.set(errorInfo(e));
      return null;
    } finally {
      this.busy.set(false);
    }
  }

  private took(task: Task | null): void {
    if (!task) return;
    this.app.upsert(task);
    void this.store.refreshTask();
  }

  show(request: ViewRequest): void { this.request.set({ ...request }); }

  async message(text: string): Promise<void> {
    const n = this.next();
    await this.run(() => this.api.post(this.path() + '/messages', { text, model: n.model, effort: n.effort, mode: n.mode, preset: n.preset, limits: n.limits }));
    void this.store.refreshTask();
  }

  async answer(card: Card, option: number | null, text?: string): Promise<void> {
    this.took(await this.run(() => this.api.post<Task>(this.path() + '/cards/' + encodeURIComponent(card.id), { decision: 'answer', option: option ?? undefined, answer: text })));
  }

  async decide(card: Card, decision: 'allow_once' | 'allow_always' | 'deny' | 'accept' | 'decline', confirm = false): Promise<void> {
    this.took(await this.run(() => this.api.post<Task>(this.path() + '/cards/' + encodeURIComponent(card.id), { decision, confirm })));
  }

  /** Answers an acceptance card: the task is done, or it needs rework (with the user's words, if any). */
  async settle(card: Card, decision: AcceptanceDecision, text?: string): Promise<boolean> {
    const task = await this.run(() => this.api.post<Task>(this.path() + '/cards/' + encodeURIComponent(card.id), acceptanceBody(decision, text)));
    this.took(task);
    return !!task;
  }

  /** C11: answers a review card with the user's verdict on a test change. */
  async review(card: Card, decision: ReviewDecision, text?: string): Promise<boolean> {
    const task = await this.run(() => this.api.post<Task>(this.path() + '/cards/' + encodeURIComponent(card.id), reviewBody(decision, text)));
    this.took(task);
    return !!task;
  }

  async allowSkipped(card: Card): Promise<void> {
    this.took(await this.run(() => this.api.post<Task>(this.path() + '/skipped/' + encodeURIComponent(card.id) + '/allow', {})));
  }

  /** C4: the agent's own test becomes the project's test check. */
  async adoptCheck(command: string): Promise<void> {
    this.took(await this.run(() => this.api.post<Task>(this.path() + '/project-check', { command })));
  }

  async rename(taskId: string, title: string): Promise<boolean> {
    const task = await this.run(() => this.api.put<Task>('/tasks/' + encodeURIComponent(taskId), { title }));
    this.took(task);
    return !!task;
  }

  async stop(): Promise<void> { this.took(await this.run(() => this.api.post<Task>(this.path() + '/stop', {}))); }

  /**
   * Continue, Retry and "Continue with more" are one request: the backend knows what the task needs. With [limits]
   * (C4 "Raise the limit and continue") a run stopped at the user's limit continues in place.
   */
  async resume(limits?: Limits): Promise<boolean> {
    const n = this.next();
    const task = await this.run(() => this.api.post<Task>(this.path() + '/continue', { model: n.model, effort: n.effort, mode: n.mode, limits }));
    this.took(task);
    return !!task;
  }

  /** E-9 "Stop it and start this one". */
  async stopOther(taskId: string): Promise<void> {
    const stopped = await this.run(() => this.api.post<Task>('/tasks/' + encodeURIComponent(taskId) + '/stop', {}));
    if (!stopped) return;
    this.app.upsert(stopped);
    // The other task needs a moment to end; the retry is refused as busy until it has.
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      const t = await this.api.get<Task>('/tasks/' + encodeURIComponent(taskId)).catch(() => null);
      if (t && t.state !== 'working' && t.state !== 'needs_you') break;
    }
    await this.resume();
  }

  open(taskId: string): void { void this.router.navigate(['/t', taskId]); }

  settings(section: string, query: Record<string, string> = {}): void { void this.router.navigate(['/settings', section], { queryParams: query }); }

  async initGit(path: string): Promise<void> {
    const done = await this.run(() => this.api.post('/fs/git-init', { path }));
    if (done) await this.resume();
  }

  async removeProject(projectId: string): Promise<void> {
    const done = await this.run(() => this.api.delete('/projects/' + encodeURIComponent(projectId)));
    if (!done) return;
    await this.app.reloadProjects();
    void this.router.navigate([this.app.projects().length ? '/new' : '/welcome']);
  }

  async copy(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
}
