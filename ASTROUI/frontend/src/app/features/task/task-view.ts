import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LAST_TASK } from '../../app.routes';
import { Approach, Effort, Limits, Mode } from '../../core/model';
import { I18n, TPipe } from '../../i18n/i18n';
import { AppStore } from '../../state/app.store';
import { TaskStore } from '../../state/task.store';
import { FlowNode } from '../../timeline/steps';
import { CardItem, ErrorItem, Item, ResultItem } from '../../timeline/timeline';
import { Dialog } from '../../ui/dialog';
import { ErrorLine } from '../../ui/error-line';
import { Icon } from '../../ui/icon';
import { MarkdownPipe } from '../../ui/markdown';
import { StateMark } from '../../ui/state-mark';
import { clockOf } from '../../ui/units';
import { Changes } from '../panel/changes';
import { FlowStage } from '../panel/flow/flow-stage';
import { Output } from '../panel/output';
import { Progress, StageRail } from '../panel/progress';
import { doneUnverified, stateKey } from './acceptance';
import { ActivityGroup } from './activity-group';
import { AskCard, ChecksCard, ErrorCard, ResultCard } from './cards';
import { Composer } from './composer';
import { CommitDialog, UndoDialog } from './landing-dialogs';
import { DEFAULT_LIMITS, LimitKind, limitKindOf, meterText, raised } from './limits';
import { PanelTab, TaskActions } from './task-actions';

const PANEL = 'studio.panel';
/** The narrowest side panel: the Flow needs a canvas of 440 px inside its padding. */
const PANEL_MIN = 474;
const TABS: PanelTab[] = ['changes', 'progress', 'output'];

interface PanelMemory { open?: boolean; tab?: PanelTab; width?: number; }

/**
 * The task view (section 7, 8): the conversation in a centred column, the composer at the bottom, the side panel on
 * demand. The state of the side panel lives in the address: `?panel=…&file=…`, `&max=1` lets the Flow fill the main area.
 */
