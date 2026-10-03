import { Card, ProvenanceClass, Task } from '../../core/model';
import { limitKindOf } from './limits';

// The acceptance card (B3) and the "Verified" line of the result: which answers the user has, and how a result was
// checked. Pure, so the rules are tested without a view.

export type AcceptanceDecision = 'done' | 'rework';

export interface AcceptanceChoice { decision: AcceptanceDecision; label: string; primary: boolean; }

/**
 * The two buttons of an acceptance card, in their order: after a rejecting review, fixing comes first; a test change only
 * the user may approve (C11) reads "Approve the test change" / "Reject".
 */
export function acceptanceChoices(card: Pick<Card, 'variant'>): AcceptanceChoice[] {
  if (card.variant === 'integrity') {
    return [{ decision: 'done', label: 'action.approve_test_change', primary: true }, { decision: 'rework', label: 'action.reject_test_change', primary: false }];
  }
  return card.variant === 'rejected'
    ? [{ decision: 'rework', label: 'action.continue_fixing', primary: true }, { decision: 'done', label: 'action.accept_as_is', primary: false }]
    : [{ decision: 'done', label: 'action.acceptance_done', primary: true }, { decision: 'rework', label: 'action.acceptance_rework', primary: false }];
}

// C11 (D-404): under "human" approval of test changes the user, never a model, approves a change to the tests the
// required checks run. The review card answers with the user's verdict; the model's, if any, is shown beside it.

export type ReviewDecision = 'approve' | 'reject';

export interface ReviewChoice { decision: ReviewDecision; label: string; primary: boolean; }

/** The two buttons of a review card. */
export function reviewChoices(): ReviewChoice[] {
  return [{ decision: 'approve', label: 'action.approve_test_change', primary: true }, { decision: 'reject', label: 'action.reject_test_change', primary: false }];
}

/** The body of `POST /tasks/{id}/cards/{cardId}` for a review answer; the user's words only for a rejection. */
export function reviewBody(decision: ReviewDecision, text?: string): { decision: ReviewDecision; answer?: string } {
  const answer = decision === 'reject' ? text?.trim() : undefined;
  return answer ? { decision, answer } : { decision };
}

export interface TestChange { path: string; checks: string[]; reason?: string; }

/** The changed tests a card asks about; the agent's reason only on a review card (an acceptance item's is the agent's log). */
export function testChanges(card: Pick<Card, 'kind' | 'items'>): TestChange[] {
  return (card.items ?? []).filter(i => !!i.path).map(i => ({
    path: i.path as string,
    checks: i.checks ?? [],
    ...(card.kind === 'review' && i.reason ? { reason: i.reason } : {}),
  }));
}

/** The catalog key of the model's verdict attached to the card: it approves, asks for changes, or could not tell. */
export function modelVerdictKey(outcome: string | undefined): string {
  switch (outcome) {
    case 'approve': return 'card.model.approve';
    case 'revise': case 'reject': return 'card.model.revise';
    default: return 'card.model.unsure';
  }
}

/** The body of `POST /tasks/{id}/cards/{cardId}` for an acceptance answer. */
export function acceptanceBody(decision: AcceptanceDecision, text?: string): { decision: AcceptanceDecision; answer?: string } {
  const answer = decision === 'rework' ? text?.trim() : undefined;
  return answer ? { decision, answer } : { decision };
}

/** A result nobody checked automatically can be sent back: "Not done — rework it" asks for a follow-up message. */
export function reworkable(kind: Task['verified'] | string | undefined): boolean {
  return kind === 'unverified' || kind === 'user';
}

/**
 * A done task whose result no check passed (F5): it reads "Done · not verified", never a plain "Done". With the core's
 * provenance class (C4) only an independent check counts: the agent's own test or a model judge's approval does not.
 */
export function doneUnverified(state: string | undefined, kind: Task['verified'] | string | undefined, provenance?: ProvenanceClass): boolean {
  if (provenance) return state === 'done' && provenance !== 'independent';
  return state === 'done' && kind !== 'answer' && !verifiedOf(kind).ok;
}

/** The catalog key of a task's state, with the qualifiers of [doneUnverified] and of a stop at the user's limit. */
export function stateKey(state: string | undefined, kind: Task['verified'] | string | undefined, provenance?: ProvenanceClass, reason?: string): string {
  if (state === 'paused' && limitKindOf(reason)) return 'state.paused_limit';
  if (state === 'done' && provenance === 'agent_test') return 'state.done_agent_test';
  return doneUnverified(state, kind, provenance) ? 'state.done_unverified' : 'state.' + state;
}

/** How the result was checked: the catalog key, whether it counts as verified (✓), whether it has an output. */
export function verifiedOf(kind: Task['verified'] | string | undefined): { key: string; ok: boolean; output: boolean } {
  switch (kind) {
    case 'tests': return { key: 'checks.passed', ok: true, output: true };
    case 'review': return { key: 'verified.review', ok: true, output: false };
    case 'build': return { key: 'verified.build', ok: true, output: true };
    case 'user': return { key: 'verified.user', ok: false, output: false };
    case 'unverified': return { key: 'verified.unverified', ok: false, output: false };
    case 'answer': return { key: 'verified.answer', ok: false, output: false };
    default: return { key: 'verified.none', ok: false, output: false };
  }
}
