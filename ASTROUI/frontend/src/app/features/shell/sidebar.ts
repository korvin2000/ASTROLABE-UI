import { ChangeDetectionStrategy, Component, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Api, errorInfo } from '../../core/api';
import { Project, Task } from '../../core/model';
import { TPipe } from '../../i18n/i18n';
import { AppStore } from '../../state/app.store';
import { Dialog } from '../../ui/dialog';
import { ErrorLine } from '../../ui/error-line';
import { Icon } from '../../ui/icon';
import { StateMark } from '../../ui/state-mark';
import { doneUnverified } from '../task/acceptance';
import { FolderDialog } from '../welcome/folder-dialog';

const SHOWN = 8;
const COLLAPSED = 'studio.sidebar';

interface Group { project: Project; tasks: Task[]; more: number; }

/** The sidebar (section 4.2): "New task", the projects with their tasks, "Needs you", and Settings. Nothing else. */
@Component({
  selector: 'as-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, FormsModule, TPipe, StateMark, Icon, Dialog, ErrorLine, FolderDialog],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
})
export class Sidebar {
  readonly app = inject(AppStore);
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  /** F5: a done task that no check verified says so in its mark. */
  readonly unverified = (t: Task): boolean => doneUnverified(t.state, t.verified);

  readonly narrow = signal(this.stored().narrow === true);
  readonly closed = signal<Record<string, boolean>>(this.stored().closed ?? {});
  readonly expanded = signal<Record<string, boolean>>({});
  readonly menu = signal<{ kind: 'task' | 'project'; id: string; x: number; y: number } | null>(null);
  readonly renaming = signal<Task | null>(null);
  readonly confirming = signal<{ kind: 'delete-task' | 'remove-project'; id: string; name: string } | null>(null);
  readonly choosing = signal(false);
  readonly failure = signal<ReturnType<typeof errorInfo> | null>(null);
  title = '';

  readonly groups = computed<Group[]>(() => {
    const tasks = this.app.tasks();
    const expanded = this.expanded();
    return this.app.visibleProjects().map(project => {
      const own = tasks.filter(t => t.projectId === project.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const shown = expanded[project.id] ? own : own.slice(0, SHOWN);
      return { project, tasks: shown, more: own.length - shown.length };
    });
  });

  private stored(): { narrow?: boolean; closed?: Record<string, boolean> } {
    try { return JSON.parse(localStorage.getItem(COLLAPSED) || '{}'); } catch { return {}; }
  }

  private remember(): void {
    try { localStorage.setItem(COLLAPSED, JSON.stringify({ narrow: this.narrow(), closed: this.closed() })); } catch { /* storage may be unavailable */ }
  }

  toggleNarrow(): void { this.narrow.update(v => !v); this.remember(); }

  toggle(project: Project): void {
    this.closed.update(c => ({ ...c, [project.id]: !c[project.id] }));
    this.remember();
  }

  showMore(project: Project): void { this.expanded.update(e => ({ ...e, [project.id]: true })); }

  /** "Needs you (n)" jumps to the oldest task that waits (there is no inbox page). */
  openOldest(): void {
    const first = this.app.needsYou()[0];
    if (first) void this.router.navigate(['/t', first.id]);
  }

  newTaskIn(project: Project): void { void this.router.navigate(['/new'], { queryParams: { project: project.id } }); }

  openMenu(ev: MouseEvent, kind: 'task' | 'project', id: string): void {
    ev.preventDefault();
    ev.stopPropagation();
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    this.menu.set({ kind, id, x: Math.min(r.left, innerWidth - 210), y: Math.min(r.bottom + 4, innerHeight - 140) });
  }

  @HostListener('document:click')
  @HostListener('document:keydown.escape')
  closeMenu(): void { this.menu.set(null); }

  menuTask(): Task | null { const m = this.menu(); return m?.kind === 'task' ? this.app.task(m.id) : null; }

  menuProject(): Project | null { const m = this.menu(); return m?.kind === 'project' ? this.app.project(m.id) : null; }

  rename(task: Task): void {
    this.title = task.title;
    this.failure.set(null);
    this.renaming.set(task);
  }

  async saveTitle(): Promise<void> {
    const task = this.renaming();
    if (!task) return;
    try {
      this.app.upsert(await this.api.put<Task>('/tasks/' + encodeURIComponent(task.id), { title: this.title }));
      this.renaming.set(null);
    } catch (e) {
      this.failure.set(errorInfo(e));
    }
  }

  async stop(task: Task): Promise<void> {
    try {
      this.app.upsert(await this.api.post<Task>('/tasks/' + encodeURIComponent(task.id) + '/stop', {}));
    } catch (e) {
      this.app.toast(errorInfo(e).detail ?? '', 'bad');
    }
  }

  askDelete(task: Task): void { this.failure.set(null); this.confirming.set({ kind: 'delete-task', id: task.id, name: task.title }); }

  askRemove(project: Project): void { this.failure.set(null); this.confirming.set({ kind: 'remove-project', id: project.id, name: project.name }); }

  projectSettings(project: Project): void { void this.router.navigate(['/settings', 'project'], { queryParams: { project: project.id } }); }

  async confirm(): Promise<void> {
    const c = this.confirming();
    if (!c) return;
    try {
      if (c.kind === 'delete-task') {
        await this.api.delete('/tasks/' + encodeURIComponent(c.id));
        this.app.tasks.update(list => list.filter(t => t.id !== c.id));
        if (this.router.url.startsWith('/t/' + encodeURIComponent(c.id)) || this.router.url.startsWith('/t/' + c.id)) void this.router.navigate(['/new']);
      } else {
        await this.api.delete('/projects/' + encodeURIComponent(c.id));
        await this.app.reloadProjects();
        if (!this.app.projects().length) void this.router.navigate(['/welcome']);
      }
      this.confirming.set(null);
    } catch (e) {
      this.failure.set(errorInfo(e));
    }
  }

  async opened(project: Project): Promise<void> {
    this.choosing.set(false);
    await this.app.reloadProjects();
    void this.router.navigate(['/new'], { queryParams: { project: project.id } });
  }
}
