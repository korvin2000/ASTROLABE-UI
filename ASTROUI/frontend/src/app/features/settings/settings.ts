import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Api, StudioError } from '../../core/api';
import { StudioSocket } from '../../core/ws';
import { AppStore, Prefs, readPrefs, writePrefs } from '../../state/app.store';
import { Icon } from '../../ui/icon';

const SECTIONS = [
  { key: 'general', label: 'General' },
  { key: 'providers', label: 'Providers & accounts' },
  { key: 'models', label: 'Models & routing' },
  { key: 'roles', label: 'Roles' },
  { key: 'autonomy', label: 'Autonomy & safety' },
  { key: 'budgets', label: 'Budgets & limits' },
  { key: 'shape', label: 'Shape policy' },
  { key: 'verification', label: 'Verification' },
  { key: 'knowledge', label: 'Knowledge' },
  { key: 'layers', label: 'Optional layers' },
  { key: 'tools', label: 'Tools & MCP' },
  { key: 'storage', label: 'Storage & diagnostics' },
  { key: 'runtime', label: 'Studio runtime' },
  { key: 'advanced', label: 'Advanced' },
];

function getPath(root: any, key: string): any {
  let n = root;
  for (const p of key.split('.')) { if (n === null || n === undefined || typeof n !== 'object') return undefined; n = n[p]; }
  return n;
}
function setPath(root: any, key: string, value: any): any {
  const copy = structuredClone(root ?? {});
  const parts = key.split('.');
  let n = copy;
  for (let i = 0; i < parts.length - 1; i++) { if (typeof n[parts[i]] !== 'object' || n[parts[i]] === null) n[parts[i]] = {}; n = n[parts[i]]; }
  if (value === undefined) delete n[parts[parts.length - 1]]; else n[parts[parts.length - 1]] = value;
  return copy;
}

/**
 * Settings (§17, W-05). Layers: library defaults → Studio → project → campaign options → frozen per attempt. Every
 * field shows its effective value, where it comes from, when it applies and whether the runtime supports it; knobs the
 * runtime does not read or expose stay visible read-only with their gap id (§17.1 honesty). Validation is the
 * libraries' own; Apply is disabled while violations exist (R-SET-02).
 */
