import { ChangeDetectionStrategy, Component, ElementRef, HostListener, afterNextRender, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Effort, UsableModel } from '../../core/model';
import { tokens } from '../../core/format';
import { I18n, TPipe } from '../../i18n/i18n';
import { AppStore } from '../../state/app.store';
import { fitEffort } from '../task/effort';

const EFFORTS: Effort[] = ['low', 'medium', 'high'];

/**
 * The model picker (section 6.4): one control, in the composer and in Settings. Models of connected accounts only;
 * each row has its name, account and price mark, the context size on hover. Effort shows the levels the model supports.
 */
@Component({
  selector: 'as-model-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TPipe],
  template: `
    <div class="pop" role="dialog" [attr.aria-label]="'picker.title' | t" (click)="$event.stopPropagation()">
      <div class="top">
        <input class="input" [(ngModel)]="query" (ngModelChange)="search.set($event)" [placeholder]="'picker.search' | t" [attr.aria-label]="'picker.search' | t"
          (keydown.arrowdown)="move(1, $event)" (keydown.arrowup)="move(-1, $event)" (keydown.enter)="pickActive($event)">
        <button class="re" type="button" [class.busy]="refreshing()" [disabled]="refreshing()" [title]="'picker.refresh' | t" [attr.aria-label]="'picker.refresh' | t" (click)="refresh()">⟳</button>
      </div>
      @if (refreshFailed()) { <div class="none muted" role="status">{{ 'picker.refresh_failed' | t }}</div> }
      <div class="rows" role="listbox">
        @if (recommended().length) { <div class="sec">{{ 'picker.recommended' | t }}</div> }
        @for (m of recommended(); track m.ref) {
          <button class="opt" role="option" [class.sel]="m.ref === model()" [class.act]="m.ref === active()" [attr.aria-selected]="m.ref === model()" [title]="hint(m)" (click)="pick(m)">
            <span class="d">◆</span><span class="n ellipsis">{{ m.name }}</span><small class="ellipsis">{{ m.account }}</small><em>{{ price(m) }}</em>
          </button>
        }
        @if (others().length) { <div class="sec">{{ 'picker.all' | t }}</div> }
        @for (m of others(); track m.ref) {
          <button class="opt" role="option" [class.sel]="m.ref === model()" [class.act]="m.ref === active()" [attr.aria-selected]="m.ref === model()" [title]="hint(m)" (click)="pick(m)">
            <span class="d"></span><span class="n ellipsis">{{ m.name }}</span><small class="ellipsis">{{ m.account }}</small><em>{{ price(m) }}</em>
          </button>
        }
        @if (!recommended().length && !others().length) { <div class="none muted">{{ (app.models().length ? 'picker.no_match' : 'empty.accounts') | t }}</div> }
        @if (hiddenCount() > 0) { <div class="none muted">{{ 'picker.more' | t: { n: hiddenCount() } }}</div> }
      </div>
      @if (efforts().length) {
        <div class="eff">
          <span>{{ 'picker.effort' | t }}</span>
          <span class="seg" role="radiogroup" [attr.aria-label]="'picker.effort' | t">
            @for (e of efforts(); track e) { <button role="radio" [class.on]="e === effort()" [attr.aria-checked]="e === effort()" (click)="effortChange.emit(e)">{{ ('effort.' + e) | t }}</button> }
          </span>
        </div>
      }
      @if (running()) { <div class="later muted">{{ 'picker.applies_next' | t }}</div> }
    </div>`,
  styles: [`
    :host { display: block; }
    .pop { width: 360px; max-width: calc(100vw - 32px); background: var(--raised); border: 1px solid var(--border); border-radius: 10px; box-shadow: var(--shadow); padding: 8px; }
    .top { display: flex; gap: 6px; align-items: center; }
    .top .input { flex: 1; min-width: 0; }
    .re { flex: none; width: 30px; height: 30px; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: var(--muted); font-size: 15px; line-height: 1; }
    .re:hover:not(:disabled) { background: var(--hover); color: inherit; }
    .re.busy { opacity: .5; }
    .rows { max-height: 320px; overflow: auto; margin-top: 6px; }
    .sec { font-size: 11px; font-weight: 600; color: var(--faint); padding: 6px 8px 2px; }
    .opt { display: flex; gap: 8px; padding: 5px 8px; border-radius: 6px; align-items: center; width: 100%; border: 0; background: transparent; text-align: left; }
    .opt:hover, .opt.act { background: var(--hover); }
    .opt.sel { background: var(--accent-soft); }
    .opt .d { width: 12px; color: var(--accent); font-size: 11px; flex: none; }
    .opt .n { flex: 1; min-width: 0; }
    .opt small { color: var(--muted); max-width: 110px; }
    .opt em { font-style: normal; color: var(--faint); width: 58px; text-align: right; font-size: 12px; flex: none; }
    .none { padding: 10px 8px; font-size: 13px; }
    .eff { display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--border); margin-top: 6px; padding: 8px 8px 2px; }
    .later { border-top: 1px solid var(--border); margin-top: 8px; padding: 8px 8px 2px; font-size: 13px; }
  `],
})
export class ModelPicker {
  readonly app = inject(AppStore);
  private readonly i18n = inject(I18n);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly model = input<string | null>(null);
  readonly effort = input<Effort>('medium');
  /** The task works: a change applies from the next message, and the picker says so. */
  readonly running = input(false);
  readonly modelChange = output<UsableModel>();
  readonly effortChange = output<Effort>();
  readonly closed = output<void>();

