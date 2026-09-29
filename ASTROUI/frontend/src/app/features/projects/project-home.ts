import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AppStore } from '../../state/app.store';
import { Api, StudioError } from '../../core/api';
import { StudioSocket } from '../../core/ws';
import { Icon } from '../../ui/icon';
import { Glyph } from '../../ui/glyph';
import { dateTime, relTime } from '../../core/format';

/**
 * Project home (§19.2, W-06): repository health, rules-file trust (data until bound — "Review & bind" shows the exact
 * bytes and digest), sniffed commands (declared, not inferred; read-only, G-13), knowledge summary, campaigns.
 */
@Component({
  selector: 'as-project-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, Glyph],
  template: `
    <div class="head">
      <as-icon name="folder" [size]="16" />
      <b>{{ project()?.name ?? projectId() }}</b>
      <span class="mono meta ellipsis path" [title]="project()?.path ?? ''">{{ project()?.path }}</span>
      @if (health(); as h) { <span class="chip mono"><as-icon name="branch" [size]="12" /> {{ h.branch }} &#64; {{ (h.baseCommit ?? '').slice(0, 7) }}</span>
        <span class="chip">{{ h.dirty?.modified ?? 0 }} modified · {{ h.dirty?.untracked ?? 0 }} untracked</span> }
      @if (project()?.demo) { <button class="btn sm" (click)="resetDemo()" title="Recreate the demo repository (a Studio fixture)"><as-icon name="rotate" [size]="13" /> Reset demo repo</button> }
      @if (project()?.open) { <button class="btn sm" (click)="close()">Close</button> } @else { <button class="btn sm" (click)="open()">Open</button> }
      <a class="btn sm primary" [routerLink]="['/new']" [queryParams]="{ project: projectId() }" [class.disabled]="!!project()?.runningWork"><as-icon name="plus" [size]="13" /> Start campaign</a>
    </div>
    <div class="scroll body">
      @if (error()) { <div class="banner bad"><as-icon name="alert" [size]="14" /> {{ error() }}</div> }
      @if (health(); as h) {
        <section class="card card-pad">
          <div class="micro">Health</div>
          <div class="kv">
            <span class="k">git</span><span class="v mono">{{ h.git }}</span>
            <span class="k">state root</span><span class="v mono">{{ h.stateRoot ?? '—' }}</span>
            <span class="k">lock</span><span class="v">@if (h.open) { held by this Studio } @else { <span class="warn">not open — locked by another process or closed</span> }</span>
            @for (l of h.leases ?? []; track l.workspace) {
              <span class="k">lease · {{ l.workspace }}</span>
              <span class="v mono">{{ l.holder }} · @if (!l.live) { expired {{ rel(l.expiry) }} } @else { until {{ time(l.expiry) }} }
                @if (l.live && !l.ours) { <span class="warn"> — an earlier Studio process; new campaigns and resumes are refused until it expires (§13.1)</span> } @else if (l.live) { <span class="meta"> — this Studio</span> }</span>
            }
            @if (h.storeCounts) { <span class="k">store</span><span class="v mono">{{ h.storeCounts.campaigns }} campaigns · {{ h.storeCounts.journal }} journal rows · {{ h.storeCounts.receipts }} receipts · {{ h.storeCounts.notes }} notes</span> }
          </div>
          @if (h.dirty?.paths?.length) { <div class="meta dirty">pre-existing changes (snapshot 0 will record them): <span class="mono">{{ h.dirty.paths.slice(0, 8).join(' · ') }}</span></div> }
        </section>
        <section class="card card-pad">
          <div class="micro">Rules</div>
          <div class="row"><span>Status</span><span class="chip" [class.ok]="h.rules?.status === 'approved'" [class.warn]="h.rules?.status === 'changed'">{{ h.rules?.status ?? 'untrusted' }}</span>
            @if (h.rules?.binding) { <span class="mono meta">{{ h.rules.binding.path }} · {{ (h.rules.binding.digest ?? '').slice(0, 12) }} · {{ h.rules.binding.provenance }}</span>
              <button class="btn sm" (click)="unbind()">Unbind</button> }</div>
          @for (c of h.repo?.rulesCandidates ?? []; track c.path) {
            <div class="row cand"><as-icon name="file" [size]="13" /><span class="mono">{{ c.path }}</span><span class="meta mono">{{ c.digest.slice(0, 12) }} · {{ c.sizeBytes }} B</span>
              <span class="grow"></span><button class="btn sm" (click)="review(c.path)">Review &amp; bind</button></div>
          } @empty { <div class="meta">No rules file discovered (.astrolabe/rules.md, AGENTS.md, CLAUDE.md).</div> }
          @if (candidate(); as c) {
            <div class="review">
              <div class="row"><b class="mono">{{ c.path }}</b><span class="meta mono">digest {{ c.digest }}</span></div>
              <pre class="code">{{ c.text }}</pre>
              <div class="meta">Binding treats exactly these bytes as instructions at the next attempt. A changed file drops back to data until you re-approve it.</div>
              <div class="row end"><button class="btn" (click)="candidate.set(null)">Cancel</button><button class="btn primary" (click)="bind(c)">Bind these bytes</button></div>
            </div>
          }
        </section>
        <section class="card card-pad">
          <div class="micro">Commands · sniffed, declared-not-inferred</div>
          <table class="table">
            <thead><tr><th>Dir</th><th>Manifest</th><th>Test</th><th>Lint</th><th>Typecheck</th><th>Build</th></tr></thead>
            <tbody>
              @for (p of h.repo?.packages ?? []; track p.dir + p.manifest) {
                <tr><td class="mono">{{ p.dir }}</td><td class="mono">{{ p.manifest }}</td><td class="mono">{{ cmd(p.test) }}</td><td class="mono">{{ cmd(p.lint) }}</td><td class="mono">{{ cmd(p.typecheck) }}</td><td class="mono">{{ cmd(p.build) }}</td></tr>
              } @empty { <tr><td colspan="6" class="meta">No manifest declares commands; campaigns need an acceptance you state or answer.</td></tr> }
            </tbody>
          </table>
        </section>
      }
      <section class="card">
        <div class="phead"><span class="micro">Campaigns</span><span class="grow"></span><a class="btn ghost sm" [routerLink]="['/p', projectId(), 'knowledge']"><as-icon name="book" [size]="13" /> Knowledge</a></div>
        @for (c of campaigns(); track c.workId) {
          <a class="crow" [routerLink]="['/p', projectId(), 'c', c.workId]">
            <as-glyph [status]="c.pendingDecisions ? 'needs_you' : c.displayStatus" [pulse]="c.live" />
            <span class="mono meta">{{ c.workId.slice(0, 12) }}</span>
            <span class="ellipsis grow">{{ c.title }}</span>
            @if (c.shape) { <span class="chip">{{ c.shape }}</span> }
            <span class="meta st">{{ c.displayStatus.replaceAll('_', ' ') }}</span>
            <span class="meta">{{ rel(c.updatedAt) }}</span>
            @if (c.resumable && !c.live) { <button class="btn sm" (click)="$event.preventDefault(); $event.stopPropagation(); resume(c.workId)">Resume</button> }
          </a>
        } @empty { <div class="meta pad">No campaigns yet.</div> }
      </section>
    </div>`,
  styles: [`
    :host{display:flex;flex-direction:column;height:100%;min-height:0}
    .head{display:flex;align-items:center;gap:10px;height:48px;padding:0 16px;border-bottom:1px solid var(--border-subtle);flex:none;min-width:0;overflow:hidden}
    .head b{white-space:nowrap}
    .path{flex:1 1 auto;min-width:0}
    .head .chip,.head .btn{flex:none}
    .body{flex:1;padding:14px 16px 30px;display:flex;flex-direction:column;gap:10px;max-width:1200px;width:100%;margin:0 auto}
    .dirty{margin-top:8px}
    .cand{padding:4px 0}
    .review{margin-top:8px;display:flex;flex-direction:column;gap:8px}
    .code{background:var(--code-bg);border:1px solid var(--border-subtle);border-radius:6px;padding:8px 10px;max-height:260px;overflow:auto}
    .end{justify-content:flex-end}
    .warn{color:var(--attention)}
    .phead{display:flex;align-items:center;gap:8px;height:36px;padding:0 12px;border-bottom:1px solid var(--border-subtle)}
    .crow{display:flex;align-items:center;gap:10px;height:36px;padding:0 12px;border-bottom:1px solid var(--border-subtle);color:var(--text-primary);text-decoration:none}
    .crow:last-child{border-bottom:0}
    .crow:hover{background:var(--bg-hover);text-decoration:none}
    .st{text-transform:capitalize;min-width:110px;text-align:right}
    .pad{padding:14px}
    .disabled{pointer-events:none;opacity:.5}
  `],
})
export class ProjectHome {
  readonly projectId = input.required<string>();
  private readonly app = inject(AppStore);
  private readonly api = inject(Api);
  private readonly socket = inject(StudioSocket);
  private readonly router = inject(Router);
  readonly health = signal<any>(null);
  readonly candidate = signal<any>(null);
  readonly error = signal<string | null>(null);
  readonly project = computed(() => this.app.project(this.projectId()));
  readonly campaigns = computed(() => this.app.projectCampaigns(this.projectId()));

