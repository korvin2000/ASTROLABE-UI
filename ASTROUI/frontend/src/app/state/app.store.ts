import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Api, StudioError } from '../core/api';
import { StudioSocket } from '../core/ws';
import { AppItem, Bootstrap, CampaignSummary, DecisionDto, HostInfo, ProfileDto, Project, Provider } from '../core/model';

export interface Toast { id: number; tone: 'ok' | 'bad' | 'warn' | 'neutral'; title: string; body?: string; action?: { label: string; run: () => void }; }

/**
 * The application store (§32.2 `state/app`): bootstrap snapshot + the `app` topic (decisions, campaign index
 * changes, projects, providers, settings, notifications). The decisions store here is the single source for the
 * inbox, inline cards and badges (§32.3 rule 5).
 */
@Injectable({ providedIn: 'root' })
export class AppStore {
  private readonly api = inject(Api);
  private readonly socket = inject(StudioSocket);
  private readonly router = inject(Router);

  readonly ready = signal(false);
  readonly unauthorized = signal(false);
  readonly fatal = signal<string | null>(null);
  readonly host = signal<HostInfo | null>(null);
  readonly projects = signal<Project[]>([]);
  readonly campaignMap = signal<Map<string, CampaignSummary>>(new Map());
  readonly decisionMap = signal<Map<string, DecisionDto>>(new Map());
  readonly providers = signal<Provider[]>([]);
  readonly profiles = signal<ProfileDto[]>([]);
  readonly runtime = signal<any>({});
  readonly config = signal<Bootstrap['config'] | null>(null);
  readonly settingsRevision = signal(0);
  readonly toasts = signal<Toast[]>([]);
  readonly activityCount = signal(0);
  readonly lastOpenedWork = signal<string | null>(localStorage.getItem('studio.lastWork'));

  readonly campaigns = computed(() => [...this.campaignMap().values()].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt.localeCompare(a.updatedAt)));
  readonly pendingDecisions = computed(() => [...this.decisionMap().values()].filter(d => d.status === 'pending').sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  readonly resolvedDecisions = computed(() => [...this.decisionMap().values()].filter(d => d.status !== 'pending').sort((a, b) => (b.answeredAt ?? b.createdAt).localeCompare(a.answeredAt ?? a.createdAt)));
  readonly liveCount = computed(() => this.campaigns().filter(c => c.live).length);
  readonly demoMode = computed(() => {
    const main = this.config()?.profileRoles?.main;
    const p = this.profiles().find(x => x.id === main);
    return !!p?.demo;
  });

  private toastId = 0;

  async init(): Promise<void> {
    try {
      const b = await this.api.get<Bootstrap>('/bootstrap');
      this.applyBootstrap(b);
      this.ready.set(true);
      this.socket.connect();
      this.socket.subscribe('app', (item: AppItem) => this.onApp(item), b.appSeq ?? 0);
      if ('Notification' in window && Notification.permission === 'default') {
        // Asked lazily on the first decision instead of at load.
      }
    } catch (e) {
      if (e instanceof StudioError && e.status === 401) this.unauthorized.set(true);
      else this.fatal.set(e instanceof Error ? e.message : String(e));
    }
  }

  private applyBootstrap(b: Bootstrap): void {
    this.host.set(b.host);
    this.projects.set(b.projects);
    this.campaignMap.set(new Map(b.campaigns.map(c => [c.workId, c])));
    const dm = new Map(this.decisionMap());
    for (const d of b.decisions) dm.set(d.id, d);
    this.decisionMap.set(dm);
    this.providers.set(b.providers);
    this.profiles.set(b.profiles);
    this.runtime.set(b.runtime);
    this.config.set(b.config);
    this.settingsRevision.set(b.settingsRevision);
  }

  /** Re-reads the bootstrap snapshot (after a reconnect, settings or provider changes). */
  async refresh(): Promise<void> {
    try {
      this.applyBootstrap(await this.api.get<Bootstrap>('/bootstrap'));
    } catch { /* keep the last snapshot; the banner shows staleness */ }
  }

  private onApp(item: AppItem): void {
    const d = item.data;
    switch (item.kind) {
      case 'campaign.changed':
        if (d?.workId) {
          const m = new Map(this.campaignMap());
          m.set(d.workId, d);
          this.campaignMap.set(m);
        }
        break;
      case 'decision.requested':
      case 'decision.resolved': {
        const m = new Map(this.decisionMap());
        m.set(d.id, d);
        this.decisionMap.set(m);
        if (item.kind === 'decision.requested') this.notifyDecision(d);
        const w = d.workId && this.campaignMap().get(d.workId);
        if (w) this.refreshCampaign(d.workId);
        break;
      }
      case 'project.changed':
        this.api.get<Project[]>('/projects').then(p => this.projects.set(p)).catch(() => {});
        break;
      case 'settings.changed':
      case 'provider.changed':
      case 'profiles.changed':
      case 'catalog.refreshed':
        this.refresh();
        break;
      case 'activity.changed':
        this.activityCount.set(d?.inFlight ?? 0);
        break;
      case 'notification':
        this.toast(d.kind === 'campaign.finished' && /completed/.test(d.title) ? 'ok' : 'neutral', d.title, d.body,
          d.workId ? { label: 'Open', run: () => this.router.navigate(['/p', d.projectId, 'c', d.workId]) } : undefined);
        this.osNotify(d.title, d.body, d.projectId && d.workId ? `/p/${d.projectId}/c/${d.workId}` : null);
        break;
    }
  }

  async refreshCampaign(work: string): Promise<void> {
    try {
      const s = await this.api.get<CampaignSummary>('/campaigns/' + work);
      const m = new Map(this.campaignMap());
      m.set(work, s);
      this.campaignMap.set(m);
    } catch { /* ignore */ }
  }

  campaign(work: string | null | undefined): CampaignSummary | undefined {
    return work ? this.campaignMap().get(work) : undefined;
  }

  project(id: string | null | undefined): Project | undefined {
    return id ? this.projects().find(p => p.id === id) : undefined;
  }

  projectCampaigns(projectId: string): CampaignSummary[] {
    return this.campaigns().filter(c => c.projectId === projectId && !c.archived);
  }

  decisionsFor(work: string): DecisionDto[] {
    return this.pendingDecisions().filter(d => d.workId === work);
  }

  rememberWork(work: string): void {
    this.lastOpenedWork.set(work);
    try { localStorage.setItem('studio.lastWork', work); } catch { /* storage unavailable */ }
  }

  // ---- notifications ------------------------------------------------------------------------------------------

  toast(tone: Toast['tone'], title: string, body?: string, action?: Toast['action']): void {
    const id = ++this.toastId;
    this.toasts.update(t => [...t.slice(-2), { id, tone, title, body, action }]);
    setTimeout(() => this.dismissToast(id), tone === 'bad' ? 9000 : 5000);
  }

  dismissToast(id: number): void {
    this.toasts.update(t => t.filter(x => x.id !== id));
  }

  error(e: unknown, context?: string): void {
    const msg = e instanceof StudioError ? e.error.message : e instanceof Error ? e.message : String(e);
    const code = e instanceof StudioError ? e.error.code : '';
    this.toast('bad', (context ? context + ' · ' : '') + (code ? code.replace(/_/g, ' ') : 'error'), msg);
  }

  private notifyDecision(d: DecisionDto): void {
    const title = 'Needs you · ' + decisionTitle(d.kind);
    const body = decisionSummary(d);
    this.osNotify(title, body, d.projectId && d.workId ? `/p/${d.projectId}/c/${d.workId}` : '/inbox');
  }

  private osNotify(title: string, body: string | undefined, url: string | null): void {
    const prefs = readPrefs();
    if (prefs.notifications === false) return;
    if (!('Notification' in window) || document.hasFocus()) return;
    const show = () => {
      try {
        const n = new Notification(title, { body: body ?? '', tag: url ?? title });
        n.onclick = () => { window.focus(); if (url) this.router.navigateByUrl(url); n.close(); };
      } catch { /* not allowed */ }
    };
    if (Notification.permission === 'granted') show();
    else if (Notification.permission === 'default') Notification.requestPermission().then(p => { if (p === 'granted') show(); });
  }
}