  readonly search = signal('');
  readonly active = signal<string | null>(null);
  readonly refreshing = signal(false);
  readonly refreshFailed = signal(false);
  query = '';

  private readonly LIMIT = 60;

  private readonly matching = computed(() => {
    const q = this.search().trim().toLowerCase();
    const all = this.app.models();
    return q ? all.filter(m => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q) || m.account.toLowerCase().includes(q)) : all;
  });
  readonly recommended = computed(() => this.matching().filter(m => m.recommended));
  readonly others = computed(() => this.matching().filter(m => !m.recommended).slice(0, this.LIMIT));
  readonly hiddenCount = computed(() => Math.max(0, this.matching().filter(m => !m.recommended).length - this.LIMIT));
  readonly efforts = computed<Effort[]>(() => {
    const m = this.app.models().find(x => x.ref === this.model());
    return m ? EFFORTS.filter(e => m.efforts.includes(e)) : [];
  });

  constructor() {
    afterNextRender(() => this.host.nativeElement.querySelector('input')?.focus());
  }

  price(m: UsableModel): string {
    if (!m.price) return '';
    const mark = m.price === 'unpriced' || m.price === 'free' ? this.i18n.t('price.' + m.price) : m.price;
    return m.nominal ? this.i18n.t('price.nominal', { price: mark }) : mark;
  }

  hint(m: UsableModel): string {
    return m.context ? this.i18n.t('picker.context', { model: m.id, tokens: tokens(m.context) }) : m.id;
  }

  pick(m: UsableModel): void {
    this.modelChange.emit(m);
    // The effort of the task stays when the new model supports it; otherwise the nearest level it has.
    const fitted = fitEffort(m.efforts, this.effort());
    if (fitted && fitted !== this.effort()) this.effortChange.emit(fitted);
  }

  /** Asks the providers for their model lists again; the list shown stays as it is when that fails. */
  async refresh(): Promise<void> {
    if (this.refreshing()) return;
    this.refreshing.set(true);
    this.refreshFailed.set(false);
    try {
      await this.app.refreshModels();
    } catch {
      this.refreshFailed.set(true);
    } finally {
      this.refreshing.set(false);
    }
  }

  private visible(): UsableModel[] { return [...this.recommended(), ...this.others()]; }

  move(step: number, ev: Event): void {
    ev.preventDefault();
    const list = this.visible();
    if (!list.length) return;
    const i = list.findIndex(m => m.ref === this.active());
    this.active.set(list[(i + step + list.length) % list.length].ref);
  }

  pickActive(ev: Event): void {
    ev.preventDefault();
    const list = this.visible();
    const m = list.find(x => x.ref === this.active()) ?? (list.length === 1 ? list[0] : null);
    if (m) { this.pick(m); this.closed.emit(); }
  }

  @HostListener('document:keydown.escape')
  escape(): void { this.closed.emit(); }
}
