import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

// Status glyphs (§21.3): custom 12 px SVG with a 1.5 px stroke — never emoji — always paired with a word in the
// accessible name. Colour is never the only carrier of state (R-OVR-07).

export type GlyphKind =
  | 'running' | 'verified' | 'current' | 'stale' | 'unknown' | 'failed' | 'refused' | 'needs_you' | 'waiting' | 'blocked'
  | 'budget' | 'inconclusive' | 'notrun' | 'pending' | 'cancelled' | 'hypothesis' | 'refuted' | 'opening' | 'interrupted' | 'lock';

export function glyphFor(status: string | null | undefined): GlyphKind {
  switch ((status ?? '').toLowerCase()) {
    case 'running': case 'finishing': case 'active': case 'in_progress': case 'inprogress': case 'selected': return 'running';
    case 'completed': case 'verified': case 'passed': case 'green': case 'ok': case 'done': case 'approved': case 'accepted': case 'answered': return 'verified';
    case 'current': return 'current';
    case 'stale': return 'stale';
    case 'failed': case 'red': case 'error': case 'open_failed': return 'failed';
    case 'refused': case 'rejected': case 'denied': case 'declined': return 'refused';
    case 'needs_you': return 'needs_you';
    case 'waiting_for_input': case 'waiting_for_process': case 'waiting': return 'waiting';
    case 'blocked_external': case 'blocked': case 'partial': return 'blocked';
    case 'budget_exhausted': return 'budget';
    case 'inconclusive': return 'inconclusive';
    case 'not_run': case 'notrun': case 'unavailable': case 'not_assessed': case 'not_reviewed': case 'missing_evidence': return 'notrun';
    case 'pending': case 'todo': case 'queued': return 'pending';
    case 'cancelled': case 'cancelling': case 'superseded': case 'expired': return 'cancelled';
    case 'opening': return 'opening';
    case 'interrupted': case 'lost': return 'interrupted';
    case 'locked': return 'lock';
    case 'h': case 'hypothesis': return 'hypothesis';
    case 'x': case 'refuted': return 'refuted';
    default: return 'unknown';
  }
}

const COLORS: Record<GlyphKind, string> = {
  running: 'var(--accent)', verified: 'var(--success)', current: 'var(--success)', stale: 'var(--attention)', unknown: 'var(--neutral-mark)',
  failed: 'var(--danger)', refused: 'var(--danger)', needs_you: 'var(--attention)', waiting: 'var(--attention)', blocked: 'var(--attention)',
  budget: 'var(--attention)', inconclusive: 'var(--neutral-mark)', notrun: 'var(--neutral-mark)', pending: 'var(--neutral-mark)',
  cancelled: 'var(--neutral-mark)', hypothesis: 'var(--text-secondary)', refuted: 'var(--neutral-mark)', opening: 'var(--accent)',
  interrupted: 'var(--neutral-mark)', lock: 'var(--text-secondary)',
};

const WORDS: Record<GlyphKind, string> = {
  running: 'running', verified: 'verified', current: 'current', stale: 'stale', unknown: 'unknown', failed: 'failed', refused: 'refused',
  needs_you: 'needs you', waiting: 'waiting', blocked: 'blocked', budget: 'budget exhausted', inconclusive: 'inconclusive', notrun: 'not run',
  pending: 'pending', cancelled: 'cancelled', hypothesis: 'hypothesis', refuted: 'refuted', opening: 'opening', interrupted: 'interrupted', lock: 'locked',
};

