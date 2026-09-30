import { StudioItem } from '../../../core/model';
import { Text } from '../../../i18n/translate';
import { FlowNode, ToolCall, describe, hidden, nodeOf, opOf, working } from '../../../timeline/steps';
import { NODES } from './flow-layout';
import { workRound } from './flow-route';

// The Flow model (Studio 2 section 8.2, Appendix D): task events become node states, counters and a queue of messages
// that travel the lines. Nothing here moves by itself: a state or a message has an event behind it.

export type NodeState = 'idle' | 'warm' | 'active' | 'waiting' | 'paused' | 'passed' | 'failed' | 'done';
export type Tone = 'ok' | 'bad' | null;

export interface Activity { text: Text; at: string; }

export interface NodeView {
  id: FlowNode;
  state: NodeState;
  /** The Model while a request is open. */
  thinking: boolean;
  subtitle: Text | null;
  detail: Text | null;
  mark: '' | '✓' | '!';
  used: boolean;
  /** An operation of the node is running; the node stays Active after its end for the hold time. */
  busy: boolean;
  /** Time of the node's last event, as the clock of the browser saw it. */
  touched: number;
  /** The last five activities, newest first, for the popover. */
  activities: Activity[];
}

export interface FlowMessage { from: FlowNode; to: FlowNode; tone: Tone; }

/** A node stays Active for this long after its last event (section 8.2.5). */
export const HOLD_MS = 900;

function str(v: unknown): string { return typeof v === 'string' ? v : ''; }
function num(v: unknown): number { return typeof v === 'number' && isFinite(v) ? v : 0; }
function obj(v: unknown): Record<string, unknown> { return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}; }
function arr(v: unknown): unknown[] { return Array.isArray(v) ? v : []; }

export class FlowModel {
  readonly nodes = {} as Record<FlowNode, NodeView>;
  /** Helpers at work (delegated work); shown as squares on the Agent. */
  helpers = 0;
  /** Messages not yet shown; the stage takes them with [take]. */
  private queue: FlowMessage[] = [];
  /** The line last used turned red by an error; the stage reads and clears it. */
  flash: FlowMessage | null = null;
  finished = false;
  version = 0;

  private lastWork: FlowNode | null = null;
  private lastMessage: FlowMessage | null = null;
  private lastActive: FlowNode | null = null;
  private messages = 0;
  private calls = 0;
  private tokens = 0;
  private recalled = 0;
  private saved = 0;
  private filesRead = new Set<string>();
  private searches = 0;
  private filesChanged = new Set<string>();
  private commands = 0;
  private pendingCards = new Set<string>();
  private model: Text | null = null;
  private checksRan = false;
  private readonly seen = new Map<string, number>();

  constructor() { this.reset(); }

  reset(): void {
    for (const id of NODES) {
      this.nodes[id] = { id, state: 'idle', thinking: false, subtitle: { key: `flow.${id}.idle` }, detail: null, mark: '', used: false, busy: false, touched: 0, activities: [] };
    }
  }

  /** The model and effort of the task, shown on the Model node while it is not thinking. */
  setModel(name: string | null, effort: string | null): void {
    this.model = name ? { key: effort ? 'flow.model.using_effort' : 'flow.model.using', params: { model: name, effort: effort ? effort : '' } } : null;
    const m = this.nodes.model;
    if (!m.thinking && this.model) m.subtitle = this.model;
    this.version++;
  }

  /** Messages to show, in order; the queue is empty afterwards. */
  take(): FlowMessage[] {
    const q = this.queue;
    this.queue = [];
    return q;
  }

  /**
   * Applies one item. [live] is false while history is replayed: states and counters change, nothing travels.
   */
  apply(item: StudioItem, live: boolean): void {
    const work = item.ids?.work ?? '';
    if (typeof item.seq === 'number') {
      if (item.seq <= (this.seen.get(work) ?? 0)) return;
      this.seen.set(work, item.seq);
    }
    try {
      this.reduce(item, live);
    } catch {
      // An item the model cannot read changes nothing; the picture stays true to what it understood.
    }
    this.version++;
  }

