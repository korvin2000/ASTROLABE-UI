import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, errorInfo } from '../../core/api';
import { ErrorInfo, FolderListing, Project } from '../../core/model';
import { TPipe } from '../../i18n/i18n';
import { Dialog } from '../../ui/dialog';
import { ErrorLine } from '../../ui/error-line';
import { Icon } from '../../ui/icon';

/**
 * The folder dialog (section 5): a browser cannot give an absolute path, so the backend lists folders. Breadcrumb,
 * sub-folders with a git mark, a path field that accepts a pasted path, recent folders, "Select this folder".
 */
@Component({
  selector: 'as-folder-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TPipe, Dialog, ErrorLine, Icon],
  template: `
    <as-dialog [label]="'folder.title' | t" [wide]="true" (closed)="closed.emit()">
      <h3>{{ 'folder.title' | t }}</h3>
      <form class="path" (ngSubmit)="go(path)">
        <input class="input mono" name="path" [(ngModel)]="path" [attr.aria-label]="'folder.path' | t" [placeholder]="'folder.path' | t" spellcheck="false" autofocus>
        <button class="btn" type="submit">{{ 'folder.go' | t }}</button>
      </form>
      @if (listing(); as l) {
        <div class="crumbs">
          @for (c of l.breadcrumb; track c.path) { <button class="lnk" (click)="go(c.path)">{{ c.name }}</button><span class="faint">›</span> }
        </div>
        <div class="folders" role="listbox" [attr.aria-label]="'folder.title' | t">
          @if (l.parent) { <button class="f" (click)="go(l.parent)"><as-icon name="chevron-up" [size]="14" /><span class="muted">{{ 'folder.up' | t }}</span></button> }
          @for (f of l.folders; track f.path) {
            <button class="f" (click)="go(f.path)" role="option" [attr.aria-selected]="false">
              <as-icon name="folder" [size]="14" /><span class="ellipsis grow">{{ f.name }}</span>
              @if (f.git) { <span class="git">git</span> }
            </button>
          } @empty { <div class="none muted">{{ (l.unreadable ? 'folder.unreadable' : 'folder.empty') | t }}</div> }
          @if (l.more) { <div class="none muted">{{ 'folder.more' | t }}</div> }
        </div>
        @if (!l.breadcrumb.length || l.recent.length) {
          <div class="recent">
            @if (l.recent.length) {
              <span class="muted small">{{ 'folder.recent' | t }}</span>
              @for (r of l.recent; track r.path) { <button class="lnk mono" (click)="go(r.path)">{{ r.path }}</button> }
            }
          </div>
        }
      }
      @if (notGit()) {
        <div class="ask">
          <p>{{ 'folder.not_git' | t }}</p>
          <div class="row">
            <button class="btn pri" [disabled]="busy()" (click)="initGit()">{{ 'action.init_git' | t }}</button>
            <button class="btn" (click)="notGit.set(false)">{{ 'action.choose_another' | t }}</button>
          </div>
        </div>
      }
      @if (failure(); as f) { <as-error-line [error]="f" /> }
      <div class="actions">
        <button class="btn ghost" (click)="closed.emit()">{{ 'action.cancel' | t }}</button>
        <button class="btn pri" [disabled]="busy() || !listing()" (click)="select()">{{ 'folder.select' | t }}</button>
      </div>
    </as-dialog>`,
  styles: [`
    .path { display: flex; gap: 8px; margin: 10px 0; }
    .crumbs { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; font-size: 13px; margin-bottom: 8px; }
    .folders { border: 1px solid var(--border); border-radius: 8px; height: 260px; overflow: auto; padding: 4px; }
    .f { display: flex; gap: 8px; align-items: center; width: 100%; border: 0; background: transparent; border-radius: 6px; padding: 5px 8px; text-align: left; }
    .f:hover { background: var(--hover); }
    .git { font: 11px var(--mono); color: var(--muted); border: 1px solid var(--border); border-radius: 4px; padding: 0 5px; }
    .none { padding: 8px; font-size: 13px; }
    .recent { display: flex; gap: 10px; flex-wrap: wrap; align-items: baseline; margin-top: 10px; }
    .ask { margin-top: 12px; padding: 12px 14px; border: 1px solid var(--warn); border-radius: 10px; }
    .ask p { color: var(--text); margin: 0 0 10px; }
  `],
})
export class FolderDialog {
  private readonly api = inject(Api);
  readonly closed = output<void>();
  readonly opened = output<Project>();

  readonly listing = signal<FolderListing | null>(null);
  readonly failure = signal<ErrorInfo | null>(null);
  readonly notGit = signal(false);
  readonly busy = signal(false);
  path = '';

  constructor() { void this.go(''); }

  async go(path: string): Promise<void> {
    this.failure.set(null);
    this.notGit.set(false);
    try {
      const l = await this.api.get<FolderListing>('/fs/folders' + (path ? '?path=' + encodeURIComponent(path) : ''));
      this.listing.set(l);
      this.path = l.path;
    } catch (e) {
      this.failure.set(errorInfo(e));
    }
  }

  async select(): Promise<void> {
    const path = this.path.trim() || this.listing()?.path;
    if (!path) return;
    this.busy.set(true);
    this.failure.set(null);
    try {
      this.opened.emit(await this.api.post<Project>('/projects', { path }));
    } catch (e) {
      const info = errorInfo(e);
      if (info.code === 'not_a_git_repo') this.notGit.set(true);
      else this.failure.set(info);
    } finally {
      this.busy.set(false);
    }
  }

  /** The one question of a folder that is not a repository yet (section 5 UX-8). */
  async initGit(): Promise<void> {
    const path = this.path.trim() || this.listing()?.path;
    if (!path) return;
    this.busy.set(true);
    try {
      await this.api.post('/fs/git-init', { path });
      this.notGit.set(false);
      this.opened.emit(await this.api.post<Project>('/projects', { path }));
    } catch (e) {
      this.failure.set(errorInfo(e));
    } finally {
      this.busy.set(false);
    }
  }
}
