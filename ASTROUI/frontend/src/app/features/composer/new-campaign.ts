import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AppStore, readPrefs } from '../../state/app.store';
import { StudioSocket } from '../../core/ws';
import { Api, StudioError } from '../../core/api';
import { Icon } from '../../ui/icon';
import { Glyph } from '../../ui/glyph';
import { clock, countdown, tokens } from '../../core/format';

const DEMO_REQUEST = 'Fix apply_discount in src/shop/pricing.py: treat the discount as a percentage and never return a negative total. Keep cart_total\'s signature unchanged.';
const DEMO_INTERACTIVE = 'Fix apply_discount in src/shop/pricing.py so discounts are percentages and totals never go negative. Ask me how totals should be rounded, and check CI workflows under .github before editing.';

/**
 * New campaign (§7.1 intent "New campaign", §7.2 anatomy): request, mode, budget, ceiling, D-class, effort, hints
 * annex (labelled "hints — the harness decides", G-06/OD-11) and a debounced preflight that disables Start with the
 * reason (R-CMP-05).
 */
@Component({
  selector: 'as-new-campaign',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, Glyph, RouterLink],
  template: `
    <div class="page scroll">
      <div class="wrap">
        <h1 class="h-page">New campaign</h1>
        <p class="meta lead">A campaign turns your request into a versioned contract, plans increments and accepts work only on evidence.
          Later messages are amendments or answers, never free chat.</p>

        <div class="field">
          <label class="micro">Project</label>
          <div class="row">
            <select class="select grow" [value]="projectId()" (change)="projectId.set($any($event.target).value)">
              @for (p of app.projects(); track p.id) { <option [value]="p.id" [selected]="p.id === projectId()">{{ p.name }}{{ p.demo ? ' (demo)' : '' }} — {{ p.path }}</option> }
            </select>
          </div>
        </div>

        <div class="composer">
          <textarea class="area" rows="6" [value]="request()" (input)="request.set($any($event.target).value)" (keydown)="key($event)"
            placeholder="Describe the change you want. Be specific about the files, behaviour and what must stay unchanged." aria-label="Request"></textarea>
          @if (project()?.demo && !request()) {
            <div class="demos">
              <button class="btn sm ghost" (click)="request.set(demoRequest)"><as-icon name="sparkle" [size]="13" /> Demo: local fix (S0)</button>
              <button class="btn sm ghost" (click)="request.set(demoInteractive); mode.set('Interactive')"><as-icon name="flag" [size]="13" /> Demo: interactive — a question and an approval</button>
            </div>
          }
          <div class="opts">
            <label>Mode
              <select class="select" [value]="mode()" (change)="mode.set($any($event.target).value)">
                <option value="Interactive">Interactive</option><option value="Autonomous">Autonomous</option>
              </select></label>
            <label>Budget
              <input class="input num" type="number" min="1000" step="1000" [value]="tokensBudget() ?? ''" (input)="tokensBudget.set(+$any($event.target).value || null)" [placeholder]="defaultBudget()" /> tok</label>
            <label>Ceiling
              <select class="select" [value]="ceiling()" (change)="ceiling.set($any($event.target).value)">
                @for (s of stages; track s) { <option [value]="s" [selected]="s === ceiling()">{{ s }}</option> }
              </select></label>
            <label>D-class
              <select class="select" [value]="dClass()" (change)="dClass.set($any($event.target).value)"><option value="Ask">Ask</option><option value="Deny">Deny</option></select></label>
            <label>Effort
              <select class="select" [value]="effort()" (change)="effort.set($any($event.target).value)">
                @for (e of efforts; track e) { <option [value]="e" [selected]="e === effort()">{{ e }}</option> }
              </select></label>
            <label class="check"><input type="checkbox" [checked]="resumeExpected()" (change)="resumeExpected.set($any($event.target).checked)" /> resume expected</label>
            <span class="grow"></span>
            <button class="btn ghost sm" (click)="hintsOpen.set(!hintsOpen())"><as-icon [name]="hintsOpen() ? 'chevron-up' : 'chevron-down'" [size]="13" /> Hints</button>
          </div>
          @if (hintsOpen()) {
            <div class="hints">
              <div class="banner info small"><as-icon name="info" [size]="13" /> Hints are appended as a labelled annex the plan cell reads — <b>hints, not contract items</b>. The harness decides; in interactive S1+ campaigns acceptance proposals come back as Plan review decisions.</div>
              <label>Acceptance (one per line: <span class="mono">run: &lt;command&gt;</span> or <span class="mono">check: &lt;statement&gt;</span>)
                <textarea class="textarea mono" rows="2" [value]="acceptance()" (input)="acceptance.set($any($event.target).value)"></textarea></label>
              <label>Constraints (one per line)<textarea class="textarea" rows="2" [value]="constraints()" (input)="constraints.set($any($event.target).value)"></textarea></label>
              <div class="row">
                <label class="grow">Write scope<input class="input mono" placeholder="src/, tests/" [value]="writeScope()" (input)="writeScope.set($any($event.target).value)" /></label>
                <label class="grow">Protected<input class="input mono" placeholder="migrations/" [value]="protectedScope()" (input)="protectedScope.set($any($event.target).value)" /></label>
              </div>
            </div>
          }
          <div class="pre">
            @for (p of preflight(); track p.text) {
              <span class="pf" [class]="p.tone"><as-glyph [status]="p.tone === 'ok' ? 'verified' : p.tone === 'bad' ? 'failed' : 'stale'" [size]="11" /> {{ p.text }}</span>
            }
            <span class="grow"></span>
            <kbd>{{ sendKey }}</kbd>
            <button class="btn primary" (click)="start()" [disabled]="!canStart()"><as-icon name="play" [size]="13" /> {{ busy() ? 'Opening…' : 'Start campaign' }}</button>
          </div>
          @if (error()) { <div class="banner bad small err"><as-icon name="alert" [size]="14" /> <span>{{ error() }}</span></div> }
        </div>

        @if (opening()) {
          <div class="opening card card-pad">
            <div class="micro">Opening</div>
            @for (s of openSteps; track s) { <div class="row small"><as-glyph status="opening" /> {{ s }}</div> }
          </div>
        }
        @if (demoMode()) {
          <div class="banner warn small"><as-icon name="alert" [size]="14" /> Demo data: the main routing function is served by the scripted demo model (fixture mode).
            <a routerLink="/providers">Connect a provider</a> and assign a real profile in <a routerLink="/settings/models">Settings › Models &amp; routing</a> to run on a real LLM.</div>
        }
      </div>
    </div>`,
  styles: [`
    :host{display:flex;flex-direction:column;height:100%;min-height:0}
    .page{flex:1}
    .wrap{max-width:900px;margin:0 auto;padding:28px 24px 60px;display:flex;flex-direction:column;flex-wrap:nowrap;gap:14px}
    .lead{margin:0}
    .field{display:flex;flex-direction:column;gap:6px}
    .composer{border:1px solid var(--border-default);border-radius:var(--r-drawer);background:var(--bg-surface);overflow:hidden}
    .composer:focus-within{border-color:var(--border-strong);box-shadow:0 0 0 3px var(--accent-faint)}
    .area{width:100%;border:0;outline:none;resize:vertical;background:transparent;font-size:14px;line-height:22px;padding:12px 14px;min-height:130px}
    .demos{display:flex;gap:6px;margin:0 10px 6px;flex-wrap:wrap}
    .opts{display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:8px 12px;border-top:1px solid var(--border-subtle);font-size:12px;color:var(--text-secondary)}
    .opts label{display:flex;align-items:center;gap:6px}
    .opts .select,.opts .input{height:26px;font-size:12px}
    .num{width:110px}
    .hints{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border-top:1px solid var(--border-subtle);font-size:12px;color:var(--text-secondary)}
    .hints label{display:flex;flex-direction:column;gap:4px}
    .pre{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:8px 12px;border-top:1px solid var(--border-subtle);font-size:12px}
    .pf{display:inline-flex;align-items:center;gap:5px;color:var(--text-secondary)}
    .pf.bad{color:var(--danger)} .pf.warn{color:var(--attention)}
    .err{margin:0 12px 12px}
    .small{font-size:12px}
    .opening{display:flex;flex-direction:column;gap:6px}
  `],
})
export class NewCampaignPage {
  readonly app = inject(AppStore);
  private readonly socket = inject(StudioSocket);
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  readonly project = computed(() => this.app.project(this.projectId()));
  readonly projectParam = input<string | undefined>(undefined, { alias: 'project' });
  readonly fromParam = input<string | undefined>(undefined, { alias: 'from' });

