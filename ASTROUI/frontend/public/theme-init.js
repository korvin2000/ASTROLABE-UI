// Resolves the theme before first paint (Studio 2 section 11); no flash, compatible with the content security policy.
(function () {
  try {
    var theme = localStorage.getItem('studio.theme') || 'system';
    if (theme === 'system') theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) { /* storage may be unavailable */ }
})();
