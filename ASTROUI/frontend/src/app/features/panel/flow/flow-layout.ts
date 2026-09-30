import { FlowNode } from '../../../timeline/steps';

// Flow layout (Studio 2 section 8.2.3): fixed positions in a 940 x 860 design space. Centres scale with the canvas,
// node sizes do not, so text stays readable. Pure functions: canvas size in, rectangles out.

export interface Rect { x: number; y: number; w: number; h: number; }

export const DESIGN = { w: 940, h: 860 } as const;
export const MIN_CANVAS = { w: 440, h: 440 } as const;
export const COMPACT_BELOW = 760;
export const INSET = 8;

export const NODES: readonly FlowNode[] = ['you', 'model', 'agent', 'memory', 'explore', 'edit', 'checks'];

export const CENTRES: Readonly<Record<FlowNode, { cx: number; cy: number }>> = {
  you: { cx: 181, cy: 148 },
  model: { cx: 677, cy: 146 },
  agent: { cx: 442, cy: 391 },
  memory: { cx: 784, cy: 466 },
  explore: { cx: 160, cy: 689 },
  edit: { cx: 483, cy: 750 },
  checks: { cx: 808, cy: 750 },
};

/** Node colours (section 8.2.2); used nowhere else in the app. */
export const COLOURS: Readonly<Record<FlowNode, string>> = {
  you: '#2dd4bf',
  model: '#a78bfa',
  agent: '#60a5fa',
  memory: '#34d3b4',
  explore: '#b794f6',
  edit: '#fbbf24',
  checks: '#5b9cf5',
};

export interface Layout {
  width: number;
  height: number;
  compact: boolean;
  /** Corner radius of the lines. */
  radius: number;
  /** Radius of a port. */
  port: number;
  nodes: Record<FlowNode, Rect>;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function layout(width: number, height: number): Layout {
  const W = Math.max(width, 1), H = Math.max(height, 1);
  const compact = W < COMPACT_BELOW;
  const w = compact ? clamp(W * 0.27, 130, 172) : Math.min(250, W * 0.27);
  const h = compact ? 80 : 108;
  const sx = W / DESIGN.w, sy = H / DESIGN.h;
  const nodes = {} as Record<FlowNode, Rect>;
  for (const id of NODES) {
    const c = CENTRES[id];
    nodes[id] = {
      x: clamp(c.cx * sx - w / 2, INSET, Math.max(INSET, W - w - INSET)),
      y: clamp(c.cy * sy - h / 2, INSET, Math.max(INSET, H - h - INSET)),
      w, h,
    };
  }
  return { width: W, height: H, compact, radius: compact ? 12 : 18, port: compact ? 4 : 5, nodes };
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
