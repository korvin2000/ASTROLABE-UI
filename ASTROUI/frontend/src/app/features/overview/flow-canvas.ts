import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, NgZone, OnDestroy, computed, effect, inject, input, output, viewChild } from '@angular/core';
import { CampaignStore } from '../../state/campaign.store';
import { NodeId, Particle } from '../../reducers/campaign-model';
import { readPrefs } from '../../state/app.store';

interface NodeDef { id: NodeId; label: string; kind: 'square' | 'capsule' | 'store' | 'circle' | 'cell'; x: number; y: number; w: number; h: number; }

// Fixed topology (§8.4, R-OVR-02): positions never move. Deterministic machinery is squared and outlined; model-driven
// cells are rounded capsules; stores have a double top rule; the human is a circle (P-09).
export const NODES: NodeDef[] = [
  { id: 'YOU', label: 'YOU', kind: 'circle', x: 500, y: 44, w: 60, h: 60 },
  { id: 'ROUTER', label: 'ROUTER', kind: 'square', x: 110, y: 150, w: 180, h: 62 },
  { id: 'CONTROLLER', label: 'CONTROLLER', kind: 'square', x: 340, y: 150, w: 200, h: 62 },
  { id: 'COMPILER', label: 'COMPILER', kind: 'square', x: 690, y: 150, w: 190, h: 62 },
  { id: 'CELL', label: 'CELL', kind: 'cell', x: 500, y: 282, w: 360, h: 104 },
  { id: 'MODEL', label: 'MODEL', kind: 'capsule', x: 890, y: 282, w: 180, h: 62 },
  { id: 'KB', label: 'KB', kind: 'store', x: 110, y: 282, w: 170, h: 62 },
  { id: 'ATLAS', label: 'ATLAS', kind: 'store', x: 190, y: 420, w: 180, h: 62 },
  { id: 'WORKSPACE', label: 'WORKSPACE', kind: 'store', x: 400, y: 420, w: 190, h: 62 },
  { id: 'VERIFIER', label: 'VERIFIER', kind: 'square', x: 610, y: 420, w: 190, h: 62 },
  { id: 'EVIDENCE', label: 'EVIDENCE', kind: 'store', x: 830, y: 420, w: 190, h: 62 },
];

const EDGES: [NodeId, NodeId, boolean?][] = [
  ['YOU', 'CONTROLLER'], ['CELL', 'YOU', true], ['ROUTER', 'CONTROLLER'], ['CONTROLLER', 'COMPILER'], ['COMPILER', 'CELL'],
  ['CELL', 'MODEL'], ['CELL', 'ATLAS'], ['CELL', 'WORKSPACE'], ['WORKSPACE', 'VERIFIER'], ['CELL', 'VERIFIER'], ['VERIFIER', 'EVIDENCE'],
  ['CELL', 'KB'], ['KB', 'COMPILER'], ['CELL', 'CONTROLLER'], ['CONTROLLER', 'EVIDENCE'],
];

function anchor(n: NodeDef, toward: NodeDef): [number, number] {
  const dx = toward.x - n.x, dy = toward.y - n.y;
  if (n.kind === 'circle') { const l = Math.hypot(dx, dy) || 1; return [n.x + dx / l * n.w / 2, n.y + dy / l * n.h / 2]; }
  const hw = n.w / 2, hh = n.h / 2;
  const sx = Math.abs(dx) < 1e-6 ? Infinity : hw / Math.abs(dx);
  const sy = Math.abs(dy) < 1e-6 ? Infinity : hh / Math.abs(dy);
  const s = Math.min(sx, sy);
  return [n.x + dx * s, n.y + dy * s];
}