@Component({
  selector: 'as-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, RouterLink],
  template: `
    <div class="head">
      <as-icon name="settings" [size]="16" /><b>Settings</b>
      <span class="grow"></span>
      <span class="micro">Scope</span>
      <select class="select sm" [value]="scope()" (change)="setScope($any($event.target).value)">
        <option value="studio">Studio defaults</option>
        @for (p of app.projects(); track p.id) { <option [value]="'project:' + p.id" [selected]="'project:' + p.id === scope()">Project: {{ p.name }}</option> }
      </select>
      <input class="input sm search" placeholder="Search settings" [value]="query()" (input)="query.set($any($event.target).value)" />
    </div>
    <div class="body">
      <nav class="nav">
        @for (s of sections; track s.key) {
          <a class="nl" [class.on]="section() === s.key" [routerLink]="['/settings', s.key]">{{ s.label }}</a>
        }
      </nav>
      <div class="scroll main">
        @if (!view()) { <div class="dim pad">Loading settings…</div> }
        @else {
          <div class="banner info">
            <as-icon name="info" [size]="14" />
            <span>Applies to new campaigns and new attempts. Running campaigns keep their frozen configuration
              @if (view()?.fingerprint) { (current fingerprint <span class="mono">{{ view()?.fingerprint?.slice(0, 12) }}</span>) }.</span>
          </div>
          @switch (section()) {
            @case ('general') {
              <h2 class="title">General</h2>
              <div class="field"><label>Theme</label><div class="seg">@for (t of ['system', 'dark', 'light']; track t) { <button [class.on]="prefs().theme === t" (click)="setPref('theme', t)">{{ t }}</button> }</div><span class="src">browser · immediate</span></div>
              <div class="field"><label>Density</label><div class="seg">@for (t of ['compact', 'comfortable']; track t) { <button [class.on]="prefs().density === t" (click)="setPref('density', t)">{{ t }}</button> }</div><span class="src">browser · immediate</span></div>
              <div class="field"><label>Motion</label><div class="seg">@for (t of ['full', 'calm', 'off']; track t) { <button [class.on]="prefs().motion === t" (click)="setPref('motion', t)">{{ t }}</button> }</div><span class="src">Calm: particles only on model and verifier edges</span></div>
              <div class="field"><label>Composer send key</label><div class="seg"><button [class.on]="prefs().sendKey === 'mod-enter'" (click)="setPref('sendKey', 'mod-enter')">Ctrl/⌘ + Enter</button><button [class.on]="prefs().sendKey === 'enter'" (click)="setPref('sendKey', 'enter')">Enter</button></div></div>
              <div class="field"><label>OS notifications</label><label class="check"><input type="checkbox" [checked]="prefs().notifications" (change)="setPref('notifications', $any($event.target).checked)" /> decisions, lease warnings, finished campaigns</label></div>
            }
            @case ('providers') {
              <h2 class="title">Providers & accounts</h2>
              <p class="meta">Connections, credentials, catalog and profiles live on their own page.</p>
              <a class="btn" routerLink="/providers"><as-icon name="plug" [size]="14" /> Open Providers &amp; models</a>
              <div class="field"><label>Credential storage</label><span class="mono small">{{ view()?.credentialStorage }}</span></div>
            }
            @case ('roles') {
              <h2 class="title">Roles</h2>
              <div class="banner warn small"><as-icon name="alert" [size]="14" /> A role is a configuration, not a security boundary; the executor enforces capability regardless. The runtime applies only persona lines, duties and the policy text version (G-24); other fields are shown for transparency.</div>
              @for (r of roles(); track r.name) {
                <div class="role card">
                  <div class="rowl"><b>{{ r.name }}</b><span class="chip mono">{{ r.def.packetKind ?? '' }}</span><span class="chip">{{ r.def.permission }}</span><span class="grow"></span>
                    @if (roleOverridden(r.name)) { <span class="chip accent">overridden</span><button class="btn ghost sm" (click)="resetRole(r.name)">Reset</button> }</div>
                  <div class="kv small">
                    <span class="k">tool mask</span><span class="v mono">{{ mask(r.def.toolMask) }}</span>
                    <span class="k">context view</span><span class="v mono">{{ json(r.def.contextView) }}</span>
                    <span class="k">tier prior</span><span class="v mono">{{ json(r.def.tierPrior) }}</span>
                    <span class="k">denied note kinds</span><span class="v mono">{{ json(r.def.deniedNoteKinds) }}</span>
                  </div>
                  <label class="small">Persona lines (≤ 3, one per line)</label>
                  <textarea class="textarea" rows="2" [value]="lines(roleValue(r.name).personaLines)" (input)="editRole(r.name, 'personaLines', $any($event.target).value)"></textarea>
                  <label class="small">Duties (one per line)</label>
                  <textarea class="textarea" rows="3" [value]="lines(roleValue(r.name).duties)" (input)="editRole(r.name, 'duties', $any($event.target).value)"></textarea>
                </div>
              }
            }
            @case ('advanced') {
              <h2 class="title">Advanced</h2>
              <div class="field"><label>Presets</label>
                <div class="row wrap">@for (p of presets(); track p.id) { <button class="btn sm" (click)="applyPreset(p)">{{ p.label }}</button> }</div>
                <span class="src">shows the diff before Apply</span></div>
              <div class="field col"><label>Layer JSON ({{ scope() }})</label>
                <textarea class="textarea mono code" rows="14" [value]="layerText()" (input)="layerTextEdit.set($any($event.target).value)"></textarea>
                <div class="row"><button class="btn sm" (click)="importLayer()" [disabled]="!layerTextEdit()">Use edited JSON</button><button class="btn sm" (click)="exportLayer()">Export</button></div></div>
              <div class="field col"><label>Effective configuration (assembled Config)</label><pre class="code mono">{{ json(view()?.effective?.config) }}</pre></div>
              <div class="field col"><label>History</label>@for (h of view()?.history ?? []; track h.revision) { <div class="small mono">r{{ h.revision }} · {{ h.at }} · {{ h.summary }}</div> }</div>
            }
            @default {
              <h2 class="title">{{ sectionLabel() }}</h2>
              @if (section() === 'models') {
                <p class="meta">Which model serves each routing function. Profiles are drafted from catalog models on the <a routerLink="/providers">Providers</a> page. Floors are never lowered; a routing refusal explains the unsatisfied floor.</p>
              }
              @if (section() === 'tools') { <p class="meta">MCP tools are declared, not callable (G-15): no McpClient reaches Run in the controller path.</p> }
              @for (f of fields(); track f.key) {
                <div class="field" [class.dirty]="isOverridden(f.key)" [class.bad]="!!violation(f.key)">
                  <label [title]="f.key">{{ f.label }}@if (f.unit) { <span class="unit"> ({{ f.unit }})</span> }</label>
                  <div class="control">
                    @if (f.availability !== 'editable' && f.availability !== 'host-managed') {
                      <span class="mono ro">{{ display(effective(f.key) ?? f.default) }}</span>
                    } @else {
                      @switch (f.type) {
                        @case ('enum') {
                          <select class="select" [value]="str(value(f.key))" (change)="set(f.key, $any($event.target).value)">
                            @for (c of f.choices ?? []; track c) { <option [value]="c" [selected]="c === str(value(f.key))" [disabled]="f.gap === 'G-14' && c === 'Confined'">{{ c }}{{ f.gap === 'G-14' && c === 'Confined' ? ' — unavailable (no backend)' : '' }}</option> }
                          </select>
                        }
                        @case ('bool') { <label class="check"><input type="checkbox" [checked]="!!value(f.key)" (change)="set(f.key, $any($event.target).checked)" /> {{ value(f.key) ? 'on' : 'off' }}</label> }
                        @case ('profile') { <select class="select" [value]="str(value(f.key))" (change)="set(f.key, $any($event.target).value)">@for (p of app.profiles(); track p.id) { <option [value]="p.id" [selected]="p.id === str(value(f.key))">{{ p.id }}{{ p.demo ? ' (demo)' : '' }}</option> }</select> }
                        @case ('profile?') { <select class="select" [value]="str(value(f.key)) || ''" (change)="set(f.key, $any($event.target).value || null)"><option value="">none</option>@for (p of app.profiles(); track p.id) { <option [value]="p.id" [selected]="p.id === str(value(f.key))">{{ p.id }}{{ p.demo ? ' (demo)' : '' }}</option> }</select> }
                        @case ('json') { <textarea class="textarea mono" rows="3" [value]="json(value(f.key))" (change)="setJson(f.key, $any($event.target).value)"></textarea> }
                        @case ('string') { <input class="input" [value]="str(value(f.key))" (change)="set(f.key, $any($event.target).value || null)" /> }
                        @case ('string?') { <input class="input" placeholder="library default" [value]="str(value(f.key))" (change)="set(f.key, $any($event.target).value || null)" /> }
                        @default { <input class="input num" type="number" [attr.step]="f.type === 'fraction' || f.type === 'number' ? 0.01 : 1" [attr.min]="f.min" [attr.max]="f.max" [value]="str(value(f.key))"
                          (change)="setNum(f.key, $any($event.target).value, f.type)" [placeholder]="f.type.endsWith('?') ? 'default' : ''" /> }
                      }
                    }
                    @if (isOverridden(f.key)) { <button class="btn ghost sm" (click)="reset(f.key)" title="Reset to inherited">↺</button> }
                  </div>
                  <span class="src">
                    <span class="avail" [class]="f.availability">{{ f.availability }}</span>
                    @if (f.gap) { <span class="chip mono">{{ f.gap }}</span> }
                    <span>{{ source(f.key) }} · {{ f.activation }}</span>
                  </span>
                  @if (violation(f.key); as v) { <div class="viol">{{ v }}</div> }
                  @if (f.help) { <div class="help">{{ f.help }}</div> }
                </div>
              } @empty { <div class="dim">No settings match.</div> }
            }
          }
          @if (section() !== 'general' && section() !== 'providers') {
            <div class="footer">
              @if (violations().length) { <span class="bad small">{{ violations().length }} violation(s): {{ violations()[0].path }} — {{ violations()[0].message }}</span> }
              @else if (validated()) { <span class="ok small">valid · fingerprint {{ validated()?.fingerprint?.slice(0, 12) ?? '—' }}</span> }
              @if (warnings().length) { <span class="warn small">{{ warnings().length }} adapter warning(s)</span> }
              <span class="grow"></span>
              <button class="btn" (click)="discard()" [disabled]="!dirty()">Discard</button>
              <button class="btn" (click)="validate()" [disabled]="busy()">Validate</button>
              <button class="btn primary" (click)="apply()" [disabled]="busy() || !dirty() || violations().length > 0">Apply</button>
            </div>
          }
        }
      </div>
    </div>`,
  styles: [`
    :host{display:flex;flex-direction:column;height:100%;min-height:0}
    .head{display:flex;align-items:center;gap:10px;height:48px;padding:0 16px;border-bottom:1px solid var(--border-subtle);flex:none}
    .select.sm,.input.sm{height:26px}
    .search{width:200px}
    .body{display:grid;grid-template-columns:220px minmax(0,1fr);flex:1;min-height:0}
    .nav{border-right:1px solid var(--border-subtle);padding:10px 8px;overflow:auto}
    .nl{display:flex;align-items:center;height:30px;padding:0 10px;border-radius:5px;color:var(--text-secondary);text-decoration:none}
    .nl:hover{background:var(--bg-hover);color:var(--text-primary);text-decoration:none}
    .nl.on{background:var(--bg-active);color:var(--text-primary);box-shadow:inset 2px 0 0 var(--accent)}
    .main{padding:14px 24px 0;display:flex;flex-direction:column;gap:8px}
    .title{font-size:16px;margin:8px 0 4px}
    .pad{padding:20px}
    .field{display:grid;grid-template-columns:260px minmax(0,1fr) minmax(0,300px);gap:4px 14px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border-subtle)}
    .field.col{grid-template-columns:1fr}
    .field.dirty label{color:var(--accent)}
    .field.bad label{color:var(--danger)}
    .control{display:flex;align-items:center;gap:6px;min-width:0}
    .control .select,.control .input{min-width:180px;max-width:100%}
    .num{width:140px}
    .unit{color:var(--text-tertiary);font-weight:400}
    .ro{color:var(--text-secondary)}
    .src{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--text-tertiary);flex-wrap:wrap}
    .avail{padding:0 5px;border-radius:3px;border:1px solid var(--border-default)}
    .avail.editable{color:var(--success)} .avail.unwired,.avail.unavailable{color:var(--attention)} .avail.read-only{color:var(--text-tertiary)} .avail.host-managed{color:var(--accent)}
    .viol{grid-column:2 / 4;color:var(--danger);font-size:12px}
    .help{grid-column:2 / 4;color:var(--text-tertiary);font-size:12px}
    .footer{position:sticky;bottom:0;display:flex;align-items:center;gap:10px;padding:10px 0 14px;background:var(--bg-canvas);border-top:1px solid var(--border-subtle);margin-top:8px}
    .role{padding:10px 12px;display:flex;flex-direction:column;gap:6px;margin-bottom:8px}
    .rowl{display:flex;align-items:center;gap:8px}
    .small{font-size:12px}
    .code{max-height:360px;overflow:auto;background:var(--code-bg);border:1px solid var(--border-subtle);border-radius:6px;padding:8px}
    .ok{color:var(--success)} .bad{color:var(--danger)} .warn{color:var(--attention)}
    @media (max-width:1279px){.field{grid-template-columns:200px minmax(0,1fr)} .src{grid-column:2}}
  `],
})
export class SettingsPage {
  readonly app = inject(AppStore);
  private readonly api = inject(Api);
  private readonly socket = inject(StudioSocket);
  private readonly router = inject(Router);
  readonly sectionParam = input<string | undefined>(undefined, { alias: 'section' });
  readonly sections = SECTIONS;
  readonly scope = signal('studio');
  readonly query = signal('');
  readonly view = signal<any>(null);
  readonly draft = signal<any>(null);
  readonly busy = signal(false);
  readonly validated = signal<any>(null);
  readonly violations = signal<{ path: string; message: string; source?: string }[]>([]);
  readonly warnings = signal<string[]>([]);
  readonly prefs = signal<Prefs>(readPrefs());
  readonly presets = signal<any[]>([]);
  readonly layerTextEdit = signal<string | null>(null);

