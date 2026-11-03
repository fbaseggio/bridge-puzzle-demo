/** Author override for compact article diagrams; omission preserves browser zoom. */
export function embedDiagramZoom(params: URLSearchParams, inherited: number): number {
  const value = params.get('diagramZoom');
  if (!value || value === 'inherit') return inherited;
  const zoom = Number(value);
  return Number.isFinite(zoom) && zoom >= 50 && zoom <= 200 ? zoom : inherited;
}

/** Measure content, not document/viewport height: the latter cannot shrink after
 * a parent grows the iframe and can create resize feedback loops. */
export function widgetContentHeight(root: HTMLElement): number {
  const nodes = [root, ...root.querySelectorAll<HTMLElement>('.table-host, .settings-panel, .narration-bubble')];
  const bottom = Math.max(0, ...nodes.filter(n => n.getClientRects().length > 0)
    .map(n => n.getBoundingClientRect().bottom + window.scrollY));
  return Math.ceil(bottom + 8);
}

export function installWidgetEmbedLayout(root: HTMLElement): () => void {
  let scheduled = false, previous = 0;
  const publish = () => {
    scheduled = false;
    const height = widgetContentHeight(root);
    if (height === previous) return;
    previous = height;
    window.parent.postMessage({type: 'ds-widget-embed-height', height, widgetUrl: location.href}, location.origin);
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(publish);
  };
  window.addEventListener('resize', schedule);
  window.addEventListener('message', event => {
    if (event.source !== parent || event.origin !== location.origin || event.data?.type !== 'ds-widget-embed-measure') return;
    previous = 0; schedule();
  });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(schedule).observe(root);
  // Renders and option panels can change positioned overflow without resizing root.
  new MutationObserver(schedule).observe(root, {childList:true, subtree:true, attributes:true});
  void document.fonts?.ready.then(schedule);
  schedule();
  return schedule;
}
