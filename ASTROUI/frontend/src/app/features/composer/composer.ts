import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { AppStore, readPrefs } from '../../state/app.store';
import { CampaignStore } from '../../state/campaign.store';
import { StudioSocket } from '../../core/ws';
import { StudioError } from '../../core/api';
import { Icon } from '../../ui/icon';

type Intent = 'amend' | 'answer' | 'resume' | 'draft';

const SLASH: Record<string, string> = {
  '/new': 'New campaign', '/amend': 'Amend the contract', '/answer': 'Answer the pending question', '/resume': 'Resume the campaign',
  '/cancel': 'Cancel the campaign (final)', '/overview': 'Open the Overview', '/plan': 'Open Plan & Contract', '/evidence': 'Open Evidence',
  '/changes': 'Open Changes', '/context': 'Open Context', '/settings': 'Open Settings', '/stats': 'Open Statistics', '/kb': 'Open Knowledge',
};

/**
 * The composer (§7): it always shows what the text will become. Later messages are amendments or answers, never
 * free chat (decision 1); Amend binds the contract revision it shows (R-CMP-02) and preserves every prior request
 * (R-CMP-09); the draft is cleared only after the backend confirms (R-CMP-08).
 */
@Component({
  selector: 'as-composer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <div class="composer" [class.disabled]="intents().length === 0">
      <div class="top">
        <div class="intent">
          <select class="select" [value]="intent()" (change)="setIntent($any($event.target).value)" aria-label="What the text becomes" [disabled]="intents().length === 0">
            @for (i of intents(); track i) { <option [value]="i" [selected]="i === intent()">{{ label(i) }}</option> }
            @if (intents().length === 0) { <option>Final</option> }
          </select>
        </div>
        <textarea #area class="area" [class.compact]="compact()" [attr.rows]="compact() ? 1 : 3" [placeholder]="placeholder()" [value]="text()" (input)="onInput($any($event.target).value)"
          (keydown)="onKey($event)" [disabled]="intents().length === 0 || (intent() === 'resume' && false)" aria-label="Composer"></textarea>
      </div>
      @if (slash().length) {
        <div class="slash">
          @for (s of slash(); track s[0]) { <button (mousedown)="$event.preventDefault(); runSlash(s[0])"><span class="mono">{{ s[0] }}</span> <span class="dim">{{ s[1] }}</span></button> }
        </div>
      }
      <div class="bottom">
        <as-icon name="info" [size]="13" />
        <span class="hint ellipsis grow">{{ hint() }}</span>
        @if (moved()) {
          <span class="moved"><as-icon name="alert" [size]="13" /> Contract moved to v{{ revision() }} — review
            <button class="btn sm" (click)="acceptMove()">Use v{{ revision() }}</button></span>
        }
        @if (error()) { <span class="err ellipsis" [title]="error() ?? ''">{{ error() }}</span> }
        <kbd>{{ sendKey() }}</kbd>
        <button class="btn primary sm" (click)="submit()" [disabled]="!canSubmit()">
          <as-icon [name]="intent() === 'resume' ? 'play' : 'send'" [size]="13" /> {{ submitLabel() }}
        </button>
        @if (summary()?.live) {
          <button class="btn danger sm icon" (click)="confirmCancel.set(true)" title="Cancel campaign (Ctrl+Shift+.)"><as-icon name="stop" [size]="12" /></button>
        }
      </div>
    </div>
    @if (confirmCancel()) {
      <div class="scrim" (click)="confirmCancel.set(false)"></div>
      <div class="confirm" role="alertdialog" aria-label="Cancel campaign">
        <div class="title">Cancel this campaign?</div>
        <p><b>Cancelled is final</b> — the campaign cannot be resumed. The running cell settles its checkpoint, nothing is dispatched or published
          afterwards, and effects already made stay archived. ASTROLABE has no pause.</p>
        @if (hasQuestion()) { <p class="meta">To pause instead, decline the pending question: the cell ends blocked and the campaign waits for input (resumable).</p> }
        <input class="input" placeholder="Reason (optional)" [value]="cancelReason()" (input)="cancelReason.set($any($event.target).value)" />
        <div class="row end">
          <button class="btn" (click)="confirmCancel.set(false)">Keep running</button>
          <button class="btn danger" (click)="cancel()" [disabled]="busy()">Cancel campaign</button>
        </div>
      </div>
    }`,
  styles: [`
    :host{display:block;flex:none;padding:0 16px 12px;background:linear-gradient(to bottom,transparent,var(--bg-canvas) 30%)}
    .composer{max-width:1080px;margin:0 auto;border:1px solid var(--border-default);border-radius:var(--r-drawer);background:var(--bg-surface);box-shadow:var(--shadow-sm);overflow:hidden}
    .composer:focus-within{border-color:var(--border-strong);box-shadow:0 0 0 3px var(--accent-faint)}
    .composer.disabled{opacity:.7}
    .top{display:flex;align-items:flex-start;gap:8px;padding:8px 8px 0}
    .intent .select{height:26px;font-size:12px;font-weight:500;background:var(--bg-canvas)}
    .area{flex:1;min-height:60px;max-height:40vh;border:0;outline:none;resize:none;background:transparent;font-size:14px;line-height:22px;padding:2px 4px}
    .area.compact{min-height:24px}
    .bottom{display:flex;align-items:center;gap:8px;padding:6px 10px 8px;color:var(--text-tertiary);font-size:12px}
    .hint{color:var(--text-secondary)}
    .moved{display:flex;align-items:center;gap:6px;color:var(--attention)}
    .err{color:var(--danger);max-width:40%}
    .slash{display:flex;flex-wrap:wrap;gap:4px;padding:4px 10px}
    .slash button{border:1px solid var(--border-default);background:var(--bg-canvas);border-radius:5px;padding:2px 8px;cursor:pointer;font-size:12px;color:var(--text-primary)}
    .scrim{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:50}
    .confirm{position:fixed;left:50%;top:30%;transform:translateX(-50%);z-index:51;width:min(520px,92vw);padding:18px;display:flex;flex-direction:column;gap:10px;
      background:var(--bg-raised);border:1px solid var(--border-default);border-radius:var(--r-drawer);box-shadow:var(--shadow-overlay)}
    .confirm p{margin:0}
    .title{font-weight:600;font-size:15px}
    .end{justify-content:flex-end}
  `],
})
export class Composer {
  private readonly app = inject(AppStore);
  private readonly socket = inject(StudioSocket);
  private readonly router = inject(Router);
  readonly projectId = input.required<string>();
  readonly workId = input.required<string>();
  readonly store = input.required<CampaignStore>();
  /** Docked (one line) in the other tabs; full height over the Thread (§4.2). */
  readonly compact = input(false);
  readonly area = viewChild<ElementRef<HTMLTextAreaElement>>('area');

  readonly text = signal('');
  readonly chosen = signal<Intent | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly boundRevision = signal<number | null>(null);
  readonly confirmCancel = signal(false);
  readonly cancelReason = signal('');

  readonly summary = computed(() => this.app.campaign(this.workId()));
  readonly revision = computed(() => this.summary()?.contractVersion ?? null);
  readonly questions = computed(() => this.app.decisionsFor(this.workId()).filter(d => d.kind === 'question'));
  readonly hasQuestion = computed(() => this.questions().length > 0);

  readonly intents = computed<Intent[]>(() => {
    const s = this.summary();
    if (!s) return [];
    const out: Intent[] = [];
    if (this.hasQuestion()) out.push('answer');
    if (s.live) out.push('amend', 'draft');
    else if (s.resumable) out.push('resume', 'amend');
    return out;
  });
  readonly intent = computed<Intent>(() => {
    const c = this.chosen();
    const list = this.intents();
    return c && list.includes(c) ? c : list[0] ?? 'draft';
  });
  readonly moved = computed(() => {
    const b = this.boundRevision();
    const r = this.revision();
    return (this.intent() === 'amend' || this.intent() === 'answer') && b !== null && r !== null && b !== r;
  });
  readonly slash = computed(() => {
    const t = this.text();
    if (!t.startsWith('/') || t.includes(' ') || t.includes('\n')) return [];
    return Object.entries(SLASH).filter(([k]) => k.startsWith(t));
  });
  readonly sendKey = computed(() => readPrefs().sendKey === 'enter' ? '⏎' : 'Ctrl ⏎');

  readonly placeholder = computed(() => {
    switch (this.intent()) {
      case 'amend': return 'Describe a change to the request… (an addition, never a replacement objective)';
      case 'answer': return this.questions()[0]?.request?.text ? 'Answer: ' + this.questions()[0].request.text : 'Your answer…';
      case 'resume': return 'Optional amendment before resuming (leave empty to resume as is)';
      default: return this.summary()?.live ? 'Draft a follow-up; it becomes a new campaign after this one ends' : 'This campaign is final — start a new campaign from it (menu ⋯)';
    }
  });

  readonly hint = computed(() => {
    const s = this.summary();
    const v = this.revision();
    const requests = (this.store().contract()?.requests ?? []).length || 1;
    switch (this.intent()) {
      case 'amend': return `Becomes U${requests + 1} and contract v${(v ?? 0) + 1}; ${s?.live ? 'the running cell sees it next turn' : 'blocked increments unblock at the next open'}`;
      case 'answer': return `Answers ${this.questions()[0]?.request?.id ?? 'the question'} (contract v${this.questions()[0]?.contractRevision ?? v}) — the card in the thread offers "changes requirements"`;
      case 'resume': return `Resumes ${s?.workId} at contract v${v}${this.text().trim() ? ' after this amendment' : ''}; the frozen attempt configuration governs`;
      default: return s?.live ? 'Saved as a local draft; becomes a new campaign after this one ends' : 'Final outcome — no resume; "New campaign from this" pre-fills the composer';
    }
  });

  readonly submitLabel = computed(() => ({ amend: 'Amend', answer: 'Answer', resume: 'Resume', draft: 'Save draft' } as Record<Intent, string>)[this.intent()]);
  readonly canSubmit = computed(() => {
    if (this.busy() || this.moved() || this.intents().length === 0) return false;
    if (this.intent() === 'resume') return true;
    return this.text().trim().length > 0 && this.socket.state() === 'open' || (this.intent() === 'draft' && this.text().trim().length > 0);
  });

  constructor() {
    effect(() => {
      // Load the draft of this campaign + intent (session storage by default, R-CMP-01).
      const key = this.draftKey();
      try { this.text.set(sessionStorage.getItem(key) ?? ''); } catch { this.text.set(''); }
      this.boundRevision.set(this.revision());
    });
  }

  private draftKey(): string { return `studio.draft.${this.workId()}.${this.intent()}`; }

  label(i: Intent): string {
    return i === 'answer' ? `Answer ${this.questions()[0]?.request?.id ?? ''}`.trim() : ({ amend: 'Amend', resume: 'Resume', draft: 'Draft follow-up' } as any)[i];
  }

  setIntent(i: string): void { this.chosen.set(i as Intent); this.boundRevision.set(this.revision()); }

  onInput(v: string): void {
    this.text.set(v);
    this.error.set(null);
    if (this.boundRevision() === null) this.boundRevision.set(this.revision());
    try { sessionStorage.setItem(this.draftKey(), v); } catch { /* ignore */ }
    const el = this.area()?.nativeElement;
    if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, window.innerHeight * 0.4) + 'px'; }
  }

  onKey(ev: KeyboardEvent): void {
    const mode = readPrefs().sendKey;
    const send = mode === 'enter' ? ev.key === 'Enter' && !ev.shiftKey : ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey);
    if (send) { ev.preventDefault(); if (this.slash().length === 1) this.runSlash(this.slash()[0][0]); else this.submit(); }
    if (ev.key === '.' && (ev.ctrlKey || ev.metaKey) && ev.shiftKey && this.summary()?.live) { ev.preventDefault(); this.confirmCancel.set(true); }
  }

  acceptMove(): void { this.boundRevision.set(this.revision()); }

  runSlash(cmd: string): void {
    this.text.set('');
    const base = ['/p', this.projectId(), 'c', this.workId()];
    switch (cmd) {
      case '/new': this.router.navigate(['/new'], { queryParams: { project: this.projectId() } }); break;
      case '/amend': this.chosen.set('amend'); break;
      case '/answer': this.chosen.set('answer'); break;
      case '/resume': this.chosen.set('resume'); break;
      case '/cancel': this.confirmCancel.set(true); break;
      case '/settings': this.router.navigate(['/settings']); break;
      case '/stats': this.router.navigate(['/stats']); break;
      case '/kb': this.router.navigate(['/p', this.projectId(), 'knowledge']); break;
      default: this.router.navigate([...base, cmd.slice(1)]);
    }
  }

  async submit(): Promise<void> {
    if (!this.canSubmit()) return;
    const text = this.text().trim();
    if (text.startsWith('/') && SLASH[text]) { this.runSlash(text); return; }
    this.busy.set(true);
    this.error.set(null);
    try {
      switch (this.intent()) {
        case 'amend':
          const r = await this.socket.command<{ version?: number }>('campaign.amend', { text }, { workId: this.workId(), projectId: this.projectId() }, { contractRevision: this.boundRevision() });
          this.app.toast('ok', 'Amendment recorded', r?.version ? `Contract v${r.version}` : undefined);
          break;
        case 'answer': {
          const q = this.questions()[0];
          await this.socket.command('decision.reply', { decisionId: q.id, reply: { text, chosenOption: null, changesRequirements: false } }, { workId: this.workId() }, { contractRevision: q.contractRevision });
          break;
        }
        case 'resume':
          await this.socket.command('campaign.resume', { amendment: text || null }, { workId: this.workId(), projectId: this.projectId() });
          this.app.toast('ok', 'Resumed', this.workId());
          break;
        case 'draft':
          try { localStorage.setItem('studio.followup.' + this.projectId(), text); } catch { /* ignore */ }
          this.app.toast('neutral', 'Draft saved', 'It pre-fills the next New campaign in this project.');
          break;
      }
      this.text.set('');
      try { sessionStorage.removeItem(this.draftKey()); } catch { /* ignore */ }
      this.boundRevision.set(null);
    } catch (e) {
      this.error.set(e instanceof StudioError ? `${e.error.code.replace(/_/g, ' ')}: ${e.error.message}` : String(e));
    } finally {
      this.busy.set(false);
    }
  }

  async cancel(): Promise<void> {
    this.busy.set(true);
    try {
      await this.socket.command('campaign.cancel', { reason: this.cancelReason() }, { workId: this.workId() }, {}, true);
      this.confirmCancel.set(false);
    } catch (e) {
      this.app.error(e, 'Cancel');
    } finally {
      this.busy.set(false);
    }
  }
}