@Component({
  selector: 'as-glyph',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.title]': 'label() ?? word()', role: 'img', '[attr.aria-label]': 'label() ?? word()', '[class.pulse]': 'pulse() && kind() === "running"' },
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 12 12" fill="none" [attr.stroke]="color()" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      @switch (kind()) {
        @case ('running') { <circle cx="6" cy="6" r="3.2" [attr.fill]="color()" stroke="none"/> }
        @case ('opening') { <circle cx="6" cy="6" r="4" stroke-dasharray="2 1.6"/> }
        @case ('verified') { <path d="M2.5 6.3 5 8.6 9.6 3.5"/> }
        @case ('current') { <circle cx="6" cy="6" r="3.4" [attr.fill]="color()" stroke="none"/> }
        @case ('stale') { <circle cx="6" cy="6" r="4" stroke-dasharray="1.8 1.6"/> }
        @case ('unknown') { <circle cx="6" cy="6" r="4.4"/><path d="M4.9 4.9a1.2 1.2 0 1 1 1.6 1.1c-.4.2-.5.4-.5.8M6 8.3v.05"/> }
        @case ('failed') { <path d="M3.2 3.2l5.6 5.6M8.8 3.2 3.2 8.8"/> }
        @case ('refused') { <circle cx="6" cy="6" r="4.2"/><path d="M3.1 8.9l5.8-5.8"/> }
        @case ('needs_you') { <path d="M3 10.5V1.8M3 2.2h6l-1.4 2 1.4 2H3"/> }
        @case ('waiting') { <circle cx="6" cy="6" r="4.2"/><path d="M6 1.8a4.2 4.2 0 0 1 0 8.4z" [attr.fill]="color()"/> }
        @case ('blocked') { <path d="M4.3 3v6M7.7 3v6"/> }
        @case ('budget') { <circle cx="6" cy="6" r="4.2"/><path d="M6 1.8V6h4.2" [attr.fill]="color()"/> }
        @case ('inconclusive') { <path d="M2.4 4.8c1.2-1 2.4 1 3.6 0s2.4 1 3.6 0M2.4 7.8c1.2-1 2.4 1 3.6 0s2.4 1 3.6 0"/> }
        @case ('notrun') { <path d="M3 6h6"/> }
        @case ('pending') { <circle cx="6" cy="6" r="3.6"/> }
        @case ('cancelled') { <circle cx="6" cy="6" r="4.2"/><path d="M3.1 8.9l5.8-5.8"/> }
        @case ('hypothesis') { <path d="M6 1.9 10.1 6 6 10.1 1.9 6z"/> }
        @case ('refuted') { <path d="M3.2 3.2l5.6 5.6M8.8 3.2 3.2 8.8"/> }
        @case ('interrupted') { <path d="M4.3 3v6M7.7 3v6"/> }
        @case ('lock') { <path d="M3 5.5h6v4.8H3zM4.2 5.5V4a1.8 1.8 0 0 1 3.6 0v1.5"/> }
      }
    </svg>`,
  styles: [`:host{display:inline-flex;flex:none;line-height:0;vertical-align:middle}
    :host(.pulse) svg{animation:as-pulse 1.6s ease-in-out infinite}
    @keyframes as-pulse{0%,100%{opacity:1}50%{opacity:.55}}`],
})
export class Glyph {
  readonly status = input<string | null | undefined>(null);
  readonly glyph = input<GlyphKind | null>(null);
  readonly label = input<string | null>(null);
  readonly size = input(12);
  readonly pulse = input(false);
  readonly kind = computed<GlyphKind>(() => this.glyph() ?? glyphFor(this.status()));
  readonly color = computed(() => COLORS[this.kind()]);
  readonly word = computed(() => WORDS[this.kind()]);
}

/** The astrolabe rete app mark (§21.1): a circle, eight ticks and a pointer. */
@Component({
  selector: 'as-mark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <circle cx="16" cy="16" r="10.5" stroke="var(--accent)" stroke-width="1.6"/>
    <circle cx="16" cy="16" r="5.6" stroke="var(--accent)" stroke-width="1.2" opacity=".5"/>
    <g stroke="var(--text-tertiary)" stroke-width="1.4" stroke-linecap="round"><path d="M16 3.6v2.6M16 25.8v2.6M3.6 16h2.6M25.8 16h2.6M7.2 7.2l1.8 1.8M23 23l1.8 1.8M7.2 24.8 9 23M23 9l1.8-1.8"/></g>
    <path d="M16 16 23.5 8.5" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/>
    <circle cx="16" cy="16" r="1.9" fill="var(--accent)"/></svg>`,
  styles: [':host{display:inline-flex;line-height:0}'],
})
export class Mark {
  readonly size = input(22);
}
