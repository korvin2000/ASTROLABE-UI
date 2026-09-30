import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Api, StudioError } from '../core/api';
import { Account, AppItem, AppSnapshot, Host, LoginSession, Preferences, Project, Task, UsableModel } from '../core/model';
import { StudioSocket } from '../core/ws';
import { I18n } from '../i18n/i18n';

/** The language of the browser decides the language of the app: Russian when it is Russian, else English. */
export function language(): 'en' | 'ru' {
  const wanted = typeof navigator !== 'undefined' ? navigator.language || '' : '';
  return wanted.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

export interface Toast { id: number; text: string; tone: 'info' | 'ok' | 'bad'; taskId?: string; }

/**
 * What the whole app shares (Studio 2 section 13): accounts, the default model, preferences, projects and the task
 * list, loaded once from `/app` and kept current by the `app` topic.
 */
@Injectable({ providedIn: 'root' })
export class AppStore {
  private readonly api = inject(Api);
  private readonly socket = inject(StudioSocket);
  private readonly i18n = inject(I18n);

  readonly ready = signal(false);
  readonly unauthorized = signal(false);
  readonly fatal = signal<string | null>(null);

  readonly accounts = signal<Account[]>([]);
  readonly models = signal<UsableModel[]>([]);
  readonly preferences = signal<Preferences | null>(null);
  readonly projects = signal<Project[]>([]);
  readonly tasks = signal<Task[]>([]);
  readonly host = signal<Host | null>(null);
  readonly login = signal<LoginSession | null>(null);
  readonly toasts = signal<Toast[]>([]);

  readonly usableAccounts = computed(() => this.accounts().filter(a => a.usable));
  readonly hasModel = computed(() => this.usableAccounts().length > 0 && this.models().length > 0);
  readonly defaultModel = computed<UsableModel | null>(() => {
    const ref = this.preferences()?.defaultModel;
    const all = this.models();
    return all.find(m => m.ref === ref) ?? all.find(m => m.recommended) ?? all[0] ?? null;
  });
  /** Tasks that wait for the user, oldest first (section 4.2 "Needs you"). */
  readonly needsYou = computed(() => this.tasks().filter(t => t.state === 'needs_you').sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)));
  readonly visibleProjects = computed(() => this.projects());

  private toastId = 0;
  private starting: Promise<void> | null = null;
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // The backend may have restarted while the connection was away: tasks that worked are paused now (section 7.6).
    effect(() => {
      if (this.socket.reconnects() > 0) untracked(() => void this.load());
    });
  }

  /** Loads the app once; every caller waits for the same load (the route guards among them). */
  init(): Promise<void> {
    this.starting ??= this.load().then(() => {
      if (!this.unauthorized() && !this.fatal()) this.socket.connect();
    });
    return this.starting;
  }

  async load(): Promise<void> {
    try {
      const snapshot = await this.api.get<AppSnapshot>('/app');
      this.accounts.set(snapshot.accounts);
      this.preferences.set(snapshot.preferences);
      this.projects.set(snapshot.projects);
      this.tasks.set(snapshot.tasks);
      this.host.set(snapshot.host);
      this.i18n.use(language());
      this.applyTheme(snapshot.preferences.theme);
      await this.loadModels();
      if (!this.ready()) this.socket.subscribe('app', item => this.onApp(item as AppItem), snapshot.appSeq);
      this.ready.set(true);
      this.fatal.set(null);
    } catch (e) {
      if (e instanceof StudioError && e.status === 401) this.unauthorized.set(true);
      else this.fatal.set(e instanceof Error ? e.message : String(e));
    }
  }

  async loadModels(): Promise<void> {
    try {
      this.models.set(await this.api.get<UsableModel[]>('/models/usable'));
    } catch {
      this.models.set([]);
    }
  }

  async reloadAccounts(): Promise<void> {
    const [accounts, preferences] = await Promise.all([this.api.get<Account[]>('/accounts'), this.api.get<Preferences>('/preferences')]);
    this.accounts.set(accounts);
    this.preferences.set(preferences);
    await this.loadModels();
  }

  async reloadProjects(): Promise<void> {
    this.projects.set(await this.api.get<Project[]>('/projects'));
  }

  private reloadSoon(): void {
    if (this.reloadTimer) return;
    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = null;
      void this.reloadAccounts();
    }, 150);
  }

  private onApp(item: AppItem): void {
    const d = item.data ?? {};
    switch (item.kind) {
      case 'task.updated':
        this.upsert(d as unknown as Task);
        break;
      case 'task.deleted':
        this.tasks.update(list => list.filter(t => t.id !== d['id']));
        break;
      case 'accounts.changed':
        this.reloadSoon();
        break;
      case 'preferences.changed': {
        const p = d as unknown as Preferences;
        this.preferences.set(p);
        this.applyTheme(p.theme);
        break;
      }
      case 'project.changed':
        void this.reloadProjects().then(() => this.reloadSoon());
        break;
      case 'auth.login.updated': {
        const session = d as unknown as LoginSession;
        if (this.login()?.loginId === session.loginId) this.login.set(session);
        break;
      }
      case 'notification':
        this.notify(String(d['kind'] ?? ''), String(d['taskId'] ?? ''), String(d['title'] ?? ''));
        break;
    }
  }

  upsert(task: Task): void {
    this.tasks.update(list => {
      const i = list.findIndex(t => t.id === task.id);
      if (i < 0) return [task, ...list];
      const next = list.slice();
      next[i] = { ...list[i], ...task };
      return next;
    });
  }

  task(id: string | null | undefined): Task | null { return this.tasks().find(t => t.id === id) ?? null; }

  project(id: string | null | undefined): Project | null { return this.projects().find(p => p.id === id) ?? null; }

  // ------------------------------------------------------------------------------------------------ preferences

  async setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]): Promise<void> {
    const before = this.preferences();
    if (before) this.preferences.set({ ...before, [key]: value });
    if (key === 'theme') this.applyTheme(value as Preferences['theme']);
    try {
      this.preferences.set(await this.api.put<Preferences>('/preferences', { [key]: value }));
      if (key === 'demoMode') await this.load();
    } catch (e) {
      this.preferences.set(before);
      throw e;
    }
  }

  applyTheme(theme: Preferences['theme'] | undefined): void {
    const chosen = theme ?? 'system';
    try { localStorage.setItem('studio.theme', chosen); } catch { /* storage may be unavailable */ }
    const dark = chosen === 'dark' || (chosen === 'system' && typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }

  // ------------------------------------------------------------------------------------------------ notifications

  toast(text: string, tone: Toast['tone'] = 'info', taskId?: string): void {
    const id = ++this.toastId;
    this.toasts.update(list => [...list, { id, text, tone, taskId }]);
    setTimeout(() => this.dismiss(id), 6000);
  }

  dismiss(id: number): void { this.toasts.update(list => list.filter(t => t.id !== id)); }

  /** A task needs the user or finished: a desktop notification when the user allowed it and looks elsewhere. */
  private notify(kind: string, taskId: string, title: string): void {
    const key = kind === 'task.done' ? 'notify.done' : kind === 'task.failed' ? 'notify.failed' : 'notify.paused';
    const text = this.i18n.t(key, { title });
    if (document.hidden && this.preferences()?.notify && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        const n = new Notification('ASTROLABE', { body: text, tag: taskId });
        n.onclick = () => { window.focus(); location.assign('/t/' + encodeURIComponent(taskId)); };
      } catch { /* a blocked notification is not an error */ }
    }
  }

  /** "Needs you": the desktop notification of a card that waits (section 7.5). */
  notifyNeedsYou(task: Task): void {
    if (!document.hidden || !this.preferences()?.notify || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try {
      const n = new Notification('ASTROLABE', { body: this.i18n.t('notify.needs_you', { title: task.title }), tag: task.id });
      n.onclick = () => { window.focus(); location.assign('/t/' + encodeURIComponent(task.id)); };
    } catch { /* a blocked notification is not an error */ }
  }
}
