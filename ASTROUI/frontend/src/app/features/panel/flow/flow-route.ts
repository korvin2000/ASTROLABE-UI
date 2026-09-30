import { FlowNode } from '../../../timeline/steps';
import { Layout, Rect } from './flow-layout';

// Flow connections (Studio 2 section 8.2.4): seven lines, orthogonal with rounded corners, each with a port at both
// ends. Pure functions: rectangles in, path strings and port points out.

export type LineId = 'you-agent' | 'model-agent' | 'agent-memory' | 'agent-explore' | 'explore-edit' | 'edit-checks' | 'agent-checks';
type Kind = 'topL' | 'topR' | 'leftDown' | 's' | 'loop';

export interface Line { id: LineId; from: FlowNode; to: FlowNode; kind: Kind; }

export const LINES: readonly Line[] = [
  { id: 'you-agent', from: 'you', to: 'agent', kind: 'topL' },
  { id: 'model-agent', from: 'model', to: 'agent', kind: 'topR' },
  { id: 'agent-memory', from: 'agent', to: 'memory', kind: 's' },
  { id: 'agent-explore', from: 'agent', to: 'explore', kind: 'leftDown' },
  { id: 'explore-edit', from: 'explore', to: 'edit', kind: 's' },
  { id: 'edit-checks', from: 'edit', to: 'checks', kind: 's' },
  { id: 'agent-checks', from: 'agent', to: 'checks', kind: 'loop' },
];

export interface Route {
  id: LineId;
  from: FlowNode;
  to: FlowNode;
  d: string;
  x1: number; y1: number; x2: number; y2: number;
  /** The corner points of the line, start and end included; the segments between them are horizontal or vertical. */
  points: [number, number][];
}

const n = (v: number) => Math.round(v * 100) / 100;

function route(line: Line, a: Rect, b: Rect, edit: Rect, R: number): Route {
  const rad = (...v: number[]) => Math.max(0, Math.min(R, ...v));
  let x1: number, y1: number, x2: number, y2: number, d: string, points: [number, number][];
  if (line.kind === 'topL') {
    x1 = a.x + a.w; y1 = a.y + a.h / 2; x2 = b.x + b.w * 0.42; y2 = b.y;
    const r = rad((x2 - x1) / 2, (y2 - y1) / 2);
    d = `M${n(x1)} ${n(y1)}H${n(x2 - r)}Q${n(x2)} ${n(y1)} ${n(x2)} ${n(y1 + r)}V${n(y2)}`;
    points = [[x1, y1], [x2, y1], [x2, y2]];
  } else if (line.kind === 'topR' || line.kind === 'leftDown') {
    const top = line.kind === 'topR';
    x1 = a.x; y1 = a.y + a.h * (top ? 0.5 : 0.62); x2 = b.x + b.w * (top ? 0.58 : 0.6); y2 = b.y;
    const r = rad((x1 - x2) / 2, (y2 - y1) / 2);
    d = `M${n(x1)} ${n(y1)}H${n(x2 + r)}Q${n(x2)} ${n(y1)} ${n(x2)} ${n(y1 + r)}V${n(y2)}`;
    points = [[x1, y1], [x2, y1], [x2, y2]];
  } else if (line.kind === 's') {
    x1 = a.x + a.w; y1 = a.y + a.h / 2; x2 = b.x; y2 = b.y + b.h / 2;
    const xm = (x1 + x2) / 2, dy = y2 - y1, s = dy < 0 ? -1 : 1;
    const r = rad((x2 - x1) / 2, Math.abs(dy) / 2);
    if (r < 1) {
      d = `M${n(x1)} ${n(y1)}H${n(x2)}`;
      points = [[x1, y1], [x2, y1]];
      y2 = y1;
    } else {
      d = `M${n(x1)} ${n(y1)}H${n(xm - r)}Q${n(xm)} ${n(y1)} ${n(xm)} ${n(y1 + s * r)}V${n(y2 - s * r)}Q${n(xm)} ${n(y2)} ${n(xm + r)} ${n(y2)}H${n(x2)}`;
      points = [[x1, y1], [xm, y1], [xm, y2], [x2, y2]];
    }
  } else {
    // Down from the Agent, right, then down between Edit & run and Checks, into the port of `edit-checks`.
    x1 = a.x + a.w * 0.78; y1 = a.y + a.h; x2 = b.x; y2 = b.y + b.h / 2;
    const xv = (edit.x + edit.w + b.x) / 2, ym = y1 + (edit.y - y1) * 0.5;
    const r = rad((xv - x1) / 2, ym - y1, (y2 - ym) / 2, x2 - xv);
    d = `M${n(x1)} ${n(y1)}V${n(ym - r)}Q${n(x1)} ${n(ym)} ${n(x1 + r)} ${n(ym)}H${n(xv - r)}Q${n(xv)} ${n(ym)} ${n(xv)} ${n(ym + r)}V${n(y2 - r)}Q${n(xv)} ${n(y2)} ${n(xv + r)} ${n(y2)}H${n(x2)}`;
    points = [[x1, y1], [x1, ym], [xv, ym], [xv, y2], [x2, y2]];
  }
  return { id: line.id, from: line.from, to: line.to, d, x1, y1, x2, y2, points };
}

export function routes(layout: Layout): Route[] {
  return LINES.map(l => route(l, layout.nodes[l.from], layout.nodes[l.to], layout.nodes.edit, layout.radius));
}

/** The line between two nodes and the direction of travel on it: 1 from its start to its end, -1 the other way. */
export function lineBetween(a: FlowNode, b: FlowNode): { line: Line; dir: 1 | -1 } | null {
  for (const line of LINES) {
    if (line.from === a && line.to === b) return { line, dir: 1 };
    if (line.from === b && line.to === a) return { line, dir: -1 };
  }
  return null;
}

/** True when a segment of [route] runs through the inside of [rect] (touching its border at a port does not count). */
export function crosses(route: Route, rect: Rect): boolean {
  const inset = 1;
  const left = rect.x + inset, right = rect.x + rect.w - inset, top = rect.y + inset, bottom = rect.y + rect.h - inset;
  for (let i = 0; i + 1 < route.points.length; i++) {
    const [ax, ay] = route.points[i], [bx, by] = route.points[i + 1];
    const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), y0 = Math.min(ay, by), y1 = Math.max(ay, by);
    if (x0 < right && x1 > left && y0 < bottom && y1 > top) return true;
  }
  return false;
}

const CHAIN: readonly FlowNode[] = ['explore', 'edit', 'checks'];

/**
 * The work-round rule (section 8.2.6): an event of Explore, Edit & run or Checks travels along the chain from the last
 * active work node when that node is earlier in the chain; otherwise a new round starts at the Agent. Returns the hops
 * as pairs of nodes, empty when the target is the node that is active already.
 */
export function workRound(last: FlowNode | null, target: FlowNode): [FlowNode, FlowNode][] {
  const to = CHAIN.indexOf(target);
  if (to < 0) return [];
  const from = last ? CHAIN.indexOf(last) : -1;
  if (from === to) return [];
  const hops: [FlowNode, FlowNode][] = [];
  let start = from;
  if (from < 0 || from > to) {
    hops.push(['agent', 'explore']);
    start = 0;
  }
  for (let i = start; i < to; i++) hops.push([CHAIN[i], CHAIN[i + 1]]);
  return hops;
}
