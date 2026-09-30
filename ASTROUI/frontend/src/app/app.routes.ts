import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { AppStore } from './state/app.store';

/** The last task the user had open, remembered in the browser (section 4.3). */
export const LAST_TASK = 'studio.lastTask';

function ready(app: AppStore): boolean {
  return app.hasModel() && app.projects().length > 0;
}

/** `/`: the last open task, else a new task, else the first run. */
const home: CanActivateFn = async () => {
  const app = inject(AppStore);
  const router = inject(Router);
  await app.init();
  if (!ready(app)) return router.parseUrl('/welcome');
  let last: string | null = null;
  try { last = localStorage.getItem(LAST_TASK); } catch { /* storage may be unavailable */ }
  if (last && app.task(last)) return router.createUrlTree(['/t', last]);
  return router.parseUrl('/new');
};

/** A new task needs a model and a project; without them the first run explains what is missing. */
const needsSetup: CanActivateFn = async () => {
  const app = inject(AppStore);
  const router = inject(Router);
  await app.init();
  return ready(app) ? true : router.parseUrl('/welcome');
};

// Five routes (the complexity budget of section 2).
export const routes: Routes = [
  { path: '', pathMatch: 'full', canActivate: [home], children: [] },
  { path: 'welcome', loadComponent: () => import('./features/welcome/welcome').then(m => m.Welcome) },
  { path: 'new', canActivate: [needsSetup], loadComponent: () => import('./features/task/new-task').then(m => m.NewTask) },
  { path: 't/:taskId', loadComponent: () => import('./features/task/task-view').then(m => m.TaskView) },
  { path: 'settings', redirectTo: 'settings/general', pathMatch: 'full' },
  { path: 'settings/:section', loadComponent: () => import('./features/settings/settings').then(m => m.Settings) },
  { path: '**', redirectTo: '' },
];