  constructor() {
    effect(() => { this.projectId(); this.app.projects(); this.load(); });
  }

  async load(): Promise<void> {
    try {
      this.health.set(await this.api.get(`/projects/${this.projectId()}/health`));
      this.error.set(null);
    } catch (e) {
      this.error.set(e instanceof StudioError ? e.error.message : String(e));
    }
  }

  cmd(argv: string[] | null): string { return argv ? argv.join(' ') : '—'; }
  rel(iso: string): string { return relTime(iso); }
  time(iso: string): string { return dateTime(iso); }

  async review(path: string): Promise<void> {
    try { this.candidate.set(await this.api.get(`/projects/${this.projectId()}/rules?path=${encodeURIComponent(path)}`)); } catch (e) { this.app.error(e, 'Rules'); }
  }

  async bind(c: any): Promise<void> {
    try {
      await this.socket.command('rules.bind', { path: c.path, digest: c.digest }, { projectId: this.projectId() });
      this.candidate.set(null);
      this.app.toast('ok', 'Rules file bound', `${c.path} applies at the next attempt`);
      this.load();
    } catch (e) { this.app.error(e, 'Bind'); }
  }

  async unbind(): Promise<void> {
    try { await this.socket.command('rules.unbind', {}, { projectId: this.projectId() }); this.load(); } catch (e) { this.app.error(e, 'Unbind'); }
  }

  async open(): Promise<void> {
    try { await this.socket.command('project.open', {}, { projectId: this.projectId() }); await this.app.refresh(); this.load(); } catch (e) { this.app.error(e, 'Open project'); }
  }

  async close(): Promise<void> {
    try { await this.socket.command('project.close', {}, { projectId: this.projectId() }); await this.app.refresh(); this.load(); } catch (e) { this.app.error(e, 'Close project'); }
  }

  async resetDemo(): Promise<void> {
    if (!confirm('Recreate the demo repository? It is a Studio fixture; campaigns and evidence stay in its state root.')) return;
    try { await this.socket.command('project.resetDemo', {}, { projectId: this.projectId() }); this.app.toast('ok', 'Demo repository reset'); this.load(); } catch (e) { this.app.error(e, 'Reset'); }
  }

  async resume(work: string): Promise<void> {
    try { await this.socket.command('campaign.resume', {}, { workId: work, projectId: this.projectId() }); this.router.navigate(['/p', this.projectId(), 'c', work]); } catch (e) { this.app.error(e, 'Resume'); }
  }
}
