import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Effort, Mode, Project, UsableModel } from '../../core/model';
import { TPipe } from '../../i18n/i18n';
import { AppStore } from '../../state/app.store';
import { Icon } from '../../ui/icon';
import { ModelPicker } from '../accounts/model-picker';
import { sends } from './keys';
import { fitEffort } from './effort';

/**
 * The composer (section 7.1): text and four controls — project, model and effort, mode, send. Send becomes Stop while
 * the task works. Nothing else lives here.
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

  readonly open = signal<'project' | 'model' | 'mode' | null>(null);
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

  toggle(menu: 'project' | 'model' | 'mode', ev: Event): void {
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
