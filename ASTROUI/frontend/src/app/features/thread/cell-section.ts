import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { CellModel, OpModel, TurnModel, toneOf } from '../../reducers/campaign-model';
import { CampaignStore } from '../../state/campaign.store';
import { ToolCard } from './tool-card';
import { Glyph } from '../../ui/glyph';
import { Icon } from '../../ui/icon';
import { MarkdownPipe } from '../../ui/markdown';
import { duration, firstLine, shortId, tokens } from '../../core/format';

export const ROLE_ICON: Record<string, string> = { plan: '◇', implementing: '▣', probe: '⌕', review: '⚖', qa: '▷', writer: '✎', repair: '⟲', extractor: '✦' };
const PHASE_ORDER: Record<string, number> = { look: 0, kb: 0, edit: 1, run: 2, verify: 2, task: 3, state: 3 };

/**
 * A cell section (§6.3): header (role · cell · increment · profile · turns · status), collapsed turn rows and the
 * expanded live turn — model text, operations grouped Read → Edit → Execute → Metadata, checker lines, gates, gauge.
 */
@Component({
  selector: 'as-cell-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ToolCard, Glyph, Icon, MarkdownPipe],
  template: `
    @let c = cell();
    <div class="cell" [class.live]="c.status === 'running'">
      <button class="chead" (click)="toggleCell()">
        <span class="role" [title]="c.role">{{ roleIcon() }}</span>
        <span class="rname">{{ c.role }}</span>
        <span class="dim mono">{{ short(c.id) }}</span>
        @if (c.incrementId) { <span class="dim">·</span> <span class="inc" [title]="incrementTitle() ?? ''">{{ c.incrementId }}@if (incrementTitle()) { <span class="dim"> "{{ incrementTitle() }}"</span> }</span> }
        @if (c.profileId) { <span class="chip mono">{{ c.profileId }}</span> }
        <span class="grow"></span>
        <span class="meta">{{ c.turns.length }} turn{{ c.turns.length === 1 ? '' : 's' }}@if (c.turnsMax) { / {{ c.turnsMax }} }</span>
        <as-glyph [status]="c.status" [pulse]="c.status === 'running'" />
        <span class="st" [class]="tone(c.status)">{{ c.status }}</span>
        <as-icon [name]="collapsed() ? 'chevron-down' : 'chevron-up'" [size]="14" />
      </button>
      @if (collapsed()) {
        <div class="result meta">{{ resultLine() }}</div>
      } @else {
        @for (t of c.turns; track t.n) {
          <div class="turn" [class.open]="isOpen(t)">
            <button class="trow" (click)="toggleTurn(t)" [attr.aria-expanded]="isOpen(t)">
              <span class="tn mono">{{ t.n }}</span>
              <as-icon [name]="isOpen(t) ? 'chevron-down' : 'chevron-right'" [size]="12" />
              <span class="gist ellipsis grow">{{ gist(t) }}</span>
              <span class="chips">@for (ch of chips(t); track $index) { <span class="tchip" [class]="ch.tone">{{ ch.label }}</span> }</span>
              <span class="tm mono">{{ turnTime(t) }}</span>
              <span class="tm mono">{{ t.outputTokens !== null ? tokens(t.outputTokens) + ' out' : (t.respondedAt ? 'usage ?' : '') }}</span>
            </button>
            @if (isOpen(t)) {
              <div class="tbody">
                @if (t.progress && !t.respondedAt) {
                  <div class="progress mono"><span class="spin"></span>{{ progressLine(t) }}</div>
                }
                @if (t.text) { <div class="prose markdown text" [innerHTML]="t.text | markdown"></div> }
                @else if (t.respondedAt) { <div class="dim small">tool calls only</div> }
                @if (t.ops.length) {
                  <div class="ops">
                    @for (op of ordered(t); track op.index) {
                      <as-tool-card [op]="op" [work]="store().work" [cell]="c.id" [turn]="t.n" />
                    }
                  </div>
                }
                @for (e of t.edits; track $index) {
                  <div class="line edit mono"><as-icon name="pencil" [size]="12" />
                    @for (p of e.paths; track p.path) { <span>{{ p.path }} <span class="dim">&#64;{{ (p.before ?? '').slice(0, 8) }}→&#64;{{ (p.after ?? '').slice(0, 8) }}</span></span> }
                  </div>
                }
                @for (ch of t.checks; track $index) {
                  <div class="line mono" [class]="tone(ch.outcome)"><as-glyph [status]="ch.outcome" [size]="11" /> {{ ch.text }}</div>
                }
                @if (t.register) { <div class="line mono dim">≡ STATE v{{ t.register.version }} · {{ t.register.ops }} ops</div> }
                @for (g of t.gates; track $index) {
                  <div class="line gate" [class.hard]="g.gate === 'exit'"><as-icon name="flag" [size]="12" /><b>{{ g.gate }}</b> <span>{{ g.text }}</span></div>
                }
                @for (n of t.nudges; track $index) { <div class="line mono dim">{{ n }}</div> }
                @if (t.worksetDropped.length) { <div class="line mono dim">workset: known {{ t.worksetKnown }} · dropped {{ t.worksetDropped.join(', ') }}</div> }
                @if (t.gauge) { <div class="gauge mono">{{ t.gauge.raw }}</div> }
                @else if (t.boundary) { <div class="gauge mono">{{ t.boundary }}</div> }
              </div>
            }
          </div>
        }
        @if (c.status !== 'running') { <div class="result meta">{{ resultLine() }}</div> }
        @for (p of c.packetLines; track $index) { <div class="result mono dim">{{ p }}</div> }
      }
    </div>`,
  styles: [`
    .cell{border:1px solid var(--border-subtle);border-radius:8px;background:var(--bg-surface);margin:8px 0}
    .cell.live{border-color:color-mix(in srgb,var(--accent) 35%,var(--border-subtle))}
    .chead{display:flex;align-items:center;gap:8px;width:100%;height:36px;padding:0 10px;border:0;background:none;color:var(--text-primary);cursor:pointer;text-align:left;border-bottom:1px solid var(--border-subtle)}
    .role{width:16px;text-align:center;color:var(--text-secondary)}
    .rname{font-weight:600}
    .inc{max-width:40ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .st{font-size:12px}
    .st.ok{color:var(--success)} .st.bad{color:var(--danger)} .st.warn{color:var(--attention)} .st.neutral{color:var(--text-secondary)}
    .result{padding:6px 12px 8px 36px}
    .turn{border-bottom:1px solid var(--border-subtle)}
    .turn:last-of-type{border-bottom:0}
    .trow{display:flex;align-items:center;gap:8px;width:100%;height:30px;padding:0 10px;border:0;background:none;color:var(--text-secondary);cursor:pointer;text-align:left}
    .trow:hover{background:var(--bg-hover)}
    .turn.open>.trow{color:var(--text-primary)}
    .tn{width:22px;text-align:right;color:var(--text-tertiary)}
    .gist{font-size:12.5px}
    .chips{display:flex;gap:4px}
    .tchip{font-size:11px;line-height:16px;padding:0 5px;border-radius:3px;background:var(--bg-active);color:var(--text-secondary);font-family:var(--font-mono)}
    .tchip.ok{color:var(--success)} .tchip.bad{color:var(--danger)} .tchip.warn{color:var(--attention)}
    .tm{font-size:11px;color:var(--text-tertiary);min-width:44px;text-align:right}
    .tbody{padding:4px 12px 10px 48px;display:flex;flex-direction:column;gap:4px}
    .text{max-width:860px;padding:2px 0 4px}
    .ops{display:flex;flex-direction:column;gap:1px;max-width:1100px;margin-left:-8px}
    .line{display:flex;align-items:baseline;gap:6px;font-size:12px;color:var(--text-secondary);flex-wrap:wrap}
    .line.ok{color:var(--success)} .line.bad{color:var(--danger)} .line.warn{color:var(--attention)}
    .line.edit{color:var(--text-secondary)}
    .gate{color:var(--attention);font-size:12.5px}
    .gate.hard{color:var(--danger)}
    .gate b{font-weight:600}
    .gauge{font-size:11.5px;color:var(--text-tertiary);padding-top:2px}
    .progress{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--accent)}
    .spin{width:8px;height:8px;border-radius:50%;background:var(--accent);animation:p 1.2s ease-in-out infinite}
    @keyframes p{0%,100%{opacity:1}50%{opacity:.3}}
    .small{font-size:12px}
  `],
})
export class CellSection {
  readonly cell = input.required<CellModel>();
  readonly store = input.required<CampaignStore>();
  readonly version = input(0);
  private readonly manual = signal<Map<number, boolean>>(new Map());
  private readonly cellOverride = signal<boolean | null>(null);

