import { ChangeDetectionStrategy, Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { StudioSocket } from './core/ws';
import { Sidebar } from './features/shell/sidebar';
import { Toasts } from './features/shell/toasts';
import { TPipe } from './i18n/i18n';
import { AppStore } from './state/app.store';

/** The shell (Studio 2 section 4): a sidebar, the conversation, a side panel on demand. No permanent secondary panels. */
@Component({
  selector: 'as-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Sidebar, Toasts, TPipe],
  template: `
    @if (app.unauthorized()) {
      <div class="gate">
        <h1>ASTROLABE</h1>
        <p class="muted">{{ 'gate.no_session' | t }}</p>
      </div>
    } @else if (app.fatal()) {
      <div class="gate">
        <h1>{{ 'gate.unavailable' | t }}</h1>
        <p class="muted">{{ 'gate.unavailable_hint' | t }}</p>
        <button class="btn pri" (click)="reload()">{{ 'action.retry' | t }}</button>
      </div>
    } @else if (app.ready()) {
      <div class="layout">
        @if (showSidebar()) { <as-sidebar /> }
        <main class="main">
          @if (socket.state() !== 'open') {
            <div class="banner" role="status"><span class="spin"></span>{{ 'error.connection_lost' | t }}</div>
          }
          @if (expired(); as account) {
            <div class="banner warn" role="status">
              {{ 'banner.session_expired' | t: { account: account.name } }}
              <button class="lnk" (click)="signInAgain()">{{ 'action.sign_in_again' | t }}</button>
            </div>
          }
          <router-outlet />
        </main>
      </div>
      <as-toasts />
    } @else {
      <div class="gate"><span class="spin"></span></div>
    }`,
  styles: [`
    :host { display: block; height: 100vh; }
    .layout { display: flex; height: 100vh; }
    .main { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; position: relative; }
    .banner { flex: none; display: flex; gap: 10px; align-items: center; padding: 7px 18px; background: var(--side); border-bottom: 1px solid var(--border); color: var(--muted); font-size: 13px; }
    .banner.warn { background: var(--warn-soft); color: var(--warn); }
    .gate { height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; text-align: center; padding: 24px; max-width: 520px; margin: 0 auto; }
    .gate h1 { font-size: 22px; font-weight: 600; }
    @media (max-width: 720px) { as-sidebar { display: none; } }
  `],
})
export class App {
  readonly app = inject(AppStore);
  readonly socket = inject(StudioSocket);
  private readonly router = inject(Router);
  private readonly url = signal('/');

  readonly showSidebar = computed(() => !this.url().startsWith('/welcome'));
  readonly expired = computed(() => this.app.accounts().find(a => a.state === 'expired') ?? null);

  constructor() {
    void this.app.init();
    this.router.events.subscribe(e => { if (e instanceof NavigationEnd) this.url.set(e.urlAfterRedirects); });
    // The tab title starts with the number of tasks that wait for the user (section 7.5).
    effect(() => {
      const n = this.app.needsYou().length;
      document.title = (n > 0 ? `(${n}) ` : '') + 'ASTROLABE';
    });
  }

  reload(): void { location.reload(); }

  signInAgain(): void { void this.router.navigate(['/settings', 'models'], { queryParams: { connect: this.expired()?.provider } }); }

  /** Shortcuts of section 11; they never take a key from a text field, a browser refresh or a tab switch. */
  @HostListener('document:keydown', ['$event'])
  onKey(ev: KeyboardEvent): void {
    const mod = ev.ctrlKey || ev.metaKey;
    if (mod && !ev.shiftKey && !ev.altKey && ev.key.toLowerCase() === 'n') {
      ev.preventDefault();
      void this.router.navigate(['/new']);
    }
  }
}
