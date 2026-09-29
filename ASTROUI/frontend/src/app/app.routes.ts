import { Routes } from '@angular/router';

// §4.1 routes. Campaign tabs share one component; every page is lazy-loaded.
export const routes: Routes = [
  { path: '', pathMatch: 'full', loadComponent: () => import('./features/home/home').then(m => m.Home) },
  { path: 'new', loadComponent: () => import('./features/composer/new-campaign').then(m => m.NewCampaignPage) },
  { path: 'p/:projectId', loadComponent: () => import('./features/projects/project-home').then(m => m.ProjectHome) },
  { path: 'p/:projectId/knowledge', loadComponent: () => import('./features/knowledge/knowledge').then(m => m.KnowledgePage) },
  { path: 'p/:projectId/c/:workId', loadComponent: () => import('./features/campaign/campaign-view').then(m => m.CampaignView) },
  { path: 'p/:projectId/c/:workId/:tab', loadComponent: () => import('./features/campaign/campaign-view').then(m => m.CampaignView) },
  { path: 'inbox', loadComponent: () => import('./features/decisions/inbox').then(m => m.InboxPage) },
  { path: 'activity', loadComponent: () => import('./features/activity/activity').then(m => m.ActivityPage) },
  { path: 'stats', loadComponent: () => import('./features/stats/stats').then(m => m.StatsPage) },
  { path: 'settings', loadComponent: () => import('./features/settings/settings').then(m => m.SettingsPage) },
  { path: 'settings/:section', loadComponent: () => import('./features/settings/settings').then(m => m.SettingsPage) },
  { path: 'providers', loadComponent: () => import('./features/providers/providers').then(m => m.ProvidersPage) },
  { path: 'providers/:providerId', loadComponent: () => import('./features/providers/providers').then(m => m.ProvidersPage) },
  { path: 'knowledge', loadComponent: () => import('./features/knowledge/knowledge').then(m => m.KnowledgePage) },
  { path: 'diagnostics', loadComponent: () => import('./features/diagnostics/diagnostics').then(m => m.DiagnosticsPage) },
  { path: '**', redirectTo: '' },
];
