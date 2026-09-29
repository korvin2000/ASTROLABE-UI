// Resolves theme, density and motion before first paint (spec §21.5, §32.5); no flash, CSP-compatible.
(function () {
  try {
    var p = JSON.parse(localStorage.getItem('studio.prefs') || '{}');
    var theme = p.theme || 'system';
    if (theme === 'system') theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    var root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-density', p.density || 'compact');
    root.setAttribute('data-motion', p.motion || 'full');
  } catch (e) { /* storage may be unavailable */ }
})();
