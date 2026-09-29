import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AppStore, decisionTitle } from '../../state/app.store';
import { DecisionCard } from './decision-card';
import { Icon } from '../../ui/icon';

/** "Needs you" (§13.8): every pending decision grouped by project and campaign, oldest first; resolved stay visible. */
@Component({
  selector: 'as-inbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecisionCard, Icon],
  template: `
    <div class="head">
      <as-icon name="flag" [size]="16" /><b>Needs you</b><span class="meta">{{ app.pendingDecisions().length }} pending</span>
      <span class="grow"></span>
      <select class="select sm" [value]="kind()" (change)="kind.set($any($event.target).value)">
        <option value="">All kinds</option>
        @for (k of kinds; track k) { <option [value]="k" [selected]="k === kind()">{{ title(k) }}</option> }
      </select>
    </div>
    <div class="scroll body">
      <div class="wrap">
        @for (g of groups(); track g.key) {
          <div class="group">
            <div class="gh micro">{{ g.label }}</div>
            @for (d of g.items; track d.id) { <as-decision-card [decision]="d" /> }
          </div>
        } @empty {
          <div class="empty"><as-icon name="check" [size]="22" /><span>Nothing needs you right now. Questions, D-class approvals, amendments, reviews and publication stages appear here.</span></div>
        }
        @if (resolved().length) {
          <div class="gh micro">Resolved this session</div>
          @for (d of resolved(); track d.id) { <as-decision-card [decision]="d" [compact]="true" /> }
        }
      </div>
    </div>`,
  styles: [`
    :host{display:flex;flex-direction:column;height:100%;min-height:0}
    .head{display:flex;align-items:center;gap:10px;height:48px;padding:0 16px;border-bottom:1px solid var(--border-subtle);flex:none}
    .select.sm{height:26px}
    .body{flex:1}
    .wrap{max-width:960px;margin:0 auto;padding:14px 20px 40px}
    .gh{margin:14px 0 4px}
  `],
})
export class InboxPage {
  readonly app = inject(AppStore);
  readonly kind = signal('');
  readonly kinds = ['question', 'effect', 'publication', 'plan_acceptance', 'amendment', 'kb_admission', 'review'];
  readonly groups = computed(() => {
    const k = this.kind();
    const map = new Map<string, { key: string; label: string; items: any[] }>();
    for (const d of this.app.pendingDecisions()) {
      if (k && d.kind !== k) continue;
      const c = this.app.campaign(d.workId);
      const p = this.app.project(d.projectId);
      const key = (d.projectId ?? '') + '/' + (d.workId ?? '');
      if (!map.has(key)) map.set(key, { key, label: `${p?.name ?? d.projectId ?? 'Studio'} · ${c?.title ?? d.workId ?? ''}`, items: [] });
      map.get(key)!.items.push(d);
    }
    return [...map.values()];
  });
  readonly resolved = computed(() => this.app.resolvedDecisions().slice(0, 30));
  title(k: string): string { return decisionTitle(k); }
}
