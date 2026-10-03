import { parseEnvelope, splitResult } from '../core/envelope';
import { Card, ErrorInfo, StudioItem, TaskState } from '../core/model';
import { Text } from '../i18n/translate';
import { Meter } from './meter';
import { Step, ToolCall, describe, hidden, nodeOf, opOf, statusOf, working } from './steps';

/** Run outcomes that end a task done: verified work, or an answer that changed nothing (core D-344). */
const DONE_OUTCOMES = ['completed', 'answered'];

// The timeline reducer (Studio 2 FE-6, Appendix A): the recorded events of a task's runs become the items of the
// conversation. Unknown kinds are kept for the technical view and never break the timeline; errors always surface.

export interface UserItem { type: 'user'; id: string; at: string; text: string; role: 'request' | 'follow_up' | 'message'; }
export interface AgentItem { type: 'agent'; id: string; at: string; text: string; workId: string; }
export interface ActivityItem { type: 'activity'; id: string; at: string; steps: Step[]; live: boolean; }
export interface NoticeItem { type: 'notice'; id: string; at: string; text: Text; action?: 'checks_settings'; }
export interface PlanItem { type: 'plan'; id: string; at: string; index: number; total: number; title: string; }
export interface ChecksItem { type: 'checks'; id: string; at: string; passed: boolean; review: boolean; workId: string; output?: number; stepId: string; }
export interface CardItem {
  type: 'card';
  id: string;
  at: string;
  card: Card;
  /** `pending`, then how it ended: answered, declined, expired or superseded. */
  status: string;
  answer?: string;
  decision?: 'allowed' | 'denied' | 'accepted' | 'declined' | 'done' | 'rework';
}
export interface ErrorItem { type: 'error'; id: string; at: string; error: ErrorInfo; state: TaskState; workId: string; }
export interface ResultItem { type: 'result'; id: string; at: string; workId: string; summary: string; }

export type Item = UserItem | AgentItem | ActivityItem | NoticeItem | PlanItem | ChecksItem | CardItem | ErrorItem | ResultItem;

/** The five stages of the rail (section 8.2.1). */
export const STAGES = ['understand', 'plan', 'build', 'check', 'finish'] as const;

export function stageOf(phase: string | null | undefined): number | null {
  switch (phase) {
    case 'Understand': case 'Locate': case 'Retrieve': return 0;
    case 'Plan': return 1;
    case 'Edit': case 'Delegate': case 'Integrate': case 'Compact': case 'Recover': return 2;
    case 'Verify': case 'Review': return 3;
    default: return null;
  }
}

export interface StatusLine { text: Text; since: number; }

interface RunState {
  workId: string;
  lastSeq: number;
  ended: boolean;
  outcome: string | null;
  lastAgent: AgentItem | null;
  increments: string[];
}

function str(v: unknown): string { return typeof v === 'string' ? v : ''; }
function num(v: unknown): number { return typeof v === 'number' && isFinite(v) ? v : 0; }
function obj(v: unknown): Record<string, unknown> { return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}; }
function arr(v: unknown): unknown[] { return Array.isArray(v) ? v : []; }

export class Timeline {
  readonly items: Item[] = [];
  /** Kinds the conversation does not show, kept in arrival order for the technical view. */
  readonly technical: StudioItem[] = [];
  state: TaskState = 'working';
  reason: ErrorInfo | null = null;
  status: StatusLine | null = null;
  /** Index of the current stage; 5 when every stage is done. */
  stage = 0;
  lastEventAt = 0;
  tokens = 0;
  modelCalls = 0;
  /** C4: what the current run spent against its limits. */
  readonly meter = new Meter();
  /** The last start was acknowledged by the agent (section 7.7: a start without it becomes E-15 after 30 seconds). */
  acknowledged = true;
  requestedAt = 0;
  /** Bumped on every change, so signals can follow a mutable model. */
  version = 0;

