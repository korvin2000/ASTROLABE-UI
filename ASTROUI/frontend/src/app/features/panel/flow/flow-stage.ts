import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, afterNextRender, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { PlanStep } from '../../../core/model';
import { clock } from '../../../core/format';
import { I18n, TPipe, Text } from '../../../i18n/i18n';
import { FlowNode } from '../../../timeline/steps';
import { COLOURS, Layout, NODES, layout } from './flow-layout';
import { FlowModel, NodeState } from './flow-model';
import { FlowMotion } from './flow-motion';
import { LINES, Route, routes } from './flow-route';

/** One shape of an icon; icons are drawn from these, never from markup in a string. */
export interface Shape { t: 'path' | 'circle' | 'ellipse'; d?: string; cx?: number; cy?: number; r?: number; rx?: number; ry?: number; }

const ICONS: Record<FlowNode, Shape[]> = {
  you: [{ t: 'circle', cx: 9, cy: 6, r: 3 }, { t: 'path', d: 'M3 15.5c0-3 2.7-4.6 6-4.6s6 1.6 6 4.6' }],
  model: [{ t: 'path', d: 'M9 2l1.8 4.7 4.7 1.8-4.7 1.8L9 15l-1.8-4.7L2.5 8.5l4.7-1.8z' }],
  agent: [{ t: 'circle', cx: 4.5, cy: 4, r: 1.8 }, { t: 'circle', cx: 4.5, cy: 14, r: 1.8 }, { t: 'circle', cx: 13.5, cy: 6.5, r: 1.8 }, { t: 'path', d: 'M4.5 5.8v6.4M13.5 8.3c0 3-9 1.2-9 3.9' }],
  memory: [{ t: 'ellipse', cx: 9, cy: 4.5, rx: 5.5, ry: 2.3 }, { t: 'path', d: 'M3.5 4.5v9c0 1.3 2.5 2.3 5.5 2.3s5.5-1 5.5-2.3v-9M3.5 9c0 1.3 2.5 2.3 5.5 2.3s5.5-1 5.5-2.3' }],
  explore: [{ t: 'circle', cx: 8, cy: 8, r: 4.5 }, { t: 'path', d: 'M11.5 11.5l4 4' }],
  edit: [{ t: 'circle', cx: 9, cy: 9, r: 3.2 }, { t: 'path', d: 'M9 1.8v2.4M9 13.8v2.4M1.8 9h2.4M13.8 9h2.4M3.9 3.9l1.7 1.7M12.4 12.4l1.7 1.7M3.9 14.1l1.7-1.7M12.4 5.6l1.7-1.7' }],
  checks: [{ t: 'path', d: 'M3 3v12h12' }, { t: 'path', d: 'M5.8 11.2l3-3.2 2.4 2 3.4-4.4' }],
};

interface NodeVm {
  id: FlowNode;
  name: string;
  state: NodeState;
  thinking: boolean;
  subtitle: string;
  detail: string;
  mark: string;
  label: string;
  colour: string;
  style: Record<string, string>;
  activities: { text: string; at: string }[];
}

/**
 * The Flow (section 8.2): seven fixed nodes named after the work, the arrangement of the reference picture, motion
 * that follows real events. Nodes are HTML over one SVG layer that holds lines, ports and travelling segments.
 */
@Component({
  selector: 'as-flow-stage',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe],
  templateUrl: './flow-stage.html',
  styleUrl: './flow-stage.css',
})
export class FlowStage implements OnDestroy {
  private readonly i18n = inject(I18n);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly canvas = viewChild.required<ElementRef<HTMLElement>>('canvas');
  private readonly svg = viewChild.required<ElementRef<SVGSVGElement>>('svg');

  readonly model = input.required<FlowModel>();
  /** Bumped by the owner when the model changed; the model itself is mutable. */
  readonly version = input(0);
  readonly working = input(false);
  readonly plan = input<PlanStep[]>([]);
  readonly nodeClick = output<FlowNode>();

  readonly size = signal({ w: 0, h: 0 });
  readonly tick = signal(0);
  readonly entered = signal(false);
  readonly popover = signal<FlowNode | null>(null);
  readonly uid = 'f' + Math.random().toString(36).slice(2, 7);
  readonly lines = LINES;
  readonly colours = COLOURS;
  readonly icons = ICONS;

  private motion: FlowMotion | null = null;
  private observer: ResizeObserver | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private drawn = false;
  private readonly reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  private readonly onVisibility = () => this.visibility();

  /** Layout and routes are recomputed only when the canvas size changes (section 8.2.10). */
  readonly layout = computed<Layout>(() => layout(this.size().w, this.size().h));
  readonly routes = computed<Route[]>(() => routes(this.layout()));