export function edgePath(a: NodeId, b: NodeId): string {
  const na = NODES.find(n => n.id === a)!, nb = NODES.find(n => n.id === b)!;
  const [x1, y1] = anchor(na, nb);
  const [x2, y2] = anchor(nb, na);
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const bend = Math.abs(x2 - x1) > 60 && Math.abs(y2 - y1) > 60 ? 0.18 : 0;
  const cx = mx + (y2 - y1) * bend, cy = my - (x2 - x1) * bend;
  return `M${x1.toFixed(1)},${y1.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
}

const SEGMENTS = ['Model', 'Read', 'Edit', 'Execute', 'Metadata'];

/**
 * The flow canvas (§8.4–§8.6): only events move things (R-OVR-01). Particles travel the typed, fixed edges for each
 * fresh stream item; excess on one edge is coalesced into a counter; the animation loop runs outside Angular change
 * detection (R-OVR-05) and writes SVG attributes directly. Every node is clickable (R-OVR-04).
 */
@Component({
  selector: 'as-flow-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg #svg class="svg" viewBox="0 0 1000 462" preserveAspectRatio="xMidYMid meet" role="img" [attr.aria-label]="ariaSummary()">
      <defs>
        <pattern id="plate" width="1000" height="462" patternUnits="userSpaceOnUse">
          <circle cx="500" cy="262" r="110" /><circle cx="500" cy="262" r="200" /><circle cx="500" cy="262" r="290" /><circle cx="500" cy="262" r="380" />
        </pattern>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9" fill="none" stroke="var(--border-strong)" stroke-width="1.4"/></marker>
      </defs>
      <rect class="plate" x="0" y="0" width="1000" height="462" fill="url(#plate)" />
      <g class="edges">
        @for (e of edges; track e.key) {
          <path [attr.id]="'edge-' + e.key" [attr.d]="e.d" class="edge" [class.dashed]="e.dashed" [class.hot]="hotEdges().has(e.key)" marker-end="url(#arrow)" />
        }
      </g>
      <g class="nodes">
        @for (n of nodes; track n.id) {
          <g class="node" [attr.data-node]="n.id" [class]="'node ' + n.kind + ' ' + state(n.id)" (click)="select.emit(n.id)" tabindex="0" role="button" [attr.aria-label]="n.label + ' ' + state(n.id) + ' ' + lines(n.id).join(' ')">
            @switch (n.kind) {
              @case ('circle') { <circle [attr.cx]="n.x" [attr.cy]="n.y" [attr.r]="n.w / 2" class="shape" /> }
              @case ('square') { <rect [attr.x]="n.x - n.w / 2" [attr.y]="n.y - n.h / 2" [attr.width]="n.w" [attr.height]="n.h" rx="3" class="shape" /> }
              @case ('store') {
                <rect [attr.x]="n.x - n.w / 2" [attr.y]="n.y - n.h / 2" [attr.width]="n.w" [attr.height]="n.h" rx="3" class="shape" />
                <line [attr.x1]="n.x - n.w / 2" [attr.x2]="n.x + n.w / 2" [attr.y1]="n.y - n.h / 2 + 4" [attr.y2]="n.y - n.h / 2 + 4" class="rule" />
              }
              @case ('capsule') { <rect [attr.x]="n.x - n.w / 2" [attr.y]="n.y - n.h / 2" [attr.width]="n.w" [attr.height]="n.h" [attr.rx]="n.h / 2" class="shape" /> }
              @case ('cell') {
                <rect [attr.x]="n.x - n.w / 2" [attr.y]="n.y - n.h / 2" [attr.width]="n.w" [attr.height]="n.h" rx="26" class="shape" />
                @for (s of segments; track s; let i = $index) {
                  <rect [attr.x]="n.x - 160 + i * 65" [attr.y]="n.y + 10" width="60" height="20" rx="10" class="seg" [class.on]="activeSegments().has(s)" />
                  <text [attr.x]="n.x - 130 + i * 65" [attr.y]="n.y + 24" class="segt" text-anchor="middle">{{ s }}</text>
                }
                <rect [attr.x]="n.x - 160" [attr.y]="n.y + 37" width="320" height="4" rx="2" class="turnbar" />
                <rect [attr.x]="n.x - 160" [attr.y]="n.y + 37" [attr.width]="320 * turnFraction()" height="4" rx="2" class="turnfill" />
              }
            }
            <text [attr.x]="n.x" [attr.y]="n.kind === 'cell' ? n.y - 28 : n.kind === 'circle' ? n.y + 5 : n.y - 6" class="label" text-anchor="middle">{{ n.id === 'CELL' ? cellLabel() : n.label }}</text>
            @if (n.kind !== 'circle') {
              <text [attr.x]="n.x" [attr.y]="n.kind === 'cell' ? n.y - 8 : n.y + 13" class="sub" text-anchor="middle">{{ clip(lines(n.id)[0]) }}</text>
              @if (n.kind !== 'cell' && lines(n.id)[1]) { <text [attr.x]="n.x" [attr.y]="n.y + 27" class="sub2" text-anchor="middle">{{ clip(lines(n.id)[1]) }}</text> }
            } @else {
              <text [attr.x]="n.x + 42" [attr.y]="n.y + 5" class="sub" text-anchor="start">{{ clip(lines(n.id)[0]) }}</text>
            }
          </g>
        }
      </g>
      <g class="sats">
        @for (s of satellites(); track s.handle; let i = $index) {
          <g class="sat" [class]="'sat ' + s.status">
            <rect [attr.x]="200 + i * 210" y="342" width="180" height="26" rx="13" class="shape" />
            <text [attr.x]="290 + i * 210" y="359" text-anchor="middle" class="sub">{{ s.kind }} · {{ s.status }}</text>
          </g>
        }
      </g>
      <g #particles class="particles"></g>
    </svg>`,
  styles: [`
    :host{display:block;position:relative;min-height:0}
    .svg{width:100%;height:100%;display:block}
    .plate{opacity:1}
    #plate circle,pattern circle{fill:none;stroke:var(--plate);stroke-width:1}
    .edge{fill:none;stroke:var(--border-default);stroke-width:1.3;transition:stroke var(--dur-slow) var(--ease)}
    .edge.dashed{stroke-dasharray:4 4}
    .edge.hot{stroke:var(--accent)}
    .node{cursor:pointer;outline:none}
    .node .shape{fill:var(--bg-surface);stroke:var(--border-strong);stroke-width:1.2;transition:stroke var(--dur-base) var(--ease),fill var(--dur-base) var(--ease)}
    .node.store .rule{stroke:var(--border-strong);stroke-width:1}
    .node.capsule .shape,.node.cell .shape{stroke-width:1.4}
    .node.active .shape{stroke:var(--accent);fill:var(--accent-faint)}
    .node.attention .shape{stroke:var(--attention)}
    .node.error .shape{stroke:var(--danger)}
    .node.flash .shape{fill:var(--accent-subtle)}
    .node:focus-visible .shape{stroke-width:2.4}
    .label{font:600 14px var(--font-ui);letter-spacing:.08em;fill:var(--text-primary)}
    .node.idle .label{fill:var(--text-secondary)}
    .sub{font:400 13px var(--font-mono);fill:var(--text-secondary)}
    .sub2{font:400 12px var(--font-mono);fill:var(--text-tertiary)}
    .seg{fill:var(--bg-canvas);stroke:var(--border-default);stroke-width:1;transition:fill var(--dur-base) var(--ease)}
    .seg.on{fill:var(--accent-subtle);stroke:var(--accent)}
    .segt{font:500 11.5px var(--font-ui);fill:var(--text-tertiary);pointer-events:none}
    .turnbar{fill:var(--bg-active)} .turnfill{fill:var(--accent)}
    .node.circle .shape{fill:var(--bg-surface)}
    .node.circle.attention .shape{animation:wait 1.6s ease-in-out infinite}
    @keyframes wait{0%,100%{stroke-opacity:1}50%{stroke-opacity:.45}}
    .sat .shape{fill:var(--bg-surface);stroke:var(--border-default)}
    .sat.running .shape{stroke:var(--accent)} .sat.failed .shape,.sat.rejected .shape{stroke:var(--danger)}
    :host ::ng-deep .pt{r:4}
    :host ::ng-deep .pt.ok{fill:var(--success)} :host ::ng-deep .pt.bad{fill:var(--danger)} :host ::ng-deep .pt.neutral{fill:var(--accent)}
    :host ::ng-deep .ptl{font:500 12px var(--font-mono);fill:var(--text-secondary)}
  `],
})
export class FlowCanvas implements AfterViewInit, OnDestroy {
  private readonly zone = inject(NgZone);
  readonly store = input.required<CampaignStore>();
  readonly select = output<string>();
  readonly svg = viewChild<ElementRef<SVGSVGElement>>('svg');
  readonly particlesLayer = viewChild<ElementRef<SVGGElement>>('particles');
  readonly nodes = NODES;
  readonly segments = SEGMENTS;
  readonly edges = EDGES.map(([a, b, dashed]) => ({ key: a + '-' + b, a, b, d: edgePath(a, b), dashed: !!dashed }));

