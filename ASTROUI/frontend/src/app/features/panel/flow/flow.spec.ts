import { describe, expect, it } from 'vitest';
import { StudioItem } from '../../../core/model';
import { EN } from '../../../i18n/catalog.en';
import { translate, translatePlural } from '../../../i18n/translate';
import auto from '../../../../testing/task-auto.events.json';
import followUp from '../../../../testing/task-follow-up.events.json';
import live from '../../../../testing/task-live-openrouter.events.json';
import paused from '../../../../testing/task-live-paused.events.json';
import asked from '../../../../testing/task-question-approval.events.json';
import { FlowNode } from '../../../timeline/steps';
import { offences } from '../../../vocabulary';
import { CENTRES, COLOURS, DESIGN, MIN_CANVAS, NODES, layout, overlaps } from './flow-layout';
import { FlowMessage, FlowModel, HOLD_MS } from './flow-model';
import { CEILING, COALESCE_MS, MIN_TRAVEL_MS, travelMs } from './flow-motion';
import { LINES, crosses, lineBetween, routes, workRound } from './flow-route';

// The Flow (Studio 2 section 8.2, A-16, A-17): layout and routes as pure functions, the model replayed from recorded runs.

const items = (r: unknown) => (r as { items: StudioItem[] }).items;

/** Canvas sizes the Flow must hold: the minimum, the side panel, a wide panel, the main area. */
const SIZES: [number, number][] = [[440, 440], [447, 470], [520, 470], [600, 520], [759, 600], [760, 600], [940, 860], [1180, 760], [1440, 820], [1900, 1000]];

describe('flow layout (8.2.3)', () => {
  it('has seven fixed nodes, named after the work', () => {
    expect(NODES).toEqual(['you', 'model', 'agent', 'memory', 'explore', 'edit', 'checks']);
    expect(Object.keys(COLOURS)).toHaveLength(7);
  });

  it('puts the node centres of the reference picture at the design size', () => {
    const l = layout(DESIGN.w, DESIGN.h);
    for (const id of ['agent', 'edit'] as FlowNode[]) {
      expect(l.nodes[id].x + l.nodes[id].w / 2).toBeCloseTo(CENTRES[id].cx, 0);
      expect(l.nodes[id].y + l.nodes[id].h / 2).toBeCloseTo(CENTRES[id].cy, 0);
    }
  });

  it('switches to the compact size below 760 px', () => {
    expect(layout(759, 600).compact).toBe(true);
    expect(layout(760, 600).compact).toBe(false);
    expect(layout(440, 440).nodes.you).toMatchObject({ w: 130, h: 80 });
    expect(layout(1440, 820).nodes.you).toMatchObject({ w: 250, h: 108 });
  });

  it.each(SIZES)('keeps every node inside a %i x %i canvas and apart from the others', (w, h) => {
    const l = layout(w, h);
    for (const id of NODES) {
      const r = l.nodes[id];
      expect(r.x).toBeGreaterThanOrEqual(8);
      expect(r.y).toBeGreaterThanOrEqual(8);
      expect(r.x + r.w).toBeLessThanOrEqual(w - 8 + 0.001);
      expect(r.y + r.h).toBeLessThanOrEqual(h - 8 + 0.001);
    }
    for (let i = 0; i < NODES.length; i++) {
      for (let j = i + 1; j < NODES.length; j++) {
        expect(overlaps(l.nodes[NODES[i]], l.nodes[NODES[j]]), `${NODES[i]} over ${NODES[j]}`).toBe(false);
      }
    }
  });

  it('keeps the minimum canvas in the list', () => {
    expect(SIZES[0]).toEqual([MIN_CANVAS.w, MIN_CANVAS.h]);
  });
});

