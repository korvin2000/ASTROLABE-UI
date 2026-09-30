import { ChangeDetectionStrategy, Component, HostListener, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Api, errorInfo } from '../../core/api';
import { Account, Effort, ErrorInfo, Mode, Preferences, Project, ProjectSettingsDto, UsableModel } from '../../core/model';
import { I18n, TPipe } from '../../i18n/i18n';
import { AppStore } from '../../state/app.store';
import { Dialog } from '../../ui/dialog';
import { ErrorLine } from '../../ui/error-line';
import { ConnectDialog } from '../accounts/connect-dialog';
import { ModelPicker } from '../accounts/model-picker';
import { FolderDialog } from '../welcome/folder-dialog';
import { SECTIONS, SETTINGS, Section } from './setting-list';

type Confirm =
  | { kind: 'remove-account'; account: Account; impact: { models: number; defaultModelAffected: boolean } | null }
  | { kind: 'remove-project'; project: Project }
  | { kind: 'calibrate' }
  | { kind: 'reset' };

/**
 * Settings (section 9): one page, five sections, a search field. Every setting has one line of help; nothing needs
 * JSON. Advanced is collapsed and never needed to get work done.
 */
@Component({
  selector: 'as-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, NgTemplateOutlet, TPipe, Dialog, ErrorLine, ConnectDialog, ModelPicker, FolderDialog],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class Settings {
  readonly app = inject(AppStore);
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18n);

  readonly section = input<string>('general');
  readonly projectParam = input<string | undefined>(undefined, { alias: 'project' });
  readonly add = input<string | undefined>();
  readonly connect = input<string | undefined>();
  readonly method = input<string | undefined>();
  readonly choose = input<string | undefined>();

  readonly sections = SECTIONS;
  readonly checkKinds = ['test', 'build', 'lint'] as const;
  readonly query = signal('');
  readonly advancedOpen = signal(false);
  readonly connecting = signal<{ provider: string | null; method?: string | null } | null>(null);
  readonly choosing = signal(false);
  readonly picking = signal(false);
  readonly confirm = signal<Confirm | null>(null);
  readonly failure = signal<ErrorInfo | null>(null);
  readonly busy = signal<string | null>(null);
  readonly chosenProject = signal<string | null>(null);
  readonly project = signal<ProjectSettingsDto | null>(null);
  readonly calibration = signal<{ qualified: boolean; problems: string[] } | null>(null);
  readonly exported = signal<{ name: string; path: string } | null>(null);
  readonly copied = signal(false);

  search = '';
  checks: Record<'test' | 'build' | 'lint', string> = { test: '', build: '', lint: '' };
  allowNew = '';
  protectNew = '';
  limitValue = '';

  readonly current = computed<Section>(() => (SECTIONS.includes(this.section() as Section) ? (this.section() as Section) : 'general'));
  readonly prefs = computed<Preferences | null>(() => this.app.preferences());
  readonly projectId = computed(() => {
    const wanted = this.chosenProject() ?? this.projectParam() ?? this.prefs()?.lastProject ?? null;
    const all = this.app.projects();
    return all.find(p => p.id === wanted)?.id ?? all.find(p => !p.demo)?.id ?? all[0]?.id ?? null;
  });

  /** The ids of the settings that match the search; null when nothing is searched. */
  readonly matches = computed<Set<string> | null>(() => {
    const q = this.query().trim().toLowerCase();
    this.i18n.lang();
    if (!q) return null;
    const out = new Set<string>();
    for (const s of SETTINGS) {
      const text = (this.i18n.t(`settings.${s.id}`) + ' ' + this.i18n.t(`settings.${s.id}.help`)).toLowerCase();
      if (text.includes(q)) out.add(s.id);
    }
    return out;
  });

  constructor() {
    effect(() => {
      const id = this.projectId();
      untracked(() => void this.loadProject(id));
    });
    effect(() => {
      const provider = this.connect();
      const add = this.add();
      const method = this.method();
      untracked(() => {
        if (provider) this.connecting.set({ provider, method: method ?? null });
        else if (add) this.connecting.set({ provider: null });
      });
    });
    effect(() => { if (this.choose()) untracked(() => this.choosing.set(true)); });
    effect(() => { if (this.current() === 'advanced') untracked(() => this.advancedOpen.set(true)); });
    effect(() => {
      const limit = this.prefs()?.limit;
      untracked(() => { this.limitValue = limit?.value ?? ''; });
    });
  }

  /** A section is shown when it is the chosen one, or when the search found something in it. */
  visible(section: Section): boolean {
    const m = this.matches();
    if (!m) return section === this.current();
    return SETTINGS.some(s => s.section === section && m.has(s.id));
  }

  show(id: string): boolean {
    const m = this.matches();
    return !m || m.has(id);
  }

  go(section: Section): void {
    this.search = '';
    this.query.set('');
    void this.router.navigate(['/settings', section], { queryParams: section === 'project' || section === 'permissions' ? { project: this.projectId() } : {} });
  }

  private async act<T>(name: string, work: () => Promise<T>): Promise<T | null> {
    this.busy.set(name);
    this.failure.set(null);
    try {
      return await work();
    } catch (e) {
      this.failure.set(errorInfo(e));
      return null;
    } finally {
      this.busy.set(null);
    }
  }

  set<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
    void this.act(String(key), () => this.app.setPreference(key, value));
  }

  // ------------------------------------------------------------------------------------------------ general

  async notify(on: boolean): Promise<void> {
    if (on && typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      let allowed = false;
      try { allowed = (await Notification.requestPermission()) === 'granted'; } catch { allowed = false; }
      if (!allowed) {
        // The switch stays off and the page says why; saving would wipe the reason.
        await this.act('notify', () => this.app.setPreference('notify', false));
        this.failure.set({ code: 'notifications_blocked', params: {} });
        return;
      }
    }
    this.set('notify', on);
  }

  // ------------------------------------------------------------------------------------------------ accounts

  initials(a: Account): string { return a.name.replace(/[^A-Za-zА-Яа-я0-9 ]/g, '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '··'; }

  describe(a: Account): string {
    switch (a.kind) {
      case 'oauth': return a.account ? this.i18n.t('account.signed_in_as', { account: a.account }) : this.i18n.t('account.signed_in');
      case 'key': return this.i18n.t(a.state === 'expired' ? 'account.expired' : 'account.key');
      case 'env': return this.i18n.t('account.from_env', { variable: a.variable ?? '' });
      case 'local': return this.i18n.t(a.reachable ? 'account.local' : 'account.local_off', { n: a.models ?? 0 });
      case 'custom': return a.baseUrl ?? '';
      default: return this.i18n.t('account.demo');
    }
  }

  async askRemove(account: Account): Promise<void> {
    this.confirm.set({ kind: 'remove-account', account, impact: null });
    try {
      const impact = await this.api.get<{ models: number; defaultModelAffected: boolean }>('/accounts/' + encodeURIComponent(account.id) + '/impact');
      if (this.confirm()?.kind === 'remove-account') this.confirm.set({ kind: 'remove-account', account, impact });
    } catch { /* the confirmation works without the numbers */ }
  }

  async use(account: Account, on: boolean): Promise<void> {
    await this.act('account', async () => {
      if (on) await this.api.post('/accounts', { provider: account.provider, method: account.kind === 'local' ? 'local' : 'env' });
      else await this.api.delete('/accounts/' + encodeURIComponent(account.id));
      await this.app.reloadAccounts();
    });
  }

  async connected(): Promise<void> {
    this.connecting.set(null);
    await this.app.reloadAccounts();
    void this.router.navigate([], { queryParams: {} });
  }

  closeConnect(): void {
    this.connecting.set(null);
    void this.router.navigate([], { queryParams: {} });
  }

  pickModel(m: UsableModel): void {
    this.picking.set(false);
    this.set('defaultModel', m.ref);
  }

  effort(e: Effort): void { this.set('defaultEffort', e); }

  mode(m: Mode): void { this.set('defaultMode', m); }

  @HostListener('document:click')
  closePicker(): void { this.picking.set(false); }

  // ------------------------------------------------------------------------------------------------ project

  private async loadProject(id: string | null): Promise<void> {
    if (!id) { this.project.set(null); return; }
    try {
      const p = await this.api.get<ProjectSettingsDto>('/projects/' + encodeURIComponent(id) + '/settings');
      if (this.projectId() !== id) return;
      this.project.set(p);
      this.checks = { test: p.checks.test.value, build: p.checks.build.value, lint: p.checks.lint.value };
    } catch (e) {
      this.failure.set(errorInfo(e));
    }
  }

  private async saveProject(patch: Record<string, unknown>): Promise<void> {
    const id = this.projectId();
    if (!id) return;
    const p = await this.act('project', () => this.api.put<ProjectSettingsDto>('/projects/' + encodeURIComponent(id) + '/settings', patch));
    if (p) {
      this.project.set(p);
      this.checks = { test: p.checks.test.value, build: p.checks.build.value, lint: p.checks.lint.value };
    }
  }

  /** A command equal to the detected one is not saved: it stays "detected" and follows the project. */
  saveChecks(): void {
    const p = this.project();
    if (!p) return;
    const checks: Record<string, string> = {};
    for (const k of ['test', 'build', 'lint'] as const) {
      const v = this.checks[k].trim();
      if (v && v !== (p.checks[k].detected ?? '')) checks[k] = v;
    }
    void this.saveProject({ checks });
  }

  checksChanged(): boolean {
    const p = this.project();
    return !!p && (['test', 'build', 'lint'] as const).some(k => this.checks[k].trim() !== p.checks[k].value);
  }

  instructions(on: boolean): void { void this.saveProject({ useInstructions: on }); }

  allow(): void {
    const v = this.allowNew.trim();
    const p = this.project();
    if (!v || !p) return;
    this.allowNew = '';
    void this.saveProject({ allowed: [...p.allowed.filter(a => a !== v), v] });
  }

  disallow(pattern: string): void {
    const p = this.project();
    if (p) void this.saveProject({ allowed: p.allowed.filter(a => a !== pattern) });
  }

  protect(): void {
    const v = this.protectNew.trim();
    const p = this.project();
    if (!v || !p) return;
    this.protectNew = '';
    void this.saveProject({ protectedFiles: [...p.protectedFiles.filter(a => a !== v), v] });
  }

  unprotect(path: string): void {
    const p = this.project();
    if (p) void this.saveProject({ protectedFiles: p.protectedFiles.filter(a => a !== path) });
  }

  protectDefault(): void { void this.saveProject({ protectedFiles: null }); }

  async opened(project: Project): Promise<void> {
    this.choosing.set(false);
    await this.app.reloadProjects();
    this.chosenProject.set(project.id);
    void this.router.navigate([], { queryParams: { project: project.id } });
  }

  // ------------------------------------------------------------------------------------------------ advanced

  limit(kind: 'auto' | 'tokens' | 'money'): void {
    if (kind === 'auto') { this.set('limit', { kind }); return; }
    const fallback = kind === 'tokens' ? '2000000' : '5';
    const value = this.prefs()?.limit.kind === kind && this.limitValue ? this.limitValue : fallback;
    this.limitValue = value;
    this.set('limit', { kind, value });
  }

  saveLimit(): void {
    const kind = this.prefs()?.limit.kind;
    const value = this.limitValue.trim().replace(',', '.');
    if (kind && kind !== 'auto' && value) this.set('limit', { kind, value });
  }

  async copyPath(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.app.host()?.dataDir ?? '');
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    } catch { /* the path stays selectable */ }
  }

  async export(): Promise<void> {
    const r = await this.act('export', () => this.api.post<{ name: string; path: string }>('/diagnostics/export', {}));
    if (r) this.exported.set(r);
  }

  download(name: string): string { return this.api.base + '/diagnostics/export/' + encodeURIComponent(name); }

  async confirmed(): Promise<void> {
    const c = this.confirm();
    if (!c) return;
    const done = await this.act('confirm', async () => {
      switch (c.kind) {
        case 'remove-account':
          await this.api.delete('/accounts/' + encodeURIComponent(c.account.id));
          await this.app.reloadAccounts();
          break;
        case 'remove-project':
          await this.api.delete('/projects/' + encodeURIComponent(c.project.id));
          await this.app.reloadProjects();
          this.chosenProject.set(null);
          if (!this.app.projects().length) void this.router.navigate(['/welcome']);
          break;
        case 'calibrate': {
          const r = await this.api.post<{ qualified: boolean; problems: string[] }>('/models/calibrate', { confirm: true });
          this.calibration.set(r);
          break;
        }
        case 'reset':
          await this.api.post('/preferences/reset', { confirm: true });
          await this.app.load();
          break;
      }
      return true;
    });
    if (done) this.confirm.set(null);
  }

  projectOf(id: string | null): Project | null { return this.app.project(id); }
}