  private readonly runs = new Map<string, RunState>();
  private readonly steps = new Map<string, Step>();
  private readonly cards = new Map<string, CardItem>();
  private group: ActivityItem | null = null;
  /** The steps of the current turn of a cell, by the position of their call in the turn. */
  private readonly turnSteps = new Map<string, Map<number, Step[]>>();
  /** Cards and notices of the host that arrived before the journal told the turn they belong to. */
  private readonly ahead = new Set<Item>();
  /** Results that were announced before the journal told the calls of the turn, by cell and position. */
  private readonly early = new Map<string, Map<number, string>>();

  /** Applies one item; items that were seen already (redelivery, replay overlap) are ignored. */
  apply(item: StudioItem): void {
    const work = item.ids?.work || '';
    const run = this.run(work);
    if (typeof item.seq === 'number') {
      if (item.seq <= run.lastSeq) return;
      run.lastSeq = item.seq;
    }
    try {
      this.meter.apply(item.kind, item.data ?? {}, item.at);
      this.reduce(item, run);
    } catch {
      // A malformed item must never break the timeline (FE-6); it is kept for the technical view.
      this.technical.push(item);
    }
    const at = Date.parse(item.at);
    if (!isNaN(at) && at > this.lastEventAt && !item.kind.startsWith('studio.preflight')) this.lastEventAt = at;
    this.version++;
  }

  private run(work: string): RunState {
    let r = this.runs.get(work);
    if (!r) {
      r = { workId: work, lastSeq: 0, ended: false, outcome: null, lastAgent: null, increments: [] };
      this.runs.set(work, r);
    }
    return r;
  }

  private id(item: StudioItem, suffix = ''): string { return `${item.ids?.work ?? ''}:${item.seq ?? item.at}${suffix}`; }

  private push(item: Item): void {
    if (item.type !== 'activity') this.closeGroup();
    this.place(item);
  }

  /**
   * The end of the conversation, but before the cards and notices that came ahead of their turn: what the agent
   * said and did before it asked is recorded after the question, and the question is the last thing the user reads.
   */
  private place(item: Item): void {
    let i = this.items.length;
    if (item.type === 'agent' || item.type === 'activity') {
      while (i > 0 && this.ahead.has(this.items[i - 1])) i--;
    }
    this.items.splice(i, 0, item);
  }

  /** Places an item of the host: it belongs to the turn whose words the journal tells a moment later. */
  private pushAhead(item: Item): void {
    this.push(item);
    this.ahead.add(item);
  }

  private closeGroup(): void {
    if (this.group) this.group.live = false;
    this.group = null;
  }

  private now(text: Text, item: StudioItem): void {
    if (this.status && this.status.text.key === text.key && JSON.stringify(this.status.text.params ?? {}) === JSON.stringify(text.params ?? {})) return;
    const at = Date.parse(item.at);
    this.status = { text, since: isNaN(at) ? Date.now() : at };
  }

