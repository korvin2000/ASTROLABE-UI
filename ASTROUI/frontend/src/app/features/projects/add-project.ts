import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { StudioSocket } from '../../core/ws';
import { AppStore } from '../../state/app.store';
import { StudioError } from '../../core/api';
import { Icon } from '../../ui/icon';

/** "Add repository" (§19.1): a server-side path with validation (a browser upload is not a writable mount). */
@Component({
  selector: 'as-add-project',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <div class="scrim" (click)="close.emit()"></div>
    <form class="dlg" role="dialog" aria-label="Add repository" (submit)="$event.preventDefault(); add()">
      <div class="title">Add a repository</div>
      <p class="meta">A git working-tree root on this machine. ASTROLABE keeps its state outside the repository and never writes the
        repository itself except through a campaign's guarded edits.</p>
      <input class="input path mono" [value]="path()" (input)="path.set($any($event.target).value)" placeholder="C:\\src\\my-repo  or  /home/me/src/my-repo" autofocus />
      @if (error()) { <div class="banner bad"><as-icon name="alert" [size]="14" /><span>{{ error() }}</span></div> }
      <div class="row end">
        <button type="button" class="btn ghost" (click)="close.emit()">Cancel</button>
        <button type="submit" class="btn primary" [disabled]="busy() || !path().trim()">{{ busy() ? 'Validating…' : 'Add and open' }}</button>
      </div>
    </form>`,
  styles: [`
    :host{position:fixed;inset:0;z-index:60;display:grid;place-items:center}
    .scrim{position:absolute;inset:0;background:rgba(0,0,0,.35)}
    .dlg{position:relative;width:min(560px,92vw);display:flex;flex-direction:column;gap:12px;padding:18px;background:var(--bg-raised);border:1px solid var(--border-default);border-radius:var(--r-drawer);box-shadow:var(--shadow-overlay)}
    .title{font-size:16px;font-weight:600}
    .path{width:100%;height:34px}
    .end{justify-content:flex-end}
    p{margin:0}
  `],
})
export class AddProjectDialog {
  private readonly socket = inject(StudioSocket);
  private readonly app = inject(AppStore);
  private readonly router = inject(Router);
  readonly close = output<void>();
  readonly path = signal('');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  async add(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const p: any = await this.socket.command('project.add', { path: this.path().trim() });
      await this.app.refresh();
      this.close.emit();
      this.router.navigate(['/p', p.id]);
    } catch (e) {
      this.error.set(e instanceof StudioError ? e.error.message : String(e));
    } finally {
      this.busy.set(false);
    }
  }
}