  private readonly running: { el: SVGCircleElement; label?: SVGTextElement; path: SVGPathElement; reverse: boolean; start: number; dur: number }[] = [];
  private raf = 0;
  private lastAnimated = Number.MAX_SAFE_INTEGER;
  private readonly hot = new Map<string, number>();

  readonly version = computed(() => this.store().version());
  readonly activeSegments = computed(() => { this.version(); return new Set(this.store().model.segments); });
  readonly hotEdges = computed(() => { this.version(); const now = Date.now(); return new Set([...this.hot.entries()].filter(([, t]) => now - t < 1200).map(([k]) => k)); });
  readonly satellites = computed(() => { this.version(); return [...this.store().model.delegations.values()].slice(-3); });
  readonly turnFraction = computed(() => {
    this.version();
    const c = this.store().model.activeCell();
    const t = c?.turns[c.turns.length - 1];
    const max = t?.turnsMax ?? c?.turnsMax;
    return t && max ? Math.min(1, t.n / max) : 0;
  });
  readonly cellLabel = computed(() => {
    this.version();
    const c = this.store().model.activeCell();
    if (!c) return 'CELL';
    const t = c.turns[c.turns.length - 1];
    return `CELL · ${c.role}${t ? ' · t' + t.n : ''}`;
  });
  readonly ariaSummary = computed(() => {
    this.version();
    const m = this.store().model;
    const active = (Object.keys(m.nodes) as NodeId[]).filter(n => m.nodes[n].state !== 'idle');
    return 'Agent overview. Active: ' + (active.join(', ') || 'none');
  });

