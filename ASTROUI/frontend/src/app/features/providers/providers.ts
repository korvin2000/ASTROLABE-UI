import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Api, StudioError } from '../../core/api';
import { StudioSocket } from '../../core/ws';
import { AppStore } from '../../state/app.store';
import { Provider } from '../../core/model';
import { Icon } from '../../ui/icon';
import { Glyph } from '../../ui/glyph';
import { dateTime, tokens } from '../../core/format';

/**
 * Providers, accounts, models and profiles (§18). A valid key, a catalog entry and a qualified profile are three
 * separate readiness checks. Secrets are write-only (R-PRV-01); states are the SDK's `AuthStatus` verbatim
 * (R-PRV-03); billable probes need an explicit confirmation naming provider and model (R-PRV-02).
 */
@Component({
  selector: 'as-providers',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, Glyph, RouterLink],
  template: `
    <div class="head">
      <as-icon name="plug" [size]="16" /><b>Providers & models</b>
      <span class="grow"></span>
      <button class="btn sm" (click)="refreshCatalog()"><as-icon name="refresh" [size]="13" /> Refresh catalog</button>
    </div>
    <div class="body">
      <aside class="list">
        <input class="input sm filter" placeholder="Filter providers" [value]="filter()" (input)="filter.set($any($event.target).value)" />
        @for (p of shown(); track p.id) {
          <a class="prov" [class.on]="p.id === providerId()" [routerLink]="['/providers', p.id]">
            <i class="dot" [class]="stateClass(p)"></i>
            <span class="ellipsis grow">{{ p.demo ? 'Studio demo (scripted)' : p.name }}</span>
            <span class="st mono">{{ p.demo ? 'demo' : p.auth.state === 'NOT_CONFIGURED' ? '' : p.auth.state.toLowerCase() }}</span>
          </a>
        }
      </aside>
      <div class="scroll main">
        @if (detail(); as p) {
          <section class="card card-pad">
            <div class="row"><b class="t">{{ p.demo ? 'Studio demo (scripted model)' : p.name }}</b><span class="chip mono">{{ p.id }}</span>
              <span class="chip" [class.ok]="p.auth.state === 'CONFIGURED'" [class.warn]="p.auth.state === 'EXPIRING'" [class.bad]="p.auth.state === 'EXPIRED' || p.auth.state === 'REFRESH_FAILED'">{{ p.auth.state }}</span>
              <span class="grow"></span>
              @if (p.apiKeyUrl) { <a class="btn sm ghost" [href]="p.apiKeyUrl" target="_blank" rel="noopener noreferrer"><as-icon name="external" [size]="13" /> Get a key</a> }
            </div>
            @if (p.demo) {
              <div class="banner warn small">Fixture mode: a scripted model answers through the real AI Gate adapter (FakeProvider). Campaigns on its profiles are labelled Demo data; they never call a network endpoint.</div>
            }
            <div class="kv">
              <span class="k">base URL</span><span class="v mono">{{ p.baseUrl }}</span>
              <span class="k">wire APIs</span><span class="v mono">{{ p.apis.join(', ') }}</span>
              <span class="k">auth methods</span><span class="v mono">{{ p.authMethods.join(', ') || (p.keyless ? 'keyless' : '—') }}</span>
              <span class="k">credential</span><span class="v mono">{{ p.auth.type ?? '—' }} · {{ p.auth.source ?? 'none' }}@if (p.auth.account) { · {{ p.auth.account }} }@if (p.auth.expiresAt) { · expires {{ when(p.auth.expiresAt) }} }</span>
              <span class="k">models</span><span class="v mono">{{ p.models }}</span>
            </div>
            @if (!p.demo && !p.keyless) {
              <div class="connect">
                <label class="small">API key (write-only; never shown again)</label>
                <div class="row">
                  <input class="input grow mono" type="password" autocomplete="off" [value]="apiKey()" (input)="apiKey.set($any($event.target).value)" placeholder="paste the key" />
                  <button class="btn primary" (click)="saveKey()" [disabled]="!apiKey().trim() || busy()">Save key</button>
                  @if (p.auth.state !== 'NOT_CONFIGURED') { <button class="btn danger" (click)="logout()">Log out</button> }
                </div>
                @if (p.authMethods.includes('OAUTH')) { <div class="small dim">OAuth sign-in (browser or device code) is available through the SDK; the Studio's login relay is not wired in this build — use an API key or an environment variable.</div> }
              </div>
            }
            <div class="test">
              <div class="row">
                <span class="micro">Connection test</span>
                <select class="select sm" [value]="testModel()" (change)="testModel.set($any($event.target).value)">
                  <option value="">first listed model</option>
                  @for (m of models(); track m.modelId) { <option [value]="m.modelId" [selected]="m.modelId === testModel()">{{ m.modelId }}</option> }
                </select>
                <button class="btn sm" (click)="test()" [disabled]="busy()">Run unbilled steps</button>
              </div>
              @if (report() ?? p.lastTest; as r) {
                <div class="steps">
                  @for (s of r.steps; track s.kind) {
                    <div class="step"><as-glyph [status]="s.status === 'PASSED' ? 'verified' : s.status === 'FAILED' ? 'failed' : s.status === 'NOT_SUPPORTED' ? 'unknown' : 'notrun'" [size]="11" />
                      <span class="mono">{{ s.kind }}</span><span class="mono small">{{ s.status }}</span><span class="small dim">{{ s.latencyMillis !== undefined ? s.latencyMillis + ' ms' : '' }}</span>
                      <span class="small ellipsis grow">{{ s.message }}{{ s.error ? ' — ' + s.error : '' }}</span></div>
                  }
                  <div class="small dim">NOT_SUPPORTED is not verified access. Billable probes (inference, usage, tools, cache) run only from profile qualification.</div>
                </div>
              }
            </div>
          </section>
          <section class="card">
            <div class="phead"><span class="micro">Models · {{ models().length }}</span><span class="grow"></span>
              <input class="input sm" placeholder="profile id" [value]="profileId()" (input)="profileId.set($any($event.target).value)" /></div>
            <table class="table">
              <thead><tr><th>Model</th><th>Context</th><th>Output</th><th>Price / M (in · out)</th><th>Source</th><th></th></tr></thead>
              <tbody>
                @for (m of models(); track m.modelId) {
                  <tr><td class="mono">{{ m.modelId }}<div class="small dim">{{ m.displayName }}</div></td>
                    <td class="mono">{{ tok(m.contextWindow) }}</td><td class="mono">{{ tok(m.maxOutputTokens) }}</td>
                    <td class="mono small">{{ price(m) }}</td><td class="small">{{ m.sourceKind }}</td>
                    <td><button class="btn sm" (click)="draft(m.modelId)" [disabled]="busy() || p.demo" title="AiGateProfiles.draft: a reviewable profile with limits, dated prices and the gate block">Draft profile</button></td></tr>
                } @empty { <tr><td colspan="6" class="dim small">No catalog models for this provider (some presets list none: name a model when drafting).</td></tr> }
              </tbody>
            </table>
          </section>
        } @else {
          <div class="empty"><as-icon name="plug" [size]="22" /><span>Select a provider to connect it, test it and draft profiles from its models.</span></div>
        }
        <section class="card">
          <div class="phead"><span class="micro">Profiles</span><span class="grow"></span>
            <span class="small dim">main: <b class="mono">{{ app.config()?.profileRoles?.main }}</b> · helper: <b class="mono">{{ app.config()?.profileRoles?.helper ?? 'none' }}</b></span>
            <a class="btn ghost sm" routerLink="/settings/models">Assign in Models &amp; routing</a></div>
          <table class="table">
            <thead><tr><th>Profile</th><th>Provider · model</th><th>Limits</th><th>State</th><th>Actions</th></tr></thead>
            <tbody>
              @for (pr of app.profiles(); track pr.id) {
                <tr>
                  <td class="mono">{{ pr.id }} @if (pr.demo) { <span class="chip">demo</span> }</td>
                  <td class="mono small">{{ pr.profile.provider }} · {{ pr.profile.model }}</td>
                  <td class="mono small">{{ tok(pr.profile.capabilities?.contextLimitTokens) }} ctx · {{ tok(pr.profile.capabilities?.outputLimitTokens) }} out</td>
                  <td><span class="chip" [class.ok]="pr.state.startsWith('qualified') || pr.state === 'validated'">{{ pr.state }}</span></td>
                  <td class="actions">
                    <button class="btn ghost sm" (click)="validateProfile(pr.id)">Validate</button>
                    @if (!pr.demo) {
                      <button class="btn ghost sm" (click)="edit(pr)">Edit</button>
                      <button class="btn ghost sm" (click)="qualify(pr)">Qualify…</button>
                      @if (pr.qualification?.proposal) { <button class="btn ghost sm" (click)="freeze(pr.id)">Freeze qualified</button> }
                      <button class="btn ghost sm" (click)="remove(pr.id)">Delete</button>
                    }
                  </td>
                </tr>
                @if (pr.qualification; as q) {
                  <tr><td colspan="5" class="small">Qualification {{ q.at }}: {{ q.qualified ? 'qualified' : 'not qualified' }} · problems {{ q.problems?.length ?? 0 }} · notes {{ q.notes?.length ?? 0 }}</td></tr>
                }
              }
            </tbody>
          </table>
          @if (editing(); as e) {
            <div class="editor">
              <div class="row"><b class="mono">{{ e.id }}</b><span class="grow"></span><span class="small dim">ASTROLABE Profile JSON · capability edits declare configuration; they do not prove the endpoint supports it</span></div>
              <textarea class="textarea mono" rows="16" [value]="editText()" (input)="editText.set($any($event.target).value)"></textarea>
              @if (editResult(); as r) { <div class="small" [class.bad]="r.violations?.length">violations {{ r.violations?.length ?? 0 }}: {{ (r.violations ?? []).join('; ') }} · warnings {{ (r.warnings ?? []).join('; ') }}</div> }
              <div class="row end"><button class="btn" (click)="editing.set(null)">Close</button><button class="btn primary" (click)="saveProfile()">Save and validate</button></div>
            </div>
          }
        </section>
      </div>
    </div>`,
  styles: [`
    :host{display:flex;flex-direction:column;height:100%;min-height:0}
    .head{display:flex;align-items:center;gap:10px;height:48px;padding:0 16px;border-bottom:1px solid var(--border-subtle);flex:none}
    .body{display:grid;grid-template-columns:260px minmax(0,1fr);flex:1;min-height:0}
    .list{border-right:1px solid var(--border-subtle);padding:10px 8px;overflow:auto}
    .filter{width:100%;margin-bottom:6px}
    .prov{display:flex;align-items:center;gap:8px;height:30px;padding:0 10px;border-radius:5px;color:var(--text-secondary);text-decoration:none}
    .prov:hover{background:var(--bg-hover);color:var(--text-primary);text-decoration:none}
    .prov.on{background:var(--bg-active);color:var(--text-primary)}
    .dot{width:7px;height:7px;border-radius:50%;background:var(--neutral-mark);flex:none}
    .dot.ok{background:var(--success)} .dot.warn{background:var(--attention)} .dot.bad{background:var(--danger)} .dot.demo{background:var(--accent)}
    .st{font-size:10.5px;color:var(--text-tertiary)}
    .main{padding:14px 20px 30px;display:flex;flex-direction:column;gap:12px}
    .t{font-size:15px}
    .kv{margin:10px 0}
    .connect,.test{margin-top:10px;display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--border-subtle);padding-top:10px}
    .steps{display:flex;flex-direction:column;gap:3px}
    .step{display:flex;align-items:center;gap:8px}
    .phead{display:flex;align-items:center;gap:8px;height:38px;padding:0 12px;border-bottom:1px solid var(--border-subtle)}
    .select.sm,.input.sm{height:26px}
    .small{font-size:12px}
    .actions{white-space:nowrap}
    .editor{padding:10px 12px;display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--border-subtle)}
    .end{justify-content:flex-end}
    .bad{color:var(--danger)}
  `],
})
export class ProvidersPage {
  readonly app = inject(AppStore);
  private readonly api = inject(Api);
  private readonly socket = inject(StudioSocket);
  private readonly router = inject(Router);
  readonly providerId = input<string | undefined>(undefined);
  readonly all = signal<Provider[]>([]);
  readonly detail = signal<Provider | null>(null);
  readonly models = signal<any[]>([]);
  readonly filter = signal('');
  readonly apiKey = signal('');
  readonly busy = signal(false);
  readonly report = signal<any>(null);
  readonly testModel = signal('');
  readonly profileId = signal('');
  readonly editing = signal<any>(null);
  readonly editText = signal('');
  readonly editResult = signal<any>(null);

