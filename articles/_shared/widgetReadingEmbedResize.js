const READING_HEIGHT_COMPACT = 326;
const READING_HEIGHT_FULL = 364;
const MESSAGE_TYPE = 'ds-widget-reading-height';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function parseUrl(rawUrl) {
  try {
    return new URL(rawUrl, window.location.origin);
  } catch {
    return null;
  }
}

function clampReadingHeight(height) {
  if (!Number.isFinite(height)) return null;
  const rounded = Math.round(height);
  return Math.max(READING_HEIGHT_COMPACT, Math.min(READING_HEIGHT_FULL, rounded));
}

function isAllowedMessageOrigin(eventOrigin) {
  if (eventOrigin === window.location.origin) return true;
  const eventUrl = parseUrl(eventOrigin);
  const pageUrl = parseUrl(window.location.origin);
  if (!eventUrl || !pageUrl) return false;
  if (eventUrl.protocol !== pageUrl.protocol) return false;
  if ((eventUrl.port || '') !== (pageUrl.port || '')) return false;
  return LOOPBACK_HOSTS.has(eventUrl.hostname) && LOOPBACK_HOSTS.has(pageUrl.hostname);
}

function normalizeWidgetUrlKey(url) {
  const params = new URLSearchParams(url.search);
  params.sort();
  const query = params.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}

function getReadingIframeKey(iframe) {
  const src = iframe.getAttribute('src');
  if (!src) return null;
  const url = parseUrl(src);
  if (!url) return null;
  if (url.searchParams.get('reading') !== '1') return null;
  return normalizeWidgetUrlKey(url);
}

function getPayloadWidgetKey(payload) {
  if (!payload || typeof payload.widgetUrl !== 'string' || !payload.widgetUrl.trim()) return null;
  const url = parseUrl(payload.widgetUrl);
  if (!url) return null;
  return normalizeWidgetUrlKey(url);
}

const readingIframes = new Set();
const readingIframeKeyByElement = new WeakMap();

function registerReadingIframe(iframe) {
  const key = getReadingIframeKey(iframe);
  const previousKey = readingIframeKeyByElement.get(iframe) ?? null;
  if (!key) {
    readingIframes.delete(iframe);
    return false;
  }
  const shouldInitializeCompactHeight = !readingIframes.has(iframe) || previousKey !== key;
  readingIframes.add(iframe);
  readingIframeKeyByElement.set(iframe, key);
  if (shouldInitializeCompactHeight || !iframe.style.height) {
    iframe.style.height = `${READING_HEIGHT_COMPACT}px`;
  }
  return true;
}

function primeReadingWidgetFrames() {
  const iframes = Array.from(document.querySelectorAll('iframe'));
  const currentIframeSet = new Set(iframes);
  for (const iframe of readingIframes) {
    if (!currentIframeSet.has(iframe) || !document.contains(iframe)) {
      readingIframes.delete(iframe);
    }
  }
  for (const iframe of iframes) {
    registerReadingIframe(iframe);
  }
}

function findTargetIframe(sourceWindow, payloadWidgetKey) {
  for (const iframe of readingIframes) {
    if (iframe.contentWindow === sourceWindow) return iframe;
  }
  if (payloadWidgetKey) {
    for (const iframe of readingIframes) {
      if (readingIframeKeyByElement.get(iframe) === payloadWidgetKey) return iframe;
    }
  }
  const readingCandidates = Array.from(document.querySelectorAll('iframe'))
    .filter((iframe) => getReadingIframeKey(iframe));
  for (const iframe of readingCandidates) {
    if (iframe.contentWindow === sourceWindow) return iframe;
  }
  if (payloadWidgetKey) {
    for (const iframe of readingCandidates) {
      if (getReadingIframeKey(iframe) === payloadWidgetKey) return iframe;
    }
  }
  if (readingCandidates.length === 1) {
    return readingCandidates[0] ?? null;
  }
  if (readingIframes.size === 1) {
    return readingIframes.values().next().value ?? null;
  }
  return null;
}

function attachReadingWidgetResizeListener() {
  window.addEventListener('message', (event) => {
    if (!isAllowedMessageOrigin(event.origin)) return;
    const payload = event.data;
    if (!payload || payload.type !== MESSAGE_TYPE) return;
    const requested = clampReadingHeight(Number(payload.height));
    if (requested === null) return;
    primeReadingWidgetFrames();
    const sourceWindow = event.source;
    const payloadWidgetKey = getPayloadWidgetKey(payload);
    const targetIframe = findTargetIframe(sourceWindow, payloadWidgetKey);
    if (!targetIframe) return;
    targetIframe.style.height = `${requested}px`;
  });
}

function observeIframeSrcChanges() {
  if (!document.body || typeof MutationObserver === 'undefined') return;
  const observer = new MutationObserver((mutations) => {
    let shouldRefresh = false;
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'src' && mutation.target instanceof HTMLIFrameElement) {
        shouldRefresh = true;
        break;
      }
      if (mutation.type === 'childList' && (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)) {
        shouldRefresh = true;
        break;
      }
    }
    if (shouldRefresh) primeReadingWidgetFrames();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src']
  });
}

primeReadingWidgetFrames();
attachReadingWidgetResizeListener();
observeIframeSrcChanges();
