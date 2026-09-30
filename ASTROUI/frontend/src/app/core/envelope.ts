/** The header of a tool result as the agent renders it. */
export interface Envelope {
  alias: string | null;
  tool: string | null;
  cls: string | null;
  versions: Record<string, string>;
  stamp: string | null;
  truncated: boolean;
  effects: string | null;
  status: string | null;
  flags: string[];
  raw: string;
}

// Parsers for ASTROLABE's rendered lines (§2.7): result envelope headers and gauge lines. Parsed once at the boundary;
// unknown fields are kept as flags, never guessed.

const HEADER = /⟦result\s+([^\s⟧]+)\s*(.*?)⟧/;

export function parseEnvelope(text: string | null | undefined): Envelope | null {
  if (!text) return null;
  const m = HEADER.exec(text);
  if (!m) return null;
  const alias = m[1] === '#-' ? null : m[1];
  const rest = m[2];
  const env: Envelope = { alias, tool: null, cls: null, versions: {}, stamp: null, truncated: false, effects: null, status: null, flags: [], raw: m[0] };
  const versions = /v=\{([^}]*)\}/.exec(rest);
  if (versions) {
    for (const part of versions[1].split(',')) {
      const [p, h] = part.split(':').map(s => s.trim());
      if (p) env.versions[p] = h ?? '';
    }
  }
  const stripped = rest.replace(/v=\{[^}]*\}/, '');
  for (const token of stripped.split(/\s+/).filter(Boolean)) {
    const eq = token.indexOf('=');
    if (eq < 0) { env.flags.push(token); continue; }
    const k = token.slice(0, eq);
    const v = token.slice(eq + 1);
    switch (k) {
      case 'tool': env.tool = v; break;
      case 'class': env.cls = v; break;
      case 'stamp': env.stamp = v; break;
      case 'truncated': env.truncated = v === 'yes'; break;
      case 'effects': env.effects = v; break;
      case 'status': env.status = v; break;
      default: env.flags.push(token);
    }
  }
  return env;
}

/** Tone of a status word: success, danger, attention or neutral (R-EVD-02: inconclusive/not_run never green). */
export function tone(status: string | null | undefined): 'ok' | 'bad' | 'warn' | 'neutral' {
  if (!status) return 'neutral';
  const s = status.toLowerCase();
  if (['ok', 'passed', 'green', 'verified', 'completed', 'applied', 'accepted', 'approved', 'answered', 'collected', 'published', 'current', 'done'].includes(s)) return 'ok';
  if (['failed', 'rejected', 'refused', 'denied', 'red', 'error', 'infra_error', 'timeout', 'deadline_exceeded', 'lost', 'partial', 'masked', 'blocked'].includes(s)) return 'bad';
  if (['stale', 'pending', 'waiting', 'unknown_outcome', 'queued', 'proposed', 'unchanged'].includes(s)) return 'warn';
  return 'neutral';
}

export interface Gauge { ctx: string | null; reserve: string | null; checks: string | null; known: string | null; state: string | null; turn: string | null; raw: string; }

/** `⟨ctx P% · reserve ok|reached · checks … · known N/tok · STATE vV · turn T/M⟩` */
export function parseGauge(text: string | null | undefined): Gauge | null {
  if (!text) return null;
  const m = /⟨([^⟩]*)⟩/.exec(text);
  if (!m) return null;
  const g: Gauge = { ctx: null, reserve: null, checks: null, known: null, state: null, turn: null, raw: m[0] };
  for (const part of m[1].split('·').map(s => s.trim())) {
    if (part.startsWith('ctx ')) g.ctx = part.slice(4);
    else if (part.startsWith('reserve ')) g.reserve = part.slice(8);
    else if (part.startsWith('checks ')) g.checks = part.slice(7);
    else if (part.startsWith('known ')) g.known = part.slice(6);
    else if (part.startsWith('STATE ')) g.state = part.slice(6);
    else if (part.startsWith('turn ')) g.turn = part.slice(5);
  }
  return g;
}

/** Splits a journal `result` row text `call <id>: ⟦…⟧\n<body>` into call id, header and body. */
export function splitResult(text: string): { callId: string | null; header: string | null; body: string } {
  const m = /^call ([^:]+): (⟦[^⟧]*⟧)\s*([\s\S]*)$/.exec(text);
  if (!m) return { callId: null, header: null, body: text };
  return { callId: m[1], header: m[2], body: m[3] };
}