  private send(from: FlowNode, to: FlowNode, live: boolean, tone: Tone = null): void {
    const m = { from, to, tone };
    this.lastMessage = m;
    if (live) this.queue.push(m);
  }

  private touch(id: FlowNode, state: NodeState, subtitle: Text | null, at: string, busy = false): NodeView {
    const n = this.nodes[id];
    n.state = state;
    n.used = true;
    n.busy = busy;
    n.touched = Date.now();
    if (state !== 'failed' && state !== 'passed' && state !== 'done') n.mark = '';
    if (subtitle) {
      n.subtitle = subtitle;
      const last = n.activities[0];
      if (!last || last.text.key !== subtitle.key || JSON.stringify(last.text.params ?? {}) !== JSON.stringify(subtitle.params ?? {})) {
        n.activities.unshift({ text: subtitle, at });
        if (n.activities.length > 5) n.activities.length = 5;
      }
    }
    if (state === 'active') this.lastActive = id;
    return n;
  }

  private settle(id: FlowNode): void {
    const n = this.nodes[id];
    n.busy = false;
    n.touched = Date.now();
  }

  private details(): void {
    this.nodes.you.detail = { key: 'flow.you.detail', params: { n: this.messages } };
    this.nodes.model.detail = { key: 'flow.model.detail', params: { calls: this.calls, tokens: this.tokens } };
    this.nodes.memory.detail = { key: 'flow.memory.detail', params: { used: this.recalled, saved: this.saved } };
    this.nodes.explore.detail = { key: 'flow.explore.detail', params: { files: this.filesRead.size, searches: this.searches } };
    this.nodes.edit.detail = { key: 'flow.edit.detail', params: { files: this.filesChanged.size, commands: this.commands } };
  }

  /** A step of Explore, Edit & run or Checks: the node becomes Active and the message follows the work-round rule. */
  private work(target: FlowNode, subtitle: Text, at: string, live: boolean): void {
    const n = this.nodes[target];
    const again = n.busy || (n.state === 'active' && Date.now() - n.touched < 2000);
    if (!again || this.lastWork !== target) {
      for (const [from, to] of workRound(this.lastWork, target)) this.send(from, to, live);
    }
    this.lastWork = target;
    this.touch(target, 'active', subtitle, at, true);
    if (this.nodes.agent.state !== 'paused') this.nodes.agent.state = 'active';
  }

