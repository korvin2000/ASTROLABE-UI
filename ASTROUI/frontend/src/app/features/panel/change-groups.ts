import { ChangedFile } from '../../core/model';

const GROUP_ABOVE = 12;

export interface Group { folder: string; files: ChangedFile[]; }

/** The folder of a path, `.` for a file at the top of the project. */
export function folderOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '.' : path.slice(0, i);
}

/** Files by folder, in the order of the list; one group without a name when the list is short (section 8.1). */
export function grouped(files: ChangedFile[], above = GROUP_ABOVE): Group[] {
  if (files.length <= above) return [{ folder: '', files }];
  const map = new Map<string, ChangedFile[]>();
  for (const f of files) {
    const k = folderOf(f.path);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(f);
  }
  return [...map.entries()].map(([folder, list]) => ({ folder, files: list }));
}
