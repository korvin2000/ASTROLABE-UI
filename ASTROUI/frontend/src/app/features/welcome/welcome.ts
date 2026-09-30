import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { Api, errorInfo } from '../../core/api';
import { Account, ErrorInfo, Project } from '../../core/model';
import { TPipe } from '../../i18n/i18n';
import { AppStore } from '../../state/app.store';
import { ErrorLine } from '../../ui/error-line';
import { ConnectDialog } from '../accounts/connect-dialog';
import { FolderDialog } from './folder-dialog';

/** Account types the first run offers by name; every other type is behind "More…". */
const FEATURED = ['anthropic', 'openai', 'google'];

/**
 * First run (section 5): one page, no wizard steps. Connect a model, open a project folder; when both are done the
 * app goes to a new task with the composer focused.
 */
@Component({
  selector: 'as-welcome',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TPipe, ConnectDialog, FolderDialog, ErrorLine],
  templateUrl: './welcome.html',
  styleUrl: './welcome.css',
})
export class Welcome {
  readonly app = inject(AppStore);
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  readonly connecting = signal<{ provider: string | null } | null>(null);
  readonly choosing = signal(false);
  readonly found = signal<Account[]>([]);
  readonly busy = signal<string | null>(null);
  readonly failure = signal<ErrorInfo | null>(null);
  readonly featured = FEATURED;

  readonly account = computed(() => this.app.usableAccounts().find(a => a.kind !== 'demo') ?? this.app.usableAccounts()[0] ?? null);
  readonly project = computed(() => this.app.projects().find(p => !p.demo) ?? this.app.projects()[0] ?? null);
  readonly recent = signal<{ name: string; path: string }[]>([]);

  constructor() {
    void this.detect();
    // Both steps done: on to the first task (UX-5).
    effect(() => {
      if (this.app.ready() && this.app.hasModel() && this.app.projects().length > 0 && !this.connecting() && !this.choosing()) {
        untracked(() => void this.router.navigate(['/new']));
      }
    });
  }

  /** Detection runs when the page opens (UX-6); a detected source is never used without the user's click. */
  private async detect(): Promise<void> {
    try {
      this.found.set(await this.api.post<Account[]>('/accounts/detect', {}));
    } catch { /* nothing found is not an error */ }
  }

  name(provider: string): string {
    return { anthropic: 'Anthropic', openai: 'OpenAI API', google: 'Google Gemini' }[provider] ?? provider;
  }

  async use(found: Account): Promise<void> {
    this.busy.set(found.id);
    this.failure.set(null);
    try {
      await this.api.post('/accounts', { provider: found.provider, method: found.kind === 'local' ? 'local' : 'env' });
      await this.app.reloadAccounts();
      await this.detect();
    } catch (e) {
      this.failure.set(errorInfo(e));
    } finally {
      this.busy.set(null);
    }
  }

  async connected(): Promise<void> {
    this.connecting.set(null);
    await this.app.reloadAccounts();
    await this.detect();
  }

  async opened(_project: Project): Promise<void> {
    this.choosing.set(false);
    await this.app.reloadProjects();
  }

  /** "Run the demo" switches demo mode on; every demo task says that it is one (UX-9). */
  async demo(): Promise<void> {
    this.busy.set('demo');
    this.failure.set(null);
    try {
      await this.app.setPreference('demoMode', true);
      await this.app.load();
    } catch (e) {
      this.failure.set(errorInfo(e));
    } finally {
      this.busy.set(null);
    }
  }

  change(): void { void this.router.navigate(['/settings', 'models']); }
}
