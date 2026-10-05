import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, HostListener, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { I18n, TPipe } from '../../i18n/i18n';
import { AppStore } from '../../state/app.store';
import { TaskStore } from '../../state/task.store';
import { CardItem, ChecksItem, ErrorItem, ResultItem } from '../../timeline/timeline';
import { sentence } from '../../ui/error-line';
import { MarkdownPipe } from '../../ui/markdown';
import { usageText } from '../../ui/units';
import { AcceptanceDecision, ReviewDecision, acceptanceChoices, acceptanceHint, modelVerdictKey, reviewChoices, reworkable, scratchRoots, testChanges, verifiedOf } from './acceptance';
import { ActionId, actionsOf } from './error-actions';
import { limitKindOf } from './limits';
import { TaskActions } from './task-actions';

// The cards of the conversation (section 7.5, 7.8, 10): question, approval, suggestion, review, checks, error and result.
// A waiting card takes the focus when it appears; keys 1–9 choose an option once the card has the focus.

/** Question, approval or suggestion; collapsed to one line once it is answered. */
@Component({
  selector: 'as-ask-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe, NgTemplateOutlet],
  template: `
    @if (item().status === 'pending') {
      <section class="card attn" tabindex="-1" role="group" [attr.aria-label]="('card.' + card().kind) | t">
        <div class="k">{{ ('card.' + card().kind) | t }}</div>
        @switch (card().kind) {
          @case ('question') {
            <h3>{{ card().text }}</h3>
            <div class="row">
              @for (o of card().options ?? []; track $index) {
                <button class="btn" [disabled]="actions.busy()" (click)="actions.answer(card(), $index)"><kbd>{{ $index + 1 }}</kbd>{{ o }}</button>
              }
              <span class="muted small">{{ ((card().options ?? []).length ? 'card.or_type' : 'card.type') | t }}</span>
            </div>
          }
          @case ('approval') {
            <h3>{{ ('effect.' + (card().effect ?? 'other')) | t }}</h3>
            <div class="cmd">{{ card().command }}</div>
            @if (card().why) { <p class="muted">{{ card().why }}</p> }
            <div class="row">
              <button class="btn pri" [disabled]="actions.busy()" (click)="actions.decide(card(), 'allow_once')"><kbd>1</kbd>{{ 'action.allow_once' | t }}</button>
              <button class="btn" [disabled]="actions.busy()" (click)="actions.decide(card(), 'allow_always')" [title]="'card.always_hint' | t: { pattern: card().pattern }"><kbd>2</kbd>{{ 'action.allow_always' | t }}</button>
              <button class="btn ghost" [disabled]="actions.busy()" (click)="actions.decide(card(), 'deny')"><kbd>3</kbd>{{ 'action.deny' | t }}</button>
            </div>
          }
          @case ('suggestion') {
            <h3>{{ 'card.suggests' | t }}</h3>
            <p>{{ card().text }}</p>
            @if (card().relaxes) { <p class="warn">{{ 'card.relaxes' | t }}</p> }
            <div class="row">
              <button class="btn pri" [disabled]="actions.busy()" (click)="accept()"><kbd>1</kbd>{{ (card().relaxes && armed() ? 'action.accept_anyway' : 'action.accept') | t }}</button>
              <button class="btn" [disabled]="actions.busy()" (click)="actions.decide(card(), 'decline')"><kbd>2</kbd>{{ 'action.decline' | t }}</button>
            </div>
          }
          @case ('review') {
            <h3>{{ (card().variant === 'integrity' ? 'card.integrity_title' : 'card.review_title') | t }}</h3>
            <ng-container *ngTemplateOutlet="changed" />
            <div class="row">
              @for (c of reviewChoices; track c.decision) {
                <button class="btn" [class.pri]="c.primary" [disabled]="actions.busy() || sent()" (click)="answerReview(c.decision)"><kbd>{{ $index + 1 }}</kbd>{{ c.label | t }}</button>
              }
            </div>
          }
          @case ('acceptance') {
            @if (card().variant === 'integrity') {
              <h3>{{ 'card.integrity_title' | t }}</h3>
              <ng-container *ngTemplateOutlet="changed" />
            } @else if (card().variant === 'rejected') {
              <h3>{{ 'card.acceptance_rejected' | t }}</h3>
              <ul class="findings">
                @for (f of findings(); track $index) {
                  <li><span class="sev" [class.bad]="f.severity === 'blocker'">{{ f.label }}</span>@if (f.location) { <code>{{ f.location }}</code> }<span>{{ f.issue }}</span></li>
                }
                @empty { @if (reasons()) { <li>{{ reasons() }}</li> } }
              </ul>
            } @else {
              <h3>{{ 'card.acceptance_unverified' | t: { reasons: reasons() } }}</h3>
            }
            <div class="row">
              @for (c of choices(); track c.decision) {
                <button class="btn" [class.pri]="c.primary" [disabled]="actions.busy() || sent()" (click)="settle(c.decision)"><kbd>{{ $index + 1 }}</kbd>{{ c.label | t }}</button>
              }
              @if (card().note || card().variant !== 'rejected') { <span class="muted small">{{ hint().key | t: hint().params }}</span> }
            </div>
          }
        }
      </section>
    } @else {
      <div class="done">
        <span class="muted">{{ ('card.' + card().kind) | t }}:</span>
        @if (card().kind === 'review') { <span>{{ paths() }}</span> }
        @else if (card().kind !== 'acceptance') { <span>{{ card().kind === 'approval' ? card().command : card().text }}</span> }
        <span class="muted">— {{ outcome() }}</span>
      </div>
    }
    <!-- C11: the changed tests, the checks they affect, the agent's reason and the model's verdict beside them. -->
    <ng-template #changed>
      <ul class="tests">
        @for (t of tests(); track t.path) {
          <li>
            <code>{{ t.path }}</code>
            @if (t.checks.length) { <div class="muted small">{{ 'card.integrity_checks' | t: { checks: t.checks.join(', ') } }}</div> }
            @if (t.reason) { <div class="muted small">{{ 'card.integrity_reason' | t: { reason: t.reason } }}</div> }
          </li>
        }
      </ul>
      @if (card().model; as m) {
        <p class="muted small">{{ modelKey() | t }}@if (m.summary) { {{ m.summary }} }</p>
        @if (modelFindings().length) {
          <ul class="findings">
            @for (f of modelFindings(); track $index) {
              <li><span class="sev" [class.bad]="f.severity === 'blocker'">{{ f.label }}</span>@if (f.location) { <code>{{ f.location }}</code> }<span>{{ f.issue }}</span></li>
            }
          </ul>
        }
      } @else if (attached()) {
        <p class="muted small">{{ 'card.model.attached' | t }}</p>
      }
      <p class="muted small">{{ 'card.integrity_note' | t }}</p>
    </ng-template>`,
  styles: [`
    .done { margin: 10px 0; padding-left: 10px; border-left: 2px solid var(--border); font-size: 13px; }
    .done span + span { margin-left: 5px; }
    .findings { margin: 0 0 12px; padding-left: 18px; font-size: 13px; }
    .findings li + li { margin-top: 4px; }
    .findings li > * + * { margin-left: 6px; }
    .tests { margin: 0 0 10px; padding-left: 18px; font-size: 13px; }
    .tests li + li { margin-top: 4px; }
    .sev { font-weight: 600; color: var(--warn); }
    .sev.bad { color: var(--bad); }
  `],
})
export class AskCard {
  readonly actions = inject(TaskActions);
  private readonly i18n = inject(I18n);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly item = input.required<CardItem>();
  /** Bumped by the owner when the timeline changed; the item itself is mutable. */
  readonly version = input(0);
  readonly card = computed(() => this.item().card);
  readonly armed = signal(false);
  /** An acceptance card was answered; its buttons stay off until the timeline collapses it. */
  readonly sent = signal(false);