  readonly projectId = signal('');
  readonly request = signal('');
  readonly mode = signal('Interactive');
  readonly tokensBudget = signal<number | null>(null);
  readonly ceiling = signal('Patch');
  readonly dClass = signal('Ask');
  readonly effort = signal('Medium');
  readonly resumeExpected = signal(false);
  readonly hintsOpen = signal(false);
  readonly acceptance = signal('');
  readonly constraints = signal('');
  readonly writeScope = signal('');
  readonly protectedScope = signal('');
  readonly busy = signal(false);
  readonly opening = signal(false);
  readonly error = signal<string | null>(null);
  readonly health = signal<any>(null);
  readonly stages = ['Patch', 'LocalCommit', 'Push', 'Merge', 'Deploy'];
  readonly efforts = ['Minimal', 'Low', 'Medium', 'High'];
  readonly openSteps = ['freeze attempt configuration', 'snapshot 0 (pre-existing changes)', 'derive and store the contract', 'reconcile unknown outcomes', 'take the workspace lease', 'select the shape'];
  readonly demoRequest = DEMO_REQUEST;
  readonly demoInteractive = DEMO_INTERACTIVE;
  readonly sendKey = readPrefs().sendKey === 'enter' ? '⏎' : 'Ctrl ⏎';
  readonly demoMode = this.app.demoMode;

