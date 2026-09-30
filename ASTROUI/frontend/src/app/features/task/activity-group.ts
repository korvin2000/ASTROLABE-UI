import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { I18n, TPipe } from '../../i18n/i18n';
import { TaskStore } from '../../state/task.store';
import { Step } from '../../timeline/steps';
import { ActivityItem, summarize } from '../../timeline/timeline';
import { Icon } from '../../ui/icon';
import { stepTime } from '../../ui/units';
import { TaskActions } from './task-actions';

const ICONS: Record<string, string> = { look: 'search', kb: 'database', edit: 'pencil', run: 'terminal', verify: 'check', delegation: 'split', task: 'split' };

/**
 * An activity group (section 7.4): one line that summarises consecutive steps — "Read 3 files · edited 1 · ran tests ✓".
 * Open while live, collapsed when finished, expandable. A click on a step opens the side panel at its file or output.
 */
@Component({
  selector: 'as-activity-group',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe, Icon],
  template: `
    <div class="group" [class.open]="open()">
      <button class="sum" (click)="toggle()" [attr.aria-expanded]="open()">
        <span class="caret" aria-hidden="true">{{ open() ? '▾' : '▸' }}</span>
        <span class="ellipsis">{{ summary() }}</span>
        @if (item().live) { <span class="dot work"></span> }
      </button>
      @if (open()) {
        @for (s of item().steps; track s.id) {
          <button class="step" (click)="show(s)" [disabled]="!s.path && !s.command && !s.check">
            <as-icon [name]="icon(s)" [size]="13" />
            <span class="tx ellipsis">{{ s.text | t }}</span>
            @if (s.status === 'ok') { <span class="ok" [attr.aria-label]="'step.ok' | t">✓</span> }
            @if (s.status === 'failed') { <span class="bad" [attr.aria-label]="'step.failed' | t">!</span> }
            @if (s.status === 'running') { <span class="dot work" [attr.aria-label]="'step.running' | t"></span> }
            <span class="r">{{ time(s) }}</span>
          </button>
        }
      }
    </div>`,
  styles: [`
    .group { margin: 8px 0; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    .sum { display: flex; gap: 8px; align-items: center; width: 100%; border: 0; background: transparent; padding: 7px 12px; color: var(--muted); text-align: left; }
    .sum:hover { background: var(--hover); }
    .caret { font-size: 10px; color: var(--faint); width: 10px; flex: none; }
    .step { display: flex; gap: 10px; align-items: center; width: 100%; border: 0; border-top: 1px solid var(--border); background: transparent; padding: 5px 12px 5px 30px; font-size: 13px; text-align: left; color: var(--text); }
    .step:hover:not(:disabled) { background: var(--hover); }
    .step:disabled { opacity: 1; cursor: default; }
    .step as-icon { color: var(--faint); }
    .tx { flex: 1; min-width: 0; }
    .r { color: var(--faint); font-size: 12px; min-width: 38px; text-align: right; }
  `],
})
export class ActivityGroup {
  private readonly i18n = inject(I18n);
  private readonly actions = inject(TaskActions);
  private readonly store = inject(TaskStore);

  readonly item = input.required<ActivityItem>();
  /** Bumped by the owner when the timeline changed; the item itself is mutable. */
  readonly version = input(0);
  private readonly chosen = signal<boolean | null>(null);

  readonly open = computed(() => { this.version(); return this.chosen() ?? this.item().live; });

  readonly summary = computed(() => {
    this.version();
    this.i18n.lang();
    const text = summarize(this.item().steps)
      .map(p => this.i18n.n(p.key, p.n) + (p.failed ? ' !' : (p.key === 'group.checks' || p.key === 'group.run') && this.done(p.key) ? ' ✓' : ''))
      .join(' · ');
    return text.charAt(0).toLocaleUpperCase(this.i18n.lang()) + text.slice(1);
  });

  private done(key: string): boolean {
    const tool = key === 'group.checks' ? 'verify' : 'run';
    const own = this.item().steps.filter(s => s.tool === tool);
    return own.length > 0 && own.every(s => s.status === 'ok');
  }

  toggle(): void { this.chosen.set(!this.open()); }

  icon(s: Step): string { return ICONS[s.tool] ?? 'info'; }

  time(s: Step): string { return stepTime(this.i18n, s.at, s.endedAt); }

  show(s: Step): void {
    if (s.command || s.check) {
      const entry = this.store.output().find(o => o.workId === s.workId && s.output !== undefined && o.output === s.output);
      this.actions.show({ panel: 'output', output: entry?.id });
    } else if (s.path) {
      this.actions.show({ panel: s.tool === 'edit' ? 'changes' : 'changes', file: s.path });
    }
  }
}
