import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { CampaignStore } from '../../state/campaign.store';
import { CampaignSummary } from '../../core/model';
import { StudioSocket } from '../../core/ws';
import { AppStore } from '../../state/app.store';
import { Glyph } from '../../ui/glyph';
import { clock, firstLine, tokens } from '../../core/format';

/**
 * Plan & Contract (§9, W-03): versions with a structured compare, requirements whose status comes from the ledger
 * only (R-PLN-01), acceptance items with origin chips and evidence state, constraints, scope, budget, authorization,
 * amendments (weakening visually distinct, R-PLN-02), and the requirement graph of increments with the ready frontier.
 */
@Component({
  selector: 'as-plan-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Glyph],
  template: `
    <div class="wrap">
      <section class="contract card">
        <div class="phead">
          <span class="title-s">Contract</span>
          <select class="select sm" [value]="selected() ?? latest()?.version" (change)="selected.set(+$any($event.target).value)" aria-label="Contract version">
            @for (v of versions(); track v.version) { <option [value]="v.version" [selected]="v.version === (selected() ?? latest()?.version)">v{{ v.version }}</option> }
          </select>
          @if (previous(); as p) { <label class="check small"><input type="checkbox" [checked]="compare()" (change)="compare.set($any($event.target).checked)" /> compare v{{ p.version }}</label> }
          <span class="grow"></span>
          @if (c(); as k) { <span class="chip">{{ k.mode }}</span><span class="chip accent">{{ k.shape }}</span> }
        </div>
        @if (c(); as k) {
          <div class="scroll body">
            @if (compare() && diff().length) {
              <div class="diff"><div class="micro">Changes since v{{ previous()?.version }}</div>@for (d of diff(); track $index) { <div class="mono small" [class]="d.tone">{{ d.text }}</div> }</div>
            }
            <div class="sec">Requests</div>
            @for (r of k.requests; track r.id; let i = $index) {
              <div class="rowline"><span class="chip mono">U{{ i + 1 }}</span><span class="dim small">{{ time(r.at) }}</span><span class="grow text">{{ r.text }}</span></div>
            }
            <div class="sec">Requirements</div>
            @for (q of k.requirements; track q.id) {
              <div class="rowline">
                <as-glyph [status]="ledgerStatus(q.id)" />
                <span class="mono b">{{ q.id }}</span>
                <span class="grow text">{{ q.text }}</span>
                @for (a of q.acceptance; track a) { <span class="chip mono">{{ a }}</span> }
                <span class="dim small">{{ ledgerStatus(q.id) }}</span>
              </div>
            } @empty { <div class="dim small">0 requirements defined</div> }
            <div class="sec">Acceptance</div>
            @for (a of k.acceptance; track a.id) {
              <div class="rowline">
                <span class="kicon" [title]="a.type">{{ a.type === 'run' ? '▶' : a.type === 'check' ? '☑' : '⚖' }}</span>
                <span class="mono b">{{ a.id }}</span>
                <span class="grow text mono small">{{ criterion(a) }}</span>
                <span class="chip" [class.accent]="a.origin?.type === 'user'" [title]="'origin ' + origin(a.origin)">{{ origin(a.origin) }}</span>
                <span class="small">@if (evidence(a.id); as e) { <as-glyph [status]="e.glyph" [size]="11" /> {{ e.text }} } @else { <span class="dim">no evidence yet</span> }</span>
              </div>
            }
            @if (k.constraints.length) {
              <div class="sec">Constraints</div>
              @for (x of k.constraints; track x.id) { <div class="rowline"><span class="mono b">{{ x.id }}</span><span class="grow text">{{ x.text }}</span><span class="chip">{{ x.authority }}</span></div> }
            }
            @if (k.exclusions.length) { <div class="sec">Exclusions</div><div class="small">{{ k.exclusions.join(' · ') }}</div> }
            <div class="sec">Scope</div>
            <div class="small mono">write {{ k.scope.writePaths.join(' · ') }}</div>
            <div class="small mono dim ellipsis" [title]="k.scope.protectedPaths.join(', ')">protected {{ k.scope.protectedPaths.slice(0, 6).join(' · ') }}{{ k.scope.protectedPaths.length > 6 ? ' · +' + (k.scope.protectedPaths.length - 6) : '' }}</div>
            <div class="sec">Budget</div>
            <div class="small mono">{{ tok(k.budget.tokens?.value) }} tok · {{ k.budget.cells }} cells · {{ k.budget.turnsPerCell }} turns/cell · {{ k.budget.attempts }} attempts
              · reserves verify {{ pct(k.budget.reserves?.verification) }} / recovery {{ pct(k.budget.reserves?.recoveryAndPersist) }}
              @if (k.budget.cost) { · cost cap {{ k.budget.cost.amount }} {{ k.budget.cost.currency }} }</div>
            <div class="sec">Authorization</div>
            <div class="small mono">ceiling {{ k.authorization.ladderCeiling }} · D-class {{ k.authorization.dClass }} · {{ k.authorization.capabilitySet }}
              @if (k.authorization.dClassAllowlist?.length) { · allowlist {{ k.authorization.dClassAllowlist.join(', ') }} }</div>
            @if (k.risk) { <div class="sec">Risk</div><div class="small mono">blast {{ k.risk.blastRadius }} · {{ k.risk.reversibility }} · contract touch {{ k.risk.contractTouch }}</div> }
            <div class="sec">Amendments</div>
            @for (a of amendments(); track a.id) {
              <div class="amend" [class.weak]="a.weakening">
                <div class="rowline"><span class="mono b">{{ a.id }}</span><span class="chip">{{ a.by }}</span>
                  @if (a.weakening) { <span class="chip bad">weakening</span> }
                  <span class="grow"></span><as-glyph [status]="a.status" /><span class="small">{{ a.status }}</span></div>
                <div class="small">{{ a.change }}</div>
                <div class="small dim">{{ a.reason }}</div>
                @if (a.status === 'Pending') {
                  <div class="rowline end">
                    @if (a.weakening) { <input class="input sm" placeholder='type "weaken"' [value]="typed()" (input)="typed.set($any($event.target).value)" /> }
                    <button class="btn sm danger" (click)="resolve(a, 'Rejected')">Reject</button>
                    <button class="btn sm primary" (click)="resolve(a, 'Accepted')" [disabled]="a.weakening && typed().trim() !== 'weaken'">Accept</button>
                  </div>
                }
              </div>
            } @empty { <div class="dim small">none</div> }
          </div>
        } @else { <div class="dim pad">Loading the contract…</div> }
      </section>
      <section class="graph card">
        <div class="phead"><span class="title-s">Requirement graph</span><span class="grow"></span><span class="small dim">observed execution · change it only by amending the contract</span></div>
        <div class="scroll gbody">
          @if (layers().length) {
            <div class="layers">
              @for (layer of layers(); track $index) {
                <div class="layer">
                  @for (inc of layer; track inc.id) {
                    <div class="inc" [class]="'inc ' + inc.status.toLowerCase()" [class.frontier]="frontier().has(inc.id)">
                      <div class="rowline"><as-glyph [status]="incGlyph(inc.status)" /><span class="mono b">{{ inc.id }}</span><span class="grow"></span><span class="small dim">{{ inc.status }}</span></div>
                      <div class="small ititle">{{ first(inc.title) }}</div>
                      <div class="rowline wrap">@for (a of inc.accept; track a) { <span class="chip mono">{{ a }}</span> }
                        <span class="dim small">{{ inc.cells?.length ?? 0 }} cell(s) · {{ inc.sizing?.turns ?? 0 }} turns</span></div>
                      @if (inc.dependsOn?.length) { <div class="small dim">after {{ inc.dependsOn.join(', ') }}</div> }
                      @if (inc.cancelledReason) { <div class="small dim">cancelled: {{ inc.cancelledReason }}</div> }
                    </div>
                  }
                </div>
              }
            </div>
          } @else { <div class="dim small pad">The graph appears once the campaign opens (S0: one increment; S1+: from the plan cell).</div> }
          <div class="ledger">
            <div class="micro">Ledger</div>
            @for (e of ledgerEntries(); track e.requirementId) {
              <div class="rowline small"><as-glyph [status]="e.status" /><span class="mono b">{{ e.requirementId }}</span><span>{{ e.status }}</span>
                @if (e.evidence?.length) { <span class="dim mono">{{ e.evidence.join(', ') }}</span> }
                <span class="dim">· stamp {{ e.stampValid ? 'valid' : 'moved' }}</span></div>
            } @empty { <div class="dim small">no ledger entries yet</div> }
          </div>
        </div>
      </section>
    </div>`,
  styles: [`
    :host{display:flex;flex:1;min-height:0}
    .wrap{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:10px;padding:10px 16px 16px;flex:1;min-height:0}
    .card{display:flex;flex-direction:column;min-height:0}
    .phead{display:flex;align-items:center;gap:8px;height:38px;padding:0 12px;border-bottom:1px solid var(--border-subtle);flex:none}
    .title-s{font-weight:600}
    .select.sm{height:24px;font-size:12px}
    .body,.gbody{padding:8px 14px 14px;flex:1}
    .sec{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-tertiary);margin:12px 0 4px;font-weight:500}
    .rowline{display:flex;align-items:center;gap:8px;padding:2px 0;min-width:0}
    .rowline.end{justify-content:flex-end}
    .rowline.wrap{flex-wrap:wrap}
    .text{min-width:0;overflow-wrap:anywhere}
    .b{font-weight:500;white-space:nowrap}
    .kicon{width:14px;text-align:center;color:var(--text-secondary)}
    .small{font-size:12px}
    .pad{padding:16px}
    .amend{border:1px solid var(--border-subtle);border-radius:6px;padding:6px 8px;margin:4px 0}
    .amend.weak{border-color:color-mix(in srgb,var(--danger) 45%,var(--border-subtle));background:var(--danger-subtle)}
    .input.sm{height:24px;width:130px}
    .diff{border:1px solid var(--border-subtle);border-radius:6px;padding:6px 8px;margin-bottom:6px;background:var(--code-bg)}
    .diff .ok{color:var(--success)} .diff .bad{color:var(--danger)}
    .layers{display:flex;gap:18px;align-items:flex-start;overflow-x:auto;padding:6px 2px 12px}
    .layer{display:flex;flex-direction:column;gap:10px;min-width:220px}
    .inc{border:1px solid var(--border-default);border-radius:8px;padding:8px 10px;background:var(--bg-canvas);max-width:280px}
    .inc.verified{border-color:color-mix(in srgb,var(--success) 45%,var(--border-default))}
    .inc.inprogress{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-faint)}
    .inc.blocked{border-color:color-mix(in srgb,var(--attention) 50%,var(--border-default))}
    .inc.cancelled{border-style:dashed;opacity:.7}
    .inc.frontier{outline:1px dashed var(--accent);outline-offset:3px}
    .ititle{margin:4px 0 6px;color:var(--text-primary)}
    .ledger{margin-top:12px;border-top:1px solid var(--border-subtle);padding-top:8px}
    @media (max-width:1279px){.wrap{grid-template-columns:minmax(0,1fr)}}
  `],
})
export class PlanTab {
  readonly store = input.required<CampaignStore>();
  readonly summary = input<CampaignSummary | null>(null);
  private readonly socket = inject(StudioSocket);
  private readonly app = inject(AppStore);
  readonly selected = signal<number | null>(null);
  readonly compare = signal(false);
  readonly typed = signal('');