  private reduce(item: StudioItem, run: RunState): void {
    const d = item.data ?? {};
    const stage = item.source === 'bus' ? stageOf(item.phase) : null;
    if (stage !== null && !run.ended && item.kind.startsWith('cell.')) this.stage = stage;

    switch (item.kind) {
      // ---------------------------------------------------------------- the Studio's own items
      case 'studio.user_message': {
        const role = str(d['role']);
        if (role === 'answer') {
          const card = this.cards.get(str(d['cardId']));
          if (card) card.answer = str(d['text']);
          return;
        }
        this.push({ type: 'user', id: this.id(item), at: item.at, text: str(d['text']), role: role === 'follow_up' ? 'follow_up' : role === 'message' ? 'message' : 'request' });
        if (role !== 'message') {
          this.state = 'working';
          this.reason = null;
          this.stage = 0;
          this.acknowledged = false;
          this.requestedAt = Date.parse(item.at) || Date.now();
          this.now({ key: 'now.starting' }, item);
        }
        return;
      }
      case 'studio.preflight':
        if (str(d['status']) === 'running') this.now({ key: 'now.starting' }, item);
        return;
      case 'studio.opened':
        this.acknowledged = true;
        return;
      case 'studio.verification': {
        const kind = str(d['kind']);
        const command = str(d['command']);
        const key = kind === 'tests' ? 'notice.checks_tests' : command ? 'notice.checks_review_with' : 'notice.checks_review';
        this.push({ type: 'notice', id: this.id(item), at: item.at, text: { key, params: { command } }, action: 'checks_settings' });
        return;
      }
      case 'studio.notice': {
        const code = str(d['code']);
        if (code === 'lock_released' || code === 'retrying') return;
        this.push({ type: 'notice', id: this.id(item), at: item.at, text: { key: 'notice.' + code, params: d } });
        return;
      }
      case 'studio.error':
        this.acknowledged = true;
        this.error(item, d as unknown as ErrorInfo, this.state === 'paused' ? 'paused' : 'failed');
        return;
      case 'studio.task_state': {
        const state = str(d['state']) as TaskState;
        this.state = state;
        const reason = d['reason'] ? (d['reason'] as ErrorInfo) : null;
        this.reason = reason;
        if (state === 'working') return;
        // A run that no longer waits for the user's word on its result closes its acceptance card.
        if (state !== 'needs_you') for (const c of this.cards.values()) if (c.card.kind === 'acceptance' && c.status === 'pending') c.status = 'expired';
        this.status = null;
        this.closeGroup();
        if ((state === 'paused' || state === 'failed') && reason) this.error(item, reason, state);
        if (state === 'stopped') this.push({ type: 'notice', id: this.id(item), at: item.at, text: { key: 'notice.stopped' } });
        return;
      }
      case 'studio.decision_requested': {
        const card = d['card'] as Card | undefined;
        if (!card) return;
        // A newer acceptance request of a run replaces the open one: one such card at a time.
        if (card.kind === 'acceptance') for (const c of this.cards.values()) if (c.card.kind === 'acceptance' && c.status === 'pending') c.status = 'superseded';
        const entry: CardItem = { type: 'card', id: card.id, at: item.at, card, status: 'pending' };
        this.cards.set(card.id, entry);
        this.pushAhead(entry);
        this.state = 'needs_you';
        this.now({ key: 'now.waiting_for_you' }, item);
        return;
      }
      case 'studio.decision_resolved': {
        const entry = this.cards.get(str(d['id']));
        if (!entry) return;
        entry.status = str(d['status']);
        this.closeGroup();
        const reply = obj(d['reply']);
        if (entry.card.kind === 'question') {
          if (!entry.answer && str(reply['text'])) entry.answer = str(reply['text']);
        } else if (entry.card.kind === 'approval') {
          entry.decision = reply['approved'] === true ? 'allowed' : 'denied';
        } else if (entry.card.kind === 'acceptance') {
          // The reply's text is the core's reason, not the user's words; those arrive as a `studio.user_message` answer.
          const said = str(reply['kind']);
          entry.decision = said === 'accept' ? 'done' : said === 'rework' ? 'rework' : undefined;
        } else {
          entry.decision = str(reply['outcome']) === 'Accepted' ? 'accepted' : 'declined';
        }
        if (this.state === 'needs_you' && ![...this.cards.values()].some(c => c.status === 'pending')) {
          this.state = 'working';
          this.now({ key: 'now.working' }, item);
        }
        return;
      }
      case 'studio.policy_decision':
        this.policy(item, d);
        return;
      case 'studio.run_ended':
        this.ended(item, run, str(d['outcome']) || null);
        return;
      case 'studio.resync':
      case 'studio.cancel_requested':
        this.technical.push(item);
        return;

      // ---------------------------------------------------------------- the agent's events
      case 'campaign.opened':
        this.state = this.state === 'needs_you' ? 'needs_you' : 'working';
        this.now({ key: 'now.understanding' }, item);
        return;
      case 'campaign.increment_selected': {
        const id = str(d['incrementId']);
        if (!run.increments.includes(id)) run.increments.push(id);
        // A divider only when the plan has more than one part; the first part alone says nothing.
        if (run.increments.length > 1) {
          this.push({ type: 'plan', id: this.id(item), at: item.at, index: run.increments.length, total: Math.max(run.increments.length, num(d['total'])), title: str(d['title']) });
        }
        return;
      }
      case 'campaign.finished':
        this.stage = DONE_OUTCOMES.includes(str(d['outcome'])) ? 5 : this.stage;
        return;
      case 'cell.started': {
        const role = str(d['role']);
        const key = role === 'review' ? 'now.reviewing' : role === 'probe' ? 'now.investigating' : role === 'qa' ? 'now.testing' : role === 'repair' ? 'now.fixing' : 'now.working';
        this.now({ key }, item);
        return;
      }
      case 'cell.turn_started':
        this.ahead.clear();
        this.turnSteps.delete(item.cell ?? '');
        this.early.delete(item.cell ?? '');
        if (this.state === 'working') this.now({ key: 'now.thinking' }, item);
        return;
      case 'cell.tool_resulted': {
        // The journal tells the result when the turn ends; the announcement comes at once.
        const cell = item.cell ?? '';
        const n = num(d['opId']);
        const steps = this.turnSteps.get(cell)?.get(n);
        if (steps) this.finish(steps, str(d['header']), item.at);
        else if (n) this.early.set(cell, (this.early.get(cell) ?? new Map<number, string>()).set(n, str(d['header'])));
        this.technical.push(item);
        return;
      }
      case 'cell.model_requested':
      case 'cell.model_progress':
        if (this.state === 'working') this.now({ key: 'now.thinking' }, item);
        return;
      case 'cell.model_responded': {
        this.modelCalls++;
        const quantities = obj(obj(d['usage'])['quantities']);
        for (const v of Object.values(quantities)) this.tokens += num(v);
        if (d['error']) {
          const e = obj(d['error']);
          this.error(item, { code: str(e['code']) || 'agent_error', params: {}, detail: str(e['message']) || JSON.stringify(d['error']) }, 'failed');
        }
        return;
      }
      case 'cell.tool_called':
        if (str(d['family']) !== 'state' && str(d['family']) !== 'task') this.now(working(str(d['family']), str(d['op'])), item);
        return;
      case 'check.scheduled':
      case 'check.started':
        this.now({ key: 'now.checking' }, item);
        return;
      case 'recovery.classified':
      case 'recovery.repaired':
        this.now({ key: 'now.recovering' }, item);
        return;
      case 'recovery.escalated':
        this.error(item, { code: 'agent_error', params: {}, detail: str(d['reason']) || str(d['detail']) || JSON.stringify(d) }, 'failed');
        return;
      case 'delegation.dispatched':
        this.step(item, 'delegation', { key: 'step.helpers_started_n', params: { n: num(d['count']) || arr(d['handles']).length || 1 } }, 'ok');
        return;
      case 'delegation.collected':
        this.step(item, 'delegation', { key: 'step.helpers_collected' }, 'ok');
        return;
      case 'edit.reverted':
        this.step(item, 'edit', { key: 'step.revert', params: { path: str(d['path']) } }, 'ok', str(d['path']));
        return;

      // ---------------------------------------------------------------- the agent's journal
      case 'journal.call':
        this.call(item, run, d);
        return;
      case 'journal.result':
        this.result(item, d);
        return;

      default:
        this.technical.push(item);
    }
  }

