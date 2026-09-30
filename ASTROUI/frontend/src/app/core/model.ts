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
  kind: 'question' | 'approval' | 'suggestion' | 'acceptance';
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
  /** Acceptance: the result could not be checked (`unverified`) or a review rejected it after one rework round. */
  variant?: 'unverified' | 'rejected';
  items?: { reason: string; status: string; findings: { severity: string; location: string; issue: string }[] }[];
  summary?: string;
}

export interface TaskRun {
  workId: string;
  startedAt: string;
  endedAt?: string;
  outcome: string | null;
  request: string | null;
  state: TaskState;
  reason?: ErrorInfo;
}

export interface Verification { kind: 'tests' | 'review' | string; source: string; command?: string | null; }

export interface Task {
  id: string;
  projectId: string;
  title: string;
  state: TaskState;
  reason?: ErrorInfo;
  verified: 'tests' | 'build' | 'review' | 'user' | 'unverified' | 'answer' | 'none';
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
  usage?: { tokens: number; cost?: { amount: string; currency: string }; elapsedMs: number };
  skipped?: Card[];
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
  price?: 'included' | 'free' | '$' | '$$' | '$$$';
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
  limit: { kind: 'auto' | 'tokens' | 'money'; value?: string };
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
