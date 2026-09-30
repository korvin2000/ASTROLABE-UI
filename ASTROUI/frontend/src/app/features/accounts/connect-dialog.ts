import { ChangeDetectionStrategy, Component, OnDestroy, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, errorInfo } from '../../core/api';
import { Account, ErrorInfo, LoginSession, Preset } from '../../core/model';
import { TPipe } from '../../i18n/i18n';
import { AppStore } from '../../state/app.store';
import { Dialog } from '../../ui/dialog';
import { ErrorLine } from '../../ui/error-line';

export interface Connected { provider: string; name: string; model: string | null; }

/**
 * The connect dialog (section 6.1, 6.2): the same dialog serves the first run and Settings. Only methods that work
 * are offered. After "Connect" the backend tests the account, loads its models and picks the recommended one; a
 * failure stays here as one sentence.
 */
@Component({
  selector: 'as-connect-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TPipe, Dialog, ErrorLine],
  templateUrl: './connect-dialog.html',
  styleUrl: './connect-dialog.css',
})
export class ConnectDialog implements OnDestroy {
  private readonly api = inject(Api);
  private readonly app = inject(AppStore);

  /** The account type to connect; without it the dialog lists every type. */
  readonly provider = input<string | null>(null);
  /** `key` opens the key field at once ("Replace key"). */
  readonly method = input<string | null>(null);
  readonly closed = output<void>();
  readonly connected = output<Connected>();

  readonly presets = signal<Preset[]>([]);
  readonly chosen = signal<Preset | null>(null);
  readonly view = signal<'list' | 'local' | 'form' | 'signin'>('list');
  readonly busy = signal(false);
  readonly failure = signal<ErrorInfo | null>(null);
  readonly session = signal<LoginSession | null>(null);
  readonly copied = signal(false);
  readonly now = signal(Date.now());
  readonly detected = computed(() => this.app.accounts().filter(a => a.kind === 'local' && !a.enabled));

  apiKey = '';
  name = '';
  baseUrl = '';
  model = '';

  private tab: Window | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private tick: ReturnType<typeof setInterval> | null = null;

  readonly secondsLeft = computed(() => {
    const at = this.session()?.expiresAt;
    return at ? Math.max(0, Math.floor((Date.parse(at) - this.now()) / 1000)) : 0;
  });

  constructor() {
    void this.load();
    // The session changes on the server; the `app` topic brings every change, the poll below is the fallback.
    effect(() => {
      const live = this.app.login();
      if (live && live.loginId === this.session()?.loginId) this.onSession(live);
    });
  }

  private async load(): Promise<void> {
    try {
      const presets = await this.api.get<Preset[]>('/accounts/presets');
      this.presets.set(presets);
      const wanted = this.provider();
      if (wanted === 'local') {
        this.view.set('local');
        void this.app.reloadAccounts();
      } else if (wanted) {
        const preset = presets.find(p => p.provider === wanted);
        if (preset) this.choose(preset);
      }
    } catch (e) {
      this.failure.set(errorInfo(e));
    }
  }

  has(preset: Preset | null, method: string): boolean { return !!preset?.methods.includes(method as Preset['methods'][number]); }

  choose(preset: Preset): void {
    this.chosen.set(preset);
    this.failure.set(null);
    this.apiKey = '';
    this.view.set('form');
    if (preset.provider !== 'custom' && this.has(preset, 'local')) void this.app.reloadAccounts();
  }

  /** The local servers the Studio knows by name; any other server is a custom address. */
  readonly locals = computed(() => this.presets().filter(p => p.methods.includes('local')));

  custom_(): void {
    const preset = this.presets().find(p => p.provider === 'custom');
    if (preset) this.choose(preset);
  }

  back(): void {
    if (this.provider() === 'local' && this.view() !== 'local') { this.chosen.set(null); this.failure.set(null); this.view.set('local'); return; }
    if (this.provider()) { this.closed.emit(); return; }
    this.chosen.set(null);
    this.failure.set(null);
    this.view.set('list');
  }

  // ------------------------------------------------------------------------------------------------ key, local, custom

  async connect(body: Record<string, unknown>): Promise<void> {
    this.busy.set(true);
    this.failure.set(null);
    try {
      const r = await this.api.post<{ provider: string; name: string; defaultModel?: string; recommended?: string }>('/accounts', body);
      await this.app.reloadAccounts();
      this.connected.emit({ provider: r.provider, name: r.name, model: r.defaultModel ?? r.recommended ?? null });
    } catch (e) {
      this.failure.set(errorInfo(e));
    } finally {
      this.busy.set(false);
      this.apiKey = '';
    }
  }

