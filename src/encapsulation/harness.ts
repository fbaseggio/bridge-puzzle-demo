import { bindStandard, renderDiagram } from './index';

const samples = [
  'Wa, a > w',
  'Wwc > a, b, W',
  "WLa, WB > b', W -1",
  'a, Wc > Wwc, WW',
  'wL =',
  'WA ='
];

for (const sample of samples) {
  const bound = bindStandard(sample);
  // eslint-disable-next-line no-console
  console.log(renderDiagram(bound));
  // eslint-disable-next-line no-console
  console.log('');
}
