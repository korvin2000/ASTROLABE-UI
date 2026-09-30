import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Api } from '../../core/api';
import { OutputEntry } from '../../core/model';
import { I18n, TPipe } from '../../i18n/i18n';
import { TaskStore } from '../../state/task.store';
import { elapsed } from '../../ui/units';

/**
 * Output (section 8.3): the commands the agent ran, newest first — command, result mark, duration. Selecting one
 * shows its output in a monospace block with "Copy". Check runs are marked "check".
 */
@Component({
  selector: 'as-output',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe],
  template: `
    @for (o of store.output(); track o.id) {
      <button class="cmd" [class.sel]="o.id === chosen()" (click)="pick(o)">
        <span class="m" [class.ok]="good(o)" [class.bad]="bad(o)" aria-hidden="true">{{ good(o) ? '✓' : bad(o) ? '!' : o.status === 'running' ? '…' : '·' }}</span>
        <code class="ellipsis grow">{{ o.check ? ('output.checks' | t) : o.command }}</code>
        @if (o.check) { <span class="tag">{{ 'output.check' | t }}</span> }
        <span class="sr-only">{{ ('output.status.' + word(o)) | t }}</span>
        <span class="faint small">{{ time(o) }}</span>
      </button>
    } @empty { <p class="muted none">{{ 'empty.output' | t }}</p> }

    @if (current(); as o) {
      <div class="out">
        <div class="h">
          <code class="ellipsis grow">{{ o.check ? ('output.checks' | t) : o.command }}</code>
          @if (text()) { <button class="lnk" (click)="copy()">{{ (copied() ? 'action.copied' : 'action.copy') | t }}</button> }
        </div>
        @if (loading()) { <div class="pad"><span class="spin"></span></div> }
        @else if (text()) { <pre tabindex="0">{{ text() }}</pre> }
        @else { <div class="pad muted">{{ 'output.none' | t }}</div> }
        @if (truncated()) { <div class="pad muted small">{{ 'output.truncated' | t }}</div> }
      </div>
    }`,
  styles: [`
    :host { display: block; }
    .cmd { display: flex; gap: 8px; align-items: center; width: 100%; border: 0; background: transparent; border-radius: 6px; padding: 5px 8px; text-align: left; }
    .cmd:hover, .cmd.sel { background: var(--hover); }
    .m { width: 12px; text-align: center; font-weight: 600; flex: none; }
    .tag { font-size: 11px; color: var(--muted); border: 1px solid var(--border); border-radius: 4px; padding: 0 5px; }
    .none { padding: 8px; }
    .out { margin-top: 12px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    .h { display: flex; gap: 10px; padding: 5px 10px; background: var(--side); color: var(--muted); border-bottom: 1px solid var(--border); }
    pre { margin: 0; padding: 10px; font: 12.5px/1.55 var(--mono); white-space: pre-wrap; word-break: break-word; max-height: 60vh; overflow: auto; }
    .pad { padding: 10px; }
  `],
})
export class Output {
  readonly store = inject(TaskStore);
  private readonly api = inject(Api);
  private readonly i18n = inject(I18n);

  /** The output to open, from a step or a card of the conversation; `work:number` names it by its stored output. */
  readonly select = input<string | null | undefined>(null);

  readonly chosen = signal<string | null>(null);
  readonly text = signal('');
  readonly truncated = signal(false);
  readonly loading = signal(false);
  readonly copied = signal(false);
  readonly current = computed(() => this.store.output().find(o => o.id === this.chosen()) ?? null);

  constructor() {
    effect(() => {
      const wanted = this.select();
      const list = this.store.output();
      untracked(() => {
        const match = wanted ? list.find(o => o.id === wanted || o.id.startsWith(wanted + ':')) : null;
        if (match && match.id !== this.chosen()) void this.pick(match);
        // Without a choice the last check is shown: it is what "Verified" rests on.
        else if (!this.chosen() && list.length) void this.pick(list.find(o => o.check) ?? list[0]);
      });
    });
  }

  word(o: OutputEntry): string { return this.good(o) ? 'ok' : this.bad(o) ? 'failed' : o.status === 'running' ? 'running' : 'unknown'; }

  good(o: OutputEntry): boolean { return ['ok', 'passed'].includes(o.status); }

  bad(o: OutputEntry): boolean { return ['failed', 'timeout', 'deadline_exceeded', 'refused', 'denied', 'infra_error'].includes(o.status); }

  time(o: OutputEntry): string { return o.durationMs && o.durationMs >= 100 ? elapsed(this.i18n, Math.max(1000, o.durationMs)) : ''; }

  async pick(o: OutputEntry): Promise<void> {
    this.chosen.set(o.id);
    this.text.set('');
    this.truncated.set(false);
    if (o.output === undefined) return;
    this.loading.set(true);
    try {
      const r = await this.api.get<{ available: boolean; text?: string; truncated?: boolean }>(
        '/tasks/' + encodeURIComponent(this.store.taskId() ?? '') + '/output/' + encodeURIComponent(o.id));
      if (this.chosen() === o.id) {
        this.text.set(r.available ? r.text ?? '' : '');
        this.truncated.set(!!r.truncated);
      }
    } catch {
      this.text.set('');
    } finally {
      this.loading.set(false);
    }
  }

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.text());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    } catch { /* the text stays selectable */ }
  }
}