  readonly choices = computed(() => acceptanceChoices(this.card()));
  // The card is mutable in the timeline (a note arrives after it, WF-8): follow the owner's version.
  readonly hint = computed(() => { this.version(); return acceptanceHint(this.item().card); });
  readonly reasons = computed(() => (this.card().items ?? []).map(i => i.reason).filter(Boolean).join('; '));
  readonly findings = computed(() => this.labelled((this.card().items ?? []).flatMap(i => i.findings ?? [])));
  readonly reviewChoices = reviewChoices();
  readonly tests = computed(() => testChanges(this.card()));
  readonly paths = computed(() => this.tests().map(t => t.path).join(', '));
  readonly modelKey = computed(() => modelVerdictKey(this.card().model?.outcome));
  readonly modelFindings = computed(() => this.labelled(this.card().model?.findings ?? []));
  /** A model's verdict the agent's runtime attached to an item (its signer is internal; the user sees that one exists). */
  readonly attached = computed(() => (this.card().items ?? []).some(i => !!i.by));

  private labelled(findings: { severity: string; location: string; issue: string }[]) {
    this.i18n.lang();
    return findings.map(f => {
      const key = 'card.severity.' + f.severity;
      return { ...f, label: this.i18n.has(key) ? this.i18n.t(key) : f.severity };
    });
  }

