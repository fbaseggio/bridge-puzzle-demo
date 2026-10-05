// Supporting navigation belongs to the page, not its embedded diagrams.
(() => {
  if (window.self !== window.top || document.querySelector('.ds-site-footer')) return;
  const footer = document.createElement('footer');
  footer.className = 'ds-site-footer';
  footer.innerHTML = `<nav aria-label="Site information">
    <a href="/about/">About</a>
    <a href="mailto:contact@deepsqueeze.ai">Contact</a>
    <a href="/credits/">Sources &amp; credits</a>
    <a href="/privacy/">Privacy</a>
  </nav><p>© 2026 Franco Baseggio</p>`;
  for (const link of footer.querySelectorAll('a')) {
    if (link.getAttribute('href') === location.pathname) link.setAttribute('aria-current', 'page');
  }
  document.body.append(footer);
})();
