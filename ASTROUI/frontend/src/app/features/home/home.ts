import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AppStore } from '../../state/app.store';
import { Icon } from '../../ui/icon';
import { Glyph, Mark } from '../../ui/glyph';
import { relTime } from '../../core/format';

/** `/` (§4.1): the last opened campaign, else the project list; first run shows the onboarding checklist (S-01). */
@Component({
  selector: 'as-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, Glyph, Mark],
  template: `
    <div class="scroll page">
      <div class="wrap">
        <div class="hero">
          <as-mark [size]="40" />
          <div>
            <h1 class="h-page">ASTROLABE Studio</h1>
            <div class="meta">A deterministic campaign controller: versioned contracts, bounded cells, work accepted only on evidence.</div>
          </div>
        </div>
        <div class="checklist card">
          <div class="micro">Get started</div>
          <div class="step" [class.done]="hasProvider()">
            <as-glyph [status]="hasProvider() ? 'verified' : 'pending'" />
            <div class="grow"><b>Connect a provider</b><div class="meta">API key, OAuth or a local server. Until then campaigns run on the scripted demo model (labelled Demo data).</div></div>
            <a class="btn sm" routerLink="/providers">Providers</a>
          </div>
          <div class="step" [class.done]="app.projects().length > 0">
            <as-glyph [status]="app.projects().length ? 'verified' : 'pending'" />
            <div class="grow"><b>Add a repository</b><div class="meta">A git working-tree root. ASTROLABE keeps its state outside the repository.</div></div>
          </div>
          <div class="step" [class.done]="!demoMode()">
            <as-glyph [status]="!demoMode() ? 'verified' : 'pending'" />
            <div class="grow"><b>Confirm profiles</b><div class="meta">Main and helper profiles serve the routing functions (Settings › Models &amp; routing).</div></div>
            <a class="btn sm" routerLink="/settings/models">Models &amp; routing</a>
          </div>
          <div class="step">
            <as-glyph [status]="app.campaigns().length ? 'verified' : 'pending'" />
            <div class="grow"><b>Start a campaign</b><div class="meta">Start with an S0 request: one file, one requirement, a test suite as acceptance.</div></div>
            <a class="btn sm primary" routerLink="/new"><as-icon name="plus" [size]="13" /> New campaign</a>
          </div>
        </div>
        <div class="grid">
          @for (p of app.projects(); track p.id) {
            <a class="proj card" [routerLink]="['/p', p.id]">
              <div class="row"><as-icon name="folder" [size]="15" /><b class="ellipsis">{{ p.name }}</b>@if (p.demo) { <span class="chip">demo</span> }<span class="grow"></span>
                @if (p.runningWork) { <as-glyph status="running" [pulse]="true" /> }</div>
              <div class="meta mono ellipsis">{{ p.path }}</div>
              <div class="meta">{{ app.projectCampaigns(p.id).length }} campaign(s) · {{ p.branch ?? '' }}</div>
            </a>
          }
        </div>
        @if (recent().length) {
          <div class="micro">Recent campaigns</div>
          <div class="card">
            @for (c of recent(); track c.workId) {
              <a class="recent" [routerLink]="['/p', c.projectId, 'c', c.workId]">
                <as-glyph [status]="c.pendingDecisions ? 'needs_you' : c.displayStatus" [pulse]="c.live" />
                <span class="ellipsis grow">{{ c.title ?? c.workId }}</span>
                <span class="meta">{{ c.displayStatus.replaceAll('_', ' ') }}</span>
                <span class="meta">{{ rel(c.updatedAt) }}</span>
              </a>
            }
          </div>
        }
      </div>
    </div>`,
  styles: [`
    :host{display:flex;flex-direction:column;height:100%;min-height:0}
    .page{flex:1}
    .wrap{max-width:960px;margin:0 auto;padding:36px 24px 60px;display:flex;flex-direction:column;flex-wrap:nowrap;gap:16px}
    .hero{display:flex;align-items:center;gap:16px}
    .checklist{padding:12px 14px;display:flex;flex-direction:column;gap:4px}
    .step{display:flex;align-items:center;gap:12px;padding:8px 4px;border-top:1px solid var(--border-subtle)}
    .step.done b{color:var(--text-secondary)}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
    .proj{padding:12px 14px;display:flex;flex-direction:column;gap:4px;color:var(--text-primary);text-decoration:none}
    .proj:hover{border-color:var(--border-strong);text-decoration:none}
    .recent{display:flex;align-items:center;gap:10px;height:36px;padding:0 12px;border-bottom:1px solid var(--border-subtle);color:var(--text-primary);text-decoration:none}
    .recent:last-child{border-bottom:0}
    .recent:hover{background:var(--bg-hover);text-decoration:none}
  `],
})
export class Home {
  readonly app = inject(AppStore);
  private readonly router = inject(Router);
  readonly hasProvider = computed(() => this.app.providers().some(p => !p.demo));
  readonly demoMode = this.app.demoMode;
  readonly recent = computed(() => this.app.campaigns().slice(0, 8));
  private redirected = false;

  constructor() {
    effect(() => {
      // Deep-link convenience: reopen the last campaign once per session when it still exists.
      if (this.redirected || !this.app.ready()) return;
      this.redirected = true;
      let shown = false;
      try { shown = !!sessionStorage.getItem('studio.homeShown'); sessionStorage.setItem('studio.homeShown', '1'); } catch { /* ignore */ }
      if (shown) return;
      // Only the first visit of a browser session jumps back; later visits (logo, palette) show Home.
      const c = this.app.campaign(this.app.lastOpenedWork());
      if (c) this.router.navigate(['/p', c.projectId, 'c', c.workId]);
    });
  }

  rel(iso: string): string { return relTime(iso); }
}
