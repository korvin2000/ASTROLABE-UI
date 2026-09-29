import { ChangeDetectionStrategy, Component, HostListener, OnDestroy, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecisionDto } from '../../core/model';
import { StudioSocket } from '../../core/ws';
import { AppStore, decisionTitle } from '../../state/app.store';
import { StudioError } from '../../core/api';
import { Glyph } from '../../ui/glyph';
import { Icon } from '../../ui/icon';
import { MarkdownPipe } from '../../ui/markdown';
import { countdown, relTime, shortId } from '../../core/format';

/**
 * A typed decision card (§13.2): kind, campaign/cell, **contract revision**, age, the consequence of each option,
 * lease countdown and shortcuts. A reply names the request and revision (R-DEC-01); approval applies to that request
 * only — there is no incidental "always allow". Weakening proposals default to Reject and need typed confirmation.
 */
@Component({
  selector: 'as-decision-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Glyph, Icon, MarkdownPipe, RouterLink],
  host: { '[class.focused]': 'focused()', tabindex: '0', '(focus)': 'focused.set(true)', '(blur)': 'focused.set(false)' },
  template: `
    @let d = decision();
    @let r = d.request;
    <div class="card" [class.pending]="d.status === 'pending'" [class.compact]="compact()">
      <div class="head">
        <as-glyph [status]="d.status === 'pending' ? 'needs_you' : d.status" />
        <span class="kind">{{ title() }}</span>
        @if (d.kind === 'amendment' && r.weakening) { <span class="chip bad">weakening</span> }
        <span class="grow"></span>
        <span class="meta mono">
          @if (d.workId && showCampaign()) { <a [routerLink]="['/p', d.projectId, 'c', d.workId]">{{ short(d.workId) }}</a> · }
          @if (d.cellId) { {{ short(d.cellId) }} · }
          @if (d.contractRevision !== undefined) { contract v{{ d.contractRevision }} · }
          {{ age() }}
        </span>
      </div>

      @if (compact() && d.status !== 'pending') {
        <div class="resolved meta">
          <span class="st">{{ d.status }}</span> by {{ d.byAuthority ?? '—' }}@if (d.reason) { · {{ d.reason }} }
          @if (d.kind === 'question' && d.reply?.text) { · “{{ d.reply.text }}” }
        </div>
      } @else {
        @switch (d.kind) {
          @case ('question') {
            <div class="prose markdown q" [innerHTML]="r.text | markdown"></div>
            @if (r.options?.length) {
              <div class="opts">
                @for (o of r.options; track $index) {
                  <button class="btn" [class.primary]="choice() === $index" (click)="choice.set($index); answer.set(o)"><kbd>{{ $index + 1 }}</kbd> {{ o }}</button>
                }
              </div>
            }
            <textarea class="textarea" rows="2" placeholder="Your answer…" [value]="answer()" (input)="answer.set($any($event.target).value)" [disabled]="d.status !== 'pending'"></textarea>
            <label class="check small"><input type="checkbox" [checked]="changes()" (change)="changes.set($any($event.target).checked)" /> This changes requirements</label>
            <div class="conseq">
              @if (changes()) { <div>On: becomes an amendment — a new contract version and a new request (U*).</div> }
              @else { <div>Off: recorded as evidence; no new contract version.</div> }
              <div>Decline: the cell ends blocked and the campaign waits for input (resumable).</div>
            </div>
          }
          @case ('effect') {
            <pre class="argv mono">{{ (r.argv ?? []).join(' ') || r.action }}</pre>
            <div class="kv small">
              <span class="k">cwd</span><span class="v mono">{{ r.cwd ?? './' }}</span>
              <span class="k">expected effect</span><span class="v">{{ r.expectedEffect }}</span>
              <span class="k">why</span><span class="v">{{ r.reason }}</span>
              <span class="k">contract allowlist</span><span class="v">{{ r.contractAllowlisted ? 'allowlisted' : 'not allowlisted' }}</span>
            </div>
            <div class="conseq">
              <div>Approve: the command runs once, under trusted-local (no sandbox).</div>
              <div>Deny: the call is refused with your reason; the cell continues.</div>
              <div>Wait: the cell stays paused@if (lease()) {; lease expires in {{ lease() }}, then the campaign stops (resumable)}.</div>
            </div>
          }
          @case ('publication') {
            <div class="kv small">
              <span class="k">action</span><span class="v mono">{{ r.action }}</span>
              <span class="k">argv</span><span class="v mono">{{ (r.argv ?? []).join(' ') }}</span>
              <span class="k">expected effect</span><span class="v">{{ r.expectedEffect }}</span>
              <span class="k">reason</span><span class="v">{{ r.reason }}</span>
            </div>
            <div class="conseq"><div>Each stage is a separate grant for this exact target; reaching the ceiling grants nothing below it.</div></div>
          }
          @case ('review') {
            <div class="kv small">
              <span class="k">scope</span><span class="v">{{ scope(r) }}</span>
              <span class="k">candidate</span><span class="v mono">{{ (r.candidate ?? '').slice(0, 12) }}</span>
              <span class="k">criteria</span><span class="v">@for (c of r.criteria ?? []; track $index) { <div>· {{ c }}</div> }</span>
            </div>
            <div class="verdict">
              <select class="select" [value]="verdict()" (change)="verdict.set($any($event.target).value)">
                @for (v of verdicts; track v) { <option [value]="v" [selected]="v === verdict()">{{ v }}</option> }
              </select>
              <label class="small">confidence <input class="input conf" type="number" min="0" max="1" step="0.05" [value]="confidence()" (input)="confidence.set(+$any($event.target).value)" /></label>
              @if (verdict() === 'InsufficientEvidence') { <input class="input grow" placeholder="Missing criterion (required)" [value]="missing()" (input)="missing.set($any($event.target).value)" /> }
            </div>
            <textarea class="textarea" rows="2" placeholder="Findings — one per line: severity | path:line@hash | issue" [value]="findings()" (input)="findings.set($any($event.target).value)"></textarea>
            <div class="conseq"><div>A human review records a verdict; it never rewrites test results (R-EVD-05). Decline: review unavailable → blocked, never skipped.</div></div>
          }
          @default {
            <div class="prose q">{{ r.change }}</div>
            <div class="kv small">
              <span class="k">proposed by</span><span class="v">{{ r.by }}</span>
              <span class="k">reason</span><span class="v">{{ r.reason }}</span>
              <span class="k">proposal</span><span class="v mono">{{ r.id }}</span>
            </div>
            @if (r.weakening) {
              <div class="banner bad small"><as-icon name="alert" [size]="14" /> This proposal narrows or removes an obligation. Accepting needs a typed confirmation; the default is Reject.</div>
              <input class="input" placeholder='Type "weaken" to allow Accept' [value]="typed()" (input)="typed.set($any($event.target).value)" />
            }
            <div class="conseq">
              <div>Accept: the contract gets a new version with this change.</div>
              <div>Reject: nothing changes. Leave pending: a pending proposal grants nothing.</div>
            </div>
          }
        }
        <input class="input reason" placeholder="Reason (optional)" [value]="reason()" (input)="reason.set($any($event.target).value)" />
        @if (error()) { <div class="banner bad small"><as-icon name="alert" [size]="14" /> {{ error() }}</div> }
        @if (d.status === 'pending') {
          <div class="actions">
            @switch (d.kind) {
              @case ('question') {
                <button class="btn" (click)="decline()" [disabled]="busy()">Decline</button>
                <button class="btn primary" (click)="reply({ text: answer(), chosenOption: choice(), changesRequirements: changes() })" [disabled]="busy() || !answer().trim()"><kbd>Ctrl ⏎</kbd> Answer</button>
              }
              @case ('review') {
                <button class="btn" (click)="decline()" [disabled]="busy()">No reviewer</button>
                <button class="btn primary" (click)="sendVerdict()" [disabled]="busy()">Sign verdict</button>
              }
              @case ('effect') {
                <button class="btn danger" (click)="reply({ approved: false, reason: reason() })" [disabled]="busy()"><kbd>D</kbd> Deny</button>
                <button class="btn primary" (click)="reply({ approved: true, reason: reason() })" [disabled]="busy()"><kbd>A</kbd> Approve once</button>
              }
              @case ('publication') {
                <button class="btn danger" (click)="reply({ approved: false, reason: reason() })" [disabled]="busy()"><kbd>D</kbd> Deny</button>
                <button class="btn primary" (click)="reply({ approved: true, reason: reason() })" [disabled]="busy()"><kbd>A</kbd> Approve stage</button>
              }
              @default {
                <button class="btn" (click)="reply({ outcome: 'Pending', reason: reason() })" [disabled]="busy()">Leave pending</button>
                <button class="btn danger" (click)="reply({ outcome: 'Rejected', reason: reason() })" [disabled]="busy()"><kbd>D</kbd> Reject</button>
                <button class="btn primary" (click)="reply({ outcome: 'Accepted', reason: reason(), confirmWeakening: typed().trim() === 'weaken' })"
                  [disabled]="busy() || (!!r.weakening && typed().trim() !== 'weaken')"><kbd>A</kbd> Accept</button>
              }
            }
          </div>
        } @else {
          <div class="resolved meta"><span class="st">{{ d.status }}</span> by {{ d.byAuthority ?? '—' }}@if (d.reason) { · {{ d.reason }} }</div>
        }
      }
    </div>`,
  styles: [`
    :host{display:block;outline:none;margin:8px 0}
    .card{border:1px solid var(--border-default);border-radius:8px;padding:10px 14px;background:var(--bg-surface);display:flex;flex-direction:column;gap:8px;max-width:900px}
    .card.pending{border-color:color-mix(in srgb,var(--attention) 55%,var(--border-default));box-shadow:inset 3px 0 0 var(--attention)}
    :host(.focused) .card{box-shadow:inset 3px 0 0 var(--attention),0 0 0 2px var(--accent-subtle)}
    .card.compact{padding:7px 12px;gap:4px}
    .head{display:flex;align-items:center;gap:8px}
    .kind{font-weight:600}
    .q{margin:0}
    .argv{padding:8px 10px;background:var(--code-bg);border:1px solid var(--border-subtle);border-radius:6px}
    .opts{display:flex;flex-wrap:wrap;gap:6px}
    .conseq{font-size:12px;color:var(--text-secondary);border-left:2px solid var(--border-default);padding-left:10px;display:flex;flex-direction:column;gap:2px}
    .actions{display:flex;gap:8px;justify-content:flex-end}
    .reason{width:100%}
    .small{font-size:12px}
    .resolved .st{text-transform:capitalize;color:var(--text-primary)}
    .verdict{display:flex;gap:8px;align-items:center}
    .conf{width:70px;margin-left:6px}
    kbd{margin-right:2px}
  `],
})
export class DecisionCard implements OnDestroy {
  private readonly socket = inject(StudioSocket);
  private readonly app = inject(AppStore);
  readonly decision = input.required<DecisionDto>();
  readonly compact = input(false);
  readonly showCampaign = input(true);
  readonly focused = signal(false);
  readonly answer = signal('');
  readonly choice = signal<number | null>(null);
  readonly changes = signal(false);
  readonly reason = signal('');
  readonly typed = signal('');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly verdict = signal('Approve');
  readonly confidence = signal(0.8);
  readonly missing = signal('');
  readonly findings = signal('');
  readonly verdicts = ['Approve', 'Revise', 'Reject', 'InsufficientEvidence', 'Escalate'];
  private readonly now = signal(Date.now());
  private readonly timer = setInterval(() => this.now.set(Date.now()), 30_000);