  constructor() {
    effect(() => {
      const fresh = this.store().fresh();
      if (!fresh.length) return;
      const prefs = readPrefs();
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || prefs.motion === 'off';
      const seqs = new Set(fresh.map(f => f.seq).filter((s): s is number => s !== undefined));
      const model = this.store().model;
      const particles = model.particles.filter(p => seqs.has(p.seq) && p.seq > this.lastAnimatedSafe());
      if (!particles.length) return;
      this.lastAnimated = Math.max(...particles.map(p => p.seq));
      // Nodes touched by these items flash briefly (activation 160 ms in, decay 1.2 s).
      for (const id of Object.keys(model.nodes) as NodeId[]) if (seqs.has(model.nodes[id].lastSeq)) this.flash(id);
      if (reduced) {
        for (const p of particles) this.markEdge(p);
        return;
      }
      const calm = prefs.motion === 'calm';
      this.zone.runOutsideAngular(() => {
        const perEdge = new Map<string, number>();
        for (const p of particles) {
          this.markEdge(p);
          if (calm && !['MODEL', 'VERIFIER', 'EVIDENCE'].includes(String(p.to)) && !['MODEL', 'VERIFIER'].includes(String(p.from))) continue;
          const key = p.from + '-' + p.to;
          const n = (perEdge.get(key) ?? 0) + 1;
          perEdge.set(key, n);
          if (n > 6) continue; // coalesced (≤ 6 concurrent per edge)
          this.launch(p, n);
        }
      });
    });
  }

