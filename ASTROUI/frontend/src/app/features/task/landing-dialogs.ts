import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, errorInfo } from '../../core/api';
import { ChangedFile, ErrorInfo } from '../../core/model';
import { I18n, TPipe } from '../../i18n/i18n';
import { AppStore } from '../../state/app.store';
import { TaskStore } from '../../state/task.store';
import { Dialog } from '../../ui/dialog';
import { ErrorLine } from '../../ui/error-line';

interface Plan {
  branch: string;
  suggestedBranch: string;
  message: string;
  files: (ChangedFile & { selected: boolean })[];
  earlier: { path: string; selected: boolean }[];
}

/**
 * Commit (section 7.8): the message prefilled from the summary, the agent's files ticked, the user's earlier changes
 * listed apart and unticked, the current branch, an option to create a new one. An ordinary `git add` and
 * `git commit` of the chosen paths, as the user's action.
 */
@Component({
  selector: 'as-commit-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TPipe, Dialog, ErrorLine],
  template: `
    <as-dialog [label]="'commit.title' | t" [wide]="true" (closed)="closed.emit()">
      <h3>{{ 'commit.title' | t }}</h3>
      @if (plan(); as p) {
        <label class="field"><span>{{ 'commit.message' | t }}</span>
          <textarea class="input" rows="3" name="message" [(ngModel)]="message" autofocus></textarea>
        </label>
        <div class="list">
          <div class="sec">{{ 'commit.files' | t }}</div>
          @for (f of p.files; track f.path) {
            <label class="f"><input type="checkbox" [(ngModel)]="picked[f.path]" [name]="'f-' + f.path"><code class="ellipsis grow">{{ f.path }}</code>
              <span class="n">@if (f.added) { <span class="ok">+{{ f.added }}</span> } @if (f.removed) { <span class="bad">−{{ f.removed }}</span> }</span></label>
          } @empty { <p class="muted small">{{ 'commit.nothing' | t }}</p> }
          @if (p.earlier.length) {
            <div class="sec">{{ 'commit.yours' | t }}</div>
            @for (f of p.earlier; track f.path) {
              <label class="f"><input type="checkbox" [(ngModel)]="picked[f.path]" [name]="'e-' + f.path"><code class="ellipsis grow">{{ f.path }}</code></label>
            }
          }
        </div>
        <div class="branch">
          <span class="muted">{{ 'commit.branch' | t }}</span> <code>{{ newBranch ? branch : p.branch }}</code>
          <label class="f"><input type="checkbox" [(ngModel)]="newBranch" name="newBranch">{{ 'commit.new_branch' | t }}</label>
          @if (newBranch) { <input class="input mono" name="branch" [(ngModel)]="branch" [attr.aria-label]="'commit.branch_name' | t" spellcheck="false"> }
        </div>
      } @else if (!failure()) { <span class="spin"></span> }
      @if (failure(); as f) { <as-error-line [error]="f" /> }
      <div class="actions">
        <button class="btn ghost" (click)="closed.emit()">{{ 'action.cancel' | t }}</button>
        <button class="btn pri" [disabled]="busy() || !plan() || !message.trim() || !any()" (click)="commit()">{{ 'action.commit_now' | t }}</button>
      </div>
    </as-dialog>`,
  styles: [`
    .list { border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; max-height: 240px; overflow: auto; }
    .sec { font-size: 12px; font-weight: 600; color: var(--muted); padding: 6px 0 2px; }
    .f { display: flex; gap: 8px; align-items: center; padding: 3px 0; font-size: 13px; }
    .n { font: 12px var(--mono); display: flex; gap: 6px; }
    .branch { margin-top: 12px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: 13px; }
    .branch .input { flex: 1 1 100%; }
    textarea { resize: vertical; }
  `],
})
export class CommitDialog {
  private readonly api = inject(Api);
  private readonly app = inject(AppStore);
  private readonly store = inject(TaskStore);
  private readonly i18n = inject(I18n);

  /** The summary of the result, for the body of the message. */
  readonly summary = input('');
  readonly closed = output<void>();

  readonly plan = signal<Plan | null>(null);
  readonly busy = signal(false);
  readonly failure = signal<ErrorInfo | null>(null);
  message = '';
  branch = '';
  newBranch = false;
  picked: Record<string, boolean> = {};