  readonly outcome = computed(() => {
    this.version();
    const item = this.item();
    if (item.status === 'expired' || item.status === 'superseded') return this.i18n.t('card.expired');
    if (item.card.kind === 'question') return item.answer ?? this.i18n.t('card.no_answer');
    if (item.card.kind === 'review') {
      return this.i18n.t(item.decision === 'approved' ? 'card.approved_change' : item.decision === 'rejected' ? 'card.rejected_change' : 'card.no_answer');
    }
    if (item.card.kind === 'acceptance' && item.card.variant === 'integrity') {
      if (item.decision === 'done') return this.i18n.t('card.approved_change');
      if (item.decision === 'rework') return item.answer ? this.i18n.t('card.acceptance_rework_text', { text: item.answer }) : this.i18n.t('card.rejected_change');
      return this.i18n.t('card.expired');
    }
    if (item.card.kind === 'acceptance') {
      if (item.decision === 'done') return this.i18n.t('card.acceptance_done');
      if (item.decision !== 'rework') return this.i18n.t('card.expired');
      return item.answer ? this.i18n.t('card.acceptance_rework_text', { text: item.answer }) : this.i18n.t('card.acceptance_rework');
    }
    return this.i18n.t('card.' + (item.decision ?? (item.status === 'declined' ? 'denied' : 'allowed')));
  });

  constructor() {
    // Focus moves to a new question or approval card (section 11).
    afterNextRender(() => {
      const card = this.host.nativeElement.querySelector<HTMLElement>('.card');
      if (card && Date.now() - Date.parse(this.item().at) < 10_000) card.focus({ preventScroll: false });
    });
  }

  /** A suggestion that makes the task easier to pass needs a second click. */
  accept(): void {
    if (this.card().relaxes && !this.armed()) { this.armed.set(true); return; }
    void this.actions.decide(this.card(), 'accept', this.armed());
  }

  async answerReview(decision: ReviewDecision): Promise<void> {
    if (this.sent()) return;
    this.sent.set(true);
    if (!(await this.actions.review(this.card(), decision))) this.sent.set(false);
  }

  async settle(decision: AcceptanceDecision): Promise<void> {
    if (this.sent()) return;
    this.sent.set(true);
    // A failed request leaves the card open: the user may answer again.
    if (!(await this.actions.settle(this.card(), decision))) this.sent.set(false);
  }

  @HostListener('keydown', ['$event'])
  key(ev: KeyboardEvent): void {
    if (this.item().status !== 'pending' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if ((ev.target as HTMLElement).tagName !== 'SECTION') return;
    const n = Number(ev.key);
    if (!Number.isInteger(n) || n < 1 || n > 9) return;
    const card = this.card();
    if (card.kind === 'question') {
      if (n <= (card.options?.length ?? 0)) { ev.preventDefault(); void this.actions.answer(card, n - 1); }
    } else if (card.kind === 'approval') {
      const d = (['allow_once', 'allow_always', 'deny'] as const)[n - 1];
      if (d) { ev.preventDefault(); void this.actions.decide(card, d); }
    } else if (card.kind === 'acceptance') {
      const c = this.choices()[n - 1];
      if (c) { ev.preventDefault(); void this.settle(c.decision); }
    } else if (card.kind === 'review') {
      const c = this.reviewChoices[n - 1];
      if (c) { ev.preventDefault(); void this.answerReview(c.decision); }
    } else if (n === 1) { ev.preventDefault(); this.accept(); }
    else if (n === 2) { ev.preventDefault(); void this.actions.decide(card, 'decline'); }
  }
}

/** "Tests passed (24)" or "Tests failed (2 of 24)" with "Show output". */
@Component({
  selector: 'as-checks-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe],
  template: `
    <div class="checks">
      <span [class.ok]="item().passed" [class.bad]="!item().passed" aria-hidden="true">{{ item().passed ? '✓' : '!' }}</span>
      <span>{{ text() }}</span>
      @if (item().output) { <button class="lnk" (click)="actions.show({ panel: 'output', output: item().workId + ':' + item().output })">{{ 'action.show_output' | t }}</button> }
    </div>`,
  styles: ['.checks { display: flex; gap: 8px; align-items: center; margin: 10px 0; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; }'],
})
export class ChecksCard {
  readonly actions = inject(TaskActions);
  private readonly store = inject(TaskStore);
  private readonly i18n = inject(I18n);
  readonly item = input.required<ChecksItem>();

