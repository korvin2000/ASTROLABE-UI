import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Approach, Effort, Limits, Mode, Project, UsableModel } from '../../core/model';
import { I18n, TPipe } from '../../i18n/i18n';
import { AppStore } from '../../state/app.store';
import { Icon } from '../../ui/icon';
import { ModelPicker } from '../accounts/model-picker';
import { sends } from './keys';
import { fitEffort } from './effort';
import { APPROACHES, DEFAULT_LIMITS, LimitKind, NO_LIMITS, limitsText, parseLimit, raises } from './limits';

/**
 * The composer (section 7.1): text and five controls — project, model and effort, mode, approach and limits (C4),
 * send. Send becomes Stop while the task works. Nothing else lives here.
 */
@Component({
  selector: 'as-composer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TPipe, Icon, ModelPicker],
  templateUrl: './composer.html',
  styleUrl: './composer.css',
})
export class Composer {
  readonly app = inject(AppStore);
  private readonly area = viewChild<ElementRef<HTMLTextAreaElement>>('area');

  readonly placeholder = input('composer.placeholder');
  readonly projectId = input<string | null>(null);
  /** In a task the project is fixed: a task belongs to one project. */
  readonly projectFixed = input(false);
  readonly model = input<string | null>(null);
  readonly effort = input<Effort>('medium');
  readonly mode = input<Mode>('ask');
  readonly working = input(false);
  readonly busy = input(false);
  /** Menus open upwards at the bottom of a conversation, downwards on the new-task page. */
  readonly up = input(true);

  readonly send = output<string>();
  readonly stop = output<void>();
  readonly projectChange = output<string>();
  readonly modelChange = output<string>();
  readonly effortChange = output<Effort>();
  readonly modeChange = output<Mode>();
  readonly openFolder = output<void>();
  /** C4: the approach and the limits of the next run; in a task, the reached limit being raised. */
  readonly approach = input<Approach>('balanced');
  readonly limits = input<Limits>(DEFAULT_LIMITS);
  readonly raise = input<LimitKind | null>(null);
  /** The limits the raise is measured against: the stopped run's. */
  readonly reached = input<Limits | null>(null);
  readonly approachChange = output<Approach>();
  readonly limitsChange = output<Limits>();
  readonly raiseConfirm = output<void>();

  readonly open = signal<'project' | 'model' | 'mode' | 'limits' | null>(null);
  readonly approaches = APPROACHES;
  readonly kinds: LimitKind[] = ['money', 'minutes', 'requests'];
  readonly invalid = signal(false);
  private readonly i18n = inject(I18n);
  readonly budgetText = computed(() => { this.i18n.lang(); return limitsText((k, p) => this.i18n.t(k, p), this.limits()); });
  /** A raise is confirmed only once the reached limit is raised or cleared (no spend on one click without a number). */
  readonly raiseReady = computed(() => {
    const kind = this.raise();
    const before = this.reached();
    return !!kind && !!before && raises(this.limits(), before, kind);
  });
  text = '';

  readonly project = computed<Project | null>(() => this.app.project(this.projectId()));
  readonly chosen = computed<UsableModel | null>(() => this.app.models().find(m => m.ref === this.model()) ?? null);
  /** The effort the chosen model will work with; a model without the chosen level uses the nearest one it has. */
  readonly fitted = computed(() => fitEffort(this.chosen()?.efforts ?? [], this.effort()));
  readonly canSend = signal(false);

  focus(): void { this.area()?.nativeElement.focus(); }

  set(text: string): void {
    this.text = text;
    this.canSend.set(!!text.trim());
    queueMicrotask(() => { this.grow(); this.focus(); });
  }

  changed(): void {
    this.canSend.set(!!this.text.trim());
    this.grow();
  }

  private grow(): void {
    const el = this.area()?.nativeElement;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 240) + 'px';
  }

  key(ev: KeyboardEvent): void {
    if (sends(ev, this.app.preferences()?.sendWith ?? 'enter')) {
      ev.preventDefault();
      this.submit();
    }
  }

  submit(): void {
    const text = this.text.trim();
    if (!text || this.busy()) return;
    this.send.emit(text);
    this.text = '';
    this.canSend.set(false);
    queueMicrotask(() => this.grow());
  }

  /** The text of a limit field: empty is no limit. */
  field(kind: LimitKind): string {
    const l = this.limits();
    const v = kind === 'money' ? l.moneyUsd : kind === 'minutes' ? l.minutes : l.requests;
    return v === null ? '' : String(v);
  }

  setLimit(kind: LimitKind, text: string): void {
    const v = parseLimit(kind, text);
    this.invalid.set(v === undefined);
    if (v === undefined) return;
    const key = kind === 'money' ? 'moneyUsd' : kind;
    this.limitsChange.emit({ ...this.limits(), [key]: v });
  }

  noLimits(): void {
    this.invalid.set(false);
    this.limitsChange.emit({ ...NO_LIMITS });
  }

  toggle(menu: 'project' | 'model' | 'mode' | 'limits', ev: Event): void {
    ev.stopPropagation();
    this.open.update(o => (o === menu ? null : menu));
  }

  @HostListener('document:click')
  @HostListener('document:keydown.escape')
  close(): void { this.open.set(null); }

  pickProject(p: Project): void {
    this.projectChange.emit(p.id);
    this.close();
  }

  pickModel(m: UsableModel): void {
    this.modelChange.emit(m.ref);
    this.close();
  }

  pickMode(m: Mode): void {
    this.modeChange.emit(m);
    this.close();
  }

  folder(): void {
    this.close();
    this.openFolder.emit();
  }
}
