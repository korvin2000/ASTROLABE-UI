// The settings of Studio 2 (section 9): five sections, twenty settings. The list is part of the complexity budget.

export const SECTIONS = ['general', 'models', 'permissions', 'project', 'advanced'] as const;
export type Section = typeof SECTIONS[number];

/** The settings of section 9, by number, with the section they belong to. Nothing else is a setting. */
export const SETTINGS: readonly { n: number; id: string; section: Section }[] = [
  { n: 1, id: 'theme', section: 'general' },
  { n: 2, id: 'notify', section: 'general' },
  { n: 3, id: 'send_with', section: 'general' },
  { n: 4, id: 'accounts', section: 'models' },
  { n: 5, id: 'default_model', section: 'models' },
  { n: 6, id: 'default_effort', section: 'models' },
  { n: 7, id: 'default_mode', section: 'permissions' },
  { n: 8, id: 'allowed', section: 'permissions' },
  { n: 9, id: 'protected', section: 'permissions' },
  { n: 10, id: 'checks', section: 'project' },
  { n: 11, id: 'instructions', section: 'project' },
  { n: 12, id: 'remove_project', section: 'project' },
  { n: 13, id: 'limit', section: 'advanced' },
  { n: 14, id: 'max_tasks', section: 'advanced' },
  { n: 15, id: 'demo', section: 'advanced' },
  { n: 16, id: 'calibrate', section: 'advanced' },
  { n: 17, id: 'data_folder', section: 'advanced' },
  { n: 18, id: 'diagnostics', section: 'advanced' },
  { n: 19, id: 'reset', section: 'advanced' },
  // P8.D.4: the main line's protocol, auto by the model's class until it is calibrated.
  { n: 20, id: 'protocol', section: 'advanced' },
];
