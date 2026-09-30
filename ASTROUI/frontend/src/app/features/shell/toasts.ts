import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AppStore, Toast } from '../../state/app.store';
import { TPipe } from '../../i18n/i18n';

/** Short confirmations ("Committed", "Undone"); errors are never toasts, they are cards or lines where they happened. */
@Component({
  selector: 'as-toasts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe],
  template: `
    <div class="stack" aria-live="polite">
      @for (t of app.toasts(); track t.id) {
        <div class="toast" [class.ok]="t.tone === 'ok'" [class.bad]="t.tone === 'bad'">
          <span class="grow">{{ t.text }}</span>
          @if (t.taskId) { <button class="lnk" (click)="open(t)">{{ 'action.open' | t }}</button> }
          <button class="icon-btn" (click)="app.dismiss(t.id)" [attr.aria-label]="'action.close' | t">✕</button>
        </div>
      }
    </div>`,
  styles: [`
    .stack { position: fixed; right: 18px; bottom: 18px; z-index: 60; display: flex; flex-direction: column; gap: 8px; max-width: 380px; }
    .toast { display: flex; gap: 10px; align-items: center; background: var(--raised); border: 1px solid var(--border); border-radius: 10px; box-shadow: var(--shadow); padding: 8px 8px 8px 14px; }
    .toast.bad { border-color: var(--bad); }
  `],
})
export class Toasts {
  readonly app = inject(AppStore);
  private readonly router = inject(Router);

  open(t: Toast): void {
    this.app.dismiss(t.id);
    void this.router.navigate(['/t', t.taskId]);
  }
}
