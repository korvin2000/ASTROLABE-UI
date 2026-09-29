import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { StudioSocket } from '../../core/ws';
import { AppStore } from '../../state/app.store';
import { Icon } from '../../ui/icon';
import { Glyph } from '../../ui/glyph';
import { dateTime, duration } from '../../core/format';

/**
 * Activity (§14): live campaigns, in-flight provider calls, background processes with a bounded, redacted log tail
 * (G-18), and intents — unknown outcomes are reconciled with evidence before a resume may lift the fence (G-11,
 * §13.7). Nothing is repeated automatically; no "Retry anyway". "No new output" is not a terminal status (R-ACT-01).
 */
@Component({
  selector: 'as-activity',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, Glyph],
  template: `
    <div class="head"><as-icon name="activity" [size]="16" /><b>Activity</b><span class="grow"></span><button class="btn sm" (click)="load()"><as-icon name="refresh" [size]="13" /></button></div>
    <div class="scroll body">
      @if (data(); as d) {
        <section class="card">
          <div class="phead micro">Campaigns</div>
          @for (c of d.campaigns; track c.workId) {
            <a class="crow" [routerLink]="['/p', c.projectId, 'c', c.workId]"><as-glyph [status]="c.displayStatus" [pulse]="true" /><span class="grow ellipsis">{{ c.title }}</span><span class="small">{{ c.displayStatus.replaceAll('_', ' ') }}</span></a>
          } @empty { <div class="pad small dim">No campaign runs right now.</div> }
        </section>
        <section class="card">
          <div class="phead micro">Provider calls in flight</div>
          @for (p of d.providerCalls; track p.requestId) {
            <div class="crow"><as-glyph status="running" [pulse]="true" /><span class="mono small">{{ p.provider }} · {{ p.model }}</span><span class="grow"></span>
              <span class="small mono">{{ since(p.startedAt) }} · attempt {{ p.attempt }}{{ p.firstOutputMillis ? ' · first output ' + p.firstOutputMillis + ' ms' : '' }} · {{ p.outputChars }} chars</span></div>
          } @empty { <div class="pad small dim">None.</div> }
        </section>
        <section class="card">
          <div class="phead micro">Background processes</div>
          <table class="table"><thead><tr><th>Handle</th><th>Status</th><th>Work</th><th>Cursor</th><th></th></tr></thead><tbody>
            @for (h of d.processes; track h.handleId) {
              <tr><td class="mono">{{ h.handleId }}</td><td><as-glyph [status]="h.status" [size]="11" /> <span class="mono">{{ h.status }}</span></td><td class="mono small">{{ h.workId }}</td>
                <td class="mono small">{{ h.cursor }} B</td><td><button class="btn sm" (click)="tail(h)">Log</button></td></tr>
            } @empty { <tr><td colspan="5" class="small dim">No background handles.</td></tr> }
          </tbody></table>
          @if (log(); as l) {
            <div class="logview">
              <div class="row small"><b class="mono">{{ l.handle }}</b><span class="dim">{{ l.available ? l.size + ' B · redacted tail' : l.reason }}</span><span class="grow"></span><button class="btn sm" (click)="log.set(null)">Close</button></div>
              @if (l.available) { <pre class="code">{{ l.text }}</pre> }
            </div>
          }
          <div class="pad small dim">Cancelling one process is not offered (R-ACT-03): cancel the campaign instead. Processes end with the backend that owns them.</div>
        </section>
        <section class="card">
          <div class="phead micro">Intents</div>
          <table class="table"><thead><tr><th>Intent</th><th>Action</th><th>Status</th><th>Work</th><th>Reconcile</th></tr></thead><tbody>
            @for (i of d.intents; track i.intentId) {
              <tr>
                <td class="mono small">{{ i.intentId }}</td>
                <td class="mono small">{{ (i.body?.argv ?? []).join(' ') || i.actionId }}</td>
                <td><as-glyph [status]="i.status === 'Unknown' ? 'unknown' : i.status" [size]="11" /> <span class="mono small">{{ i.status }}</span></td>
                <td class="mono small">{{ i.workId }}</td>
                <td>
                  @if (i.status === 'Unknown') {
                    <div class="row">
                      <input class="input sm grow" placeholder="evidence: effects observed — … / did not happen — …" [value]="evidence()[i.intentId] ?? ''" (input)="setEvidence(i.intentId, $any($event.target).value)" />
                      <button class="btn sm primary" (click)="reconcile(i)" [disabled]="!(evidence()[i.intentId] ?? '').trim()">Record</button>
                    </div>
                  } @else { <span class="small dim">{{ i.body?.reconciliation ?? '' }}</span> }
                </td>
              </tr>
            } @empty { <tr><td colspan="5" class="small dim">No open intents.</td></tr> }
          </tbody></table>
        </section>
      } @else { <div class="pad dim">Loading…</div> }
    </div>`,
  styles: [`
    :host{display:flex;flex-direction:column;height:100%;min-height:0}
    .head{display:flex;align-items:center;gap:10px;height:48px;padding:0 16px;border-bottom:1px solid var(--border-subtle);flex:none}
    .body{flex:1;padding:14px 16px 30px;display:flex;flex-direction:column;gap:10px;max-width:1280px;width:100%;margin:0 auto}
    .phead{display:flex;align-items:center;height:34px;padding:0 12px;border-bottom:1px solid var(--border-subtle)}
    .crow{display:flex;align-items:center;gap:10px;height:34px;padding:0 12px;border-bottom:1px solid var(--border-subtle);color:var(--text-primary);text-decoration:none}
    .crow:last-child{border-bottom:0}
    .small{font-size:12px}
    .pad{padding:10px 12px}
    .input.sm{height:24px}
    .logview{padding:8px 12px;border-top:1px solid var(--border-subtle)}
    .code{background:var(--code-bg);border:1px solid var(--border-subtle);border-radius:6px;padding:8px;max-height:320px;overflow:auto;margin-top:6px}
  `],
})
export class ActivityPage implements OnDestroy {
  readonly app = inject(AppStore);
  private readonly api = inject(Api);
  private readonly socket = inject(StudioSocket);
  readonly data = signal<any>(null);
  readonly log = signal<any>(null);
  readonly evidence = signal<Record<string, string>>({});
  private readonly timer = setInterval(() => this.load(), 3000);

  constructor() { this.load(); }

  async load(): Promise<void> { try { this.data.set(await this.api.get('/activity')); } catch { /* keep last */ } }

  async tail(h: any): Promise<void> {
    try { this.log.set({ handle: h.handleId, ...(await this.api.get<any>(`/projects/${h.projectId}/handles/${h.handleId}/log?cursor=${Math.max(0, h.cursor - 32768)}`)) }); }
    catch (e) { this.app.error(e, 'Log'); }
  }

  setEvidence(id: string, v: string): void { this.evidence.set({ ...this.evidence(), [id]: v }); }

  async reconcile(i: any): Promise<void> {
    if (!confirm('Record this evidence for the unknown outcome? The effect is never repeated automatically.')) return;
    try {
      await this.socket.command('intent.reconcile', { intentId: i.intentId, evidence: this.evidence()[i.intentId] }, { projectId: i.projectId }, {}, true);
      this.app.toast('ok', 'Reconciled', i.intentId);
      this.load();
    } catch (e) { this.app.error(e, 'Reconcile'); }
  }

  since(iso: string): string { return duration(Date.now() - Date.parse(iso)); }
  when(iso: string): string { return dateTime(iso); }
  ngOnDestroy(): void { clearInterval(this.timer); }
}
