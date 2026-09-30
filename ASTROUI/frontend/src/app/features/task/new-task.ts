import { ChangeDetectionStrategy, Component, afterNextRender, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Api, errorInfo } from '../../core/api';
import { Effort, ErrorInfo, Mode, Project, ProjectSettingsDto } from '../../core/model';
import { I18n, TPipe } from '../../i18n/i18n';
import { AppStore } from '../../state/app.store';
import { ErrorLine } from '../../ui/error-line';
import { FolderDialog } from '../welcome/folder-dialog';
import { Composer } from './composer';
import { kindOf } from './project-kind';

/** New task (section 4.3, 10): an empty conversation with the composer in the centre and three example requests. */
@Component({
  selector: 'as-new-task',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe, Composer, FolderDialog, ErrorLine],
  template: `
    <div class="head"><span class="crumb">{{ project()?.name }}</span>@if (demo()) { <span class="tag">{{ 'demo.tag' | t }}</span> }</div>
    <div class="empty">
      <h1>{{ 'new.title' | t }}</h1>
      <as-composer #composer [up]="false" [projectId]="projectId()" [model]="model()" [effort]="effort()" [mode]="mode()" [busy]="busy()"
        (send)="start($event)" (projectChange)="chosenProject.set($event)" (modelChange)="chosenModel.set($event)"
        (effortChange)="chosenEffort.set($event)" (modeChange)="chosenMode.set($event)" (openFolder)="choosing.set(true)" />
      @if (failure(); as f) { <div class="err"><as-error-line [error]="f" /></div> }
      <div class="ex">
        @for (n of [1, 2, 3]; track n) {
          <button (click)="composer.set(example(n))">{{ example(n) }}</button>
        }
      </div>
      @if (demo()) { <p class="demo muted small">{{ 'demo.note' | t }}</p> }
    </div>
    @if (choosing()) { <as-folder-dialog (closed)="choosing.set(false)" (opened)="opened($event)" /> }`,
  styles: [`
    :host { display: flex; flex-direction: column; flex: 1; min-height: 0; }
    .head { height: 46px; flex: none; display: flex; align-items: center; gap: 10px; padding: 0 18px; border-bottom: 1px solid var(--border); color: var(--muted); }
    .empty { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 0 18px 60px; overflow: auto; }
    h1 { max-width: 760px; width: 100%; margin: 0 auto 18px; font-size: 22px; font-weight: 600; }
    .ex { max-width: 760px; width: 100%; margin: 14px auto 0; display: flex; gap: 8px; flex-wrap: wrap; }
    .ex button { border: 1px solid var(--border); background: transparent; border-radius: 999px; padding: 5px 12px; color: var(--muted); font-size: 13px; text-align: left; }
    .ex button:hover { background: var(--hover); color: var(--text); }
    .err, .demo { max-width: 760px; width: 100%; margin: 8px auto 0; }
    .tag { font-size: 10px; font-weight: 600; color: var(--warn); border: 1px solid var(--warn); border-radius: 4px; padding: 0 4px; }
  `],
})
export class NewTask {
  readonly app = inject(AppStore);
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18n);
  private readonly composer = viewChild<Composer>('composer');

  /** `?project=` chooses the project (the sidebar's "new task in this project"). */
  readonly projectParam = input<string | undefined>(undefined, { alias: 'project' });

  readonly chosenProject = signal<string | null>(null);
  readonly chosenModel = signal<string | null>(null);
  readonly chosenEffort = signal<Effort | null>(null);
  readonly chosenMode = signal<Mode | null>(null);
  readonly choosing = signal(false);
  readonly busy = signal(false);
  readonly failure = signal<ErrorInfo | null>(null);
  readonly kind = signal<'python' | 'web' | 'jvm' | 'generic'>('generic');

  readonly projectId = computed(() => {
    const wanted = this.chosenProject() ?? this.projectParam() ?? this.app.preferences()?.lastProject ?? null;
    const all = this.app.projects();
    return all.find(p => p.id === wanted)?.id ?? all.find(p => !p.demo)?.id ?? all[0]?.id ?? null;
  });
  readonly project = computed<Project | null>(() => this.app.project(this.projectId()));
  readonly model = computed(() => this.chosenModel() ?? this.app.defaultModel()?.ref ?? null);
  readonly effort = computed<Effort>(() => this.chosenEffort() ?? this.app.preferences()?.defaultEffort ?? 'medium');
  readonly mode = computed<Mode>(() => this.chosenMode() ?? this.app.preferences()?.defaultMode ?? 'ask');
  readonly demo = computed(() => !!this.app.models().find(m => m.ref === this.model())?.demo);

  constructor() {
    afterNextRender(() => this.composer()?.focus());
    effect(() => {
      const id = this.projectId();
      if (id) untracked(() => void this.loadKind(id));
    });
  }

  private async loadKind(id: string): Promise<void> {
    try {
      const s = await this.api.get<ProjectSettingsDto>('/projects/' + encodeURIComponent(id) + '/settings');
      if (this.projectId() === id) this.kind.set(kindOf(s.manifest));
    } catch {
      this.kind.set('generic');
    }
  }

  example(n: number): string { return this.i18n.t(`example.${this.kind()}.${n}`); }

  async start(text: string): Promise<void> {
    const projectId = this.projectId();
    if (!projectId) { this.choosing.set(true); return; }
    this.busy.set(true);
    this.failure.set(null);
    try {
      const r = await this.api.post<{ taskId: string }>('/tasks', { projectId, text, model: this.model(), effort: this.effort(), mode: this.mode() });
      void this.router.navigate(['/t', r.taskId]);
    } catch (e) {
      this.failure.set(errorInfo(e));
      this.composer()?.set(text);
    } finally {
      this.busy.set(false);
    }
  }

  async opened(project: Project): Promise<void> {
    this.choosing.set(false);
    await this.app.reloadProjects();
    this.chosenProject.set(project.id);
  }
}