  readonly defaultBudget = computed(() => {
    const cfg = this.app.config();
    const main = this.app.profiles().find(p => p.id === cfg?.profileRoles?.main);
    const ctx = main?.profile?.capabilities?.contextLimitTokens;
    return ctx && cfg ? tokens(ctx * cfg.campaignCells) + ' (default)' : 'default';
  });

  readonly preflight = computed(() => {
    const out: { text: string; tone: 'ok' | 'bad' | 'warn' }[] = [];
    const p = this.project();
    if (!p) { out.push({ text: 'choose a project', tone: 'bad' }); return out; }
    if (!p.exists) out.push({ text: 'repository missing', tone: 'bad' });
    else if (!p.open) out.push({ text: 'project not open (locked by another process?)', tone: 'warn' });
    else out.push({ text: 'lock free', tone: 'ok' });
    if (p.runningWork) out.push({ text: 'a campaign already runs in this project', tone: 'bad' });
    const cfg = this.app.config();
    const main = this.app.profiles().find(x => x.id === cfg?.profileRoles?.main);
    if (!main) out.push({ text: `no profile '${cfg?.profileRoles?.main}' for the main function`, tone: 'bad' });
    else if (main.demo) out.push({ text: 'profiles ok (demo)', tone: 'warn' });
    else {
      const prov = this.app.providers().find(x => x.id === main.profile?.provider);
      out.push(prov && prov.auth.state !== 'NOT_CONFIGURED' ? { text: `profile ${main.id} · ${prov.id} ${prov.auth.state.toLowerCase()}`, tone: 'ok' } : { text: `provider ${main.profile?.provider} not authenticated`, tone: 'bad' });
    }
    const h = this.health();
    for (const l of h?.leases ?? []) {
      if (l.live && !l.ours) out.push({ text: `workspace ${l.workspace} leased to ${l.holder} (an earlier Studio process) until ${clock(l.expiry)} (in ${countdown(l.expiry)}) — ASTROLABE refuses a new controller until then (§13.1)`, tone: 'bad' });
    }
    if (h?.dirty) {
      const n = (h.dirty.modified ?? 0) + (h.dirty.untracked ?? 0);
      out.push({ text: n ? `snapshot 0 will record ${n} pre-existing change${n === 1 ? '' : 's'}` : 'clean working tree', tone: n ? 'warn' : 'ok' });
    }
    return out;
  });

