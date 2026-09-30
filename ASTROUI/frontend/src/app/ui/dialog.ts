import { ChangeDetectionStrategy, Component, ElementRef, HostListener, afterNextRender, inject, input, output } from '@angular/core';

/**
 * A dialog over the page. Escape and a click on the veil close it; focus moves into it when it opens and stays
 * inside while it is open.
 */
@Component({
  selector: 'as-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="veil" (mousedown)="veil($event)">
      <div class="dlg" [class.wide]="wide()" role="dialog" aria-modal="true" [attr.aria-label]="label()" tabindex="-1">
        <ng-content />
      </div>
    </div>`,
})
export class Dialog {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly label = input.required<string>();
  readonly wide = input(false);
  readonly closed = output<void>();

  constructor() {
    afterNextRender(() => {
      const box = this.host.nativeElement.querySelector<HTMLElement>('.dlg');
      const first = box?.querySelector<HTMLElement>('[autofocus], input, textarea, button.pri');
      (first ?? box)?.focus();
    });
  }

  veil(ev: MouseEvent): void {
    if ((ev.target as HTMLElement).classList.contains('veil')) this.closed.emit();
  }

  @HostListener('document:keydown.escape', ['$event'])
  escape(ev: Event): void {
    ev.stopPropagation();
    this.closed.emit();
  }

  @HostListener('keydown.tab', ['$event'])
  @HostListener('keydown.shift.tab', ['$event'])
  trap(ev: Event): void {
    const e = ev as KeyboardEvent;
    const items = [...this.host.nativeElement.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])')];
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}
