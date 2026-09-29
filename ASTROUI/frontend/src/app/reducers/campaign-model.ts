import { StudioItem, Envelope } from '../core/model';
import { parseEnvelope, parseGauge, splitResult, Gauge } from '../core/envelope';

// The campaign-stream reducer (spec §3.5, §32.3): a deterministic function of the ordered stream, applied item by
// item. Live and replay feed the same items through the same `apply`, so a replayed position renders exactly as the
// live view did at that sequence (R-OVR-03). Nothing here invents status: every field cites a stream item.

export type CellStatus = 'running' | 'completed' | 'blocked' | 'partial' | 'failed' | 'cancelled' | 'lost' | string;

export interface OpModel {
  index: number;               // 1-based position in the model's call list (= opId)
  callId: string | null;
  family: string;              // look | edit | run | verify | state | task | kb
  op: string | null;           // e.g. read, anchored, acceptance, patch
  phase: string | null;
  args: any;                   // parsed arguments from the journal call row
  header: string | null;
  env: Envelope | null;
  body: string | null;         // result text after the header (journal `result`)
  alias: string | null;
  refs: string[];
  status: string | null;       // envelope status verbatim (R-THR-02)
  pending: boolean;
}

export interface GateLine { gate: string; text: string; at: string; seq?: number; }
export interface CheckLine { text: string; outcome: string | null; refs: string[]; at: string; }
export interface EditOutcome { text: string; paths: { path: string; before: string; after: string }[]; refs: string[]; payload: any; }

export interface TurnModel {
  n: number;
  startedAt: string;
  endedAt: string | null;
  turnsMax: number | null;
  text: string | null;          // model output text, from the journal `call` row only (R-THR-07)
  stop: string | null;
  callCount: number | null;
  ops: OpModel[];
  edits: EditOutcome[];
  checks: CheckLine[];
  gates: GateLine[];
  nudges: string[];
  register: { version: number; ops: number } | null;
  worksetKnown: number | null;
  worksetDropped: string[];
  boundary: string | null;      // turn checkpoint line
  gauge: Gauge | null;
  invocation: string | null;
  profileId: string | null;
  estimatedTokens: number | null;
  anchorTokens: number | null;
  requestedAt: string | null;
  respondedAt: string | null;
  outputTokens: number | null;
  inputTokens: number | null;
  progress: { stage: string; textChars?: number; outputTokens?: number; attempt?: number; at: string } | null;
  seqFrom: number;
}

export interface CellModel {
  id: string;
  role: string;
  incrementId: string | null;
  status: CellStatus;
  startedAt: string;
  endedAt: string | null;
  turns: TurnModel[];
  turnsMax: number | null;
  manifestRef: string | null;
  registerVersion: number | null;
  rebuilds: { reason: string; generation: any; at: string }[];
  gates: number;
  outputTokens: number;
  profileId: string | null;
  packetLines: string[];
  seqFrom: number;
  parent: string | null;
}

export type Block =
  | { type: 'request'; id: string; seq: number; at: string; label: string; version: number | null; by: string }
  | { type: 'boundary'; id: string; seq: number; at: string; text: string; tone: 'ok' | 'bad' | 'warn' | 'neutral'; icon: string; detail?: string }
  | { type: 'cell'; id: string; seq: number; cell: string }
  | { type: 'decision'; id: string; seq: number; decisionId: string; kind: string }
  | { type: 'policy'; id: string; seq: number; at: string; decision: any }
  | { type: 'finish'; id: string; seq: number; at: string; outcome: string; reason: string | null; ref: string | null }
  | { type: 'warning'; id: string; seq: number; at: string; kind: string; text: string };

export type NodeId = 'YOU' | 'CONTROLLER' | 'ROUTER' | 'COMPILER' | 'CELL' | 'MODEL' | 'ATLAS' | 'WORKSPACE' | 'VERIFIER' | 'EVIDENCE' | 'KB';

export interface NodeState { state: 'idle' | 'active' | 'attention' | 'error'; lines: string[]; lastSeq: number; }

export interface RailStage { key: string; label: string; state: 'pending' | 'active' | 'done' | 'failed' | 'blocked' | 'cancelled' | 'absent'; detail?: string; }

export interface TickerLine { seq: number; at: string; kind: string; target: string; result: string; tone: 'ok' | 'bad' | 'warn' | 'neutral'; cell?: string; turn?: number; }

export interface Particle { seq: number; from: NodeId | string; to: NodeId | string; tone: 'ok' | 'bad' | 'neutral'; label?: string; }

const TOOL_TARGET: Record<string, NodeId> = { look: 'ATLAS', edit: 'WORKSPACE', run: 'VERIFIER', verify: 'VERIFIER', kb: 'KB', task: 'YOU', state: 'CELL' };
const SEGMENT: Record<string, string> = { Locate: 'Read', Edit: 'Edit', Verify: 'Execute', Understand: 'Metadata' };

