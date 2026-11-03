/** Parent-side sizing for legacy article/puzzle embeds. Modern Movie/Random
 * retain their own sizing protocol.
 * Embed zoom is authored in the iframe URL: diagramZoom=inherit (default), or
 * diagramZoom=100 for original size; explicit values 50..200 are supported.
 * Fixed zoom ignores browser zoom preferences, but still gets automatic height. Match origin AND the actual source frame. */
export function isWidgetEmbedUrl(raw, origin) {
  try {
    const url = new URL(raw, origin);
    return url.origin === origin && /^\/(workbench|practice)\/?$/.test(url.pathname)
      && url.searchParams.get('mode') === 'widget';
  } catch { return false; }
}
export function validWidgetHeight(height) {
  return typeof height === 'number' && Number.isFinite(height) && height >= 40 && height <= 10000;
}
let installed = false;
export function installWidgetEmbeds() {
  if (installed) return;
  installed = true;
  const watched = new WeakSet();
  const request = frame => {
    if (isWidgetEmbedUrl(frame.src, location.origin)) frame.contentWindow?.postMessage({type:'ds-widget-embed-measure'},location.origin);
  };
  const scan = () => {
    for (const frame of document.querySelectorAll('iframe')) {
      if (!isWidgetEmbedUrl(frame.src, location.origin)) continue;
      if (!watched.has(frame)) {
        watched.add(frame);
        frame.addEventListener('load', () => request(frame));
        request(frame);
      }
    }
  };
  window.addEventListener('message', event => {
    const data = event.data;
    if (event.origin !== location.origin || data?.type !== 'ds-widget-embed-height' || !validWidgetHeight(data.height)) return;
    for (const frame of document.querySelectorAll('iframe')) {
      if (frame.contentWindow !== event.source || !isWidgetEmbedUrl(frame.src,location.origin)) continue;
      if (typeof data.widgetUrl !== 'string' || new URL(frame.src,location.href).href !== data.widgetUrl) return;
      frame.style.height = `${Math.ceil(data.height)}px`;
      return;
    }
  });
  scan();
  new MutationObserver(scan).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
}