  readonly section = computed(() => this.sectionParam() ?? 'autonomy');
  readonly sectionLabel = computed(() => SECTIONS.find(s => s.key === this.section())?.label ?? '');
  readonly dirty = computed(() => JSON.stringify(this.draft()) !== JSON.stringify(this.view()?.layer));
  readonly fields = computed(() => {
    const schema: any[] = this.view()?.schema ?? [];
    const q = this.query().trim().toLowerCase();
    return schema.filter(f => q ? (f.label + ' ' + f.key + ' ' + (f.help ?? '')).toLowerCase().includes(q) : f.group === this.section());
  });
  readonly roles = computed(() => Object.entries(this.view()?.roles ?? {}).map(([name, def]) => ({ name, def: def as any })));
  readonly layerText = computed(() => JSON.stringify(this.draft(), null, 2));

  constructor() {
    effect(() => { this.scope(); this.load(); });
    this.api.get<any[]>('/settings/presets').then(p => this.presets.set(p)).catch(() => {});
  }

  async load(): Promise<void> {
    try {
      const v = await this.api.get<any>('/settings?scope=' + encodeURIComponent(this.scope()));
      this.view.set(v);
      this.draft.set(structuredClone(v.layer));
      this.violations.set([]);
      this.validated.set(null);
    } catch (e) { this.app.error(e, 'Settings'); }
  }