export class CampaignModel {
  readonly work: string;
  items: StudioItem[] = [];
  blocks: Block[] = [];
  cells = new Map<string, CellModel>();
  cellOrder: string[] = [];
  currentCell: string | null = null;
  shape: string | null = null;
  shapeInputs: string | null = null;
  opened: any = null;
  outcome: string | null = null;
  finishRef: string | null = null;
  runEnded: any = null;
  cancelRequested = false;
  increments = new Map<string, { id: string; state: 'selected' | 'verified' | 'blocked' | 'cancelled'; at: string }>();
  incrementOrder: string[] = [];
  currentIncrement: string | null = null;
  contractVersion: number | null = null;
  amendments: { version: number; by: string; seq: number }[] = [];
  proposals: { proposalId: string; weakening: boolean; outcome?: string }[] = [];
  questions = new Map<string, { at: string; answered: boolean; changesRequirements?: boolean }>();
  blockedReason: string | null = null;
  warnings: { kind: string; text: string }[] = [];
  delegations = new Map<string, { handle: string; kind: string; status: string; at: string }>();
  kb: { noteId: string; kind: string; event: string }[] = [];
  spans = new Map<string, { phase: string; status?: string; cost?: string | null; durationNanos?: number | null; parent?: string | null; cell?: string }>();
  campaignCost: string | null = null;
  lastGauge: Gauge | null = null;
  nodes: Record<NodeId, NodeState>;
  particles: Particle[] = [];
  ticker: TickerLine[] = [];
  turnHistory: { cell: string; turn: number; edits: number; checks: 'ok' | 'bad' | null; gates: number; blocked: boolean }[] = [];
  segments = new Set<string>();
  lastSeq = 0;
  reconstructed = false;
  resyncs = 0;
  tokensOut = 0;
  tokensIn = 0;
  modelCalls = 0;
  receipts = new Set<string>();
  editCount = 0;
  checkSummary = new Map<string, string>();

  constructor(work: string) {
    this.work = work;
    const idle = (): NodeState => ({ state: 'idle', lines: [], lastSeq: 0 });
    this.nodes = { YOU: idle(), CONTROLLER: idle(), ROUTER: idle(), COMPILER: idle(), CELL: idle(), MODEL: idle(), ATLAS: idle(), WORKSPACE: idle(), VERIFIER: idle(), EVIDENCE: idle(), KB: idle() };
  }