@Component({
  selector: 'as-task-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [TaskStore, TaskActions],
  imports: [FormsModule, Dialog, TPipe, MarkdownPipe, Icon, StateMark, ErrorLine, Composer, ActivityGroup, AskCard, ChecksCard, ErrorCard, ResultCard, Changes, Progress, StageRail, FlowStage, Output, CommitDialog, UndoDialog],
  templateUrl: './task-view.html',
  styleUrl: './task-view.css',
})
export class TaskView {
  readonly app = inject(AppStore);
  readonly store = inject(TaskStore);
  readonly actions = inject(TaskActions);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18n);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly composer = viewChild<Composer>('composer');

  readonly taskId = input.required<string>();
  readonly panel = input<string | undefined>();
  readonly file = input<string | undefined>();
  readonly out = input<string | undefined>();
  readonly max = input<string | undefined>();

  readonly dialog = signal<{ kind: 'commit' | 'undo' | 'rename'; file?: string } | null>(null);
  title = '';
  readonly menu = signal(false);
  readonly width = signal(this.memory().width ?? 0);
  readonly dragging = signal(false);
  readonly tabs = TABS;
  private pinned = true;

  readonly task = computed(() => this.store.task() ?? this.app.task(this.taskId()));
  /** F5: the header of a done task that no check verified reads "Done · not verified". */
  readonly unverified = computed(() => doneUnverified(this.store.state(), this.task()?.verified, this.task()?.provenance?.class));
  readonly stateKey = stateKey;
  readonly project = computed(() => this.app.project(this.task()?.projectId));
  readonly tab = computed<PanelTab | null>(() => (TABS.includes(this.panel() as PanelTab) ? (this.panel() as PanelTab) : null));
  readonly filled = computed(() => this.max() === '1' && this.tab() === 'progress');
  readonly items = computed<Item[]>(() => { this.store.version(); return [...this.store.timeline.items]; });
  readonly lastId = computed(() => this.items().at(-1)?.id ?? null);
  readonly lastResult = computed(() => [...this.items()].reverse().find(i => i.type === 'result')?.id ?? null);
  readonly pending = computed<CardItem | null>(() => { this.store.version(); return this.store.timeline.pending()[0] ?? null; });
  readonly summary = computed(() => (this.items().filter(i => i.type === 'result').at(-1) as ResultItem | undefined)?.summary ?? '');
  readonly model = computed(() => this.actions.next().model ?? this.task()?.model.ref ?? this.app.defaultModel()?.ref ?? null);
  readonly effort = computed<Effort>(() => this.actions.next().effort ?? this.task()?.model.effort ?? 'medium');
  readonly mode = computed<Mode>(() => this.actions.next().mode ?? this.task()?.mode ?? 'ask');
  readonly approach = computed<Approach>(() => this.actions.next().preset ?? this.task()?.preset ?? 'balanced');
  readonly limits = computed<Limits>(() => this.actions.next().limits ?? this.task()?.limits ?? DEFAULT_LIMITS);
  /** C4: the reached limit being raised in the composer, until the run continues. */
  readonly raising = signal<LimitKind | null>(null);
  /** The live meter of the run: spent against its limits. */
  readonly meter = computed(() => {
    const v = this.store.meter();
    this.i18n.lang();
    return v ? { text: meterText((k, p) => this.i18n.t(k, p), v), near: v.near } : null;
  });
  /** A placeholder asked for by a card ("What should change?"), until the next message is sent. */
  readonly hint = signal<string | null>(null);
  readonly placeholder = computed(() => {
    const hint = this.hint();
    if (hint) return hint;
    const state = this.store.state();
    if (this.pending()?.card.kind === 'question') return 'composer.answer';
    return state === 'working' || state === 'needs_you' ? 'composer.add' : 'composer.reply';
  });
  readonly panelWidth = computed(() => {
    const w = this.width();
    return w > 0 ? Math.max(PANEL_MIN, Math.min(w, Math.round(innerWidth * 0.7))) + 'px' : '40%';
  });
  /** E-15: a start that was not acknowledged in time is an error card with "Retry". */
  readonly startTimeout = computed<ErrorItem | null>(() => this.store.startTimedOut()
    ? { type: 'error', id: 'start-timeout', at: new Date().toISOString(), error: { code: 'start_timeout', params: {} }, state: 'failed', workId: this.task()?.lastRun ?? '' }
    : null);

  constructor() {
    effect(() => {
      const id = this.taskId();
      untracked(() => {
        this.pinned = true;
        this.hint.set(null);
        this.actions.next.set({});
        this.raising.set(null);
        this.actions.failure.set(null);
        void this.store.open(id).then(() => this.opened(id));
      });
    });
    // New items keep the conversation at its end while the user has not scrolled away.
    effect(() => {
      this.items();
      this.store.status();
      untracked(() => queueMicrotask(() => this.follow()));
    });
    // What a card or a step asks the view to show.
    effect(() => {
      const r = this.actions.request();
      if (!r) return;
      untracked(() => {
        this.actions.request.set(null);
        if (r.dialog === 'model') { this.composer()?.open.set('model'); return; }
        if (r.dialog === 'limits') { this.raise(); return; }
        if (r.compose === 'rework') { this.hint.set('composer.rework'); this.composer()?.focus(); return; }
        if (r.dialog) { this.dialog.set({ kind: r.dialog, file: r.file }); return; }
        if (r.panel) this.open(r.panel, { file: r.file, out: r.output });
      });
    });
    // A card that waits while the user looks elsewhere: the desktop says so.
    effect(() => {
      const card = this.pending();
      const task = untracked(() => this.task());
      if (card && task) untracked(() => this.app.notifyNeedsYou(task));
    });
  }

  private memory(): PanelMemory {
    try { return JSON.parse(localStorage.getItem(PANEL) || '{}'); } catch { return {}; }
  }

  private remember(patch: PanelMemory): void {
    try { localStorage.setItem(PANEL, JSON.stringify({ ...this.memory(), ...patch })); } catch { /* storage may be unavailable */ }
  }

  private opened(id: string): void {
    if (this.store.failure()) return;
    try { localStorage.setItem(LAST_TASK, id); } catch { /* storage may be unavailable */ }
    if (this.panel() !== undefined) return;
    // On the user's first task the panel opens on Progress, so the live view is discovered (section 8).
    const first = !this.app.preferences()?.firstTaskDone && this.memory().open === undefined;
    const m = this.memory();
    if (first) this.open('progress', {}, true);
    else if (m.open && innerWidth >= 1100) this.open(m.tab ?? 'changes', {}, true);
    if (this.app.preferences()?.notify === null && this.store.working()) void this.askNotify();
  }

  /** Setting 2 is asked once, while the first task runs. */
  private async askNotify(): Promise<void> {
    if (typeof Notification === 'undefined') return;
    let allowed = Notification.permission === 'granted';
    if (Notification.permission === 'default') {
      try { allowed = (await Notification.requestPermission()) === 'granted'; } catch { allowed = false; }
    }
    void this.app.setPreference('notify', allowed).catch(() => null);
  }

  // ------------------------------------------------------------------------------------------------ side panel

  open(tab: PanelTab, extra: { file?: string; out?: string; max?: boolean } = {}, replace = false): void {
    this.remember({ open: true, tab });
    void this.router.navigate([], { queryParams: { panel: tab, file: extra.file ?? null, out: extra.out ?? null, max: extra.max ? 1 : null }, replaceUrl: replace });
  }

  close(): void {
    this.remember({ open: false });
    void this.router.navigate([], { queryParams: {} });
  }

  toggle(): void { if (this.tab()) this.close(); else this.open(this.memory().tab ?? 'changes'); }

  fill(on: boolean): void { this.open('progress', { max: on }); }

  node(id: FlowNode): void {
    if (id === 'edit') this.open('changes');
    else if (id === 'checks') this.open('output', { out: this.store.output().find(o => o.check)?.id });
    else if (id === 'you') {
      if (this.filled()) this.fill(false);
      queueMicrotask(() => this.toEnd(true));
    }
  }

  grab(ev: PointerEvent): void {
    ev.preventDefault();
    this.dragging.set(true);
    const move = (e: PointerEvent) => this.width.set(Math.max(PANEL_MIN, innerWidth - e.clientX));
    const up = () => {
      this.dragging.set(false);
      this.remember({ width: this.width() });
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  }

  // ------------------------------------------------------------------------------------------------ conversation

  scrolled(): void {
    const el = this.scroller()?.nativeElement;
    if (el) this.pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  private follow(): void { if (this.pinned) this.toEnd(false); }

  private toEnd(smooth: boolean): void {
    const el = this.scroller()?.nativeElement;
    if (!el) return;
    const card = el.querySelector<HTMLElement>('.card.attn');
    if (smooth && card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.focus({ preventScroll: true }); return; }
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }

  clock(seconds: number): string { return clockOf(seconds); }

  send(text: string): void {
    this.pinned = true;
    this.hint.set(null);
    void this.actions.message(text).then(() => this.actions.next.set({}));
  }

  choose(patch: { model?: string; effort?: Effort; mode?: Mode; preset?: Approach; limits?: Limits }): void { this.actions.next.update(n => ({ ...n, ...patch })); }

  /** R11: "Raise the limit and continue" shows the raised number first — the reached limit doubled — in the composer. */
  private raise(): void {
    const task = this.task();
    const kind = limitKindOf(task?.reason?.code);
    if (!task || !kind) return;
    this.raising.set(kind);
    this.choose({ limits: raised(task.limits ?? DEFAULT_LIMITS, kind) });
    queueMicrotask(() => this.composer()?.open.set('limits'));
  }

  async raiseAndContinue(): Promise<void> {
    const limits = this.limits();
    this.leaveRaise();
    await this.actions.resume(limits);
  }

  /** The raise ends — confirmed or left: the doubled limits never stay behind for the next message. */
  leaveRaise(): void {
    if (!this.raising()) return;
    this.raising.set(null);
    this.actions.next.update(n => ({ ...n, limits: undefined }));
  }

  rename(): void {
    this.menu.set(false);
    this.title = this.task()?.title ?? '';
    this.dialog.set({ kind: 'rename' });
  }

  async saveTitle(): Promise<void> {
    const task = this.task();
    if (task && await this.actions.rename(task.id, this.title)) this.dialog.set(null);
  }

  @HostListener('document:click')
  closeMenu(): void { this.menu.set(false); }

  /** Ctrl+Shift+D toggles Changes; Escape closes the panel (dialogs take Escape first). */
  @HostListener('document:keydown', ['$event'])
  key(ev: KeyboardEvent): void {
    if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && ev.key.toLowerCase() === 'd') {
      ev.preventDefault();
      if (this.tab() === 'changes') this.close(); else this.open('changes');
      return;
    }
    if (ev.key === 'Escape' && !ev.defaultPrevented && !this.dialog() && !document.querySelector('as-dialog')) {
      if (this.composer()?.open()) return;
      if (this.filled()) this.fill(false);
      else if (this.tab()) this.close();
    }
  }
}
