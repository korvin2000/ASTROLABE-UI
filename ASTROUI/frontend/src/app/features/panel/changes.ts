import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Api } from '../../core/api';
import { ChangedFile } from '../../core/model';
import { I18n, TPipe } from '../../i18n/i18n';
import { TaskStore } from '../../state/task.store';
import { DiffView } from '../../ui/diff-view';
import { TaskActions } from '../task/task-actions';
import { grouped } from './change-groups';

/**
 * Changes (section 8.1): what the task changed, from the state before it to now. File list with line counts, a
 * unified diff with word-level marks, Undo per file, Commit and Undo all in the header. Live while the task works.
 */
@Component({
  selector: 'as-changes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe, DiffView],
  template: `
    @if (files().length) {
      <div class="row head">
        <b>{{ count() }}</b>
        <span class="grow"></span>
        <button class="btn sm" [disabled]="store.working()" (click)="actions.show({ dialog: 'commit' })">{{ 'action.commit' | t }}</button>
        <button class="btn sm ghost" [disabled]="store.working()" (click)="actions.show({ dialog: 'undo' })">{{ 'action.undo_all' | t }}</button>
      </div>
    }
    @for (g of groups(); track g.folder) {
      @if (g.folder) { <div class="folder mono">{{ g.folder }}/</div> }
      @for (f of g.files; track f.path) {
        <button class="file" [class.sel]="f.path === chosen() && !earlier()" [class.in]="!!g.folder" (click)="pick(f.path, false)" [title]="f.path">
          <code class="ellipsis grow">{{ g.folder ? name(f.path) : f.path }}</code>
          <span class="n">
            @if (f.binary) { <span class="muted">{{ 'changes.binary' | t }}</span> }
            @else {
              @if (f.kind === 'D') { <span class="bad">{{ 'changes.deleted' | t }}</span> }
              @if (f.added) { <span class="ok">+{{ f.added }}</span> }
              @if (f.removed) { <span class="bad">−{{ f.removed }}</span> }
            }
          </span>
        </button>
      }
    } @empty { <p class="muted none">{{ 'empty.changes' | t }}</p> }

    @if (mine().length) {
      <label class="sw">
        <button class="switch" role="switch" [attr.aria-checked]="showMine()" (click)="showMine.set(!showMine())" [attr.aria-label]="'changes.show_mine' | t"></button>
        <span>{{ 'changes.show_mine' | t }}</span>
      </label>
      @if (showMine()) {
        @for (f of mine(); track f.path) {
          <button class="file" [class.sel]="f.path === chosen() && earlier()" (click)="pick(f.path, true)" [title]="f.path">
            <code class="ellipsis grow">{{ f.path }}</code>
            <span class="n">@if (f.added) { <span class="ok">+{{ f.added }}</span> } @if (f.removed) { <span class="bad">−{{ f.removed }}</span> }</span>
          </button>
        }
      }
    }

    @if (chosen(); as path) {
      <div class="diff">
        <div class="h">
          <code class="ellipsis grow">{{ path }}</code>
          @if (!earlier()) { <button class="lnk" [disabled]="store.working()" (click)="actions.show({ dialog: 'undo', file: path })">{{ 'action.undo' | t }}</button> }
          @else { <span class="muted small">{{ 'changes.yours' | t }}</span> }
        </div>
        @if (loading()) { <div class="pad"><span class="spin"></span></div> }
        @else if (diff()) { <as-diff-view [diff]="diff()" [showHeader]="false" /> }
        @else { <div class="pad muted">{{ 'changes.no_text' | t }}</div> }
      </div>
    }`,
  styles: [`
    :host { display: block; }
    .head { margin-bottom: 10px; flex-wrap: nowrap; }
    .folder { font-size: 12px; color: var(--muted); padding: 8px 8px 2px; }
    .file { display: flex; gap: 8px; padding: 5px 8px; border-radius: 6px; align-items: center; font-size: 13px; width: 100%; border: 0; background: transparent; text-align: left; }
    .file.in { padding-left: 20px; }
    .file:hover, .file.sel { background: var(--hover); }
    .n { margin-left: auto; font: 12px var(--mono); white-space: nowrap; display: flex; gap: 6px; }
    .none { padding: 8px; }
    .sw { display: flex; gap: 10px; align-items: center; margin: 14px 8px 6px; font-size: 13px; color: var(--muted); }
    .diff { margin-top: 12px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    .h { display: flex; gap: 10px; padding: 5px 10px; background: var(--side); color: var(--muted); border-bottom: 1px solid var(--border); align-items: center; }
    .pad { padding: 10px; }
    as-diff-view { max-height: 70vh; overflow: auto; }
    :host ::ng-deep as-diff-view .file { border: 0; border-radius: 0; margin: 0; }
  `],
})
export class Changes {
  readonly store = inject(TaskStore);
  readonly actions = inject(TaskActions);
  private readonly api = inject(Api);
  private readonly i18n = inject(I18n);

  /** The file to open, from a step of the conversation. */
  readonly select = input<string | null | undefined>(null);

  readonly chosen = signal<string | null>(null);
  readonly earlier = signal(false);
  readonly diff = signal('');
  readonly loading = signal(false);
  readonly showMine = signal(false);

  readonly files = computed(() => this.store.changes()?.files ?? []);
  readonly mine = computed(() => {
    const own = new Set(this.files().map(f => f.path));
    return (this.store.changes()?.earlier ?? []).filter(f => !own.has(f.path));
  });
  readonly groups = computed(() => (this.files().length ? grouped(this.files()) : []));
  readonly count = computed(() => { this.i18n.lang(); return this.i18n.n('changes.files_changed', this.files().length); });

  private loaded = '';

  constructor() {
    effect(() => {
      const wanted = this.select();
      const files = this.files();
      const changes = this.store.changes();
      untracked(() => {
        const chosen = this.chosen();
        if (wanted && files.some(f => f.path === wanted) && wanted !== chosen) { void this.pick(wanted, false); return; }
        if (!chosen && files.length) { void this.pick(files[0].path, false); return; }
        if (chosen && !this.earlier() && !files.some(f => f.path === chosen)) { this.chosen.set(null); this.diff.set(''); return; }
        // The list changed while the task works: the open diff follows it.
        if (chosen && changes) void this.load(chosen, this.earlier(), true);
      });
    });
  }

  name(path: string): string { return path.slice(path.lastIndexOf('/') + 1); }

  async pick(path: string, earlier: boolean): Promise<void> {
    this.chosen.set(path);
    this.earlier.set(earlier);
    await this.load(path, earlier, false);
  }

  private async load(path: string, earlier: boolean, quiet: boolean): Promise<void> {
    const file = this.files().find(f => f.path === path);
    const key = `${path}|${earlier}|${file?.added ?? 0}|${file?.removed ?? 0}|${this.store.changes()?.files.length ?? 0}`;
    if (quiet && key === this.loaded) return;
    this.loaded = key;
    if (!quiet) { this.loading.set(true); this.diff.set(''); }
    try {
      const r = await this.api.get<{ diff: string }>('/tasks/' + encodeURIComponent(this.store.taskId() ?? '') + '/diff?path=' + encodeURIComponent(path) + (earlier ? '&earlier=true' : ''));
      if (this.chosen() === path && this.earlier() === earlier) this.diff.set(r.diff ?? '');
    } catch {
      if (!quiet) this.diff.set('');
    } finally {
      this.loading.set(false);
    }
  }
}
