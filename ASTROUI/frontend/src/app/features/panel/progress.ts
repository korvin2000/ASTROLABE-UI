import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { I18n, TPipe } from '../../i18n/i18n';
import { TaskStore } from '../../state/task.store';
import { FlowNode } from '../../timeline/steps';
import { STAGES } from '../../timeline/timeline';
import { clockOf, usageText } from '../../ui/units';
import { FlowStage } from './flow/flow-stage';

/** The stage rail (section 8.2.1): Understand, Plan, Build, Check, Finish; the line fills up to the current stage. */
@Component({
  selector: 'as-stage-rail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe],
  template: `
    <ol class="rail" [style.--p]="fill()" [attr.aria-label]="'rail.label' | t">
      @for (s of stages; track s; let i = $index) {
        <li [class.done]="i < stage()" [class.now]="i === stage() && working()" [attr.aria-current]="i === stage() ? 'step' : null"><i></i>{{ ('rail.' + s) | t }}</li>
      }
    </ol>`,
  styles: [`
    .rail { display: grid; grid-template-columns: repeat(5, 1fr); margin: 4px 0 14px; padding: 0; list-style: none; position: relative; }
    .rail::before { content: ""; position: absolute; left: 10%; right: 10%; top: 6px; height: 2px; background: var(--border); }
    .rail::after { content: ""; position: absolute; left: 10%; width: 80%; top: 6px; height: 2px; background: var(--accent); transform-origin: left; transform: scaleX(calc(var(--p, 0) / 4)); transition: transform .6s ease; }
    li { text-align: center; font-size: 12px; color: var(--faint); position: relative; z-index: 1; }
    i { display: block; width: 14px; height: 14px; border-radius: 50%; margin: 0 auto 6px; background: var(--bg); border: 2px solid var(--border); transition: background .3s, border-color .3s; }
    .done i { background: var(--accent); border-color: var(--accent); }
    .done, .now { color: var(--text); }
    .now i { border-color: var(--accent); box-shadow: 0 0 0 4px var(--accent-soft); animation: pulse 1.6s ease-in-out infinite; }
    @keyframes pulse { 50% { opacity: .35; } }
  `],
})
export class StageRail {
  readonly stage = input(0);
  readonly working = input(false);
  readonly stages = STAGES;
  readonly fill = computed(() => Math.min(this.stage(), 4));
}

/**
 * Progress (section 8.2): the live picture of the agent at work — the stage rail, the Flow, the details below it.
 */
@Component({
  selector: 'as-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe, FlowStage, StageRail],
  template: `
    <as-stage-rail [stage]="stage()" [working]="store.working()" />
    <as-flow-stage class="stage" [model]="store.flow" [version]="store.version()" [working]="store.working()" [plan]="plan()" (nodeClick)="node.emit($event)" />
    <dl class="pl">
      <dt>{{ 'progress.now' | t }}</dt>
      <dd>
        @if (store.status(); as s) { {{ s.text | t }} <span class="faint">{{ clock(s.seconds) }}</span> }
        @else { {{ ('state.' + store.state()) | t }} }
      </dd>
      @if (plan().length > 1) {
        <dt>{{ 'progress.plan' | t }}</dt>
        <dd>
          <ol>
            @for (s of plan(); track s.n) { <li [attr.data-s]="s.state"><span class="sr-only">{{ ('plan.' + s.state) | t }}</span>{{ s.text }}</li> }
          </ol>
        </dd>
      }
      <dt>{{ 'progress.used' | t }}</dt>
      <dd>
        {{ used() }}
        @if (share() !== null) {
          <div class="bar2" role="progressbar" [attr.aria-valuenow]="share()" aria-valuemin="0" aria-valuemax="100"><i [style.width.%]="share()"></i></div>
          <small class="faint">{{ 'progress.share' | t: { percent: share() } }}</small>
        }
      </dd>
    </dl>`,
  styles: [`
    :host { display: block; }
    .stage { height: 470px; min-width: 440px; }
    .pl { display: grid; grid-template-columns: 70px 1fr; gap: 8px 12px; font-size: 13px; margin: 16px 0 0; }
    dt { color: var(--muted); }
    dd { margin: 0; min-width: 0; }
    ol { margin: 0; padding: 0; list-style: none; }
    li { display: flex; gap: 8px; padding: 1px 0; }
    li::before { content: "○"; color: var(--faint); }
    li[data-s="now"]::before { content: "●"; color: var(--accent); }
    li[data-s="done"]::before { content: "✓"; color: var(--ok); }
    li[data-s="skipped"] { color: var(--faint); text-decoration: line-through; }
    .bar2 { height: 4px; border-radius: 2px; background: var(--border); margin-top: 6px; overflow: hidden; }
    .bar2 i { display: block; height: 100%; background: var(--accent); }
  `],
})
export class Progress {
  readonly store = inject(TaskStore);
  private readonly i18n = inject(I18n);
  readonly node = output<FlowNode>();

  readonly stage = computed(() => { this.store.version(); return this.store.timeline.stage; });
  readonly plan = computed(() => this.store.progress()?.plan ?? []);
  readonly used = computed(() => {
    this.store.version();
    this.i18n.lang();
    const task = this.store.task();
    // While the task works the numbers of the conversation are newer than the task's own.
    const tokens = Math.max(task?.usage?.tokens ?? 0, this.store.working() ? this.store.timeline.tokens : 0);
    return usageText(this.i18n, { tokens, cost: task?.usage?.cost, elapsedMs: task?.usage?.elapsedMs ?? 0 });
  });
  /** The share of the task's limit that is used, in percent; null when the limit is not known. */
  readonly share = computed<number | null>(() => {
    this.store.version();
    const limit = this.store.timeline.limitTokens;
    if (!limit) return null;
    return Math.min(100, Math.round((this.store.timeline.tokens / limit) * 100));
  });

  clock(seconds: number): string { return clockOf(seconds); }
}