  readonly text = computed(() => {
    const item = this.item();
    if (item.review) return this.i18n.t(item.passed ? 'checks.review_passed' : 'checks.review_failed');
    // The counts come from the runner's own report, matched to this result by its time.
    const at = Date.parse(item.at);
    const results = this.store.progress()?.checks ?? [];
    const near = results.filter(c => Math.abs(Date.parse(c.at) - at) < 15_000).pop();
    if (!near || near.passed === undefined) return this.i18n.t(item.passed ? 'checks.passed' : 'checks.failed');
    const total = (near.passed ?? 0) + (near.failed ?? 0);
    return item.passed ? this.i18n.t('checks.passed_n', { n: near.passed }) : this.i18n.t('checks.failed_n', { n: near.failed, total });
  });
}

/** An error or a pause with its reason (section 10): one sentence, at most two actions, "Details" with the raw reason. */
@Component({
  selector: 'as-error-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe],
  template: `
    <section class="card" [class.err]="item().state === 'failed'" [class.attn]="item().state !== 'failed'" role="alert">
      <div class="k">{{ (limited() ? 'state.paused_limit' : 'state.' + (item().state === 'failed' ? 'failed' : 'paused')) | t }}</div>
      <p>{{ text() }}</p>
      @if (best(); as b) { <p class="muted">{{ ('limit.best.' + b) | t }}</p> }
      @if (limited() && latest()) { <p class="muted">{{ 'limit.new_run_note' | t }}</p> }
      @if (said(); as words) { <blockquote class="said">{{ words }}</blockquote> }
      @if (latest()) {
        <div class="row">
          @for (a of acts(); track a; let first = $first) {
            <button class="btn" [class.pri]="first" [disabled]="actions.busy()" (click)="act(a)">{{ (a === 'copy_details' && copied() ? 'action.copied' : 'action.' + a) | t }}</button>
          }
        </div>
      }
      @if (item().error.detail && !said()) {
        <details class="more">
          <summary>{{ 'action.details' | t }}</summary>
          <pre>{{ item().error.detail }}</pre>
          <button class="lnk" (click)="copy()">{{ (copied() ? 'action.copied' : 'action.copy_details') | t }}</button>
        </details>
      }
    </section>`,
})
export class ErrorCard {
  readonly actions = inject(TaskActions);
  private readonly app = inject(AppStore);
  private readonly store = inject(TaskStore);
  private readonly i18n = inject(I18n);

  readonly item = input.required<ErrorItem>();
  /** Only the last card of the conversation offers its actions; an older one is history. */
  readonly latest = input(true);
  readonly copied = signal(false);

  readonly text = computed(() => {
    this.i18n.lang();
    const e = this.item().error;
    // A time limit of two hours or more reads in hours, as the limits menu writes it.
    const minutes = Number(e.params?.['limit']);
    if (e.code === 'limit_minutes' && minutes >= 120) return this.i18n.t('error.limit_hours', { limit: Math.round((minutes / 60) * 10) / 10 });
    return sentence(this.i18n, e);
  });
  readonly acts = computed<ActionId[]>(() => actionsOf(this.item().error.code));
  /** C4: a stop at the user's limit, and — on the last card — where the best verified result is. */
  readonly limited = computed(() => limitKindOf(this.item().error.code) !== null);
  readonly best = computed(() => (this.limited() && this.latest() ? this.store.task()?.limit?.best ?? null : null));
  /** Why the agent stopped, in its own words: the user has to read them to answer (section 10, `blocked`). */
  readonly said = computed(() => {
    const e = this.item().error;
    return (e.code === 'needs_answer' || e.code === 'blocked') && e.detail ? e.detail : null;
  });

  private account(): string | undefined {
    const ref = this.store.task()?.model.ref;
    return ref ? ref.slice(0, ref.indexOf('/')) : undefined;
  }