  readonly versions = computed(() => (this.store().contract()?.view?.contracts ?? []).map((r: any) => r.body).sort((a: any, b: any) => a.version - b.version));
  readonly latest = computed(() => { const v = this.versions(); return v.length ? v[v.length - 1] : null; });
  readonly c = computed(() => {
    const sel = this.selected();
    return (sel ? this.versions().find((v: any) => v.version === sel) : null) ?? this.latest();
  });
  readonly previous = computed(() => {
    const cur = this.c();
    return cur ? this.versions().filter((v: any) => v.version < cur.version).slice(-1)[0] ?? null : null;
  });
  readonly diff = computed(() => {
    const a = this.previous(), b = this.c();
    if (!a || !b) return [];
    const out: { text: string; tone: string }[] = [];
    const ids = (x: any[]) => new Map(x.map(i => [i.id, i]));
    for (const [kind, key] of [['request', 'requests'], ['requirement', 'requirements'], ['acceptance', 'acceptance'], ['constraint', 'constraints']] as const) {
      const ma = ids(a[key] ?? []), mb = ids(b[key] ?? []);
      for (const [id, v] of mb) if (!ma.has(id)) out.push({ text: `+ ${kind} ${id} ${v.text ?? this.criterion(v)}`, tone: 'ok' });
      for (const [id, v] of ma) if (!mb.has(id)) out.push({ text: `− ${kind} ${id} ${v.text ?? this.criterion(v)}`, tone: 'bad' });
      for (const [id, v] of mb) if (ma.has(id) && JSON.stringify(ma.get(id)) !== JSON.stringify(v)) out.push({ text: `~ ${kind} ${id} changed`, tone: '' });
    }
    return out;
  });
  readonly ledgerEntries = computed(() => {
    const e = this.store().state()?.state?.ledger?.entries ?? {};
    return Object.values(e) as any[];
  });
  readonly increments = computed(() => (this.store().state()?.state?.graph?.increments ?? []) as any[]);
  readonly layers = computed(() => {
    const incs = this.increments();
    const depth = new Map<string, number>();
    const byId = new Map(incs.map(i => [i.id, i]));
    const d = (id: string, seen = new Set<string>()): number => {
      if (depth.has(id)) return depth.get(id)!;
      if (seen.has(id)) return 0;
      seen.add(id);
      const inc = byId.get(id);
      const v = inc?.dependsOn?.length ? 1 + Math.max(...inc.dependsOn.map((x: string) => d(x, seen))) : 0;
      depth.set(id, v);
      return v;
    };
    incs.forEach(i => d(i.id));
    const layers: any[][] = [];
    for (const i of incs) (layers[depth.get(i.id) ?? 0] ??= []).push(i);
    return layers.filter(Boolean);
  });
  readonly frontier = computed(() => {
    const incs = this.increments();
    const verified = new Set(incs.filter(i => i.status === 'Verified').map(i => i.id));
    return new Set(incs.filter(i => i.status === 'Pending' && (i.dependsOn ?? []).every((x: string) => verified.has(x))).map(i => i.id));
  });
  readonly amendments = computed(() => {
    const rows: any[] = this.store().contract()?.view?.amendments ?? [];
    return rows.map(r => ({ ...r.body, id: r.body?.id ?? r.key, status: r.body?.status ?? 'Pending' }));
  });

