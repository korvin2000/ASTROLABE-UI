import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { ErrorInfo } from '../core/model';
import { I18n, TPipe } from '../i18n/i18n';

/** The sentence of an error (section 10): the text of its code from the catalog, `agent_error` for a code nobody knows. */
export function sentence(i18n: I18n, error: ErrorInfo): string {
  const key = 'error.' + error.code;
  return i18n.t(i18n.has(key) ? key : 'error.agent_error', error.params ?? {});
}

/**
 * An error in the dialog where it happened (section 10 rule 1): one plain sentence and "Details" with the raw reason.
 */
@Component({
  selector: 'as-error-line',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe],
  template: `
    <div class="line-error" role="alert">
      {{ text() }}
      @if (error().detail) {
        <button class="lnk" (click)="open.set(!open())">{{ 'action.details' | t }}</button>
        @if (open()) { <pre>{{ error().detail }}</pre> }
      }
    </div>`,
  styles: [`
    pre { margin: 6px 0 0; padding: 8px 10px; background: var(--side); border: 1px solid var(--border); border-radius: 6px; color: var(--muted); white-space: pre-wrap; word-break: break-word; font: 12.5px/1.5 var(--mono); max-height: 160px; overflow: auto; }
    .lnk { margin-left: 6px; font-size: 13px; }
  `],
})
export class ErrorLine {
  private readonly i18n = inject(I18n);
  readonly error = input.required<ErrorInfo>();
  readonly open = signal(false);
  readonly text = computed(() => { this.i18n.lang(); return sentence(this.i18n, this.error()); });
}