  // ------------------------------------------------------------------------------------------------ model output

  private call(item: StudioItem, run: RunState, d: Record<string, unknown>): void {
    let text = '';
    const calls: { id: string; call: ToolCall }[] = [];
    for (const raw of arr(d['payload'])) {
      const part = obj(raw);
      if (part['type'] === 'message') {
        for (const p of arr(part['parts'])) text += str(obj(p)['text']);
      } else if (part['type'] === 'tool_call') {
        let args: Record<string, unknown> = {};
        try { args = obj(JSON.parse(str(part['argsJson']) || '{}')); } catch { /* arguments that do not parse show as a plain step */ }
        calls.push({ id: str(part['id']), call: { name: str(part['name']), args } });
      }
    }
    if (text.trim()) {
      const agent: AgentItem = { type: 'agent', id: this.id(item), at: item.at, text: text.trim(), workId: run.workId };
      this.push(agent);
      run.lastAgent = agent;
    }
    let k = 0;
    const cell = item.cell ?? '';
    const turn = new Map<number, Step[]>();
    this.turnSteps.set(cell, turn);
    calls.forEach(({ id, call }, position) => {
      if (hidden(call)) return;
      const op = opOf(call);
      const parts = describe(call);
      const made: Step[] = [];
      parts.forEach((part, i) => {
        const step: Step = {
          id: `${this.id(item)}:${k++}`, workId: run.workId, callId: id, tool: call.name, op, text: part.text, status: 'running', at: item.at,
          node: nodeOf(call.name, op), path: part.path, command: part.command, check: part.check,
        };
        this.steps.set(`${cell}/${id}/${i}`, step);
        this.add(step);
        made.push(step);
      });
      turn.set(position + 1, made);
      const known = this.early.get(cell)?.get(position + 1);
      if (known) this.finish(made, known, item.at);
      const first = parts[0];
      if (first && this.state === 'working' && made.some(s => s.status === 'running')) this.now(this.doing(call.name, op, first), item);
    });
    this.early.delete(cell);
    // What follows belongs below the cards and notices of this turn.
    if (this.ahead.size) this.closeGroup();
    this.ahead.clear();
  }