  readonly roleIcon = computed(() => ROLE_ICON[this.cell().role] ?? '▣');
  readonly collapsed = computed(() => {
    const o = this.cellOverride();
    if (o !== null) return o;
    return false;
  });
  readonly incrementTitle = computed(() => {
    const id = this.cell().incrementId;
    const incs: any[] = this.store().state()?.state?.graph?.increments ?? [];
    const t = incs.find(i => i.id === id)?.title as string | undefined;
    return t ? firstLine(t, 60) : null;
  });

  isOpen(t: TurnModel): boolean {
    this.version();
    const m = this.manual().get(t.n);
    if (m !== undefined) return m;
    const c = this.cell();
    const last = c.turns[c.turns.length - 1];
    return c.status === 'running' && last?.n === t.n;
  }

  toggleTurn(t: TurnModel): void {
    const m = new Map(this.manual());
    m.set(t.n, !this.isOpen(t));
    this.manual.set(m);
  }

  toggleCell(): void { this.cellOverride.set(!this.collapsed()); }

  gist(t: TurnModel): string {
    if (t.text) return firstLine(t.text, 160);
    if (t.progress && !t.respondedAt) return 'model working…';
    if (t.respondedAt) return 'tool calls only';
    return 'waiting for the model';
  }

  chips(t: TurnModel): { label: string; tone: string }[] {
    const out: { label: string; tone: string }[] = [];
    const reads = t.ops.filter(o => o.family === 'look' || o.family === 'kb');
    if (reads.length) out.push({ label: reads.length > 1 ? `look×${reads.length}` : 'look', tone: '' });
    for (const o of t.ops) {
      if (o.family === 'look' || o.family === 'kb') continue;
      const tn = toneOf(o.status);
      const mark = tn === 'ok' && o.family !== 'state' ? ' ✓' : tn === 'bad' ? ' ✗' : '';
      out.push({ label: (o.family || 'tool') + mark, tone: o.family === 'state' ? '' : tn });
    }
    for (const g of t.gates) out.push({ label: '⚑ ' + g.gate, tone: g.gate === 'exit' ? 'bad' : 'warn' });
    return out.slice(0, 6);
  }