  /** Applies one stream item. Items are applied in `seq` order; ephemeral progress has no seq. */
  apply(item: StudioItem): void {
    const seq = item.seq ?? this.lastSeq;
    if (item.seq !== undefined) {
      if (item.seq <= this.lastSeq) return;
      this.lastSeq = item.seq;
      this.items.push(item);
    }
    if (item.reconstructed) this.reconstructed = true;
    const d = item.data ?? {};
    switch (item.kind) {
      // ---- Studio items ---------------------------------------------------------------------------------
      case 'studio.opened':
        this.opened = d;
        this.shape = d.shape ?? this.shape;
        this.contractVersion = d.contractVersion ?? this.contractVersion;
        this.blocks.push({ type: 'boundary', id: 'b' + seq, seq, at: item.at, icon: 'open', tone: 'neutral',
          text: (d.resumed ? 'Resumed' : 'Opened') + ` · attempt ${d.attemptId ?? 'a1'} · contract v${d.contractVersion ?? '?'}` + (d.shape ? ` · shape ${d.shape}` : '') +
            (d.reconciliation?.unknownOutcomes?.length ? ` · ${d.reconciliation.unknownOutcomes.length} unknown outcome(s)` : '') +
            (d.reconciliation?.external?.length ? ` · ${d.reconciliation.external.length} external change(s)` : ''),
          detail: d.stopReason ? 'Cannot run: ' + d.stopReason : undefined });
        this.node('CONTROLLER', 'active', seq, ['opened', d.shape ? 'shape ' + d.shape : '']);
        this.tick(item, 'open', 'campaign', d.resumed ? 'resumed' : 'opened', 'neutral');
        break;
      case 'studio.open_failed':
        this.blocks.push({ type: 'boundary', id: 'b' + seq, seq, at: item.at, icon: 'x', tone: 'bad', text: 'Open failed · ' + (d.message ?? d.code) });
        this.node('CONTROLLER', 'error', seq, ['open failed']);
        break;
      case 'studio.run_ended':
        this.runEnded = d;
        if (d.outcome == null) {
          this.blocks.push({ type: 'boundary', id: 'b' + seq, seq, at: item.at, icon: 'pause', tone: 'warn', text: 'Run stopped · ' + (d.reason ?? 'unknown') + (d.failure ? ' · ' + d.failure : '') });
        }
        for (const n of Object.keys(this.nodes) as NodeId[]) if (this.nodes[n].state === 'active') this.nodes[n].state = 'idle';
        break;
      case 'studio.cancel_requested':
        this.cancelRequested = true;
        this.blocks.push({ type: 'boundary', id: 'b' + seq, seq, at: item.at, icon: 'stop', tone: 'warn', text: 'Cancel requested · settling effects and usage' + (d.reason ? ' · ' + d.reason : '') });
        break;
      case 'studio.decision_requested':
        this.blocks.push({ type: 'decision', id: 'd' + seq, seq, decisionId: d.id, kind: d.kind });
        this.node('YOU', 'attention', seq, ['decision ' + (d.kind ?? '')]);
        this.particle(seq, d.kind === 'question' || d.kind === 'effect' ? 'CELL' : 'CONTROLLER', 'YOU', 'neutral', d.kind);
        this.tick(item, 'decision', d.kind ?? 'decision', 'waiting', 'warn');
        break;
      case 'studio.decision_resolved':
        this.node('YOU', this.pendingDecisionBlocks() ? 'attention' : 'idle', seq, [d.status ?? 'resolved']);
        this.particle(seq, 'YOU', d.kind === 'question' || d.kind === 'effect' ? 'CELL' : 'CONTROLLER', d.status === 'answered' ? 'ok' : 'neutral', d.status);
        this.tick(item, 'decision', d.kind ?? 'decision', d.status ?? 'resolved', d.status === 'answered' ? 'ok' : 'neutral');
        break;
      case 'studio.policy_decision':
        this.blocks.push({ type: 'policy', id: 'p' + seq, seq, at: item.at, decision: d });
        this.tick(item, 'policy', d.kind ?? 'policy', 'decided by policy', 'neutral');
        break;
      case 'studio.resync':
        this.resyncs++;
        this.blocks.push({ type: 'boundary', id: 'b' + seq, seq, at: item.at, icon: 'sync', tone: 'neutral', text: d.reason ?? 'Rebuilt from the store' });
        break;
      case 'studio.publication':
        this.blocks.push({ type: 'boundary', id: 'b' + seq, seq, at: item.at, icon: 'publish', tone: 'neutral', text: `Publication · reached ${d.reached ?? '?'}` });
        break;

      // ---- campaign ------------------------------------------------------------------------------------------
      case 'campaign.opened':
        this.node('CONTROLLER', 'active', seq, ['opened']);
        break;
      case 'campaign.shape_selected':
        this.shape = d.shape;
        this.shapeInputs = d.inputsRef;
        this.blocks.push({ type: 'boundary', id: 'b' + seq, seq, at: item.at, icon: 'shape', tone: d.shape === 'blocked' ? 'bad' : 'neutral', text: `Shape ${d.shape}`, detail: d.inputsRef });
        this.tick(item, 'shape', d.shape, 'selected', 'neutral');
        break;
      case 'campaign.increment_selected':
        this.currentIncrement = d.incrementId;
        this.setIncrement(d.incrementId, 'selected', item.at);
        this.blocks.push({ type: 'boundary', id: 'b' + seq, seq, at: item.at, icon: 'increment', tone: 'neutral', text: `Increment ${d.incrementId} selected` });
        this.node('CONTROLLER', 'active', seq, ['increment ' + d.incrementId]);
        this.particle(seq, 'CONTROLLER', 'COMPILER', 'neutral', d.incrementId);
        this.tick(item, 'increment', d.incrementId, 'selected', 'neutral');
        break;
      case 'campaign.increment_closed':
        this.setIncrement(d.incrementId, 'verified', item.at);
        this.blocks.push({ type: 'boundary', id: 'b' + seq, seq, at: item.at, icon: 'check', tone: 'ok', text: `Increment ${d.incrementId} ${d.status ?? 'verified'}` });
        this.node('EVIDENCE', 'active', seq, ['ledger ' + d.incrementId + ' ✓']);
        this.particle(seq, 'CONTROLLER', 'EVIDENCE', 'ok', 'ledger ✓');
        this.tick(item, 'increment', d.incrementId, d.status ?? 'verified', 'ok');
        break;
      case 'campaign.finished':
        this.outcome = d.outcome;
        this.finishRef = d.finishReceiptRef ?? null;
        this.blocks.push({ type: 'finish', id: 'f' + seq, seq, at: item.at, outcome: d.outcome, reason: d.reason ?? null, ref: d.finishReceiptRef ?? null });
        this.node('CONTROLLER', d.outcome === 'completed' ? 'idle' : 'attention', seq, ['finished · ' + (d.outcome ?? '')]);
        this.tick(item, 'finish', 'campaign', d.outcome, d.outcome === 'completed' ? 'ok' : 'warn');
        for (const n of ['CELL', 'MODEL', 'ATLAS', 'WORKSPACE', 'VERIFIER', 'COMPILER', 'ROUTER'] as NodeId[]) this.nodes[n].state = 'idle';
        break;
      case 'contract.amended':
        this.contractVersion = d.version;
        this.amendments.push({ version: d.version, by: d.by, seq });
        this.blocks.push({ type: 'request', id: 'r' + seq, seq, at: item.at, label: d.by === 'user' ? 'Amendment' : 'Contract amended', version: d.version, by: d.by });
        this.particle(seq, 'YOU', 'CONTROLLER', 'neutral', 'v' + d.version);
        this.tick(item, 'contract', 'v' + d.version, 'amended by ' + d.by, 'neutral');
        break;
      case 'contract.amendment_proposed':
        this.proposals.push({ proposalId: d.proposalId, weakening: !!d.weakening });
        this.tick(item, 'proposal', d.proposalId, d.weakening ? 'weakening' : 'proposed', d.weakening ? 'warn' : 'neutral');
        break;
      case 'contract.amendment_resolved': {
        const p = this.proposals.find(x => x.proposalId === d.proposalId);
        if (p) p.outcome = d.outcome;
        this.tick(item, 'proposal', d.proposalId, String(d.outcome ?? '').toLowerCase(), d.outcome === 'Accepted' ? 'ok' : 'neutral');
        break;
      }

      // ---- cells -----------------------------------------------------------------------------------------------
      case 'cell.started': {
        const id = item.cell ?? item.ids.context ?? 'cell';
        const cell: CellModel = {
          id, role: d.role ?? 'implementing', incrementId: d.incrementId ?? null, status: 'running', startedAt: item.at, endedAt: null, turns: [],
          turnsMax: null, manifestRef: null, registerVersion: null, rebuilds: [], gates: 0, outputTokens: 0, profileId: null, packetLines: [], seqFrom: seq,
          parent: this.currentCell && this.cells.get(this.currentCell)?.status === 'running' && d.role !== 'implementing' ? this.currentCell : null,
        };
        this.cells.set(id, cell);
        this.cellOrder.push(id);
        if (!cell.parent) this.blocks.push({ type: 'cell', id: 'c' + seq, seq, cell: id });
        if (!cell.parent || d.role === 'implementing') this.currentCell = id;
        this.segments.clear();
        this.node('COMPILER', 'active', seq, ['compiled [K]', d.incrementId ? 'for ' + d.incrementId : '']);
        this.node('CELL', 'active', seq, [d.role, d.incrementId ?? '']);
        this.particle(seq, 'COMPILER', 'CELL', 'neutral', '[K]');
        this.tick(item, 'cell', d.role + (d.incrementId ? ' · ' + d.incrementId : ''), 'started', 'neutral');
        break;
      }
      case 'cell.turn_started': {
        const cell = this.cellOf(item);
        if (!cell) break;
        cell.turnsMax = d.turnsMax ?? cell.turnsMax;
        const t = this.turn(cell, d.turn, item.at, seq);
        t.turnsMax = d.turnsMax ?? null;
        this.segments.clear();
        this.segments.add('Model');
        this.node('CELL', 'active', seq, [cell.role, `turn ${d.turn}/${d.turnsMax ?? '?'}`]);
        break;
      }
      case 'cell.model_requested': {
        const cell = this.cellOf(item);
        const t = cell ? this.lastTurn(cell) : null;
        if (t) {
          t.invocation = d.invocationId;
          t.profileId = d.profileId;
          t.estimatedTokens = d.estimatedTokens ?? null;
          t.anchorTokens = d.anchorTokens ?? null;
          t.requestedAt = item.at;
          t.progress = { stage: 'requesting', at: item.at };
          if (cell) cell.profileId = d.profileId;
        }
        this.node('ROUTER', 'active', seq, [d.profileId ?? '']);
        this.node('MODEL', 'active', seq, [d.profileId ?? '', 'est. ' + (d.estimatedTokens ?? '?') + ' tok']);
        this.particle(seq, 'CELL', 'MODEL', 'neutral', d.profileId);
        this.modelCalls++;
        this.tick(item, 'model', d.profileId ?? 'model', 'requested', 'neutral');
        break;
      }
      case 'cell.model_progress': {
        const cell = this.cellOf(item);
        const t = cell ? this.lastTurn(cell) : null;
        if (t && !t.respondedAt) t.progress = { stage: d.stage, textChars: d.textChars ?? undefined, outputTokens: d.outputTokens ?? undefined, attempt: d.attempt ?? undefined, at: item.at };
        if (d.stage === 'retrying') this.node('MODEL', 'attention', seq, ['retry ' + (d.attempt ?? '')]);
        break;
      }
      case 'cell.model_responded': {
        const cell = this.cellOf(item);
        const t = cell ? this.lastTurn(cell) : null;
        const q = d.usage?.quantities ?? {};
        const out = typeof q.output === 'number' ? q.output : null;
        const inp = ['uncached_input', 'cache_read', 'cache_write_5m', 'cache_write_1h'].reduce((s, k) => s + (typeof q[k] === 'number' ? q[k] : 0), 0);
        if (t) {
          t.respondedAt = item.at;
          t.stop = d.stop ?? null;
          t.outputTokens = out;
          t.inputTokens = d.usage ? inp : null;
          t.progress = null;
        }
        if (cell && out) cell.outputTokens += out;
        if (out) this.tokensOut += out;
        this.tokensIn += inp;
        this.node('MODEL', 'idle', seq, [cell?.profileId ?? '', out !== null ? out + ' out' : 'usage unknown']);
        this.particle(seq, 'MODEL', 'CELL', 'neutral', out !== null ? out + ' tok' : undefined);
        this.tick(item, 'model', cell?.profileId ?? 'model', `${String(d.stop ?? '').toLowerCase()}${out !== null ? ' · ' + out + ' out' : ''}`, 'neutral');
        break;
      }
      case 'cell.tool_called': {
        const cell = this.cellOf(item);
        const t = cell ? this.lastTurn(cell) : null;
        if (t) {
          const op = this.op(t, d.opId);
          op.family = d.family ?? op.family;
          op.op = d.op ?? op.op;
          op.phase = item.phase ?? null;
          op.pending = true;
        }
        const seg = SEGMENT[item.phase ?? ''];
        if (seg) this.segments.add(seg);
        const target = TOOL_TARGET[d.family] ?? 'ATLAS';
        if (target !== 'CELL') {
          this.node(target, 'active', seq, [d.family + ' ' + (d.op ?? '')]);
          this.particle(seq, 'CELL', target, 'neutral', d.op);
        }
        break;
      }
      case 'cell.tool_resulted': {
        const cell = this.cellOf(item);
        const t = cell ? this.lastTurn(cell) : null;
        const env = parseEnvelope(d.header);
        if (t) {
          const op = this.op(t, d.opId);
          op.header = d.header;
          op.env = env;
          op.status = env?.status ?? null;
          op.alias = d.resultAlias && d.resultAlias !== '#-' ? d.resultAlias : op.alias;
          op.pending = false;
          if (env?.tool) op.family = env.tool;
        }
        const target = TOOL_TARGET[env?.tool ?? ''] ?? 'ATLAS';
        const tn = toneOf(env?.status);
        if (target !== 'CELL') {
          this.node(target, tn === 'bad' ? 'error' : 'idle', seq, [(env?.tool ?? '') + ' ' + (env?.status ?? '')]);
          this.particle(seq, target, 'CELL', tn === 'warn' ? 'neutral' : tn, env?.status ?? undefined);
        }
        if (env?.tool === 'edit' && env.status === 'ok') {
          this.editCount++;
          this.node('WORKSPACE', 'idle', seq, ['stamp ' + (env.stamp ?? ''), Object.keys(env.versions).join(', ')]);
        }
        if ((env?.tool === 'verify' || env?.tool === 'run') && env.status) {
          this.node('VERIFIER', tn === 'bad' ? 'error' : 'idle', seq, [env.tool + ' ' + env.status]);
          if (env.tool === 'verify') this.particle(seq, 'VERIFIER', 'EVIDENCE', tn === 'warn' ? 'neutral' : tn, 'receipt');
        }
        this.tick(item, env?.tool ?? 'tool', target === 'CELL' ? 'STATE' : Object.keys(env?.versions ?? {})[0] ?? (env?.alias ?? ''), env?.status ?? '', tn);
        break;
      }
      case 'cell.gate_fired': {
        const cell = this.cellOf(item);
        const t = cell ? this.lastTurn(cell) : null;
        const g: GateLine = { gate: d.gate, text: d.text, at: item.at, seq };
        if (t) t.gates.push(g);
        if (cell) cell.gates++;
        const exit = d.gate === 'exit';
        this.node('CELL', exit ? 'error' : 'attention', seq, ['gate ' + d.gate]);
        if (exit) this.node('VERIFIER', 'error', seq, ['completion refused']);
        this.tick(item, 'gate', d.gate, (d.text ?? '').slice(0, 80), exit ? 'bad' : 'warn');
        break;
      }
      case 'cell.register_patched': {
        const cell = this.cellOf(item);
        const t = cell ? this.lastTurn(cell) : null;
        if (t) t.register = { version: d.version, ops: d.ops };
        if (cell) cell.registerVersion = d.version;
        this.tick(item, 'state', 'STATE v' + d.version, d.ops + ' ops', 'neutral');
        break;
      }
      case 'cell.workset_changed': {
        const cell = this.cellOf(item);
        const t = cell ? this.lastTurn(cell) : null;
        if (t) { t.worksetKnown = d.known; t.worksetDropped = d.dropped ?? []; }
        if ((d.dropped ?? []).length) this.node('ATLAS', 'attention', seq, ['−' + d.dropped.length + ' stale']);
        break;
      }
      case 'cell.rebuilt': {
        const cell = this.cellOf(item);
        if (cell) cell.rebuilds.push({ reason: d.reason, generation: d.generation, at: item.at });
        this.node('COMPILER', 'active', seq, ['rebuild', d.reason ?? '']);
        this.particle(seq, 'COMPILER', 'CELL', 'neutral', 'rebuild');
        this.tick(item, 'rebuild', cell?.role ?? '', d.reason ?? '', 'warn');
        break;
      }
      case 'cell.ended': {
        const cell = this.cellOf(item);
        if (cell) {
          cell.status = d.status;
          cell.endedAt = item.at;
          cell.manifestRef = d.manifestRef ?? null;
          const last = this.lastTurn(cell);
          if (last && !last.endedAt) last.endedAt = item.at;
          if (last) this.pushHistory(cell, last);
        }
        this.node('CELL', 'idle', seq, [cell?.role ?? '', 'ended ' + d.status]);
        this.particle(seq, 'CELL', 'CONTROLLER', toneOf(d.status) === 'bad' ? 'bad' : 'neutral', 'result');
        this.tick(item, 'cell', cell?.role ?? 'cell', d.status, toneOf(d.status));
        break;
      }

      // ---- questions, delegation, knowledge, telemetry -------------------------------------------------------
      case 'ask.question':
        this.questions.set(d.questionId, { at: item.at, answered: false });
        this.particle(seq, 'CELL', 'YOU', 'neutral', '?');
        break;
      case 'ask.answered': {
        const q = this.questions.get(d.questionId);
        if (q) { q.answered = true; q.changesRequirements = d.changesRequirements; }
        this.particle(seq, 'YOU', 'CELL', 'ok', 'answer');
        break;
      }
      case 'blocked':
        this.blockedReason = d.reason;
        this.blocks.push({ type: 'boundary', id: 'b' + seq, seq, at: item.at, icon: 'pause', tone: 'warn', text: 'Blocked · ' + d.reason });
        this.node('CELL', 'attention', seq, ['blocked']);
        this.tick(item, 'blocked', item.cell ?? 'campaign', (d.reason ?? '').slice(0, 80), 'warn');
        break;
      case 'warning':
        this.warnings.push({ kind: d.kind, text: d.text });
        this.blocks.push({ type: 'warning', id: 'w' + seq, seq, at: item.at, kind: d.kind, text: d.text });
        this.tick(item, 'warning', d.kind, (d.text ?? '').slice(0, 80), 'warn');
        break;
      case 'run.reconciled':
        this.blocks.push({ type: 'boundary', id: 'b' + seq, seq, at: item.at, icon: 'sync', tone: d.outcome === 'unknown_outcome' ? 'warn' : 'neutral', text: `Reconciled ${d.actionId} · ${d.outcome}` });
        break;
      case 'delegation.dispatched':
        this.delegations.set(d.handle, { handle: d.handle, kind: d.kind, status: 'running', at: item.at });
        this.particle(seq, 'CELL', 'sat-' + d.handle, 'neutral', d.kind);
        this.tick(item, 'delegate', d.kind, 'dispatched', 'neutral');
        break;
      case 'delegation.collected': {
        const x = this.delegations.get(d.handle);
        if (x) x.status = d.status;
        this.particle(seq, 'sat-' + d.handle, 'CELL', d.status === 'published' ? 'ok' : 'bad', 'packet');
        this.tick(item, 'collect', x?.kind ?? d.handle, d.status, toneOf(d.status));
        break;
      }
      case 'delegation.rejected': {
        const x = this.delegations.get(d.handle);
        if (x) x.status = 'rejected';
        this.tick(item, 'delegate', x?.kind ?? d.handle, 'rejected · ' + d.reason, 'bad');
        break;
      }
      case 'kb.proposed':
      case 'kb.admitted':
      case 'kb.invalidated':
        this.kb.push({ noteId: d.noteId, kind: d.kind ?? '', event: item.kind.slice(3) });
        this.node('KB', 'active', seq, [item.kind.slice(3) + ' ' + d.noteId]);
        this.particle(seq, 'CELL', 'KB', 'neutral', d.noteId);
        this.tick(item, 'kb', d.noteId, item.kind.slice(3), 'neutral');
        break;
      case 'span.started':
        if (item.span) this.spans.set(item.span, { phase: item.phase ?? '', parent: item.parent ?? null, cell: item.cell });
        break;
      case 'span.ended':
        if (item.span) {
          const s = this.spans.get(item.span) ?? { phase: item.phase ?? '' };
          s.status = d.status;
          s.cost = d.cost;
          s.durationNanos = d.durationNanos;
          this.spans.set(item.span, s);
          if (!item.parent) this.campaignCost = d.cost;
        }
        break;

      // ---- journal rows ---------------------------------------------------------------------------------------
      case 'journal.call': {
        const cell = this.cellOf(item);
        const t = cell && item.turn ? this.turn(cell, item.turn, item.at, seq) : null;
        if (!t) break;
        const payload: any[] = Array.isArray(d.payload) ? d.payload : [];
        const texts: string[] = [];
        let idx = 0;
        for (const p of payload) {
          if (p?.type === 'message') {
            for (const part of p.parts ?? []) if (part?.type === 'text' && part.text) texts.push(part.text);
          } else if (p?.type === 'tool_call') {
            idx++;
            const op = this.op(t, idx);
            op.callId = p.id;
            op.family = op.family || p.name;
            if (!op.family) op.family = p.name;
            try { op.args = JSON.parse(p.argsJson); } catch { op.args = p.argsJson; }
            if (!op.op) op.op = op.args?.what ?? op.args?.op ?? (p.name === 'edit' ? 'batch' : null);
          }
        }
        t.text = texts.join('\n\n') || null;
        const m = /· stop (\w+) · (\d+) calls/.exec(d.text ?? '');
        if (m) { t.stop = t.stop ?? m[1]; t.callCount = +m[2]; }
        break;
      }
      case 'journal.result': {
        const cell = this.cellOf(item);
        const t = cell && item.turn ? this.turn(cell, item.turn, item.at, seq) : null;
        if (!t) break;
        const r = splitResult(d.text ?? '');
        let op = r.callId ? t.ops.find(o => o.callId === r.callId) : undefined;
        if (!op && r.callId) {
          const mm = /_(\d+)$/.exec(r.callId);
          op = this.op(t, mm ? +mm[1] : t.ops.length + 1);
          op.callId = r.callId;
        }
        if (op) {
          op.header = op.header ?? r.header;
          op.env = op.env ?? parseEnvelope(r.header);
          op.status = op.status ?? op.env?.status ?? null;
          op.body = r.body || null;
          op.refs = d.refs ?? [];
          op.pending = false;
          if (op.env?.tool && !op.family) op.family = op.env.tool;
          const g = parseGauge(r.body);
          if (g) { t.gauge = g; this.lastGauge = g; }
        }
        break;
      }
      case 'journal.edit-outcome': {
        const cell = this.cellOf(item);
        const t = cell && item.turn ? this.turn(cell, item.turn, item.at, seq) : null;
        const paths = (Array.isArray(d.payload) ? d.payload : []).map((p: any) => ({ path: p.path, before: p.versionBefore, after: p.versionAfter }));
        if (t) t.edits.push({ text: d.text, paths, refs: d.refs ?? [], payload: d.payload });
        this.tick(item, 'edit', paths.map((p: any) => p.path).join(', '), 'applied', 'ok');
        break;
      }
      case 'journal.check': {
        const cell = this.cellOf(item);
        const t = cell && item.turn ? this.turn(cell, item.turn, item.at, seq) : null;
        const text: string = d.text ?? '';
        const m = /(CHK-[\w.-]+):\s*(\w+)/.exec(text);
        const outcome = m ? m[2] : null;
        if (m) this.checkSummary.set(m[1], m[2]);
        for (const r of d.refs ?? []) this.receipts.add(r);
        if (t) t.checks.push({ text, outcome, refs: d.refs ?? [], at: item.at });
        else this.blocks.push({ type: 'boundary', id: 'b' + seq, seq, at: item.at, icon: 'check', tone: toneOf(outcome), text });
        this.node('VERIFIER', toneOf(outcome) === 'bad' ? 'error' : 'idle', seq, [text.slice(0, 40)]);
        this.particle(seq, 'VERIFIER', 'EVIDENCE', toneOf(outcome) === 'bad' ? 'bad' : toneOf(outcome) === 'ok' ? 'ok' : 'neutral', m ? m[1] : 'check');
        this.tick(item, 'check', m ? m[1] : 'check', outcome ?? '', toneOf(outcome));
        break;
      }
      case 'journal.nudge': {
        const cell = this.cellOf(item);
        const t = cell && item.turn ? this.turn(cell, item.turn, item.at, seq) : null;
        if (t) t.nudges.push(d.text ?? '');
        break;
      }
      case 'journal.boundary': {
        const text: string = d.text ?? '';
        const cell = this.cellOf(item);
        if (cell && item.turn) {
          const t = this.turn(cell, item.turn, item.at, seq);
          if (/^turn \d+ /.test(text)) {
            t.boundary = text;
            if (/completed|blocked|partial|failed|cancelled/.test(text)) t.endedAt = t.endedAt ?? item.at;
          } else if (text.startsWith('packet ')) {
            cell.packetLines.push(text);
          } else {
            t.nudges.push(text);
          }
          break;
        }
        if (text.startsWith('open: impact')) break; // shown with the shape line
        if (text.startsWith('open: shape')) break;
        const recovery = d.payload?.type && String(d.payload.type).startsWith('recovery');
        this.blocks.push({ type: 'boundary', id: 'b' + seq, seq, at: item.at, icon: recovery ? 'recover' : 'dot', tone: recovery ? 'warn' : 'neutral', text });
        if (recovery) this.node('CELL', 'attention', seq, ['⟲ recovery']);
        break;
      }
      case 'journal.reconcile':
        this.blocks.push({ type: 'boundary', id: 'b' + seq, seq, at: item.at, icon: 'sync', tone: /unknown|lost/.test(d.text ?? '') ? 'warn' : 'neutral', text: d.text ?? '' });
        break;
      case 'journal.intent':
      case 'journal.edit-intent':
        break;
      default:
        // R-WS-01: unknown kinds are rendered as generic lines, never dropped.
        if (item.source !== 'bus' || !['span.started', 'span.ended'].includes(item.kind)) {
          if (!item.kind.startsWith('journal.') && !item.kind.startsWith('studio.') && !item.kind.startsWith('budget.') && !item.kind.startsWith('check.')) {
            this.blocks.push({ type: 'boundary', id: 'b' + seq, seq, at: item.at, icon: 'dot', tone: 'neutral', text: item.kind + ' ' + compact(d) });
          }
        }
    }
  }

