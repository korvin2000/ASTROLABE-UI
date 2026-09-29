import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Api } from '../../core/api';
import { AppStore } from '../../state/app.store';
import { Inspector } from '../shell/inspector';
import { Icon } from '../../ui/icon';
import { Glyph } from '../../ui/glyph';
import { dateTime } from '../../core/format';

/**
 * Knowledge (§15): notes are data, never instructions (R-KB-01) — browse admitted notes, the admission queue with
 * provenance, and usage. Curator operations need the knowledge bridge (G-10); until it lands they are shown as
 * not available instead of offered.
 */
@Component({
  selector: 'as-knowledge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, Glyph],
  template: `
    <div class="head">
      <as-icon name="book" [size]="16" /><b>Knowledge</b><span class="grow"></span>
      <select class="select sm" [value]="pid()" (change)="selected.set($any($event.target).value)">
        @for (p of app.projects(); track p.id) { <option [value]="p.id" [selected]="p.id === pid()">{{ p.name }}</option> }
      </select>
    </div>
    <div class="scroll body">
      <div class="banner info small"><as-icon name="info" [size]="14" /> Injection mode is <b class="mono">{{ injection() }}</b> (Settings › Knowledge; off until evaluated). Admit / reject / supersede / rollback run through the curator, which needs the knowledge bridge (G-10) — not available in this build.</div>
      <div class="seg">
        <button [class.on]="tab() === 'queue'" (click)="tab.set('queue')">Inbox ({{ queue().length }})</button>
        <button [class.on]="tab() === 'notes'" (click)="tab.set('notes')">Notes ({{ notes().length }})</button>
        <button [class.on]="tab() === 'usage'" (click)="tab.set('usage')">Usage ({{ usage().length }})</button>
      </div>
      @switch (tab()) {
        @case ('queue') {
          <table class="table"><thead><tr><th>Entry</th><th>Note</th><th>Status</th><th>Origin</th><th>Recorded</th></tr></thead><tbody>
            @for (q of queue(); track q.id) {
              <tr class="clickable" (click)="open('Queue entry ' + q.id, q.body)"><td class="mono small">{{ q.id }}</td><td class="mono small">{{ q.noteId }}</td>
                <td><as-glyph [status]="q.status" [size]="11" /> {{ q.status }}</td><td class="mono small">{{ q.workId }}</td><td class="small">{{ when(q.createdAt) }}</td></tr>
            } @empty { <tr><td colspan="5" class="dim small">No candidates waiting.</td></tr> }
          </tbody></table>
        }
        @case ('notes') {
          <table class="table"><thead><tr><th>Note</th><th>Kind</th><th>Status</th><th>Summary</th></tr></thead><tbody>
            @for (n of notes(); track n.noteId) {
              <tr class="clickable" (click)="open(n.noteId, n.body)"><td class="mono small">{{ n.noteId }}</td><td class="mono">{{ n.kind }}</td>
                <td><as-glyph [status]="n.status === 'admitted' ? 'verified' : n.status" [size]="11" /> {{ n.status }}</td><td class="small">{{ n.summary }}</td></tr>
            } @empty { <tr><td colspan="4" class="dim small">No notes in this project.</td></tr> }
          </tbody></table>
        }
        @case ('usage') {
          <table class="table"><thead><tr><th>Note</th><th>Cell</th><th>Used</th></tr></thead><tbody>
            @for (u of usage(); track $index) { <tr><td class="mono small">{{ u.noteId }}</td><td class="mono small">{{ u.contextId }}</td><td class="small">{{ when(u.usedAt) }}</td></tr> }
            @empty { <tr><td colspan="3" class="dim small">No injections recorded.</td></tr> }
          </tbody></table>
        }
      }
    </div>`,
  styles: [`
    :host{display:flex;flex-direction:column;height:100%;min-height:0}
    .head{display:flex;align-items:center;gap:10px;height:48px;padding:0 16px;border-bottom:1px solid var(--border-subtle);flex:none}
    .select.sm{height:26px}
    .body{flex:1;padding:14px 16px 30px;display:flex;flex-direction:column;gap:10px;max-width:1200px;width:100%;margin:0 auto}
    .small{font-size:12px}
    .seg{align-self:flex-start}
  `],
})
export class KnowledgePage {
  readonly app = inject(AppStore);
  private readonly api = inject(Api);
  private readonly inspector = inject(Inspector);
  readonly projectId = input<string | undefined>(undefined);
  readonly selected = signal<string | null>(null);
  readonly tab = signal<'queue' | 'notes' | 'usage'>('queue');
  readonly data = signal<any>(null);
  readonly injection = signal('Off');
  readonly pid = computed(() => this.selected() ?? this.projectId() ?? this.app.projects()[0]?.id ?? '');
  readonly notes = computed(() => (this.data()?.notes ?? []) as any[]);
  readonly queue = computed(() => (this.data()?.queue ?? []) as any[]);
  readonly usage = computed(() => (this.data()?.usage ?? []) as any[]);

  constructor() {
    effect(() => {
      const id = this.pid();
      if (!id) return;
      this.api.get(`/projects/${id}/kb`).then(d => this.data.set(d)).catch(e => this.app.error(e, 'Knowledge'));
      this.api.get<any>(`/settings/effective?project=${id}`).then(s => this.injection.set(s?.config?.flags?.kbInjection ?? 'Off')).catch(() => {});
    });
  }

  open(title: string, body: any): void { this.inspector.open({ type: 'json', title, data: body }); }
  when(iso: string): string { return dateTime(iso); }
}