  private reduce(item: StudioItem, live: boolean): void {
    const d = item.data ?? {};
    const at = item.at;
    switch (item.kind) {
      case 'studio.user_message': {
        const role = str(d['role']);
        this.messages++;
        if (role === 'request' || role === 'follow_up') {
          // A new run: the work nodes start a new round, the picture keeps what the task did so far.
          this.finished = false;
          this.lastWork = null;
          for (const id of NODES) {
            const n = this.nodes[id];
            if (n.state === 'done' || n.state === 'passed' || n.state === 'failed' || n.state === 'paused') { n.state = n.used ? 'warm' : 'idle'; n.mark = ''; }
          }
        }
        this.touch('you', 'active', { key: role === 'answer' ? 'flow.you.answered' : 'flow.you.request', params: { text: str(d['text']) } }, at);
        this.send('you', 'agent', live);
        if (role === 'answer') this.touch('agent', 'active', { key: 'now.working' }, at);
        this.details();
        return;
      }
      case 'campaign.opened':
      case 'campaign.shape_selected':
        this.touch('agent', 'active', { key: 'now.understanding' }, at, true);
        return;
      case 'cell.started': {
        const role = str(d['role']);
        if (role === 'review') {
          this.checksRan = true;
          this.work('checks', { key: 'now.reviewing' }, at, live);
        } else {
          this.touch('agent', 'active', { key: role === 'probe' ? 'now.investigating' : role === 'qa' ? 'now.testing' : role === 'repair' ? 'now.fixing' : 'now.working' }, at, true);
        }
        return;
      }
      case 'routing.decided':
        return;
      case 'cell.model_requested': {
        const m = this.touch('model', 'active', { key: 'now.thinking' }, at, true);
        m.thinking = true;
        this.send('agent', 'model', live);
        return;
      }
      case 'cell.model_progress': {
        const m = this.nodes.model;
        m.touched = Date.now();
        return;
      }
      case 'cell.model_responded': {
        this.calls++;
        const quantities = obj(obj(d['usage'])['quantities']);
        for (const v of Object.values(quantities)) this.tokens += num(v);
        const m = this.nodes.model;
        m.thinking = false;
        m.busy = false;
        m.touched = Date.now();
        if (this.model) m.subtitle = this.model;
        if (d['error']) { m.state = 'failed'; m.mark = '!'; } else if (m.state !== 'failed') m.state = 'active';
        this.send('model', 'agent', live, d['error'] ? 'bad' : null);
        this.details();
        return;
      }
      case 'cell.tool_called': {
        const family = str(d['family']), op = str(d['op']);
        const node = nodeOf(family, op);
        if (!node) return;
        const text = working(family, op);
        if (node === 'memory') this.memory(text, at, live);
        else this.work(node, this.nodes[node].busy && this.nodes[node].subtitle ? this.nodes[node].subtitle! : text, at, live);
        return;
      }
      case 'cell.tool_resulted': {
        for (const id of ['explore', 'edit', 'memory'] as FlowNode[]) if (this.nodes[id].busy) this.settle(id);
        return;
      }
      case 'journal.call':
        this.calls_(d, at, live);
        return;
      case 'journal.result':
        this.result(d, at, live);
        return;
      case 'edit.applied':
      case 'edit.transformed':
      case 'edit.reverted': {
        const path = str(d['path']);
        if (path) this.filesChanged.add(path);
        this.details();
        return;
      }
      case 'kb.proposed':
      case 'kb.admitted':
        // Calibration notes are the agent's own bookkeeping; a note counts when it is about the project.
        if (str(d['kind']) === 'CAL') return;
        this.saved++;
        this.touch('memory', 'active', { key: 'flow.memory.saved', params: { n: this.saved } }, at);
        this.send('agent', 'memory', live);
        this.details();
        return;
      case 'cell.rebuilt':
        this.nodes.memory.touched = Date.now();
        if (this.nodes.memory.used) this.nodes.memory.state = 'active';
        return;
      case 'check.scheduled':
      case 'check.started':
        this.checksRan = true;
        this.work('checks', { key: 'now.checking' }, at, live);
        return;
      case 'studio.decision_requested': {
        const card = obj(d['card']);
        this.pendingCards.add(str(card['id']));
        this.touch('you', 'waiting', { key: 'flow.you.needs_answer' }, at);
        this.touch('agent', 'paused', { key: 'flow.agent.waiting' }, at);
        this.send('agent', 'you', live);
        return;
      }
      case 'studio.decision_resolved': {
        this.pendingCards.delete(str(d['id']));
        if (this.pendingCards.size) return;
        const status = str(d['status']);
        if (status === 'answered' || status === 'declined') {
          this.touch('you', 'active', { key: status === 'answered' ? 'flow.you.replied' : 'flow.you.declined' }, at);
          this.touch('agent', 'active', { key: 'now.working' }, at);
          this.send('you', 'agent', live);
        } else {
          this.nodes.you.state = 'warm';
        }
        return;
      }
      case 'studio.policy_decision': {
        if (str(d['kind']) !== 'review') return;
        this.checksRan = true;
        const verdict = str(d['reason']);
        const c = this.touch('checks', verdict === 'approve' ? 'passed' : 'failed', { key: verdict === 'approve' ? 'flow.checks.reviewed' : verdict === 'unavailable' ? 'flow.checks.no_review' : 'flow.checks.review_revise' }, at);
        c.mark = verdict === 'approve' ? '✓' : '!';
        c.detail = { key: 'flow.checks.by_review' };
        this.lastWork = 'checks';
        this.send('checks', 'agent', live, verdict === 'approve' ? 'ok' : 'bad');
        return;
      }
      case 'delegation.dispatched':
        this.helpers = Math.max(1, num(d['count']) || arr(d['handles']).length || this.helpers + 1);
        return;
      case 'delegation.collected':
        this.helpers = 0;
        return;
      case 'recovery.classified':
      case 'recovery.repaired':
        this.touch('agent', 'active', { key: 'now.recovering' }, at, true);
        return;
      case 'recovery.escalated':
      case 'studio.error':
        this.failed(at, live);
        return;
      case 'budget.exhausted':
        this.touch('agent', 'paused', { key: 'flow.agent.limit' }, at);
        return;
      case 'blocked':
        if (!d['questionId']) this.touch('agent', 'paused', { key: 'flow.agent.paused' }, at);
        return;
      case 'studio.task_state': {
        const state = str(d['state']);
        if (state === 'paused' || state === 'stopped' || state === 'failed') {
          // Nothing works any more, whether the end of the run was told or not (a restart tells none).
          this.helpers = 0;
          this.pendingCards.clear();
          for (const id of NODES) {
            const n = this.nodes[id];
            n.busy = false;
            n.thinking = false;
            if (n.state === 'active' || n.state === 'waiting') n.state = 'warm';
          }
        }
        if (state === 'paused') this.touch('agent', 'paused', { key: 'flow.agent.paused' }, at);
        if (state === 'stopped') this.touch('agent', 'paused', { key: 'flow.agent.stopped' }, at);
        return;
      }
      case 'studio.run_ended':
        this.ended(str(d['outcome']), at, live);
        return;
      default:
        return;
    }
  }

