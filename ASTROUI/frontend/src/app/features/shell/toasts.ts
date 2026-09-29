import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AppStore } from '../../state/app.store';
import { Icon } from '../../ui/icon';

/** Toasts (§4.2): bottom-right above the composer, at most three; command results and connection state only. */
@Component({
  selector: 'as-toasts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <div class="stack" role="status" aria-live="polite">
      @for (t of app.toasts(); track t.id) {
        <div class="toast" [class]="t.tone">
          <i class="bar"></i>
          <div class="grow">
            <div class="t">{{ t.title }}</div>
            @if (t.body) { <div class="b">{{ t.body }}</div> }
          </div>
          @if (t.action) { <button class="btn sm" (click)="t.action.run(); app.dismissToast(t.id)">{{ t.action.label }}</button> }
          <button class="btn ghost sm icon" (click)="app.dismissToast(t.id)" aria-label="Dismiss"><as-icon name="x" [size]="13" /></button>
        </div>
      }
    </div>`,
  styles: [`
    :host{position:fixed;right:16px;bottom:150px;z-index:70;pointer-events:none}
    .stack{display:flex;flex-direction:column;gap:8px;align-items:flex-end}
    .toast{pointer-events:auto;display:flex;align-items:flex-start;gap:10px;width:min(420px,90vw);padding:10px 10px 10px 0;background:var(--bg-raised);
      border:1px solid var(--border-default);border-radius:8px;box-shadow:var(--shadow-overlay);animation:in var(--dur-base) var(--ease);overflow:hidden}
    @keyframes in{from{transform:translateY(8px);opacity:0}to{transform:none;opacity:1}}
    .bar{width:3px;align-self:stretch;border-radius:0 2px 2px 0;background:var(--accent);margin-right:2px}
    .ok .bar{background:var(--success)} .bad .bar{background:var(--danger)} .warn .bar{background:var(--attention)} .neutral .bar{background:var(--neutral-mark)}
    .t{font-weight:600;font-size:12.5px}
    .b{font-size:12px;color:var(--text-secondary);margin-top:2px;overflow-wrap:anywhere}
  `],
})
export class Toasts {
  readonly app = inject(AppStore);
}