  readonly canStart = computed(() => !this.busy() && this.request().trim().length > 0 && !this.preflight().some(p => p.tone === 'bad'));

  constructor() {
    effect(() => {
      const param = this.projectParam();
      const list = this.app.projects();
      if (!this.projectId() && list.length) this.projectId.set(param && list.some(p => p.id === param) ? param : list[0].id);
    });
    effect(() => {
      const id = this.projectId();
      if (!id) return;
      this.api.get(`/projects/${id}/health`).then(h => this.health.set(h)).catch(() => this.health.set(null));
      let draft: string | null = null;
      try { draft = localStorage.getItem('studio.followup.' + id); } catch { /* ignore */ }
      if (draft && !this.request()) this.request.set(draft);
    });
    effect(() => {
      const from = this.fromParam();
      if (!from) return;
      this.api.get<any>(`/campaigns/${from}/contract`).then(c => {
        const reqs: any[] = c?.requests ?? [];
        const text = reqs.map(r => r.body?.text).filter(Boolean).join('\n\n');
        if (text && !this.request()) this.request.set(text + `\n\n(New campaign from ${from}.)`);
      }).catch(() => {});
    });
    const cfg = this.app.config();
    if (cfg) { this.mode.set(cfg.mode); this.ceiling.set(cfg.ceiling); this.dClass.set(cfg.dClass); }
  }

  key(ev: KeyboardEvent): void {
    const mode = readPrefs().sendKey;
    const send = mode === 'enter' ? ev.key === 'Enter' && !ev.shiftKey : ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey);
    if (send) { ev.preventDefault(); this.start(); }
  }

  private annex(): string | null {
    const lines: string[] = [];
    const acc = this.acceptance().split('\n').map(s => s.trim()).filter(Boolean);
    if (acc.length) { lines.push('acceptance:'); acc.forEach(a => lines.push('  - ' + a)); }
    const cons = this.constraints().split('\n').map(s => s.trim()).filter(Boolean);
    if (cons.length) lines.push('constraints: [' + cons.join('; ') + ']');
    const w = this.writeScope().trim(), p = this.protectedScope().trim();
    if (w || p) lines.push(`scope: {write: [${w}], protected: [${p}]}`);
    return lines.length ? lines.join('\n') : null;
  }

  async start(): Promise<void> {
    if (!this.canStart()) return;
    this.busy.set(true);
    this.opening.set(true);
    this.error.set(null);
    try {
      const options: any = { mode: this.mode(), ceiling: this.ceiling(), dClass: this.dClass(), effort: this.effort(), resumeExpected: this.resumeExpected() };
      if (this.tokensBudget()) options.tokens = this.tokensBudget();
      const s: any = await this.socket.command('campaign.start', { request: this.request().trim(), annex: this.annex(), options, parentWork: this.fromParam() ?? null }, { projectId: this.projectId() });
      try { localStorage.removeItem('studio.followup.' + this.projectId()); } catch { /* ignore */ }
      await this.app.refreshCampaign(s.workId);
      this.router.navigate(['/p', this.projectId(), 'c', s.workId]);
    } catch (e) {
      this.error.set(e instanceof StudioError ? `${e.error.code.replace(/_/g, ' ')}: ${e.error.message}` + (e.error.fieldErrors?.length ? ' — ' + e.error.fieldErrors.map(f => f.path + ': ' + f.message).join('; ') : '') : String(e));
    } finally {
      this.busy.set(false);
      this.opening.set(false);
    }
  }
}