  withKey(): void {
    const p = this.chosen();
    if (p && this.apiKey.trim()) void this.connect({ provider: p.provider, method: 'key', apiKey: this.apiKey.trim() });
  }

  useLocal(account: Account): void { void this.connect({ provider: account.provider, method: 'local' }); }

  tryLocal(preset?: Preset): void {
    const p = preset ?? this.chosen();
    if (p) void this.connect({ provider: p.provider, method: 'local' });
  }

  custom(): void {
    void this.connect({ method: 'custom', name: this.name.trim(), baseUrl: this.baseUrl.trim(), apiKey: this.apiKey.trim() || undefined, model: this.model.trim() || undefined });
  }

  // ------------------------------------------------------------------------------------------------ sign-in (section 6.2)

  async signIn(method: 'browser' | 'code'): Promise<void> {
    const p = this.chosen();
    if (!p) return;
    this.failure.set(null);
    this.busy.set(true);
    // A pop-up blocker allows a tab only from the click itself: open it now, give it its address when it arrives.
    if (method === 'browser') {
      try { this.tab = window.open('', '_blank'); } catch { this.tab = null; }
    }
    const previous = this.session();
    if (previous && !this.terminal(previous)) void this.api.post('/accounts/login/' + previous.loginId + '/cancel', {}).catch(() => null);
    try {
      const s = await this.api.post<LoginSession>('/accounts/login', { provider: p.provider, method });
      this.app.login.set(s);
      this.view.set('signin');
      this.onSession(s);
      this.watch(s.loginId);
    } catch (e) {
      this.closeTab();
      this.failure.set(errorInfo(e));
    } finally {
      this.busy.set(false);
    }
  }

  private watch(id: string): void {
    this.stopWatching();
    this.poll = setInterval(async () => {
      try {
        const s = await this.api.get<LoginSession>('/accounts/login/' + id);
        if (this.session()?.loginId === id) this.onSession(s);
      } catch { /* the next poll tries again */ }
    }, 2000);
    this.tick = setInterval(() => this.now.set(Date.now()), 1000);
  }

  private stopWatching(): void {
    if (this.poll) clearInterval(this.poll);
    if (this.tick) clearInterval(this.tick);
    this.poll = this.tick = null;
  }

  terminal(s: LoginSession): boolean { return ['connected', 'cancelled', 'timed_out', 'failed'].includes(s.state); }

  private onSession(s: LoginSession): void {
    const before = this.session();
    this.session.set(s);
    if (s.method === 'code' || s.state === 'waiting_for_code') this.closeTab();
    if (s.url && s.method === 'browser' && this.tab && before?.url !== s.url) {
      try { this.tab.location.href = s.url; } catch { /* the link in the dialog is the fallback */ }
    }
    if (!this.terminal(s)) return;
    this.stopWatching();
    if (s.state === 'connected') {
      void this.app.reloadAccounts().then(() => {
        this.connected.emit({ provider: s.provider, name: s.result?.name ?? s.name, model: s.result?.model?.ref ?? null });
      });
    } else if (s.state === 'cancelled') {
      this.closeTab();
      this.view.set('form');
      this.session.set(null);
    } else {
      this.closeTab();
      this.failure.set(s.error ?? { code: 'login_failed', params: {} });
    }
  }

  private closeTab(): void {
    try { if (this.tab && !this.tab.closed && this.tab.location.href === 'about:blank') this.tab.close(); } catch { /* a tab on another origin is the user's now */ }
    this.tab = null;
  }

  openAgain(): void {
    const url = this.session()?.url;
    if (url) window.open(url, '_blank', 'noopener');
  }

  async copy(text: string | undefined): Promise<void> {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    } catch { /* the text stays selectable */ }
  }

  async cancel(): Promise<void> {
    const s = this.session();
    this.stopWatching();
    this.closeTab();
    if (s && !this.terminal(s)) await this.api.post('/accounts/login/' + s.loginId + '/cancel', {}).catch(() => null);
    this.session.set(null);
    this.app.login.set(null);
    this.failure.set(null);
    this.view.set('form');
  }

  close(): void {
    const s = this.session();
    if (s && !this.terminal(s)) void this.api.post('/accounts/login/' + s.loginId + '/cancel', {}).catch(() => null);
    this.closed.emit();
  }

  clock(seconds: number): string { return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0'); }

  ngOnDestroy(): void {
    this.stopWatching();
    this.closeTab();
  }
}