describe('flow routes (8.2.4)', () => {
  it('has the seven lines of the specification', () => {
    expect(LINES.map(l => l.id)).toEqual(['you-agent', 'model-agent', 'agent-memory', 'agent-explore', 'explore-edit', 'edit-checks', 'agent-checks']);
  });

  it.each(SIZES)('draws no line through a node on a %i x %i canvas', (w, h) => {
    const l = layout(w, h);
    for (const r of routes(l)) {
      expect(r.d.startsWith('M')).toBe(true);
      expect(r.d).not.toContain('NaN');
      for (const id of NODES) {
        if (id === r.from || id === r.to) continue;
        expect(crosses(r, l.nodes[id]), `${r.id} through ${id}`).toBe(false);
      }
    }
  });

  it.each(SIZES)('starts and ends every line on the border of its nodes (%i x %i)', (w, h) => {
    const l = layout(w, h);
    const onBorder = (x: number, y: number, id: FlowNode) => {
      const n = l.nodes[id];
      const inX = x >= n.x - 0.5 && x <= n.x + n.w + 0.5, inY = y >= n.y - 0.5 && y <= n.y + n.h + 0.5;
      const edgeX = Math.abs(x - n.x) < 0.5 || Math.abs(x - n.x - n.w) < 0.5, edgeY = Math.abs(y - n.y) < 0.5 || Math.abs(y - n.y - n.h) < 0.5;
      return (edgeX && inY) || (edgeY && inX);
    };
    for (const r of routes(l)) {
      expect(onBorder(r.x1, r.y1, r.from), `${r.id} start`).toBe(true);
      expect(onBorder(r.x2, r.y2, r.to), `${r.id} end`).toBe(true);
    }
  });

  it('knows the direction of a message on a line', () => {
    expect(lineBetween('you', 'agent')).toMatchObject({ dir: 1 });
    expect(lineBetween('agent', 'you')).toMatchObject({ dir: -1, line: { id: 'you-agent' } });
    expect(lineBetween('checks', 'agent')).toMatchObject({ dir: -1, line: { id: 'agent-checks' } });
    expect(lineBetween('you', 'model')).toBeNull();
  });

  it('follows the work-round rule', () => {
    expect(workRound(null, 'explore')).toEqual([['agent', 'explore']]);
    expect(workRound('explore', 'edit')).toEqual([['explore', 'edit']]);
    expect(workRound('explore', 'checks')).toEqual([['explore', 'edit'], ['edit', 'checks']]);
    expect(workRound('edit', 'checks')).toEqual([['edit', 'checks']]);
    expect(workRound('edit', 'edit')).toEqual([]);
    // Later in the chain than the target: a new round starts at the Agent.
    expect(workRound('checks', 'edit')).toEqual([['agent', 'explore'], ['explore', 'edit']]);
    expect(workRound('edit', 'explore')).toEqual([['agent', 'explore']]);
    expect(workRound(null, 'checks')).toEqual([['agent', 'explore'], ['explore', 'edit'], ['edit', 'checks']]);
  });
});

describe('flow motion (8.2.6)', () => {
  it('travels at 620 px per second and never faster than 420 ms', () => {
    expect(travelMs(620)).toBeCloseTo(1000, 0);
    expect(travelMs(100)).toBe(MIN_TRAVEL_MS);
    expect(COALESCE_MS).toBe(400);
    expect(CEILING).toBe(8);
  });
});

function run(list: StudioItem[], live = true): { model: FlowModel; sent: FlowMessage[] } {
  const model = new FlowModel();
  const sent: FlowMessage[] = [];
  for (const i of list) {
    model.apply(i, live);
    sent.push(...model.take());
  }
  return { model, sent };
}

const hop = (m: FlowMessage) => `${m.from}>${m.to}`;

