import { ChangeDetectionStrategy, Component, Injectable, computed, effect, inject, signal } from '@angular/core';
import { Api } from '../../core/api';
import { Icon } from '../../ui/icon';
import { Glyph } from '../../ui/glyph';
import { DiffView } from '../../ui/diff-view';
import { parseEnvelope } from '../../core/envelope';
import { OpModel, targetOf } from '../../reducers/campaign-model';
import { clock, hash8, tokens } from '../../core/format';

export type InspectTarget =
  | { type: 'op'; work: string; op: OpModel; turn: number; cell: string }
  | { type: 'alias'; work: string; alias: string; title?: string }
  | { type: 'receipt'; work: string; projectId: string; receipt: any }
  | { type: 'diff'; work: string; path: string; from?: number; to?: number }
  | { type: 'json'; title: string; data: any; subtitle?: string }
  | { type: 'blob'; projectId: string; digest: string; title: string };

/** The inspector drawer (§4.4): one generic container with a back stack, item id and deep link; never blocks the composer. */
@Injectable({ providedIn: 'root' })
export class Inspector {
  readonly stack = signal<InspectTarget[]>([]);
  readonly current = computed(() => { const s = this.stack(); return s.length ? s[s.length - 1] : null; });
  readonly pinned = signal(false);

  open(target: InspectTarget): void { this.stack.update(s => [...s.slice(-15), target]); }
  replace(target: InspectTarget): void { this.stack.set([target]); }
  back(): void { this.stack.update(s => s.slice(0, -1)); }
  close(): void { this.stack.set([]); }
}

@Component({
  selector: 'as-inspector',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, Glyph, DiffView],
  host: { '[class.open]': '!!inspector.current()' },
  template: `
    @if (inspector.current(); as t) {
      <aside class="drawer" role="dialog" aria-label="Inspector">
        <header class="bar">
          @if (inspector.stack().length > 1) {
            <button class="btn ghost sm icon" (click)="inspector.back()" title="Back"><as-icon name="chevron-left" /></button>
          }
          <div class="grow ellipsis title-s">{{ title() }}</div>
          <button class="btn ghost sm icon" (click)="copy()" title="Copy content"><as-icon name="copy" [size]="14" /></button>
          <button class="btn ghost sm icon" (click)="inspector.close()" title="Close (Esc)"><as-icon name="x" /></button>
        </header>
        <div class="body scroll">
          @switch (t.type) {
            @case ('op') {
              @let op = $any(t).op;
              <div class="kv">
                <span class="k">tool</span><span class="v mono">{{ op.family }} {{ op.op }}</span>
                <span class="k">target</span><span class="v mono">{{ target(op) || '—' }}</span>
                <span class="k">status</span><span class="v row"><as-glyph [status]="op.status" /> <span class="mono">{{ op.status ?? (op.pending ? 'pending' : 'unknown') }}</span></span>
                @if (op.env?.cls) { <span class="k">effect class</span><span class="v mono">{{ op.env.cls }}</span> }
                @if (op.env?.stamp) { <span class="k">stamp</span><span class="v mono">{{ op.env.stamp }}</span> }
                @if (op.alias) { <span class="k">result</span><span class="v mono">{{ op.alias }}</span> }
                @if (op.env?.effects) { <span class="k">effects</span><span class="v mono">{{ op.env.effects }}</span> }
                @if (op.env?.truncated) { <span class="k">truncated</span><span class="v warn">yes — the model saw a bounded view</span> }
                <span class="k">cell · turn</span><span class="v mono">{{ $any(t).cell }} · {{ $any(t).turn }}</span>
              </div>
              @if (op.header) { <div class="sec micro">Envelope</div><pre class="code">{{ op.header }}</pre> }
              @if (op.body) { <div class="sec micro">Result</div><pre class="code">{{ op.body }}</pre> }
              @if (aliasContent()) { <div class="sec micro">Captured output · {{ aliasKind() }}</div><pre class="code">{{ aliasContent() }}</pre> }
              <div class="sec micro">Arguments</div>
              <pre class="code">{{ json(op.args) }}</pre>
            }
            @case ('alias') {
              @if (aliasData(); as a) {
                <div class="kv"><span class="k">alias</span><span class="v mono">{{ a.alias }}</span><span class="k">kind</span><span class="v mono">{{ a.kind }}</span>
                  <span class="k">action</span><span class="v mono">{{ a.actionId ?? '—' }}</span></div>
                @if (a.content) { <div class="sec micro">Content · {{ a.contentKind }}</div><pre class="code">{{ a.content }}</pre> }
                @else { <div class="dim sec">No served content for this reference (recovery material and pre/post images stay private).</div> }
              } @else { <div class="dim">Loading…</div> }
            }
            @case ('receipt') {
              @let r = $any(t).receipt;
              <div class="kv">
                <span class="k">receipt</span><span class="v mono">{{ r.receiptId }}</span>
                <span class="k">check</span><span class="v mono">{{ r.checkId }}</span>
                <span class="k">outcome</span><span class="v row"><as-glyph [status]="r.outcome" /> <span class="mono">{{ r.outcome }}</span></span>
                @if (r.parsed) { <span class="k">counts</span><span class="v mono">{{ r.parsed.passed }} passed · {{ r.parsed.failed }} failed · {{ r.parsed.errors }} errors · {{ r.parsed.skipped }} skipped · {{ r.parsed.discovered }} discovered</span> }
                <span class="k">command</span><span class="v mono">{{ (r.command ?? []).join(' ') }}</span>
                <span class="k">stamp before → after</span><span class="v mono">{{ hash(r.stampBefore) }} → {{ hash(r.stampAfter) }}</span>
                <span class="k">verifier</span><span class="v mono">{{ r.verifierVersion }} · env {{ hash(r.envId) }}</span>
                <span class="k">contract</span><span class="v mono">v{{ r.contractVersion }}</span>
              </div>
              @if (blobText()) { <div class="sec micro">Log (redacted)</div><pre class="code">{{ blobText() }}</pre> }
            }
            @case ('diff') {
              @if (diffText() !== null) { <as-diff-view [diff]="diffText() ?? ''" /> } @else { <div class="dim">Loading diff…</div> }
            }
            @case ('blob') {
              @if (blobText() !== null) { <pre class="code">{{ blobText() }}</pre> } @else { <div class="dim">Loading…</div> }
            }
            @case ('json') {
              @if ($any(t).subtitle) { <div class="meta" style="margin-bottom:8px">{{ $any(t).subtitle }}</div> }
              <pre class="code">{{ json($any(t).data) }}</pre>
            }
          }
        </div>
      </aside>
    }`,
  styles: [`
    :host{position:fixed;top:0;right:0;bottom:0;z-index:40;pointer-events:none}
    .drawer{pointer-events:auto;width:min(560px,92vw);height:100%;background:var(--bg-raised);border-left:1px solid var(--border-default);
      box-shadow:var(--shadow-overlay);display:flex;flex-direction:column;animation:slide var(--dur-base) var(--ease)}
    @keyframes slide{from{transform:translateX(24px);opacity:.4}to{transform:none;opacity:1}}
    .bar{display:flex;align-items:center;gap:6px;height:44px;padding:0 8px 0 14px;border-bottom:1px solid var(--border-subtle)}
    .title-s{font-weight:600}
    .body{padding:14px;flex:1}
    .sec{margin:14px 0 6px}
    .code{background:var(--code-bg);border:1px solid var(--border-subtle);border-radius:6px;padding:8px 10px;max-height:52vh;overflow:auto;white-space:pre-wrap}
  `],
})
export class InspectorDrawer {
  readonly inspector = inject(Inspector);
  private readonly api = inject(Api);
  readonly aliasData = signal<any>(null);
  readonly blobText = signal<string | null>(null);
  readonly diffText = signal<string | null>(null);
  readonly aliasContent = computed(() => this.aliasData()?.content ?? null);
  readonly aliasKind = computed(() => this.aliasData()?.contentKind ?? '');