  readonly shown = computed(() => {
    const q = this.filter().toLowerCase();
    return this.all().filter(p => !q || (p.name + p.id).toLowerCase().includes(q))
      .sort((a, b) => Number(b.demo) - Number(a.demo) || Number(b.auth.state !== 'NOT_CONFIGURED') - Number(a.auth.state !== 'NOT_CONFIGURED') || a.name.localeCompare(b.name));
  });

  constructor() {
    this.loadList();
    effect(() => {
      const id = this.providerId();
      this.report.set(null);
      this.apiKey.set('');
      if (!id) { this.detail.set(null); this.models.set([]); return; }
      this.loadDetail(id);
    });
  }

  async loadList(): Promise<void> { try { this.all.set(await this.api.get<Provider[]>('/providers')); } catch (e) { this.app.error(e, 'Providers'); } }

  async loadDetail(id: string): Promise<void> {
    try {
      this.detail.set(await this.api.get<Provider>('/providers/' + id));
      this.models.set(await this.api.get<any[]>('/models?provider=' + encodeURIComponent(id)));
      if (!this.profileId()) this.profileId.set(id.replace(/[^A-Za-z0-9._-]/g, '-') + '-main');
    } catch (e) { this.app.error(e, 'Provider'); }
  }

  stateClass(p: Provider): string {
    if (p.demo) return 'demo';
    return p.auth.state === 'CONFIGURED' ? 'ok' : p.auth.state === 'EXPIRING' ? 'warn' : p.auth.state === 'EXPIRED' || p.auth.state === 'REFRESH_FAILED' ? 'bad' : '';
  }

