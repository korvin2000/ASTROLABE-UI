// Wire types of the Studio protocol (spec §29). ASTROLABE's own JSON is passed through verbatim (`any`-shaped
// mirrors are narrowed where the UI reads them). Unknown enum values must never crash the client (§3.4).

export interface Ids { work: string; attempt?: string; candidate?: string | null; context?: string | null; }

/** One item of a campaign stream (§3.5): bus event, journal row, derived or Studio item. */
export interface StudioItem {
  seq?: number;
  at: string;
  source: 'bus' | 'journal' | 'derived' | 'studio';
  kind: string;
  ids: Ids;
  cell?: string;
  turn?: number;
  phase?: string;
  span?: string;
  parent?: string;
  busSeq?: number;
  ephemeral?: boolean;
  reconstructed?: boolean;
  data: any;
}

export interface AppItem { seq: number; at: string; kind: string; data: any; }

export interface Action { name: string; enabled: boolean; reason?: string; }

export type DisplayStatus =
  | 'opening' | 'open_failed' | 'running' | 'needs_you' | 'finishing' | 'cancelling' | 'completed'
  | 'waiting_for_input' | 'waiting_for_process' | 'blocked_external' | 'budget_exhausted' | 'cancelled'
  | 'failed' | 'interrupted' | 'unknown' | string;

export interface CampaignSummary {
  workId: string;
  projectId: string;
  title: string | null;
  phase: string | null;
  outcome: string | null;
  reason: string | null;
  shape: string | null;
  mode: string | null;
  fingerprint: string | null;
  demo: boolean;
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  archived: boolean;
  parentWork: string | null;
  displayStatus: DisplayStatus;
  live: boolean;
  attached: boolean;
  attemptId: string;
  pendingDecisions: number;
  resumable: boolean;
  contractVersion?: number;
  leaseExpiresAt?: string;
  allowedActions: Action[];
}

export interface Project {
  id: string; name: string; path: string; demo: boolean; pinned: boolean; addedAt: string; openedAt?: string;
  open: boolean; stateRoot?: string; runningWork?: string; branch?: string; exists: boolean;
}

export interface DecisionDto {
  id: string;
  kind: 'question' | 'effect' | 'publication' | 'plan_acceptance' | 'amendment' | 'kb_admission' | 'review' | string;
  projectId: string | null;
  workId: string | null;
  cellId: string | null;
  contractRevision?: number;
  request: any;
  status: 'pending' | 'answered' | 'declined' | 'superseded' | 'expired' | 'policy' | string;
  reply?: any;
  byAuthority?: string | null;
  reason?: string | null;
  createdAt: string;
  answeredAt?: string | null;
  leaseExpiresAt?: string | null;
}

export interface Provider {
  id: string; name: string; preset: string; baseUrl: string; demo: boolean; apis: string[]; apiKeyUrl?: string;
  keyless: boolean; authMethods: string[]; auth: { state: string; type?: string; source?: string; expiresAt?: string; account?: string; error?: string };
  models: number; lastTest?: any; fields?: FieldDescriptor[];
}

export interface FieldDescriptor { key: string; label: string; kind: string; required: boolean; defaultValue?: string; help?: string; group?: string; choices?: string[]; min?: number; max?: number; unit?: string; }

export interface ProfileDto { id: string; profile: any; state: string; demo: boolean; updatedAt?: string; qualification?: any; }

export interface HostInfo {
  studioVersion: string; astrolabeVersion: string; schemaVersion: number; aiGateVersion: string; jdk: string; os: string;
  platformSupported: boolean; dataDir: string; credentialStorage: string; security: boolean; epoch: string; fixtures: boolean;
  counters: Record<string, number>;
}

export interface Bootstrap {
  host: HostInfo;
  projects: Project[];
  campaigns: CampaignSummary[];
  decisions: DecisionDto[];
  providers: Provider[];
  profiles: ProfileDto[];
  runtime: any;
  config: { profileRoles: { main: string; helper: string | null; escalation: string | null }; mode: string; ceiling: string; dClass: string;
    executionMode: string; unknownOutcomeReconciliation: string; campaignCells: number; turnsPerCell: number; alpha: number; registerCapTokens: number };
  settingsRevision: number;
  appSeq: number;
}

export interface ApiError { code: string; message: string; requestId?: string; retryable?: boolean; fieldErrors?: { path: string; message: string }[]; currentRevision?: number; gap?: string; details?: any; }

/** A parsed result envelope header `⟦result #n tool=… class=… v={…} … status=…⟧` (§2.7). */
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

export interface StoredRow<T = any> { table: string; key: string; identities: Ids; schemaVersion: number; createdAt: string; body: T; }
