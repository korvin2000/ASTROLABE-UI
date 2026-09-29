import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { OpModel, targetOf, toneOf } from '../../reducers/campaign-model';
import { Icon } from '../../ui/icon';
import { Glyph } from '../../ui/glyph';
import { Inspector } from '../shell/inspector';

const FAMILY_ICON: Record<string, string> = { look: 'search', edit: 'pencil', run: 'terminal', verify: 'shield', state: 'list', task: 'split', kb: 'book' };

/**
 * One tool call (§6.4): family icon · op · target · status from the envelope, never from model commentary
 * (R-THR-02); envelope flags render on every card. Bodies load lazily in the inspector (R-THR-03).
 */
@Component({
  selector: 'as-tool-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, Glyph],
  template: `
    <button class="card-row" (click)="open()" [class.pending]="op().pending" [class.bad]="tone() === 'bad'" [attr.aria-label]="op().family + ' ' + (op().op ?? '') + ' ' + target()">
      <as-icon [name]="icon()" [size]="14" />
      <span class="fam">{{ op().family || 'tool' }}</span>
      <span class="op">{{ op().op ?? '' }}</span>
      <span class="tgt mono ellipsis grow" [title]="target()">{{ target() }}</span>
      @if (detail()) { <span class="det mono">{{ detail() }}</span> }
      @for (f of flags(); track f) { <span class="flag" [class.warn]="f.startsWith('⚠')">{{ f }}</span> }
      @if (op().env?.cls) { <span class="cls mono" [title]="'effect class ' + op().env?.cls">{{ op().env?.cls }}</span> }
      @if (op().pending) { <span class="st dim">running…</span> }
      @else { <as-glyph [status]="op().status" [size]="11" /><span class="st mono" [class]="tone()">{{ op().status ?? 'unknown' }}</span> }
      @if (op().alias) { <span class="alias mono">{{ op().alias }}</span> }
    </button>`,
  styles: [`
    .card-row{display:flex;align-items:center;gap:7px;width:100%;min-height:26px;padding:2px 8px;border:1px solid transparent;border-radius:5px;background:none;color:var(--text-secondary);cursor:pointer;text-align:left;font-size:12.5px}
    .card-row:hover{background:var(--bg-hover);border-color:var(--border-subtle);color:var(--text-primary)}
    .card-row.pending{color:var(--text-tertiary)}
    .fam{color:var(--text-primary);font-weight:500}
    .op{color:var(--text-secondary)}
    .tgt{color:var(--text-primary);font-size:12px}
    .det{font-size:11.5px;color:var(--text-tertiary)}
    .flag{font-size:11px;padding:0 4px;border:1px solid var(--border-default);border-radius:3px;color:var(--text-tertiary)}
    .flag.warn{color:var(--attention);border-color:color-mix(in srgb,var(--attention) 40%,var(--border-default))}
    .cls{font-size:10.5px;padding:0 4px;border-radius:3px;background:var(--bg-active);color:var(--text-secondary)}
    .st{font-size:11.5px}
    .st.ok{color:var(--success)} .st.bad{color:var(--danger)} .st.warn{color:var(--attention)} .st.neutral{color:var(--text-tertiary)}
    .alias{font-size:11px;color:var(--text-tertiary)}
  `],
})
export class ToolCard {
  private readonly inspector = inject(Inspector);
  readonly op = input.required<OpModel>();
  readonly work = input.required<string>();
  readonly cell = input.required<string>();
  readonly turn = input.required<number>();
  readonly icon = computed(() => FAMILY_ICON[this.op().family] ?? 'zap');
  readonly target = computed(() => targetOf(this.op()));
  readonly tone = computed(() => toneOf(this.op().status));
  readonly detail = computed(() => {
    const o = this.op();
    const v = o.env?.versions ?? {};
    const keys = Object.keys(v);
    if (o.family === 'edit' && keys.length) return keys.map(k => '→' + v[k]).join(' ');
    if (o.family === 'look' && keys.length) return '@' + v[keys[0]];
    if (o.env?.stamp) return '@' + o.env.stamp;
    return '';
  });
  readonly flags = computed(() => {
    const o = this.op();
    const f: string[] = [];
    if (o.env?.truncated) f.push('truncated');
    if (o.env?.effects === 'unknown') f.push('⚠ effects unknown');
    for (const x of o.env?.flags ?? []) {
      if (/instruction/i.test(x)) f.push('⚠ instruction-shaped');
      else if (/redact/i.test(x)) f.push('redaction applied');
      else if (/stale/i.test(x)) f.push(x);
    }
    return f;
  });

  open(): void {
    this.inspector.open({ type: 'op', work: this.work(), op: this.op(), turn: this.turn(), cell: this.cell() });
  }
}