  private lastAnimatedSafe(): number { return this.lastAnimated === Number.MAX_SAFE_INTEGER ? -1 : this.lastAnimated; }

  ngAfterViewInit(): void {
    // Historical particles are never replayed as animation on open (§8.11): start from the current position.
    this.lastAnimated = this.store().model.lastSeq;
  }

  private markEdge(p: Particle): void {
    const key = p.from + '-' + p.to;
    const rev = p.to + '-' + p.from;
    const k = this.edges.some(e => e.key === key) ? key : rev;
    this.hot.set(k, Date.now());
  }

  private flash(id: string): void {
    const el = this.svg()?.nativeElement.querySelector(`[data-node="${id}"]`);
    if (!el) return;
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1200);
  }

  private launch(p: Particle, n: number): void {
    const svg = this.svg()?.nativeElement;
    const layer = this.particlesLayer()?.nativeElement;
    if (!svg || !layer) return;
    const forward = svg.querySelector<SVGPathElement>(`#edge-${p.from}-${p.to}`);
    const backward = forward ? null : svg.querySelector<SVGPathElement>(`#edge-${p.to}-${p.from}`);
    const path = forward ?? backward;
    if (!path) return;
    const ns = 'http://www.w3.org/2000/svg';
    const el = document.createElementNS(ns, 'circle');
    el.setAttribute('r', '4');
    el.setAttribute('class', 'pt ' + p.tone);
    layer.appendChild(el);
    let label: SVGTextElement | undefined;
    if (p.label && n === 1) {
      label = document.createElementNS(ns, 'text');
      label.setAttribute('class', 'ptl');
      label.textContent = p.label.length > 18 ? p.label.slice(0, 17) + '…' : p.label;
      layer.appendChild(label);
    }
    this.running.push({ el, label, path, reverse: !forward, start: performance.now() + (n - 1) * 90, dur: 560 + Math.random() * 140 });
    if (!this.raf) this.raf = requestAnimationFrame(t => this.frame(t));
  }

  private frame(now: number): void {
    this.raf = 0;
    for (let i = this.running.length - 1; i >= 0; i--) {
      const r = this.running[i];
      const t = (now - r.start) / r.dur;
      if (t < 0) continue;
      if (t >= 1) {
        r.el.remove();
        r.label?.remove();
        this.running.splice(i, 1);
        continue;
      }
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const len = r.path.getTotalLength();
      const pt = r.path.getPointAtLength((r.reverse ? 1 - e : e) * len);
      r.el.setAttribute('cx', pt.x.toFixed(1));
      r.el.setAttribute('cy', pt.y.toFixed(1));
      r.el.setAttribute('opacity', String(t > 0.85 ? (1 - t) / 0.15 : 1));
      if (r.label) {
        r.label.setAttribute('x', (pt.x + 8).toFixed(1));
        r.label.setAttribute('y', (pt.y - 7).toFixed(1));
        r.label.setAttribute('opacity', String(t > 0.7 ? (1 - t) / 0.3 : 1));
      }
    }
    if (this.running.length) this.raf = requestAnimationFrame(tt => this.frame(tt));
  }

  clip(s: string | undefined): string { return !s ? '' : s.length > 24 ? s.slice(0, 23) + '…' : s; }

  state(id: NodeId): string { this.version(); return this.store().model.nodes[id].state; }
  lines(id: NodeId): string[] { this.version(); return this.store().model.nodes[id].lines; }

  ngOnDestroy(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    for (const r of this.running) { r.el.remove(); r.label?.remove(); }
  }
}
