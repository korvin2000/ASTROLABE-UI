import { Card, Task } from '../../core/model';

// The acceptance card (B3) and the "Verified" line of the result: which answers the user has, and how a result was
// checked. Pure, so the rules are tested without a view.

export type AcceptanceDecision = 'done' | 'rework';

export interface AcceptanceChoice { decision: AcceptanceDecision; label: string; primary: boolean; }

/** The two buttons of an acceptance card, in their order: after a rejecting review, fixing comes first. */
export function acceptanceChoices(card: Pick<Card, 'variant'>): AcceptanceChoice[] {
  return card.variant === 'rejected'
    ? [{ decision: 'rework', label: 'action.continue_fixing', primary: true }, { decision: 'done', label: 'action.accept_as_is', primary: false }]
    : [{ decision: 'done', label: 'action.acceptance_done', primary: true }, { decision: 'rework', label: 'action.acceptance_rework', primary: false }];
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

/** A done task whose result no check passed (F5): it reads "Done · not verified", never a plain "Done". */
export function doneUnverified(state: string | undefined, kind: Task['verified'] | string | undefined): boolean {
  return state === 'done' && kind !== 'answer' && !verifiedOf(kind).ok;
}

/** The catalog key of a task's state, with the "not verified" qualifier of [doneUnverified]. */
export function stateKey(state: string | undefined, kind: Task['verified'] | string | undefined): string {
  return doneUnverified(state, kind) ? 'state.done_unverified' : 'state.' + state;
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