  setScope(s: string): void { this.scope.set(s); }

  value(key: string): any {
    const v = getPath(this.draft(), key);
    return v !== undefined ? v : this.effective(key);
  }
  effective(key: string): any { return getPath(this.view()?.effective, key); }
  isOverridden(key: string): boolean { return getPath(this.draft(), key) !== undefined; }
  source(key: string): string {
    const v = this.view();
    if (!v) return '';
    const inScope = getPath(this.draft(), key) !== undefined;
    if (this.scope().startsWith('project:')) return inScope ? 'Project' : getPath(v.studioLayer, key) !== undefined ? 'Studio' : 'library default';
    return inScope ? 'Studio' : 'library default';
  }
  violation(key: string): string | null {
    const path = key.replace(/^config\./, '');
    const v = this.violations().find(x => x.path === path || path.startsWith(x.path + '.') || x.path.startsWith(path));
    return v ? v.message : null;
  }

  set(key: string, value: any): void { this.draft.set(setPath(this.draft(), key, value)); this.validated.set(null); }
  setNum(key: string, raw: string, type: string): void {
    if (raw === '' && type.endsWith('?')) { this.set(key, null); return; }
    const n = type === 'int' || type === 'int?' ? parseInt(raw, 10) : parseFloat(raw);
    if (!Number.isNaN(n)) this.set(key, n);
  }
  setJson(key: string, raw: string): void {
    try { this.set(key, JSON.parse(raw)); } catch { this.app.toast('bad', 'Invalid JSON', key); }
  }
  reset(key: string): void { this.draft.set(setPath(this.draft(), key, undefined)); this.validated.set(null); }
  discard(): void { this.draft.set(structuredClone(this.view()?.layer)); this.violations.set([]); this.validated.set(null); }