  private memory(text: Text, at: string, live: boolean): void {
    const n = this.nodes.memory;
    if (!n.busy) this.send('agent', 'memory', live);
    this.touch('memory', 'active', text, at, true);
  }

  /** The tool calls of one model output: the nodes learn what exactly they are doing (a file, a command). */
  private calls_(d: Record<string, unknown>, at: string, live: boolean): void {
    for (const raw of arr(d['payload'])) {
      const part = obj(raw);
      if (part['type'] !== 'tool_call') continue;
      let args: Record<string, unknown> = {};
      try { args = obj(JSON.parse(str(part['argsJson']) || '{}')); } catch { /* shown without details */ }
      const call: ToolCall = { name: str(part['name']), args };
      if (hidden(call)) continue;
      const op = opOf(call);
      const node = nodeOf(call.name, op);
      if (!node) continue;
      for (const step of describe(call)) {
        if (node === 'memory') { this.memory(step.text, at, live); continue; }
        if (node === 'explore') {
          if (op === 'read' && step.path) this.filesRead.add(step.path);
          if (op === 'find') this.searches++;
        }
        if (node === 'edit') {
          if (call.name === 'run') this.commands++;
          else if (step.path) this.filesChanged.add(step.path);
        }
        if (node === 'checks') this.checksRan = true;
        const text: Text = node === 'checks' ? (op === 'review' ? { key: 'now.reviewing' } : { key: 'now.checking' })
          : call.name === 'run' ? { key: 'flow.edit.running', params: { command: step.command ?? '' } }
          : step.text;
        this.work(node, text, at, live);
      }
    }
    this.details();
  }

  private result(d: Record<string, unknown>, at: string, live: boolean): void {
    const text = str(d['text']);
    const m = /⟦result\s+\S+\s+tool=(\w+).*?status=(\w+)/.exec(text);
    if (!m) return;
    const tool = m[1], status = m[2];
    if (tool === 'look') {
      this.settle('explore');
      if (this.nodes.memory.busy) this.recalledNotes(at, live);
      return;
    }
    if (tool === 'kb') { this.recalledNotes(at, live); return; }
    if (tool === 'edit' || tool === 'run') {
      this.settle('edit');
      if (['failed', 'timeout', 'deadline_exceeded', 'infra_error'].includes(status)) this.nodes.edit.mark = '!';
      return;
    }
    if (tool === 'verify') {
      if (status !== 'passed' && status !== 'failed') { this.settle('checks'); return; }
      const passed = status === 'passed';
      const c = this.touch('checks', passed ? 'passed' : 'failed', { key: passed ? 'flow.checks.passed' : 'flow.checks.failed' }, at);
      c.mark = passed ? '✓' : '!';
      c.detail = { key: 'flow.checks.by_tests' };
      this.lastWork = 'checks';
      this.send('checks', 'agent', live, passed ? 'ok' : 'bad');
    }
  }