  constructor() { void this.load(); }

  private path(): string { return '/tasks/' + encodeURIComponent(this.store.taskId() ?? ''); }

  private async load(): Promise<void> {
    try {
      const summary = this.summary().slice(0, 600);
      const p = await this.api.get<Plan>(this.path() + '/commit' + (summary ? '?summary=' + encodeURIComponent(summary) : ''));
      this.message = p.message;
      this.branch = p.suggestedBranch;
      for (const f of p.files) this.picked[f.path] = f.selected;
      for (const f of p.earlier) this.picked[f.path] = f.selected;
      this.plan.set(p);
    } catch (e) {
      this.failure.set(errorInfo(e));
    }
  }

  any(): boolean { return Object.values(this.picked).some(Boolean); }

  async commit(): Promise<void> {
    this.busy.set(true);
    this.failure.set(null);
    try {
      const paths = Object.entries(this.picked).filter(([, on]) => on).map(([path]) => path);
      const r = await this.api.post<{ commit: string; branch: string; files: number }>(this.path() + '/commit', { message: this.message, paths, branch: this.newBranch ? this.branch.trim() : undefined });
      this.app.toast(this.i18n.t('commit.done', { commit: r.commit, branch: r.branch }), 'ok');
      void this.store.refreshPanel(true);
      void this.app.reloadProjects();
      this.closed.emit();
    } catch (e) {
      this.failure.set(errorInfo(e));
    } finally {
      this.busy.set(false);
    }
  }
}

/**
 * Undo (section 7.8): restores the state before the task for the files the agent changed. Files the user edited
 * afterwards are skipped and named.
 */
@Component({
  selector: 'as-undo-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe, Dialog, ErrorLine],
  template: `
    <as-dialog [label]="title()" (closed)="closed.emit()">
      <h3>{{ title() }}</h3>
      @if (result(); as r) {
        <p>{{ restored() }}</p>
        @if (r.skipped.length) {
          <p class="warn">{{ 'undo.skipped' | t }}</p>
          <ul>@for (s of r.skipped; track s.path) { <li><code>{{ s.path }}</code> <span class="muted small">{{ ('undo.why.' + s.why) | t }}</span></li> }</ul>
        }
        <div class="actions"><button class="btn pri" (click)="closed.emit()">{{ 'action.close' | t }}</button></div>
      } @else {
        <p>{{ (file() ? 'undo.text_file' : 'undo.text_all') | t: { path: file() } }}</p>
        @if (failure(); as f) { <as-error-line [error]="f" /> }
        <div class="actions">
          <button class="btn ghost" (click)="closed.emit()">{{ 'action.cancel' | t }}</button>
          <button class="btn pri" [disabled]="busy()" (click)="undo()">{{ (file() ? 'action.undo' : 'action.undo_all') | t }}</button>
        </div>
      }
    </as-dialog>`,
  styles: ['ul { margin: 0 0 8px; padding-left: 20px; } p.warn { color: var(--warn); }'],
})
export class UndoDialog {
  private readonly api = inject(Api);
  private readonly store = inject(TaskStore);
  private readonly i18n = inject(I18n);

  /** One file to undo; without it, every file the task changed. */
  readonly file = input<string | null | undefined>(null);
  readonly closed = output<void>();

  readonly busy = signal(false);
  readonly failure = signal<ErrorInfo | null>(null);
  readonly result = signal<{ restored: string[]; skipped: { path: string; why: string }[] } | null>(null);

  readonly title = computed(() => { this.i18n.lang(); return this.i18n.t(this.file() ? 'undo.title_file' : 'undo.title_all'); });
  readonly restored = computed(() => { this.i18n.lang(); return this.i18n.n('undo.restored', this.result()?.restored.length ?? 0); });

  async undo(): Promise<void> {
    this.busy.set(true);
    this.failure.set(null);
    try {
      const file = this.file();
      this.result.set(await this.api.post('/tasks/' + encodeURIComponent(this.store.taskId() ?? '') + '/undo', { paths: file ? [file] : [] }));
      void this.store.refreshPanel(true);
      void this.store.refreshTask();
    } catch (e) {
      this.failure.set(errorInfo(e));
    } finally {
      this.busy.set(false);
    }
  }
}
