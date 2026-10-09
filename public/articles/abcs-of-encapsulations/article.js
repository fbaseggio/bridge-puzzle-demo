// Each frame owns its play state; the article only hosts and sizes it.
const frames = [...document.querySelectorAll('.deal iframe')];
const scales = new WeakMap();
function sizeDiagram(frame, key) {
  const percent = Math.min(120, Math.floor(frame.clientWidth / 350 * 100));
  const previous = scales.get(frame);
  if (previous?.key === key && previous.percent === percent) return;
  scales.set(frame, {key, percent});
  frame.contentWindow.postMessage({type: 'movie-diagram-zoom', key, percent}, location.origin);
}
window.addEventListener('resize', () => frames.forEach(frame => {
  const previous = scales.get(frame);
  if (previous) sizeDiagram(frame, previous.key);
}));
window.addEventListener('message', event => {
  if (event.origin !== location.origin) return;
  const frame = frames.find(item => item.contentWindow === event.source);
  if (!frame || !event.data) return;
  const data = event.data;
  if (data.type === 'movie-widget-size' && Number.isFinite(data.height)) {
    frame.style.height = `${Math.max(180, Math.min(1800, data.height))}px`;
    sizeDiagram(frame, data.key);
  }
  if (data.type === 'movie-settings' && typeof data.a === 'string') {
    const url = new URL(frame.src);
    url.searchParams.set('a', data.a);
    frame.src = url.href;
    url.pathname = '/movie/';
    frame.closest('.deal').querySelector('.movie-link').href = url.href;
  }
});