  async saveKey(): Promise<void> {
    const p = this.detail();
    if (!p) return;
    this.busy.set(true);
    try {
      this.detail.set(await this.api.post<Provider>(`/providers/${p.id}/credentials`, { apiKey: this.apiKey() }));
      this.apiKey.set('');
      this.app.toast('ok', 'Credential saved', `${p.name}: ${this.detail()?.auth.state}`);
      this.loadList();
      this.app.refresh();
    } catch (e) { this.app.error(e, 'Save key'); } finally { this.busy.set(false); }
  }

  async logout(): Promise<void> {
    const p = this.detail();
    if (!p || !confirm(`Log out of ${p.name}? Local credentials are removed.`)) return;
    try { await this.socket.command('provider.logout', { providerId: p.id }); this.loadDetail(p.id); this.loadList(); } catch (e) { this.app.error(e, 'Log out'); }
  }

  async test(): Promise<void> {
    const p = this.detail();
    if (!p) return;
    this.busy.set(true);
    try { this.report.set(await this.socket.command('provider.test', { providerId: p.id, modelId: this.testModel() || null })); } catch (e) { this.app.error(e, 'Test'); } finally { this.busy.set(false); }
  }

  async draft(modelId: string): Promise<void> {
    const p = this.detail();
    if (!p) return;
    this.busy.set(true);
    try {
      await this.socket.command('profile.draft', { providerId: p.id, modelId, profileId: this.profileId() || (p.id + '-' + modelId).replace(/[^A-Za-z0-9._-]/g, '-') });
      this.app.toast('ok', 'Profile drafted', 'Review it, then assign it in Settings › Models & routing.');
      await this.app.refresh();
    } catch (e) { this.app.error(e, 'Draft profile'); } finally { this.busy.set(false); }
  }