  readonly title = computed(() => decisionTitle(this.decision().kind));
  readonly age = computed(() => { this.now(); return relTime(this.decision().createdAt) + (relTime(this.decision().createdAt) === 'now' ? '' : ' ago'); });
  readonly lease = computed(() => { this.now(); return countdown(this.decision().leaseExpiresAt); });

  short(id: string): string { return shortId(id, 10); }
  scope(r: any): string { return typeof r.scope === 'string' ? r.scope : r.scope?.type ?? JSON.stringify(r.scope ?? ''); }

  async reply(reply: any): Promise<void> {
    const d = this.decision();
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.socket.command('decision.reply', { decisionId: d.id, reply }, { workId: d.workId, projectId: d.projectId }, { contractRevision: d.contractRevision });
    } catch (e) {
      this.error.set(e instanceof StudioError ? `${e.error.code.replace(/_/g, ' ')}: ${e.error.message}` : String(e));
    } finally {
      this.busy.set(false);
    }
  }

  async decline(): Promise<void> {
    const d = this.decision();
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.socket.command('decision.decline', { decisionId: d.id, reason: this.reason() }, { workId: d.workId });
    } catch (e) {
      this.error.set(e instanceof StudioError ? e.error.message : String(e));
    } finally {
      this.busy.set(false);
    }
  }

  sendVerdict(): void {
    if (this.verdict() === 'InsufficientEvidence' && !this.missing().trim()) {
      this.error.set('InsufficientEvidence must name the missing criterion');
      return;
    }
    const findings = this.findings().split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const [severity, location, ...issue] = l.split('|').map(s => s.trim());
      return { severity: ['Blocker', 'Major', 'Minor', 'Nit'].includes(severity) ? severity : 'Minor', location: location ?? '', issue: issue.join(' | ') || l, suggestedFix: null, kind: 'Quality' };
    });
    this.reply({ outcome: this.verdict(), findings, coverage: null, contractViolations: [], confidence: Math.min(1, Math.max(0, this.confidence())),
      missingCriterion: this.verdict() === 'InsufficientEvidence' ? this.missing() : null });
  }

  @HostListener('keydown', ['$event'])
  onKey(ev: KeyboardEvent): void {
    const d = this.decision();
    if (d.status !== 'pending') return;
    const t = ev.target as HTMLElement;
    const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
    if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter' && d.kind === 'question' && this.answer().trim()) {
      ev.preventDefault();
      this.reply({ text: this.answer(), chosenOption: this.choice(), changesRequirements: this.changes() });
      return;
    }
    if (typing) return;
    if (/^[1-9]$/.test(ev.key) && d.kind === 'question' && d.request.options?.[+ev.key - 1]) {
      this.choice.set(+ev.key - 1);
      this.answer.set(d.request.options[+ev.key - 1]);
    } else if (ev.key.toLowerCase() === 'a' && (d.kind === 'effect' || d.kind === 'publication')) this.reply({ approved: true, reason: this.reason() });
    else if (ev.key.toLowerCase() === 'd' && (d.kind === 'effect' || d.kind === 'publication')) this.reply({ approved: false, reason: this.reason() });
  }

  ngOnDestroy(): void { clearInterval(this.timer); }
}