  private recalledNotes(at: string, live: boolean): void {
    this.recalled++;
    this.touch('memory', 'active', { key: 'flow.memory.recalled', params: { n: this.recalled } }, at);
    this.send('memory', 'agent', live);
    this.details();
  }

  /** Check counts, when the task knows them: "26 passed", "2 failed". */
  setChecks(passed: number | undefined, failed: number | undefined): void {
    const c = this.nodes.checks;
    if (c.state === 'passed' && passed) c.subtitle = { key: 'flow.checks.passed_n', params: { n: passed } };
    if (c.state === 'failed' && failed) c.subtitle = { key: 'flow.checks.failed_n', params: { n: failed } };
    this.version++;
  }

  private failed(at: string, live: boolean): void {
    const active = this.lastActive && this.lastActive !== 'agent' ? this.nodes[this.lastActive] : null;
    if (active && active.state !== 'passed') { active.state = 'failed'; active.mark = '!'; active.busy = false; active.thinking = false; }
    const a = this.nodes.agent;
    a.state = 'failed';
    a.mark = '!';
    a.busy = false;
    a.used = true;
    a.subtitle = { key: 'flow.agent.failed' };
    this.nodes.model.thinking = false;
    if (live && this.lastMessage) this.flash = { ...this.lastMessage, tone: 'bad' };
  }

  private ended(outcome: string, at: string, live: boolean): void {
    this.helpers = 0;
    this.pendingCards.clear();
    for (const id of NODES) { this.nodes[id].busy = false; this.nodes[id].thinking = false; }
    if (outcome === 'completed' || outcome === 'answered') {
      this.finished = true;
      if (this.checksRan && this.nodes.checks.state === 'passed') this.send('checks', 'agent', live, 'ok');
      if (this.saved > 0) this.send('agent', 'memory', live);
      this.send('agent', 'you', live, 'ok');
      for (const id of NODES) {
        const n = this.nodes[id];
        if (!n.used) continue;
        if (id === 'checks' && (n.state === 'passed' || n.state === 'failed')) continue;
        n.state = 'done';
        n.mark = '✓';
      }
      this.nodes.agent.subtitle = { key: 'flow.agent.done' };
      this.nodes.you.state = 'done';
      this.nodes.you.mark = '✓';
      this.nodes.you.used = true;
      this.nodes.you.subtitle = { key: 'flow.you.done', n: this.filesChanged.size };
      return;
    }
    if (outcome === 'cancelled') {
      this.touch('agent', 'paused', { key: 'flow.agent.stopped' }, at);
      return;
    }
    for (const id of NODES) if (this.nodes[id].state === 'active' || this.nodes[id].state === 'waiting') this.nodes[id].state = 'warm';
    if (outcome === 'failed' || !outcome) this.failed(at, false);
    else this.touch('agent', 'paused', { key: 'flow.agent.paused' }, at);
  }

  /** "Done · 2 files changed" uses the task's own count of changed files once it is known. */
  setChanged(files: number): void {
    if (this.nodes.you.state === 'done') this.nodes.you.subtitle = { key: 'flow.you.done', n: files };
    this.version++;
  }

  /**
   * What the node shows now: Active decays to Warm once its operation ended and the hold time passed. Pure in
   * [now], so the stage can ask as often as it paints.
   */
  display(id: FlowNode, now: number, working: boolean): NodeState {
    const n = this.nodes[id];
    if (n.state !== 'active') return n.state;
    if (!working) return n.used ? 'warm' : 'idle';
    if (n.busy || n.thinking) return 'active';
    return now - n.touched < HOLD_MS ? 'active' : 'warm';
  }

  /** True while any node would still change by time alone; the stage keeps its clock running only then. */
  settling(now: number): boolean {
    return NODES.some(id => { const n = this.nodes[id]; return n.state === 'active' && !n.busy && !n.thinking && now - n.touched < HOLD_MS; });
  }
}