  readonly nodes = computed<NodeVm[]>(() => {
    this.version();
    this.tick();
    this.i18n.lang();
    const model = this.model(), l = this.layout(), now = Date.now(), working = this.working();
    return NODES.map(id => {
      const n = model.nodes[id];
      const r = l.nodes[id];
      const state = model.display(id, now, working);
      const name = this.i18n.t('flow.' + id + '.name');
      const subtitle = this.i18n.text(n.subtitle);
      const detail = id === 'agent' ? this.agentDetail() : this.i18n.text(n.detail);
      return {
        id, name, state, thinking: n.thinking && working, subtitle, detail, mark: n.mark, colour: COLOURS[id],
        label: `${this.i18n.t('flow.' + id + '.label')}, ${this.i18n.t('flow.state.' + state)}, ${subtitle}`,
        style: { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px', '--base': COLOURS[id], '--i': String(NODES.indexOf(id)) },
        activities: n.activities.map((a: { text: Text; at: string }) => ({ text: this.i18n.text(a.text), at: clock(a.at) })),
      };
    });
  });

  /** The text alternative of the canvas; it follows the task (section 8.2.10). */
  readonly alt = computed(() => this.nodes().filter(n => n.state !== 'idle' || n.id === 'checks' || n.id === 'agent').map(n => `${n.name}: ${n.subtitle}`).join('. '));

  readonly helpers = computed(() => { this.version(); const n = this.model().helpers; return { squares: Array.from({ length: Math.min(n, 3) }), more: Math.max(0, n - 3) }; });

  constructor() {
    afterNextRender(() => this.mount());
    // Messages travel when the model has some and the picture is seen; otherwise they are dropped, not replayed later.
    effect(() => {
      this.version();
      const model = this.model();
      const working = this.working();
      untracked(() => this.pump(model, working));
    });
    effect(() => {
      if (!this.working()) untracked(() => this.motion?.rest());
    });
  }

  private agentDetail(): string {
    const plan = this.plan();
    if (plan.length < 2) return '';
    const now = plan.findIndex(s => s.state === 'now');
    const done = plan.filter(s => s.state === 'done').length;
    return now >= 0 ? this.i18n.t('flow.agent.step', { n: now + 1, total: plan.length }) : this.i18n.t('flow.agent.steps_done', { n: done, total: plan.length });
  }

  private still(): boolean { return !!this.reduced?.matches; }

  private seen(): boolean { return !document.hidden && this.host.nativeElement.offsetParent !== null; }

  private mount(): void {
    const el = this.canvas().nativeElement;
    this.motion = new FlowMotion(this.svg().nativeElement, () => this.still());
    const measure = () => {
      const w = el.clientWidth, h = el.clientHeight;
      const s = this.size();
      if (w !== s.w || h !== s.h) this.size.set({ w, h });
      if (!this.drawn && w > 0 && h > 0) {
        this.drawn = true;
        this.entered.set(true);
        // The routes are in the document one frame after the size is known.
        requestAnimationFrame(() => requestAnimationFrame(() => this.motion?.draw()));
        setTimeout(() => this.entered.set(false), 1300);
      }
    };
    this.observer = new ResizeObserver(measure);
    this.observer.observe(el);
    measure();
    document.addEventListener('visibilitychange', this.onVisibility);
    // The clock only lets Active decay to Warm; it runs while a node is settling and stops by itself.
    this.timer = setInterval(() => {
      if (this.working() && this.seen() && this.model().settling(Date.now() - 1000)) this.tick.update(t => t + 1);
    }, 300);
  }

  private pump(model: FlowModel, working: boolean): void {
    const messages = model.take();
    const flash = model.flash;
    model.flash = null;
    if (!this.motion || !this.seen()) return;
    if (flash) this.motion.flash(flash);
    // The last messages of a run (checks passed, the result goes to You) arrive with the end of the work.
    if (messages.length && (working || model.finished)) this.motion.play(messages);
  }

  private visibility(): void {
    if (document.hidden) this.motion?.rest();
    else this.tick.update(t => t + 1);
  }

  click(id: FlowNode): void {
    if (id === 'you' || id === 'edit' || id === 'checks') {
      this.popover.set(null);
      this.nodeClick.emit(id);
      return;
    }
    this.popover.update(p => (p === id ? null : id));
  }

  hover(id: FlowNode | null): void {
    const current = this.popover();
    if (id === null) { if (current) this.popover.set(null); return; }
    if (current !== id) this.popover.set(id);
  }

  key(ev: KeyboardEvent, id: FlowNode): void {
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); this.click(id); }
    if (ev.key === 'Escape') this.popover.set(null);
  }

  /** The popover opens towards the middle of the canvas, so it never leaves it. */
  popStyle(n: NodeVm): Record<string, string> {
    const l = this.layout(), r = l.nodes[n.id];
    const below = r.y + r.h / 2 < l.height / 2;
    const left = Math.max(8, Math.min(l.width - 268, r.x + r.w / 2 - 130));
    return below ? { left: left + 'px', top: r.y + r.h + 8 + 'px' } : { left: left + 'px', bottom: l.height - r.y + 8 + 'px' };
  }

  gradient(i: number): string { return `${this.uid}-${i}`; }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    if (this.timer) clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.motion?.stop();
  }
}