  /** The announced result of a call: its steps stop running. The journal confirms it later. */
  private finish(steps: Step[], header: string, at: string): void {
    const envelope = parseEnvelope(header);
    if (!envelope) return;
    for (const step of steps) {
      step.status = statusOf(envelope.status);
      step.endedAt = at;
      if (envelope.alias) step.output = Number(envelope.alias.replace('#', '')) || step.output;
    }
  }

  /** "Editing `pricing.py`…": the status line while a step runs, with its file or command when it has one. */
  private doing(tool: string, op: string, part: { path?: string; command?: string }): Text {
    if (tool === 'edit' && part.path) return { key: 'now.editing_file', params: { path: part.path } };
    if (tool === 'look' && op === 'read' && part.path) return { key: 'now.reading_file', params: { path: part.path } };
    if (tool === 'run' && part.command) return { key: 'now.running_command', params: { command: part.command } };
    return working(tool, op);
  }

  private add(step: Step): void {
    if (!this.group) {
      this.group = { type: 'activity', id: 'g:' + step.id, at: step.at, steps: [], live: this.state !== 'needs_you' };
      this.place(this.group);
    }
    this.group.steps.push(step);
  }

  private step(item: StudioItem, tool: string, text: Text, status: Step['status'], path?: string): void {
    this.add({ id: this.id(item), workId: item.ids?.work ?? '', callId: '', tool, op: '', text, status, at: item.at, endedAt: item.at, node: tool === 'edit' ? 'edit' : 'agent', path });
  }

  private result(item: StudioItem, d: Record<string, unknown>): void {
    const { callId, header } = splitResult(str(d['text']));
    if (!callId) return;
    const envelope = parseEnvelope(header);
    const status = statusOf(envelope?.status);
    for (let i = 0; ; i++) {
      const step = this.steps.get(`${item.cell ?? ''}/${callId}/${i}`);
      if (!step) break;
      step.status = status;
      step.endedAt = item.at;
      if (envelope?.alias) step.output = Number(envelope.alias.replace('#', '')) || undefined;
      if (step.check && i === 0) {
        const word = (envelope?.status ?? '').toLowerCase();
        // A check that could not run (nothing to run in a project without tests) is not a result; the review says more.
        if (word === 'passed' || word === 'failed') {
          this.push({ type: 'checks', id: this.id(item), at: item.at, passed: word === 'passed', review: step.op === 'review', workId: step.workId, output: step.output, stepId: step.id });
        }
      }
    }
  }

  // ------------------------------------------------------------------------------------------------ policy, errors, end

