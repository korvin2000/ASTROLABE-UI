import { Text } from '../i18n/translate';

/** The seven nodes of the Flow (section 8.2.2), named after the work. */
export type FlowNode = 'you' | 'model' | 'agent' | 'memory' | 'explore' | 'edit' | 'checks';

export type StepStatus = 'running' | 'ok' | 'failed' | 'unknown';

/** One step of the agent (one tool call) as the conversation shows it (Appendix A). */
export interface Step {
  id: string;
  workId: string;
  callId: string;
  tool: string;
  op: string;
  text: Text;
  status: StepStatus;
  at: string;
  endedAt?: string;
  node: FlowNode | null;
  /** The file the step is about; a click opens Changes there. */
  path?: string;
  /** The command the step ran; a click opens Output there. */
  command?: string;
  /** The number of the stored output of the step, when it has one. */
  output?: number;
  check?: boolean;
  added?: number;
  removed?: number;
}

export interface ToolCall { name: string; args: Record<string, unknown>; }

function str(v: unknown): string { return typeof v === 'string' ? v : ''; }

function fileName(path: string): string {
  const clean = path.replace(/::.*$/, '').replace(/:\d+(-\d+)?$/, '');
  return clean;
}

export function commandText(args: Record<string, unknown>): string {
  const argv = args['argv'];
  if (Array.isArray(argv) && argv.length) return argv.map(a => (/\s/.test(String(a)) ? `"${a}"` : String(a))).join(' ');
  return str(args['cmd']);
}

/** The operation of a tool call: the agent names it `what` for look and verify, `op` elsewhere. */
export function opOf(call: ToolCall): string {
  const a = call.args;
  switch (call.name) {
    case 'look': case 'verify': return str(a['what']);
    case 'run': return str(a['op']) || 'run';
    case 'edit': {
      const ops = Array.isArray(a['ops']) ? (a['ops'] as Record<string, unknown>[]) : [];
      const first = ops[0] ?? {};
      if (first['transform']) return 'transform';
      if (str(first['revert'])) return 'revert';
      if (str(first['rename'])) return 'rename';
      if (str(first['delete'])) return 'delete';
      if (str(first['create'])) return 'create';
      return 'anchored';
    }
    default: return str(a['op']);
  }
}

/** Steps the conversation never shows: the agent's own bookkeeping, and calls that become cards. */
export function hidden(call: ToolCall): boolean {
  const op = opOf(call);
  if (call.name === 'state') return true;
  if (call.name === 'kb' && op === 'propose') return true;
  if (call.name === 'task' && (op === 'ask' || op === 'propose')) return true;
  if (call.name === 'run' && op === 'poll') return true;
  return false;
}

/** The Flow node a tool call belongs to (Appendix D); null for calls the Flow does not show. */
export function nodeOf(name: string, op: string): FlowNode | null {
  switch (name) {
    case 'look': return op === 'recall' || op === 'bmap' ? 'memory' : 'explore';
    case 'kb': return 'memory';
    case 'edit': return 'edit';
    case 'run': return 'edit';
    case 'verify': return 'checks';
    default: return null;
  }
}

/**
 * The sentences of Appendix A, one per tool call. An edit call may change several files: it becomes one step per file.
 */
export function describe(call: ToolCall): { text: Text; path?: string; command?: string; check?: boolean }[] {
  const a = call.args;
  const op = opOf(call);
  switch (call.name) {
    case 'look': {
      const target = str(a['target']);
      if (op === 'read') return [{ text: { key: 'step.read', params: { path: fileName(target) } }, path: fileName(target) }];
      if (op === 'find') return [{ text: { key: 'step.search', params: { text: target } } }];
      if (op === 'def' || op === 'refs' || op === 'importers' || op === 'impact') return [{ text: { key: 'step.lookup', params: { symbol: target } } }];
      if (op === 'recall' || op === 'bmap') return [{ text: { key: 'step.recall' } }];
      return [{ text: { key: 'step.explore' } }];
    }
    case 'kb': return [{ text: { key: 'step.recall' } }];
    case 'edit': {
      const ops = Array.isArray(a['ops']) ? (a['ops'] as Record<string, unknown>[]) : [];
      const out: { text: Text; path?: string }[] = [];
      for (const o of ops) {
        if (o['transform']) out.push({ text: { key: 'step.edit_many' } });
        else if (str(o['revert'])) out.push({ text: { key: 'step.revert', params: { path: str(o['revert']) } } });
        else if (str(o['rename'])) out.push({ text: { key: 'step.rename', params: { from: str(o['rename']), to: str(o['to']) } }, path: str(o['to']) });
        else if (str(o['delete'])) out.push({ text: { key: 'step.delete', params: { path: str(o['delete']) } }, path: str(o['delete']) });
        else if (str(o['create'])) out.push({ text: { key: 'step.create', params: { path: str(o['create']) } }, path: str(o['create']) });
        else if (str(o['path'])) out.push({ text: { key: 'step.edit', params: { path: str(o['path']) } }, path: str(o['path']) });
      }
      return out.length ? out : [{ text: { key: 'step.edit_many' } }];
    }
    case 'run': {
      const command = commandText(a);
      if (op === 'cancel') return [{ text: { key: 'step.stop_command' } }];
      return [{ text: { key: 'step.run', params: { command } }, command }];
    }
    case 'verify':
      if (op === 'review') return [{ text: { key: 'step.review' }, check: true }];
      return [{ text: { key: 'step.checks' }, check: true }];
    case 'task':
      if (op === 'delegate') return [{ text: { key: 'step.helpers_started' } }];
      if (op === 'collect') return [{ text: { key: 'step.helpers_collected' } }];
      return [];
    default: return [];
  }
}

/** What the status line and the Flow say while a tool of [family] runs and its details are not known yet. */
export function working(family: string, op: string): Text {
  switch (family) {
    case 'look':
      if (op === 'read') return { key: 'now.reading' };
      if (op === 'find') return { key: 'now.searching' };
      if (op === 'recall' || op === 'bmap') return { key: 'now.recalling' };
      return { key: 'now.exploring' };
    case 'kb': return { key: 'now.recalling' };
    case 'edit': return { key: 'now.editing' };
    case 'run': return { key: 'now.running' };
    case 'verify': return op === 'review' ? { key: 'now.reviewing' } : { key: 'now.checking' };
    default: return { key: 'now.working' };
  }
}

/** The status of a step from the status word of its result (the agent's runner assigns it, never the model). */
export function statusOf(word: string | null | undefined): StepStatus {
  const s = (word ?? '').toLowerCase();
  if (['ok', 'passed', 'applied', 'answered', 'collected', 'dispatched'].includes(s)) return 'ok';
  if (['failed', 'refused', 'rejected', 'denied', 'timeout', 'deadline_exceeded', 'infra_error', 'error', 'lost', 'partial', 'masked'].includes(s)) return 'failed';
  return 'unknown';
}
