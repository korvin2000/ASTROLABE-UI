import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AppStore } from './state/app.store';
import { StudioSocket } from './core/ws';
import { Sidebar } from './features/shell/sidebar';
import { InspectorDrawer, Inspector } from './features/shell/inspector';
import { Palette } from './features/shell/palette';
import { Toasts } from './features/shell/toasts';
import { AddProjectDialog } from './features/projects/add-project';
import { Icon } from './ui/icon';
import { Mark } from './ui/glyph';

/** The shell (§4): one sidebar, one workspace, an inspector drawer on demand, overlays for palette and dialogs. */
@Component({
  selector: 'as-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Sidebar, InspectorDrawer, Palette, Toasts, AddProjectDialog, Icon, Mark],
  template: `
    @if (app.unauthorized()) {
      <div class="gate">
        <as-mark [size]="44" />
        <h1 class="h-page">ASTROLABE Studio</h1>
        <p class="meta">No Studio session in this browser. Open the launch link the Studio printed when it started
          (it is also written to <span class="mono">launch-url.txt</span> in the Studio data directory).</p>
      </div>
    } @else if (app.fatal()) {
      <div class="gate">
        <as-mark [size]="44" />
        <h1 class="h-page">Studio backend unavailable</h1>
        <p class="meta">{{ app.fatal() }}</p>
        <button class="btn" (click)="reload()">Retry</button>
      </div>
    } @else {
      <div class="layout" [class.rail]="railed()">
        <as-sidebar (palette)="paletteOpen.set(true)" (addProject)="addOpen.set(true)" />
        <main class="main">
          @if (socket.state() !== 'open' && app.ready()) {
            <div class="conn banner warn" role="status">
              <as-icon name="refresh" [size]="14" />
              {{ socket.state() === 'offline' ? 'Offline — the Studio backend is not reachable.' : 'Reconnecting… live updates paused; views show their last synchronized state.' }}
            </div>
          }
          @if (app.ready()) { <router-outlet /> } @else { <div class="loading meta">Loading the workspace…</div> }
        </main>
      </div>
      <as-inspector />
      @if (paletteOpen()) { <as-palette (close)="paletteOpen.set(false)" /> }
      @if (addOpen()) { <as-add-project (close)="addOpen.set(false)" /> }
      <as-toasts />
    }`,
  styles: [`
    :host{display:block;height:100vh}
    .layout{display:grid;grid-template-columns:var(--sidebar-w) minmax(0,1fr);height:100vh}
    .main{position:relative;display:flex;flex-direction:column;min-width:0;min-height:0;height:100vh}
    .conn{border-radius:0;border-left:0;border-right:0;border-top:0;flex:none}
    .loading{padding:40px}
    .gate{height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;padding:24px;max-width:560px;margin:0 auto}
    @media (max-width:1023px){.layout{grid-template-columns:minmax(0,1fr)} .layout as-sidebar{display:none}}
  `],
})
export class App {
  readonly app = inject(AppStore);
  readonly socket = inject(StudioSocket);
  private readonly router = inject(Router);
  private readonly inspector = inject(Inspector);
  readonly paletteOpen = signal(false);
  readonly addOpen = signal(false);
  readonly railed = signal(false);

  constructor() {
    this.app.init();
  }

  reload(): void { location.reload(); }

  /** §20.2 keyboard map (never overriding browser refresh, tabs or text editing). */
  @HostListener('document:keydown', ['$event'])
  onKey(ev: KeyboardEvent): void {
    const mod = ev.ctrlKey || ev.metaKey;
    const target = ev.target as HTMLElement | null;
    const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
    if (mod && ev.key.toLowerCase() === 'k') { ev.preventDefault(); this.paletteOpen.set(!this.paletteOpen()); return; }
    if (mod && ev.key.toLowerCase() === 'i') { ev.preventDefault(); this.router.navigate(['/inbox']); return; }
    if (mod && ev.key === '.') { ev.preventDefault(); this.router.navigate(['/activity']); return; }
    if (ev.altKey && ev.key.toLowerCase() === 'n') { ev.preventDefault(); this.router.navigate(['/new']); return; }
    if (ev.key === 'Escape') {
      if (this.paletteOpen()) { this.paletteOpen.set(false); return; }
      if (this.addOpen()) { this.addOpen.set(false); return; }
      if (this.inspector.current()) { this.inspector.close(); return; }
    }
    if (!typing && ev.key === '?' ) { this.paletteOpen.set(true); }
  }
}