  private policy(item: StudioItem, d: Record<string, unknown>): void {
    const kind = str(d['kind']);
    const verdict = str(d['reason']);
    const card = obj(d['card']);
    const id = this.id(item);
    if (kind === 'question') {
      this.pushAhead({ type: 'notice', id, at: item.at, text: { key: 'notice.auto_assumed', params: { question: str(card['text']) } } });
    } else if (kind === 'effect' || kind === 'publication') {
      this.pushAhead({ type: 'notice', id, at: item.at, text: { key: verdict === 'allowed' ? 'notice.auto_allowed' : 'notice.auto_skipped', params: { command: str(card['command']) } } });
    } else if (kind === 'amendment') {
      this.pushAhead({ type: 'notice', id, at: item.at, text: { key: verdict === 'accepted' ? 'notice.suggestion_accepted' : 'notice.suggestion_declined', params: { text: str(card['text']) } } });
    } else if (kind === 'acceptance' && verdict === 'accepted') {
      this.pushAhead({ type: 'notice', id, at: item.at, text: { key: 'notice.auto_accepted_unverified' } });
    } else if (kind === 'review') {
      this.stage = Math.max(this.stage, 3);
      const key = verdict === 'approve' ? 'notice.review_passed' : verdict === 'unavailable' ? 'notice.review_unavailable' : 'notice.review_revise';
      const findings = arr(obj(d['reply'])['findings']).map(f => str(obj(f)['issue'])).filter(Boolean).join(' ');
      this.push({ type: 'notice', id, at: item.at, text: { key, params: { findings } } });
    } else {
      this.technical.push(item);
    }
  }

  private error(item: StudioItem, error: ErrorInfo, state: TaskState): void {
    const last = this.items[this.items.length - 1];
    // The end of a run reports its reason twice (the error and the state); one card is enough.
    if (last && last.type === 'error' && last.error.code === error.code && last.workId === (item.ids?.work ?? '')) {
      last.state = state;
      return;
    }
    this.push({ type: 'error', id: this.id(item), at: item.at, error: { ...error, params: error.params ?? {} }, state, workId: item.ids?.work ?? '' });
  }

  private ended(item: StudioItem, run: RunState, outcome: string | null): void {
    run.ended = true;
    run.outcome = outcome;
    this.status = null;
    this.closeGroup();
    for (const step of this.steps.values()) if (step.workId === run.workId && step.status === 'running') step.status = 'unknown';
    for (const card of this.cards.values()) {
      // A run that ends waiting for input keeps its acceptance card open: the user's answer resumes it.
      if (card.card.kind === 'acceptance' && outcome === 'waiting_for_input') continue;
      if (card.card.workId === run.workId && card.status === 'pending') card.status = 'expired';
    }
    if (outcome !== null && DONE_OUTCOMES.includes(outcome)) {
      this.stage = 5;
      let summary = '';
      // The agent's last words are the summary of the result card, not a message of their own.
      const last = run.lastAgent;
      if (last) {
        const i = this.items.lastIndexOf(last);
        if (i >= 0 && !this.items.slice(i + 1).some(x => x.type === 'agent' || x.type === 'user' || x.type === 'activity')) {
          summary = last.text;
          this.items.splice(i, 1);
        }
      }
      this.push({ type: 'result', id: this.id(item), at: item.at, workId: run.workId, summary });
    }
  }

  // ------------------------------------------------------------------------------------------------ reads

  /** The cards that wait for the user, oldest first. */
  pending(): CardItem[] { return [...this.cards.values()].filter(c => c.status === 'pending'); }

  stepById(id: string): Step | undefined {
    for (const s of this.steps.values()) if (s.id === id) return s;
    return undefined;
  }

  allSteps(): Step[] { return [...this.steps.values()]; }
}

/** "Read 3 files · edited 1 · ran tests ✓": the summary line of a group of steps, as counts per kind. */
export function summarize(steps: Step[]): { key: string; n: number; failed: boolean }[] {
  const order = ['read', 'search', 'explore', 'recall', 'edit', 'run', 'checks', 'helpers'];
  const counts = new Map<string, { n: number; failed: boolean }>();
  for (const s of steps) {
    const kind = s.tool === 'look' ? (s.op === 'read' ? 'read' : s.op === 'find' ? 'search' : s.op === 'recall' || s.op === 'bmap' ? 'recall' : 'explore')
      : s.tool === 'kb' ? 'recall'
      : s.tool === 'edit' ? 'edit'
      : s.tool === 'run' ? 'run'
      : s.tool === 'verify' ? 'checks'
      : 'helpers';
    const c = counts.get(kind) ?? { n: 0, failed: false };
    c.n++;
    if (s.status === 'failed') c.failed = true;
    counts.set(kind, c);
  }
  return order.filter(k => counts.has(k)).map(k => ({ key: 'group.' + k, n: counts.get(k)!.n, failed: counts.get(k)!.failed }));
}
