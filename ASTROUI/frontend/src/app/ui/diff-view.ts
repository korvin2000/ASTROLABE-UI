import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

interface DiffLine { t: ' ' | '+' | '-' | '@' | 'h'; text: string; old: number | null; neu: number | null; words?: { text: string; mark: boolean }[]; }
interface DiffFile { path: string; lines: DiffLine[]; binary: boolean; added: number; removed: number; }

/** Parses a unified diff (git) into files, hunks and lines with word-level marks for 1:1 replaced lines. */
export function parseUnified(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  let file: DiffFile | null = null;
  let o = 0, n = 0;
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('diff --git')) {
      const m = /b\/(.+)$/.exec(raw);
      file = { path: m ? m[1] : raw, lines: [], binary: false, added: 0, removed: 0 };
      files.push(file);
      continue;
    }
    if (!file) continue;
    if (raw.startsWith('Binary files')) { file.binary = true; continue; }
    if (raw.startsWith('+++') || raw.startsWith('---') || raw.startsWith('index ') || raw.startsWith('new file') || raw.startsWith('deleted file') || raw.startsWith('similarity') || raw.startsWith('rename ')) continue;
    if (raw.startsWith('@@')) {
      const m = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/.exec(raw);
      o = m ? +m[1] : 0;
      n = m ? +m[2] : 0;
      file.lines.push({ t: '@', text: raw, old: null, neu: null });
      continue;
    }
    if (raw.startsWith('+')) { file.lines.push({ t: '+', text: raw.slice(1), old: null, neu: n++ }); file.added++; }
    else if (raw.startsWith('-')) { file.lines.push({ t: '-', text: raw.slice(1), old: o++, neu: null }); file.removed++; }
    else if (raw.startsWith(' ')) { file.lines.push({ t: ' ', text: raw.slice(1), old: o++, neu: n++ }); }
    else if (raw.startsWith('\\')) { file.lines.push({ t: 'h', text: raw, old: null, neu: null }); }
  }
  for (const f of files) markWords(f.lines);
  return files;
}

function markWords(lines: DiffLine[]): void {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].t !== '-') continue;
    let j = i;
    while (j < lines.length && lines[j].t === '-') j++;
    let k = j;
    while (k < lines.length && lines[k].t === '+') k++;
    const dels = lines.slice(i, j), adds = lines.slice(j, k);
    if (dels.length === adds.length && dels.length <= 6) {
      dels.forEach((d, x) => { const [a, b] = wordDiff(d.text, adds[x].text); d.words = a; adds[x].words = b; });
    }
    i = k - 1;
  }
}

function wordDiff(a: string, b: string): [{ text: string; mark: boolean }[], { text: string; mark: boolean }[]] {
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  const part = (x: string) => [{ text: x.slice(0, p), mark: false }, { text: x.slice(p, x.length - s), mark: true }, { text: x.slice(x.length - s), mark: false }].filter(w => w.text);
  return [part(a), part(b)];
}

/** Read-only unified diff viewer (§10.2): gutters with `+`/`−` (colour is never the only carrier), word-level marks. */
@Component({
  selector: 'as-diff-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (f of files(); track f.path) {
      <div class="file">
        @if (showHeader()) { <div class="fhead"><span class="mono">{{ f.path }}</span><span class="grow"></span><span class="mono ok">+{{ f.added }}</span><span class="mono bad">−{{ f.removed }}</span></div> }
        @if (f.binary) { <div class="dim pad">Binary file — metadata only.</div> }
        <div class="lines">
          @for (l of f.lines; track $index) {
            <div class="l" [class.add]="l.t === '+'" [class.del]="l.t === '-'" [class.hunk]="l.t === '@'">
              <span class="n">{{ l.old ?? '' }}</span><span class="n">{{ l.neu ?? '' }}</span>
              <span class="g">{{ l.t === '+' ? '+' : l.t === '-' ? '−' : '' }}</span>
              <span class="c">@if (l.words) {@for (w of l.words; track $index) {<span [class.w]="w.mark">{{ w.text }}</span>}} @else {{{ l.text }}}</span>
            </div>
          }
        </div>
      </div>
    } @empty { <div class="dim pad">No textual changes between these snapshots.</div> }`,
  styles: [`
    :host{display:block;font-family:var(--font-mono);font-size:12.5px;line-height:19px}
    .file{border:1px solid var(--border-subtle);border-radius:6px;overflow:hidden;margin-bottom:10px;background:var(--code-bg)}
    .fhead{display:flex;gap:10px;align-items:center;padding:6px 10px;border-bottom:1px solid var(--border-subtle);background:var(--bg-surface)}
    .lines{overflow-x:auto}
    .l{display:grid;grid-template-columns:40px 40px 16px 1fr;white-space:pre;min-width:max-content}
    .n{color:var(--text-disabled);text-align:right;padding-right:6px;user-select:none}
    .g{color:var(--text-tertiary);user-select:none}
    .add{background:var(--diff-add-bg)} .add .g{color:var(--success)}
    .del{background:var(--diff-del-bg)} .del .g{color:var(--danger)}
    .add .w{background:var(--diff-add-word);border-radius:2px} .del .w{background:var(--diff-del-word);border-radius:2px}
    .hunk{color:var(--text-tertiary);background:var(--bg-surface)}
    .pad{padding:10px}
  `],
})
export class DiffView {
  readonly diff = input.required<string>();
  readonly showHeader = input(true);
  readonly files = computed(() => parseUnified(this.diff()));
}
