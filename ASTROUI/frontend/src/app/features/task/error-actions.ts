// The actions of every error and pause reason (section 10): at most two per card, the first is the primary one.

export type ActionId =
  | 'connect' | 'sign_in' | 'replace_key' | 'retry' | 'change_model' | 'choose_folder' | 'remove_project' | 'init_git'
  | 'open_task' | 'stop_other' | 'set_checks' | 'review_pass' | 'copy_details' | 'continue_more' | 'stop' | 'continue' | 'show_output'
  | 'raise_limit';

const ACTIONS: Record<string, ActionId[]> = {
  account_missing: ['connect'],
  auth_expired: ['sign_in', 'retry'],
  auth_rejected: ['replace_key', 'retry'],
  rate_limited: ['retry', 'change_model'],
  quota_exhausted: ['change_model'],
  provider_unreachable: ['retry', 'change_model'],
  model_unavailable: ['change_model'],
  project_not_found: ['choose_folder', 'remove_project'],
  not_a_git_repo: ['init_git'],
  project_busy: ['open_task', 'stop_other'],
  project_locked: ['retry'],
  no_verification: ['set_checks', 'review_pass'],
  start_timeout: ['retry'],
  agent_error: ['retry', 'copy_details'],
  limit_reached: ['continue_more', 'stop'],
  // C4: the user's own limit; raising it continues the same run with what it spent.
  limit_money: ['raise_limit', 'stop'],
  limit_minutes: ['raise_limit', 'stop'],
  limit_requests: ['raise_limit', 'stop'],
  command_timeout: ['retry'],
  context_too_large: ['change_model'],
  checks_failed: ['retry', 'show_output'],
  too_many_tasks: ['retry'],
  needs_answer: ['continue'],
  waiting_for_process: ['continue'],
  blocked: ['continue'],
  interrupted: ['continue'],
  // The run waits for the user's word on its result: the acceptance card answers it, never Continue.
  acceptance_decision: ['copy_details'],
  review_rejected: ['copy_details'],
};

/** The actions of [code]; a code nobody knows is an agent error (section 10 rule 3). */
export function actionsOf(code: string): ActionId[] {
  return ACTIONS[code] ?? ACTIONS['agent_error'];
}

export const ERROR_CODES: readonly string[] = Object.keys(ACTIONS);