  readonly title = computed(() => {
    const t = this.inspector.current();
    if (!t) return '';
    switch (t.type) {
      case 'op': return `${t.op.family} ${t.op.op ?? ''} · ${targetOf(t.op) || t.op.alias || ''}`;
      case 'alias': return t.title ?? 'Result ' + t.alias;
      case 'receipt': return 'Receipt ' + (t.receipt.receiptId ?? '');
      case 'diff': return t.path;
      case 'json': return t.title;
      case 'blob': return t.title;
    }
  });

  constructor() {
    effect(() => {
      const t = this.inspector.current();
      this.aliasData.set(null);
      this.blobText.set(null);
      this.diffText.set(null);
      if (!t) return;
      if (t.type === 'op' && t.op.alias) this.loadAlias(t.work, t.op.alias);
      if (t.type === 'alias') this.loadAlias(t.work, t.alias);
      if (t.type === 'receipt') {
        const raw = t.receipt.rawBlob ?? t.receipt.raw_blob;
        if (raw) this.api.get(`/projects/${t.projectId}/blobs/${raw}`).then((b: any) => this.blobText.set(b.text)).catch(e => this.blobText.set('Log unavailable: ' + (e?.message ?? e)));
      }
      if (t.type === 'blob') this.api.get(`/projects/${t.projectId}/blobs/${t.digest}`).then((b: any) => this.blobText.set(b.text)).catch(e => this.blobText.set('Unavailable: ' + (e?.message ?? e)));
      if (t.type === 'diff') {
        const q = new URLSearchParams({ path: t.path });
        if (t.from !== undefined) q.set('from', String(t.from));
        if (t.to !== undefined) q.set('to', String(t.to));
        this.api.get(`/campaigns/${t.work}/diff?${q}`).then((d: any) => this.diffText.set(d.diff ?? '')).catch(() => this.diffText.set(''));
      }
    });
  }

  private loadAlias(work: string, alias: string): void {
    const n = alias.replace('#', '');
    if (!/^\d+$/.test(n)) return;
    this.api.get(`/campaigns/${work}/aliases/${n}`).then(a => this.aliasData.set(a)).catch(() => this.aliasData.set({ alias, kind: 'unavailable' }));
  }

  target(op: OpModel): string { return targetOf(op); }
  json(v: unknown): string { try { return JSON.stringify(v, null, 2); } catch { return String(v); } }
  hash(h: string | null | undefined): string { return hash8(h); }

  copy(): void {
    const t = this.inspector.current();
    if (!t) return;
    const text = t.type === 'op' ? [t.op.header, t.op.body, this.aliasContent()].filter(Boolean).join('\n\n') : t.type === 'json' ? this.json(t.data) : this.blobText() ?? this.diffText() ?? this.aliasContent() ?? '';
    navigator.clipboard?.writeText(text);
  }

  protected readonly clock = clock;
  protected readonly tokens = tokens;
  protected readonly parseEnvelope = parseEnvelope;
}
