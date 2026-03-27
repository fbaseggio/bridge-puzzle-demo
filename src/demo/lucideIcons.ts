export type DemoLucideIconName =
  | 'skip-back'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevrons-down'
  | 'chevrons-right'
  | 'sliders-horizontal'
  | 'lightbulb'
  | 'move-up-right'
  | 'ellipsis';

export function renderLucideIcon(iconName: DemoLucideIconName, className?: string): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.classList.add('lucide-icon');
  if (className) {
    for (const token of className.split(/\s+/).filter(Boolean)) svg.classList.add(token);
  }
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const append = (tagName: string, attrs: Record<string, string>) => {
    const node = document.createElementNS(ns, tagName);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    svg.appendChild(node);
  };

  switch (iconName) {
    case 'skip-back':
      append('line', { x1: '5', y1: '5', x2: '5', y2: '19' });
      append('polygon', { points: '19 5 9 12 19 19 19 5' });
      break;
    case 'chevron-left':
      append('path', { d: 'm15 18-6-6 6-6' });
      break;
    case 'chevron-right':
      append('path', { d: 'm9 18 6-6-6-6' });
      break;
    case 'chevrons-down':
      append('path', { d: 'm7 6 5 5 5-5' });
      append('path', { d: 'm7 13 5 5 5-5' });
      break;
    case 'chevrons-right':
      append('path', { d: 'm6 17 5-5-5-5' });
      append('path', { d: 'm13 17 5-5-5-5' });
      break;
    case 'sliders-horizontal':
      append('line', { x1: '21', y1: '4', x2: '14', y2: '4' });
      append('line', { x1: '10', y1: '4', x2: '3', y2: '4' });
      append('line', { x1: '21', y1: '12', x2: '12', y2: '12' });
      append('line', { x1: '8', y1: '12', x2: '3', y2: '12' });
      append('line', { x1: '21', y1: '20', x2: '16', y2: '20' });
      append('line', { x1: '12', y1: '20', x2: '3', y2: '20' });
      append('circle', { cx: '12', cy: '4', r: '2' });
      append('circle', { cx: '10', cy: '12', r: '2' });
      append('circle', { cx: '14', cy: '20', r: '2' });
      break;
    case 'lightbulb':
      append('path', { d: 'M15.09 14.37a5 5 0 1 0-6.18 0A7 7 0 0 1 12 20a7 7 0 0 1 3.09-5.63' });
      append('path', { d: 'M9 18h6' });
      append('path', { d: 'M10 22h4' });
      break;
    case 'move-up-right':
      append('path', { d: 'M13 5h6v6' });
      append('path', { d: 'M19 5 5 19' });
      break;
    case 'ellipsis':
      append('circle', { cx: '6', cy: '12', r: '2' });
      append('circle', { cx: '12', cy: '12', r: '2' });
      append('circle', { cx: '18', cy: '12', r: '2' });
      break;
  }

  return svg;
}