  async copy(): Promise<void> {
    if (await this.actions.copy(`${this.item().error.code}\n${this.item().error.detail ?? ''}`)) {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    }
  }

  act(a: ActionId): void {
    const params = this.item().error.params ?? {};
    const projectId = this.store.task()?.projectId ?? '';
    switch (a) {
      case 'connect': this.actions.settings('models', { add: '1' }); break;
      case 'sign_in': this.actions.settings('models', { connect: this.account() ?? '' }); break;
      case 'replace_key': this.actions.settings('models', { connect: this.account() ?? '', method: 'key' }); break;
      case 'change_model': this.actions.show({ dialog: 'model' }); break;
      case 'choose_folder': this.actions.settings('project', { project: projectId, choose: '1' }); break;
      case 'remove_project': void this.actions.removeProject(projectId); break;
      case 'init_git': void this.actions.initGit(String(params['path'] ?? this.app.project(projectId)?.path ?? '')); break;
      case 'open_task': this.actions.open(String(params['taskId'] ?? '')); break;
      case 'stop_other': void this.actions.stopOther(String(params['taskId'] ?? '')); break;
      case 'set_checks': this.actions.settings('project', { project: projectId }); break;
      case 'show_output': this.actions.show({ panel: 'output' }); break;
      case 'copy_details': void this.copy(); break;
      case 'stop': void this.actions.stop(); break;
      case 'raise_limit': this.actions.show({ dialog: 'limits' }); break;
      default: void this.actions.resume();
    }
  }
}

/** The result of a run (section 7.8): the summary, what changed, how it was verified, what it used. */
@Component({
  selector: 'as-result-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe, MarkdownPipe],
  template: `
    <section class="card">
      <div class="k ok">{{ 'state.done' | t }}@if (task()?.demo) { <span class="tag">{{ 'demo.tag' | t }}</span> }</div>
      @if (item().summary) { <div class="md" [innerHTML]="item().summary | markdown"></div> }
      @if (latest()) {
        <div class="kv">
          <span class="l">{{ 'result.changes' | t }}</span>
          @if (changes(); as c) {
            @if (c.files > 0) {
              <span>{{ files(c.files) }} · <span class="ok">+{{ c.added }}</span> <span class="bad">−{{ c.removed }}</span></span>
              <button class="lnk" (click)="actions.show({ panel: 'changes' })">{{ 'action.review_changes' | t }}</button>
            } @else { <span class="muted">{{ 'empty.changes' | t }}</span><span></span> }
          } @else { <span class="muted">…</span><span></span> }
          @if (scratch()) {
            <span class="l">{{ 'result.scratch' | t }}</span>
            <span class="muted">{{ scratch() }}</span><span></span>
          }
          <span class="l">{{ 'result.verified' | t }}</span>
          <span>@if (verified().ok) { <span class="ok" aria-hidden="true">✓</span> } {{ verified().text }}@if (judge()) { · <span class="muted">{{ 'provenance.judge' | t }}</span> }</span>
          @if (verified().output) { <button class="lnk" (click)="actions.show({ panel: 'output' })">{{ 'action.show_output' | t }}</button> } @else { <span></span> }
          <span class="l">{{ 'result.used' | t }}</span><span>{{ used() }}</span><span></span>
        </div>
        @if (skipped().length) {
          <div class="skipped">
            <div class="l">{{ 'result.skipped' | t }}</div>
            @for (s of skipped(); track s.id) {
              <div class="row"><code class="grow ellipsis">{{ s.command }}</code><button class="btn sm" [disabled]="actions.busy()" (click)="actions.allowSkipped(s)">{{ 'action.allow_and_continue' | t }}</button></div>
            }
          </div>
        }
        @if (offer(); as command) {
          <div class="skipped">
            <div class="l">{{ 'result.check_offer' | t }}</div>
            <code class="cmd">{{ command }}</code>
            <div class="row">
              <button class="btn sm" [disabled]="actions.busy()" (click)="actions.adoptCheck(command)">{{ 'action.make_project_check' | t }}</button>
              <button class="btn ghost sm" (click)="notNow()">{{ 'action.not_now' | t }}</button>
            </div>
          </div>
        }
        @if ((changes()?.files ?? 0) > 0 || rework()) {
          <div class="row">
            @if ((changes()?.files ?? 0) > 0) {
              <button class="btn pri" (click)="actions.show({ dialog: 'commit' })">{{ 'action.commit' | t }}</button>
              <button class="btn" (click)="actions.show({ dialog: 'undo' })">{{ 'action.undo_all' | t }}</button>
            }
            @if (rework()) { <button class="btn" (click)="actions.show({ compose: 'rework' })">{{ 'action.not_done_rework' | t }}</button> }
          </div>
        }
      }
    </section>`,
  styles: [`
    .k.ok { color: var(--ok); display: flex; gap: 8px; align-items: center; }
    .kv { display: grid; grid-template-columns: 90px 1fr auto; gap: 6px 12px; align-items: baseline; margin: 12px 0 14px; }
    .l { color: var(--muted); }
    .skipped { margin: 0 0 14px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; }
    .skipped .l { font-size: 13px; margin-bottom: 6px; }
    .skipped .row { flex-wrap: nowrap; margin-top: 4px; }
    .skipped .cmd { display: block; font-family: var(--mono, monospace); margin: 2px 0 6px; white-space: pre-wrap; word-break: break-all; }
    .tag { font-size: 10px; font-weight: 600; color: var(--warn); border: 1px solid var(--warn); border-radius: 4px; padding: 0 4px; }
  `],
})
export class ResultCard {
  readonly actions = inject(TaskActions);
  private readonly store = inject(TaskStore);
  private readonly i18n = inject(I18n);