  private pendingDecisionBlocks(): boolean { return false; }

  private cellOf(item: StudioItem): CellModel | null {
    const id = item.cell ?? item.ids?.context ?? null;
    if (id) {
      let c = this.cells.get(id);
      if (!c) {
        // A row for a cell whose start was not captured (reconstructed stream): create it honestly.
        c = { id, role: 'cell', incrementId: null, status: 'running', startedAt: item.at, endedAt: null, turns: [], turnsMax: null, manifestRef: null,
          registerVersion: null, rebuilds: [], gates: 0, outputTokens: 0, profileId: null, packetLines: [], seqFrom: item.seq ?? 0, parent: null };
        this.cells.set(id, c);
        this.cellOrder.push(id);
        this.blocks.push({ type: 'cell', id: 'c' + (item.seq ?? 0), seq: item.seq ?? 0, cell: id });
      }
      return c;
    }
    return null;
  }

  private turn(cell: CellModel, n: number, at: string, seq: number): TurnModel {
    let t = cell.turns.find(x => x.n === n);
    if (!t) {
      const prev = cell.turns[cell.turns.length - 1];
      if (prev && !prev.endedAt && prev.n < n) {
        prev.endedAt = at;
        this.pushHistory(cell, prev);
      }
      t = {
        n, startedAt: at, endedAt: null, turnsMax: cell.turnsMax, text: null, stop: null, callCount: null, ops: [], edits: [], checks: [], gates: [], nudges: [],
        register: null, worksetKnown: null, worksetDropped: [], boundary: null, gauge: null, invocation: null, profileId: null, estimatedTokens: null,
        anchorTokens: null, requestedAt: null, respondedAt: null, outputTokens: null, inputTokens: null, progress: null, seqFrom: seq,
      };
      cell.turns.push(t);
      cell.turns.sort((a, b) => a.n - b.n);
    }
    return t;
  }