export function decisionTitle(kind: string): string {
  switch (kind) {
    case 'question': return 'Question';
    case 'effect': return 'Effect approval · D-class';
    case 'publication': return 'Publication stage';
    case 'plan_acceptance': return 'Plan review';
    case 'amendment': return 'Contract amendment';
    case 'kb_admission': return 'Knowledge admission';
    case 'review': return 'Human review';
    default: return kind.replace(/_/g, ' ');
  }
}

export function decisionSummary(d: DecisionDto): string {
  const r = d.request ?? {};
  switch (d.kind) {
    case 'question': return r.text ?? '';
    case 'effect':
    case 'publication': return (r.argv ?? []).join(' ') || r.action || '';
    case 'review': return 'Review ' + (r.scope?.type ?? r.scope ?? '') + ' · ' + (r.criteria?.length ?? 0) + ' criteria';
    default: return r.change ?? r.reason ?? '';
  }
}

export interface Prefs { theme: 'system' | 'dark' | 'light'; density: 'compact' | 'comfortable'; motion: 'full' | 'calm' | 'off'; notifications: boolean; sendKey: 'mod-enter' | 'enter'; }

export function readPrefs(): Prefs {
  try {
    return { theme: 'system', density: 'compact', motion: 'full', notifications: true, sendKey: 'mod-enter', ...JSON.parse(localStorage.getItem('studio.prefs') || '{}') };
  } catch {
    return { theme: 'system', density: 'compact', motion: 'full', notifications: true, sendKey: 'mod-enter' };
  }
}

export function writePrefs(p: Prefs): void {
  try { localStorage.setItem('studio.prefs', JSON.stringify(p)); } catch { /* ignore */ }
  const root = document.documentElement;
  const theme = p.theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : p.theme;
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-density', p.density);
  root.setAttribute('data-motion', p.motion);
}
