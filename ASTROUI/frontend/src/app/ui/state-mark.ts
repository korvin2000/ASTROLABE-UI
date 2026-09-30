import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TaskState } from '../core/model';
import { I18n } from '../i18n/i18n';

/**
 * The one status mark of a task (section 4.2): working, needs you, paused, done, stopped, failed. The state is never
 * shown by colour alone: every mark has its own shape and an accessible name.
 */
@Component({
  selector: 'as-state-mark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (state()) {
      @case ('working') { <span class="dot work" role="img" [attr.aria-label]="label()"></span> }
      @case ('needs_you') { <span class="dot need" role="img" [attr.aria-label]="label()"></span> }
      @case ('paused') { <span class="dot pause" role="img" [attr.aria-label]="label()"></span> }
      @case ('done') { <span class="mark ok" role="img" [attr.aria-label]="label()">✓</span> }
      @case ('stopped') { <span class="mark sq" role="img" [attr.aria-label]="label()"></span> }
      @case ('failed') { <span class="mark bad" role="img" [attr.aria-label]="label()">!</span> }
    }`,
  styles: [`
    :host { display: inline-flex; align-items: center; justify-content: center; width: 10px; flex: none; }
    .sq { width: 7px; height: 7px; background: var(--faint); border-radius: 1.5px; }
    .bad { font-weight: 700; }
  `],
})
export class StateMark {
  private readonly i18n = inject(I18n);
  readonly state = input.required<TaskState>();

  label(): string { return this.i18n.t('state.' + this.state()); }
}