  readonly item = input.required<ResultItem>();
  /** Only the result of the last run shows numbers and actions: they are the task's, not the run's. */
  readonly latest = input(true);

  readonly task = computed(() => this.store.task());
  readonly changes = computed(() => this.task()?.changes ?? null);
  readonly scratch = computed(() => scratchRoots(this.task()));
  readonly skipped = computed(() => this.task()?.skipped ?? []);
  /** The message the user sends next starts the follow-up run; the button only prepares the composer. */
  readonly rework = computed(() => this.task()?.state === 'done' && reworkable(this.task()?.verified));
  readonly used = computed(() => { this.i18n.lang(); return usageText(this.i18n, this.task()?.usage); });

  files(n: number): string { return this.i18n.n('count.files', n); }


  /** C1b/C4: the agent's own test offered as the project's check, until the user says "Not now" for this task. */
  private readonly dismissed = signal(0);
  readonly offer = computed(() => {
    this.dismissed();
    const task = this.task();
    const command = task?.checkOffer?.command;
    if (!task || !command) return null;
    try { if (localStorage.getItem('studio.checkOffer.' + task.id) === command) return null; } catch { /* storage may be unavailable */ }
    return command;
  });

  notNow(): void {
    const task = this.task();
    if (!task?.checkOffer) return;
    try { localStorage.setItem('studio.checkOffer.' + task.id, task.checkOffer.command); } catch { /* storage may be unavailable */ }
    this.dismissed.update(n => n + 1);
  }

  /** D-397: a model judge's approval is shown beside the class, never as independent verification. */
  readonly judge = computed(() => !!this.task()?.provenance?.judge);

  /**
   * The "Verified" line (section 7.8), honest about how the result was checked. With the core's provenance class (C4)
   * the class leads and ✓ marks only an independent check; the detail follows.
   */
  readonly verified = computed<{ ok: boolean; text: string; output: boolean }>(() => {
    this.i18n.lang();
    const task = this.task();
    const cls = task?.provenance?.class;
    const plain = this.plain();
    if (!cls) return plain;
    const detail = ['tests', 'user', 'unverified'].includes(task?.verified ?? '') ? ' · ' + plain.text : '';
    return { ok: cls === 'independent', text: this.i18n.t('provenance.' + cls) + detail, output: plain.output };
  });

  private plain(): { ok: boolean; text: string; output: boolean } {
    const task = this.task();
    const kind = task?.verified ?? 'none';
    if (kind === 'tests') {
      const checks = this.store.progress()?.checks ?? [];
      const last = [...checks].reverse().find(c => c.acceptance) ?? checks[checks.length - 1];
      const text = last?.passed !== undefined ? this.i18n.t('checks.passed_n', { n: last.passed }) : this.i18n.t('checks.passed');
      return { ok: true, text, output: true };
    }
    const v = verifiedOf(kind);
    return { ok: v.ok, text: this.i18n.t(v.key), output: v.output };
  }
}