  private lastTurn(cell: CellModel): TurnModel | null {
    return cell.turns.length ? cell.turns[cell.turns.length - 1] : null;
  }

  private op(t: TurnModel, index: number): OpModel {
    let op = t.ops.find(o => o.index === index);
    if (!op) {
      op = { index, callId: null, family: '', op: null, phase: null, args: null, header: null, env: null, body: null, alias: null, refs: [], status: null, pending: true };
      t.ops.push(op);
      t.ops.sort((a, b) => a.index - b.index);
    }
    return op;
  }

  private pushHistory(cell: CellModel, t: TurnModel): void {
    if (this.turnHistory.some(h => h.cell === cell.id && h.turn === t.n)) return;
    const checkTones = t.checks.map(c => toneOf(c.outcome));
    const verify = t.ops.filter(o => o.family === 'verify' || o.family === 'run').map(o => toneOf(o.status));
    const all = [...checkTones, ...verify];
    this.turnHistory.push({
      cell: cell.id, turn: t.n, edits: t.ops.filter(o => o.family === 'edit' && o.status === 'ok').length,
      checks: all.includes('bad') ? 'bad' : all.includes('ok') ? 'ok' : null, gates: t.gates.length, blocked: /blocked/.test(t.boundary ?? ''),
    });
    if (this.turnHistory.length > 60) this.turnHistory.shift();
  }

