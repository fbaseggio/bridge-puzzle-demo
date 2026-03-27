const READING_HEIGHT_COMPACT = 326;
const READING_HEIGHT_FULL = 364;
const MESSAGE_TYPE = 'ds-widget-reading-height';

function isReadingWidgetIframe(iframe) {
  try {
    const src = iframe.getAttribute('src');
    if (!src) return false;
    const url = new URL(src, window.location.origin);
    return url.searchParams.get('reading') === '1';
  } catch {
    return false;
  }
}

function clampReadingHeight(height) {
  if (!Number.isFinite(height)) return null;
  const rounded = Math.round(height);
  return Math.max(READING_HEIGHT_COMPACT, Math.min(READING_HEIGHT_FULL, rounded));
}

const readingIframes = new Set();

function primeReadingWidgetFrames() {
  const iframes = Array.from(document.querySelectorAll('figure.widget iframe'));
  for (const iframe of iframes) {
    if (!isReadingWidgetIframe(iframe)) continue;
    readingIframes.add(iframe);
    iframe.style.height = `${READING_HEIGHT_COMPACT}px`;
  }
}

function attachReadingWidgetResizeListener() {
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    const payload = event.data;
    if (!payload || payload.type !== MESSAGE_TYPE) return;
    const requested = clampReadingHeight(Number(payload.height));
    if (requested === null) return;
    const sourceWindow = event.source;
    for (const iframe of readingIframes) {
      if (iframe.contentWindow !== sourceWindow) continue;
      iframe.style.height = `${requested}px`;
      break;
    }
  });
}

primeReadingWidgetFrames();
attachReadingWidgetResizeListener();