  ledgerStatus(req: string): string {
    const e = this.store().state()?.state?.ledger?.entries?.[req];
    return (e?.status ?? 'pending').toLowerCase();
  }

  criterion(a: any): string {
    if (a.type === 'run') return 'run: ' + (a.command?.argv ?? []).join(' ') + (a.command?.cwd ? ' (in ' + a.command.cwd + ')' : '') + (a.scope ? ' · scope ' + a.scope : '');
    return (a.type ?? '') + ': ' + (a.text ?? '');
  }

  origin(o: any): string {
    if (!o) return 'unknown';
    if (o.type === 'model') return 'model · strengthens ' + (o.strengthens ?? '');
    if (o.type === 'amended') return 'amended@v' + o.version;
    return o.type;
  }

  evidence(acceptanceId: string): { glyph: string; text: string } | null {
    const f = this.store().finish()?.receipt?.acceptance?.find((a: any) => a.id === acceptanceId);
    if (f) return { glyph: f.status === 'green' ? (f.currency === 'current' ? 'verified' : 'stale') : f.status, text: `${f.status} · ${f.currency ?? ''} @${f.stamp ?? ''}` };
    const checks = this.store().checks()?.receipts ?? [];
    const r = [...checks].reverse().find((x: any) => (x.body?.acceptanceIds ?? []).includes(acceptanceId));
    if (r) return { glyph: String(r.outcome).toLowerCase(), text: `${String(r.outcome).toLowerCase()} · ${r.receiptId} @${(r.stampAfter ?? '').slice(0, 8)}` };
    return null;
  }

  incGlyph(s: string): string { return ({ Verified: 'verified', InProgress: 'running', Blocked: 'blocked', Cancelled: 'cancelled', Pending: 'pending' } as any)[s] ?? 'pending'; }
  first(t: string): string { return firstLine(t, 90); }
  tok(n: number): string { return tokens(n); }
  pct(x: number | undefined): string { return x === undefined ? '—' : Math.round(x * 100) + '%'; }
  time(iso: string): string { return clock(iso); }

  async resolve(a: any, outcome: 'Accepted' | 'Rejected'): Promise<void> {
    try {
      await this.socket.command('amendment.resolve', { amendmentId: a.id, outcome, patch: null, confirmWeakening: this.typed().trim() === 'weaken' }, { workId: this.store().work });
      this.store().invalidate(['contract']);
    } catch (e) {
      this.app.error(e, 'Resolve amendment');
    }
  }
}
