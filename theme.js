// Sigue la apariencia del teléfono al abrir la app y al cambiarla.
(() => {
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  function updateTheme() {
    const dark = systemTheme.matches;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = dark ? '#0f141b' : '#f4f6fa';
  }
  updateTheme();
  if (systemTheme.addEventListener) systemTheme.addEventListener('change', updateTheme);
  else systemTheme.addListener(updateTheme);
  window.addEventListener('pageshow', updateTheme);
})();