describe('flow model (Appendix D)', () => {
  it('starts idle, with a text on every node', () => {
    const m = new FlowModel();
    for (const id of NODES) {
      expect(m.nodes[id].state).toBe('idle');
      expect(EN[m.nodes[id].subtitle!.key]).toBeTruthy();
    }
    expect(m.take()).toEqual([]);
  });

  it('leaves every used node Done and Checks green when the task finished', () => {
    const { model } = run(items(asked));
    expect(model.finished).toBe(true);
    expect(model.nodes.checks.state).toBe('passed');
    expect(model.nodes.checks.mark).toBe('✓');
    for (const id of ['you', 'model', 'agent', 'explore', 'edit'] as FlowNode[]) {
      expect(model.nodes[id].state, id).toBe('done');
      expect(model.nodes[id].mark, id).toBe('✓');
    }
    // Memory was not used in this task: it stays as it was.
    expect(model.nodes.memory.state).toBe('idle');
  });

  it('sends every message along a line that exists', () => {
    for (const r of [asked, auto, followUp, live, paused]) {
      for (const m of run(items(r)).sent) expect(lineBetween(m.from, m.to), hop(m)).not.toBeNull();
    }
  });

  it('shows the request, the model calls and the result in the right direction', () => {
    const { sent } = run(items(asked));
    const hops = sent.map(hop);
    expect(hops[0]).toBe('you>agent');
    expect(hops).toContain('agent>model');
    expect(hops).toContain('model>agent');
    expect(hops).toContain('agent>explore');
    expect(hops).toContain('explore>edit');
    expect(hops).toContain('edit>checks');
    expect(sent.at(-1)).toEqual({ from: 'agent', to: 'you', tone: 'ok' });
    expect(sent.some(m => m.from === 'checks' && m.to === 'agent' && m.tone === 'ok')).toBe(true);
    // A request goes out for every answer that comes back.
    expect(hops.filter(h => h === 'agent>model').length).toBe(hops.filter(h => h === 'model>agent').length);
  });

  it('turns You amber and pauses the Agent while a question waits', () => {
    const list = items(asked);
    const at = list.findIndex(i => i.kind === 'studio.decision_requested');
    const { model, sent } = run(list.slice(0, at + 1));
    expect(model.nodes.you.state).toBe('waiting');
    expect(model.nodes.agent.state).toBe('paused');
    expect(hop(sent.at(-1)!)).toBe('agent>you');
    const after = run(list.slice(0, list.findIndex(i => i.kind === 'studio.decision_resolved') + 1));
    expect(after.model.nodes.you.state).toBe('active');
    expect(hop(after.sent.at(-1)!)).toBe('you>agent');
  });

  it('replays history without motion', () => {
    const { model, sent } = run(items(asked), false);
    expect(sent).toEqual([]);
    expect(model.nodes.agent.state).toBe('done');
  });

  it('ignores an item it has seen', () => {
    const list = items(asked);
    const once = run(list);
    const twice = run([...list, ...list]);
    expect(twice.sent.length).toBe(once.sent.length);
  });

  it('verifies by review in a project without tests', () => {
    const { model } = run(items(followUp));
    expect(model.nodes.checks.state).toBe('passed');
    expect(model.nodes.checks.detail?.key).toBe('flow.checks.by_review');
    expect(model.nodes.you.subtitle).toMatchObject({ key: 'flow.you.done', n: 2 });
  });

  it('pauses the Agent when a run could not go on', () => {
    const { model } = run(items(paused));
    expect(model.finished).toBe(false);
    expect(model.nodes.agent.state).toBe('paused');
    expect(model.nodes.model.thinking).toBe(false);
    expect(NODES.some(id => model.nodes[id].busy)).toBe(false);
  });

  it('lets Active decay to Warm after the hold time, and only while the task works', () => {
    const m = new FlowModel();
    m.apply({ at: new Date().toISOString(), source: 'bus', ids: { work: 'W-x' }, seq: 1, kind: 'cell.tool_called', data: { opId: 1, family: 'look', op: 'read' } }, true);
    const now = Date.now();
    expect(m.display('explore', now, true)).toBe('active');
    m.apply({ at: new Date().toISOString(), source: 'bus', ids: { work: 'W-x' }, seq: 2, kind: 'cell.tool_resulted', data: { opId: 1 } }, true);
    expect(m.display('explore', Date.now(), true)).toBe('active');
    expect(m.display('explore', Date.now() + HOLD_MS + 1, true)).toBe('warm');
    expect(m.display('explore', now, false)).toBe('warm');
    expect(m.settling(Date.now())).toBe(true);
    expect(m.settling(Date.now() + HOLD_MS + 1)).toBe(false);
  });

  it('counts helpers on the Agent and never adds a node', () => {
    const m = new FlowModel();
    const base = { at: new Date().toISOString(), source: 'bus' as const, ids: { work: 'W-x' } };
    m.apply({ ...base, seq: 1, kind: 'delegation.dispatched', data: { count: 5 } }, true);
    expect(m.helpers).toBe(5);
    expect(Object.keys(m.nodes)).toHaveLength(7);
    m.apply({ ...base, seq: 2, kind: 'delegation.collected', data: {} }, true);
    expect(m.helpers).toBe(0);
  });

  it('says everything in the words of the catalog, without internal terms', () => {
    for (const r of [asked, auto, followUp, live, paused]) {
      const model = new FlowModel();
      for (const i of items(r)) {
        model.apply(i, true);
        for (const id of NODES) {
          for (const text of [model.nodes[id].subtitle, model.nodes[id].detail]) {
            if (!text) continue;
            const sentence = text.n === undefined ? translate('en', text.key, text.params) : translatePlural('en', text.key, text.n, text.params);
            expect(sentence, text.key).not.toBe(text.key);
            expect(offences(sentence.replace(/\S*[\/.]\S*/g, '')), sentence).toEqual([]);
          }
        }
      }
    }
  });
});
