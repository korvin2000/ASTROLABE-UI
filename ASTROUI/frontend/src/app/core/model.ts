// Wire types of Studio 2 (spec section 12.3). The agent's own JSON is passed through as recorded; unknown values
// must never crash the client.

export interface Ids { work: string; attempt?: string; candidate?: string | null; context?: string | null; }

/** One item of a run's stream: an event of the agent, a row of its journal, or an item the Studio added. */
export interface StudioItem {
  seq?: number;
  at: string;
  source: 'bus' | 'journal' | 'derived' | 'studio';
  kind: string;
  ids: Ids;
  cell?: string;
  turn?: number;
  phase?: string;
  busSeq?: number;
  ephemeral?: boolean;
  reconstructed?: boolean;
  data: Record<string, unknown>;
}

export interface AppItem { seq: number; at: string; kind: string; data: Record<string, unknown>; }

/** `{ code, params, detail, retryable }` (section 10); the sentence lives in the message catalog. */
export interface ErrorInfo {
  code: string;
  params?: Record<string, unknown>;
  detail?: string;
  retryable?: boolean;
  message?: string;
}

export type ApiError = ErrorInfo & { message: string };

export type TaskState = 'working' | 'needs_you' | 'paused' | 'done' | 'stopped' | 'failed';
export type Mode = 'ask' | 'auto';
export type Effort = 'low' | 'medium' | 'high';

export interface Card {
  id: string;
  workId: string;
  kind: 'question' | 'approval' | 'suggestion' | 'acceptance' | 'review';
  status: string;
  createdAt: string;
  text?: string;
  options?: string[];
  command?: string;
  effect?: string;
  why?: string;
  detail?: string;
  pattern?: string;
  relaxes?: boolean;
  /**
   * Acceptance: the result could not be checked (`unverified`), a review rejected it after one rework round, or (C11) the
   * agent changed tests only the user may approve (`integrity`). Review: `integrity`, or a plain `review`.
   */
  variant?: 'unverified' | 'rejected' | 'integrity' | 'review';
  /** C11: a changed test has its `path` and the required `checks` it affects; on a review card `reason` is the agent's. */
  items?: { reason?: string; status?: string; findings?: Finding[]; path?: string; checks?: string[]; humanOnly?: boolean; by?: string }[];
  /** C11: the model's verdict attached to the user's card as information, never as the answer. */
  model?: { outcome: string; summary?: string; findings: Finding[] };
  summary?: string;
  /** WF-8: what the user typed while an acceptance card was open; it decides nothing until Accept or Rework. */
  note?: string;
}

export interface Finding { severity: string; location: string; issue: string; }

export interface TaskRun {
  workId: string;
  startedAt: string;
  endedAt?: string;
  outcome: string | null;
  request: string | null;
  state: TaskState;
  reason?: ErrorInfo;
}

/** ASTROLABE 2.0 C4: how a run spends — the approach of its attempt. */
export type Approach = 'economy' | 'balanced' | 'thorough';
/** The user's limits of one run; null is no limit. */
export interface Limits { moneyUsd: string | null; minutes: number | null; requests: number | null; }
/** Who verified a result (core §4.4 C2): an independent check, only the agent's own test, or nothing. */
export type ProvenanceClass = 'independent' | 'agent_test' | 'unverified';

export interface Verification { kind: 'tests' | 'review' | string; source: string; command?: string | null; }

export interface Task {
  id: string;
  projectId: string;
  title: string;
  state: TaskState;
  reason?: ErrorInfo;
  /** `unavailable`: the run finished but its evidence cannot be read now (WD-30) — not the same as `none`. */
  verified: 'tests' | 'build' | 'review' | 'user' | 'unverified' | 'answer' | 'unavailable' | 'none';
  verification?: Verification;
  model: { ref: string | null; name: string | null; effort: Effort | null };
  mode: Mode;
  demo: boolean;
  lastRun: string;
  createdAt: string;
  updatedAt: string;
  pending: Card[];
  runs?: TaskRun[];
  changes?: { files: number; added: number; removed: number };
  /** The scratch list the task's attempt froze (W3): untracked files under these roots are not its result. */
  scratch?: { id: string; roots: string[] };
  /** C16: `cost.paidAmount` / `cost.nominalAmount` only when some of the cost is a subscription model's nominal spend. */
  usage?: { tokens: number; cost?: { amount: string; currency: string; paidAmount?: string; nominalAmount?: string }; elapsedMs: number };
  skipped?: Card[];
  preset?: Approach;
  limits?: Limits;
  /** A completed run with a receipt: its class and whether a model judge approved an item. */
  provenance?: { class: ProvenanceClass; judge: boolean };
  /** A run stopped at the user's limit: which, and where its best verified result is. */
  limit?: { kind: 'money' | 'minutes' | 'requests'; best: 'current' | 'earlier' | 'none' };
  /** C1b: the agent's own test that could become the project's check. */
  checkOffer?: { command: string };
}