  ordered(t: TurnModel): OpModel[] {
    return [...t.ops].sort((a, b) => (PHASE_ORDER[a.family] ?? 2) - (PHASE_ORDER[b.family] ?? 2) || a.index - b.index);
  }

  turnTime(t: TurnModel): string {
    if (!t.requestedAt) return '';
    const end = t.respondedAt ? Date.parse(t.respondedAt) : Date.now();
    return duration(end - Date.parse(t.requestedAt));
  }

  progressLine(t: TurnModel): string {
    const p = t.progress!;
    const parts = [t.profileId ?? 'model', p.stage === 'output' ? 'generating' : p.stage];
    if (p.textChars) parts.push(p.textChars.toLocaleString() + ' chars');
    if (p.outputTokens) parts.push(p.outputTokens + ' out');
    if (p.attempt) parts.push('attempt ' + p.attempt);
    return parts.join(' · ');
  }

  resultLine(): string {
    const c = this.cell();
    const edits = c.turns.reduce((s, t) => s + t.ops.filter(o => o.family === 'edit' && o.status === 'ok').length, 0);
    const checks = c.turns.reduce((s, t) => s + t.checks.length, 0);
    const parts = [c.status, `${c.turns.length} turns`];
    if (edits) parts.push(`${edits} edit${edits === 1 ? '' : 's'}`);
    if (checks) parts.push(`${checks} check line${checks === 1 ? '' : 's'}`);
    if (c.outputTokens) parts.push(tokens(c.outputTokens) + ' tok out');
    if (c.rebuilds.length) parts.push(`${c.rebuilds.length} rebuild(s)`);
    return parts.join(' · ');
  }

  tone(s: string | null | undefined): string { return toneOf(s); }
  short(id: string): string { return shortId(id, 12); }
  protected readonly tokens = tokens;
}
