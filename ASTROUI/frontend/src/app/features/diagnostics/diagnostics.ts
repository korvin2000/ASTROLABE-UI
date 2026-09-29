import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from '@angular/core';
import { Api } from '../../core/api';
import { Icon } from '../../ui/icon';

/** Diagnostics (§19.3): versions, paths and live counters of the host; nothing here is a success claim. */
@Component({
  selector: 'as-diagnostics',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <div class="head"><as-icon name="cpu" [size]="16" /><b>Diagnostics</b></div>
    <div class="scroll body">
      @if (d(); as h) {
        <section class="card card-pad">
          <div class="micro">Versions</div>
          <div class="kv">
            <span class="k">Studio</span><span class="v mono">{{ h.studioVersion }}</span>
            <span class="k">ASTROLABE</span><span class="v mono">{{ h.astrolabeVersion }} · store schema v{{ h.schemaVersion }}</span>
            <span class="k">AI Gate</span><span class="v mono">{{ h.aiGateVersion }}</span>
            <span class="k">JDK</span><span class="v mono">{{ h.jdk }}</span>
            <span class="k">OS</span><span class="v mono">{{ h.os }} @if (!h.platformSupported) { <span class="warn">— unsupported by ASTROLABE's process layer</span> }</span>
            <span class="k">data directory</span><span class="v mono">{{ h.dataDir }}</span>
            <span class="k">credentials</span><span class="v mono">{{ h.credentialStorage }}</span>
            <span class="k">session security</span><span class="v">{{ h.security ? 'launch token · HttpOnly cookie · Origin/Host/CSRF checks' : 'off (development)' }}</span>
            <span class="k">live gates</span><span class="v">UNMEASURED — fixtures validate runtime contracts, not live quality</span>
          </div>
        </section>
        <section class="card card-pad">
          <div class="micro">Counters</div>
          <div class="grid">
            @for (c of counters(); track c[0]) { <div class="ctr"><span class="dim small">{{ c[0] }}</span><span class="mono">{{ c[1] }}</span></div> }
          </div>
        </section>
        <section class="card card-pad">
          <div class="micro">Projects</div>
          @for (p of h.projects; track p.id) { <div class="small mono">{{ p.name }} · {{ p.open ? 'open' : 'closed' }} @if (p.storeCounts) { · {{ json(p.storeCounts) }} }</div> }
        </section>
      }
    </div>`,
  styles: [`
    :host{display:flex;flex-direction:column;height:100%;min-height:0}
    .head{display:flex;align-items:center;gap:10px;height:48px;padding:0 16px;border-bottom:1px solid var(--border-subtle);flex:none}
    .body{flex:1;padding:14px 16px 30px;display:flex;flex-direction:column;gap:10px;max-width:1100px;width:100%;margin:0 auto}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px 16px;margin-top:6px}
    .ctr{display:flex;justify-content:space-between;border-bottom:1px solid var(--border-subtle);padding:3px 0}
    .small{font-size:12px}
    .warn{color:var(--attention)}
  `],
})
export class DiagnosticsPage implements OnDestroy {
  private readonly api = inject(Api);
  readonly d = signal<any>(null);
  readonly counters = signal<[string, number][]>([]);
  private readonly timer = setInterval(() => this.load(), 3000);
  constructor() { this.load(); }
  async load(): Promise<void> {
    try {
      const h = await this.api.get<any>('/diagnostics');
      this.d.set(h);
      this.counters.set(Object.entries(h.counters ?? {}));
    } catch { /* keep */ }
  }
  json(v: any): string { return Object.entries(v ?? {}).map(([k, n]) => k.replaceAll('_', ' ') + ' ' + n).join(' · '); }
  ngOnDestroy(): void { clearInterval(this.timer); }
}
