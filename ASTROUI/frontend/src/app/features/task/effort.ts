import { Effort } from '../../core/model';

const ORDER: readonly Effort[] = ['low', 'medium', 'high'];

/**
 * The effort a model works with when [wanted] is asked for: the same level if the model has it, else the nearest
 * lower one, else the nearest higher one. Null when the model has no levels of effort.
 */
export function fitEffort(levels: readonly string[], wanted: Effort): Effort | null {
  const has = ORDER.filter(e => levels.includes(e));
  if (!has.length) return null;
  if (has.includes(wanted)) return wanted;
  const at = ORDER.indexOf(wanted);
  return [...has].reverse().find(e => ORDER.indexOf(e) < at) ?? has[0];
}