  async validateProfile(id: string): Promise<void> {
    try {
      const r: any = await this.api.post(`/profiles/${id}/validate`);
      this.app.toast(r.violations?.length ? 'bad' : 'ok', `${id}: ${r.state}`, r.violations?.length ? r.violations.join('; ') : (r.warnings?.length ? 'warnings: ' + r.warnings.join('; ') : 'no violations'));
      this.app.refresh();
    } catch (e) { this.app.error(e, 'Validate'); }
  }

  edit(pr: any): void { this.editing.set(pr); this.editText.set(JSON.stringify(pr.profile, null, 2)); this.editResult.set(null); }

  async saveProfile(): Promise<void> {
    const e = this.editing();
    if (!e) return;
    try {
      const profile = JSON.parse(this.editText());
      await this.api.put(`/profiles/${e.id}`, { profile });
      this.editResult.set(await this.api.post(`/profiles/${e.id}/validate`));
      this.app.refresh();
    } catch (err) { this.app.error(err, 'Save profile'); }
  }

  async qualify(pr: any): Promise<void> {
    if (!confirm(`Qualification is billable: it makes 3–5 short calls to ${pr.profile.provider} / ${pr.profile.model}. Continue?`)) return;
    this.busy.set(true);
    try {
      const r: any = await this.socket.command('profile.qualify', { profileId: pr.id }, {}, {}, true);
      this.app.toast(r.qualified ? 'ok' : 'warn', `Qualification ${r.qualified ? 'passed' : 'found problems'}`, (r.problems ?? []).join('; '));
      this.app.refresh();
    } catch (e) { this.app.error(e, 'Qualify'); } finally { this.busy.set(false); }
  }

  async freeze(id: string): Promise<void> {
    try { await this.socket.command('profile.freeze', { profileId: id }); this.app.refresh(); } catch (e) { this.app.error(e, 'Freeze'); }
  }

  async remove(id: string): Promise<void> {
    if (!confirm(`Delete profile ${id}? Running attempts keep their frozen copy.`)) return;
    try { await this.api.delete('/profiles/' + id); this.app.refresh(); } catch (e) { this.app.error(e, 'Delete'); }
  }

  async refreshCatalog(): Promise<void> {
    try { await this.api.post('/models/refresh'); this.app.toast('ok', 'Catalog refreshed'); const id = this.providerId(); if (id) this.loadDetail(id); } catch (e) { this.app.error(e, 'Catalog'); }
  }

  tok(n: number | undefined): string { return n ? tokens(n) : '—'; }
  price(m: any): string {
    const p = m.prices ?? m.price;
    if (!p) return 'unknown';
    const i = p.input ?? p.inputPerMillion, o = p.output ?? p.outputPerMillion;
    return (i ?? '?') + ' · ' + (o ?? '?') + ' ' + (p.currency ?? 'USD');
  }
  when(iso: string): string { return dateTime(iso); }
}