  private setIncrement(id: string, state: 'selected' | 'verified' | 'blocked' | 'cancelled', at: string): void {
    if (!this.increments.has(id)) this.incrementOrder.push(id);
    this.increments.set(id, { id, state, at });
  }

  private node(id: NodeId, state: NodeState['state'], seq: number, lines: string[]): void {
    const n = this.nodes[id];
    n.state = state;
    n.lines = lines.filter(Boolean).slice(0, 2);
    n.lastSeq = seq;
  }

  private particle(seq: number, from: string, to: string, tone: 'ok' | 'bad' | 'neutral' | 'warn', label?: string | null): void {
    this.particles.push({ seq, from, to, tone: tone === 'warn' ? 'neutral' : tone, label: label ?? undefined });
    if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);
  }

  private tick(item: StudioItem, kind: string, target: string, result: string, tone: 'ok' | 'bad' | 'warn' | 'neutral'): void {
    this.ticker.push({ seq: item.seq ?? this.lastSeq, at: item.at, kind, target, result, tone, cell: item.cell, turn: item.turn });
    if (this.ticker.length > 200) this.ticker.shift();
  }

  /** The campaign rail (§8.3) from observed items. Absent machinery is absent, not greyed (P-08). */
  rail(): RailStage[] {
    const stages: RailStage[] = [];
    stages.push({ key: 'open', label: 'Open', state: this.opened ? 'done' : this.lastSeq > 0 ? 'active' : 'pending' });
    stages.push({ key: 'shape', label: this.shape ? 'Shape ' + this.shape : 'Shape', state: this.shape ? (this.shape === 'blocked' ? 'failed' : 'done') : 'pending', detail: this.shapeInputs ?? undefined });
    const planCell = this.cellOrder.map(id => this.cells.get(id)!).find(c => c.role === 'plan');
    if (this.shape && this.shape !== 'S0' && this.shape !== 'blocked') {
      stages.push({ key: 'plan', label: 'Plan', state: planCell ? (planCell.status === 'running' ? 'active' : planCell.status === 'completed' ? 'done' : 'failed') : 'pending' });
    }
    for (const id of this.incrementOrder) {
      const inc = this.increments.get(id)!;
      const running = this.currentIncrement === id && inc.state === 'selected' && !this.outcome;
      stages.push({ key: 'inc-' + id, label: id, state: inc.state === 'verified' ? 'done' : running ? 'active' : inc.state === 'blocked' ? 'blocked' : inc.state === 'cancelled' ? 'cancelled' : 'pending' });
    }
    const finishState = this.outcome ? (this.outcome === 'completed' ? 'done' : ['cancelled'].includes(this.outcome) ? 'cancelled' : ['failed'].includes(this.outcome) ? 'failed' : 'blocked') : 'pending';
    stages.push({ key: 'finish', label: this.outcome ? 'Finish · ' + this.outcome.replace(/_/g, ' ') : 'Finish', state: finishState as RailStage['state'] });
    return stages;
  }

  activeCell(): CellModel | null {
    if (this.currentCell) return this.cells.get(this.currentCell) ?? null;
    const last = this.cellOrder[this.cellOrder.length - 1];
    return last ? this.cells.get(last) ?? null : null;
  }

  /** The operation currently open in the active cell, as data (never narrative). */
  currentOp(): { label: string; since: string } | null {
    const cell = this.activeCell();
    if (!cell || cell.status !== 'running') return null;
    const t = this.lastTurn(cell);
    if (!t) return null;
    if (t.progress && !t.respondedAt) {
      const p = t.progress;
      return { label: `${t.profileId ?? 'model'} · ${p.stage}${p.textChars ? ' · ' + p.textChars.toLocaleString() + ' chars' : ''}${p.outputTokens ? ' · ' + p.outputTokens + ' out' : ''}${p.attempt ? ' · attempt ' + p.attempt : ''}`, since: t.requestedAt ?? t.startedAt };
    }
    const pending = t.ops.find(o => o.pending);
    if (pending) return { label: `${pending.family} ${pending.op ?? ''} ${targetOf(pending)}`.trim(), since: t.respondedAt ?? t.startedAt };
    return null;
  }
}