export interface Project {
  id: string;
  name: string;
  path: string;
  demo: boolean;
  branch?: string;
  exists: boolean;
  open: boolean;
}

export interface Account {
  id: string;
  provider: string;
  name: string;
  kind: 'oauth' | 'key' | 'env' | 'local' | 'custom' | 'demo';
  enabled: boolean;
  usable: boolean;
  state?: 'ok' | 'expired';
  account?: string;
  variable?: string;
  baseUrl?: string;
  model?: string;
  models?: number;
  reachable?: boolean;
  signedIn?: boolean;
}

export interface Preset {
  provider: string;
  name: string;
  methods: ('signin' | 'key' | 'local' | 'custom')[];
  keyUrl?: string;
  code?: boolean;
  baseUrl?: string;
}

export interface UsableModel {
  ref: string;
  id: string;
  name: string;
  provider: string;
  account: string;
  recommended: boolean;
  /** `unpriced`: a subscription model without an official price, so no money accounting (C16). */
  price?: 'unpriced' | 'free' | '$' | '$$' | '$$$';
  /** A subscription model's price is its official one: spend at it is nominal, not paid (C16). */
  nominal?: boolean;
  context?: number;
  efforts: Effort[];
  demo: boolean;
}

export interface Preferences {
  theme: 'system' | 'light' | 'dark';
  notify: boolean | null;
  sendWith: 'enter' | 'ctrl-enter';
  language: 'en' | 'ru';
  defaultModel: string | null;
  defaultEffort: Effort;
  defaultMode: Mode;
  taskLimits: Limits;
  defaultPreset: Approach;
  maxTasks: number;
  demoMode: boolean;
  lastProject: string | null;
  firstTaskDone: boolean;
}

export interface Host {
  version: string;
  agentVersion: string;
  dataDir: string;
  demoMode: boolean;
  platformSupported: boolean;
  security: boolean;
}

export interface AppSnapshot {
  accounts: Account[];
  defaultModel: UsableModel | null;
  preferences: Preferences;
  projects: Project[];
  tasks: Task[];
  needsYou: number;
  host: Host;
  appSeq: number;
}

export interface LoginSession {
  loginId: string;
  provider: string;
  name: string;
  method: 'browser' | 'code';
  state: 'starting' | 'waiting_for_browser' | 'waiting_for_code' | 'finishing' | 'connected' | 'cancelled' | 'timed_out' | 'failed';
  url?: string;
  userCode?: string;
  verificationUri?: string;
  expiresAt?: string;
  fallback?: string;
  error?: ErrorInfo;
  result?: { provider: string; name: string; model?: UsableModel | null; warning?: ErrorInfo };
}

export interface ChangedFile { path: string; kind: string; added?: number; removed?: number; binary?: boolean; renamedFrom?: string; }

export interface TaskChanges { available: boolean; files: ChangedFile[]; earlier: ChangedFile[]; }

export interface OutputEntry { id: string; workId: string; command: string; check: boolean; at: string; status: string; durationMs?: number; output?: number; }

export interface PlanStep { n: number; text: string; state: 'done' | 'now' | 'todo' | 'skipped'; }

export interface CheckResult { at: string; outcome: string; command: string; acceptance: boolean; passed?: number; failed?: number; skipped?: number; }

export interface Progress { available: boolean; plan: PlanStep[]; checks: CheckResult[]; }

export interface ProjectSettingsDto {
  projectId: string;
  checks: Record<'test' | 'build' | 'lint', { value: string; source: 'saved' | 'detected' | 'none'; detected?: string }>;
  manifest?: string;
  instructions: { file?: string; use: boolean };
  allowed: string[];
  protectedFiles: string[];
  protectedDefault: boolean;
}

export interface FolderListing {
  roots: string[];
  home: string;
  path: string;
  name: string;
  git: boolean;
  insideGit: boolean;
  parent?: string;
  breadcrumb: { name: string; path: string }[];
  folders: { name: string; path: string; git: boolean }[];
  more: boolean;
  unreadable?: boolean;
  recent: { name: string; path: string }[];
}