  async validate(): Promise<boolean> {
    this.busy.set(true);
    try {
      const r = await this.api.post<any>('/settings/validate', { scope: this.scope(), layer: this.draft() });
      this.violations.set(r.violations ?? []);
      this.warnings.set(r.adapterWarnings ?? []);
      this.validated.set(r);
      return !!r.valid;
    } catch (e) {
      this.app.error(e, 'Validate');
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  async apply(): Promise<void> {
    if (!(await this.validate())) return;
    this.busy.set(true);
    try {
      const r: any = await this.socket.command('settings.save', { scope: this.scope(), layer: this.draft() }, {}, { settingsRevision: this.view()?.revision ?? 0 });
      this.app.toast('ok', 'Settings applied', r?.applies ?? 'Applies to new campaigns');
      await this.load();
      await this.app.refresh();
    } catch (e) {
      if (e instanceof StudioError && e.error.fieldErrors?.length) this.violations.set(e.error.fieldErrors);
      this.app.error(e, 'Apply');
    } finally {
      this.busy.set(false);
    }
  }

  applyPreset(p: any): void {
    let d = this.draft();
    for (const [k, v] of Object.entries(p.config ?? {})) d = setPath(d, 'config.' + k, v);
    this.draft.set(d);
    this.app.toast('neutral', `Preset “${p.label}” staged`, 'Review the changes, then Validate and Apply.');
  }

  importLayer(): void {
    try { this.draft.set(JSON.parse(this.layerTextEdit() ?? '{}')); this.layerTextEdit.set(null); } catch { this.app.toast('bad', 'Invalid JSON'); }
  }
  exportLayer(): void {
    const blob = new Blob([JSON.stringify({ format: 'astrolabe-studio.settings/1', scope: this.scope(), layer: this.draft() }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `astrolabe-studio-settings-${this.scope().replace(':', '-')}.json`;
    a.click();
  }

  roleValue(name: string): any { return getPath(this.draft(), 'config.roles.' + name) ?? this.view()?.roles?.[name] ?? {}; }
  roleOverridden(name: string): boolean { return getPath(this.draft(), 'config.roles.' + name) !== undefined; }
  editRole(name: string, field: 'personaLines' | 'duties', text: string): void {
    const base = structuredClone(this.roleValue(name));
    base[field] = text.split('\n').map(s => s.trim()).filter(Boolean).slice(0, field === 'personaLines' ? 3 : 50);
    this.set('config.roles.' + name, base);
  }
  resetRole(name: string): void { this.reset('config.roles.' + name); }

  setPref<K extends keyof Prefs>(k: K, v: any): void {
    const p = { ...this.prefs(), [k]: v } as Prefs;
    this.prefs.set(p);
    writePrefs(p);
  }

  display(v: any): string { return v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v); }
  str(v: any): string { return v === null || v === undefined ? '' : String(v); }
  json(v: any): string { return v === undefined ? '' : JSON.stringify(v, null, 2); }
  lines(v: any): string { return Array.isArray(v) ? v.join('\n') : ''; }
  mask(m: any): string { return Array.isArray(m?.allowed) ? m.allowed.join(' ') : JSON.stringify(m); }
}