export function toneOf(status: string | null | undefined): 'ok' | 'bad' | 'warn' | 'neutral' {
  if (!status) return 'neutral';
  const s = status.toLowerCase();
  if (['ok', 'passed', 'green', 'verified', 'completed', 'applied', 'accepted', 'answered', 'collected', 'published', 'done', 'dispatched', 'queued', 'proposed'].includes(s)) return 'ok';
  if (['failed', 'rejected', 'refused', 'denied', 'red', 'infra_error', 'infraerror', 'timeout', 'deadline_exceeded', 'lost', 'masked', 'error'].includes(s)) return 'bad';
  if (['partial', 'blocked', 'stale', 'pending', 'unknown_outcome', 'unknownoutcome', 'unchanged', 'not_found', 'historical'].includes(s)) return 'warn';
  return 'neutral';
}

export function targetOf(op: OpModel): string {
  const a = op.args ?? {};
  if (op.family === 'look') return a.target ?? a.id ?? a.glob ?? '';
  if (op.family === 'edit') return (a.ops ?? []).map((o: any) => o.path ?? o.create ?? o.delete ?? o.rename ?? o.revert ?? (o.transform ? 'transform ' + (o.transform.scope_glob ?? '') : '')).filter(Boolean).join(', ');
  if (op.family === 'run') return a.argv ? a.argv.join(' ') : a.cmd ?? (a.op === 'poll' || a.op === 'cancel' ? a.handle ?? '' : '');
  if (op.family === 'verify') return a.what + (a.ids ? ' ' + a.ids.join(',') : '') + (a.selection ? ' ' + a.selection : '');
  if (op.family === 'task') return a.question ?? a.kind ?? '';
  if (op.family === 'kb') return a.query ?? a.id ?? '';
  if (op.family === 'state') return Array.isArray(a.patch) ? a.patch.length + ' ops' : a.op ?? '';
  return '';
}

function compact(d: any): string {
  try {
    const s = JSON.stringify(d);
    return s.length > 160 ? s.slice(0, 157) + '…' : s;
  } catch {
    return '';
  }
}
