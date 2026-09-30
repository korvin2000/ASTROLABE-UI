/** True when [ev] sends the message: Enter, or Ctrl+Enter when the user chose that (setting 3). Shift+Enter adds a line. */
export function sends(ev: { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; isComposing?: boolean }, sendWith: 'enter' | 'ctrl-enter'): boolean {
  if (ev.key !== 'Enter' || ev.isComposing) return false;
  if (ev.shiftKey) return false;
  return sendWith === 'ctrl-enter' ? ev.ctrlKey || ev.metaKey : true;
}
