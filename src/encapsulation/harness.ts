import { bindRandom, bindStandard, renderDiagram } from './index';

const samples = [
  'Wa, a > w',
  'Wwc > a, b, W',
  "WLa, WB > b', W -1",
  'a, Wc > Wwc, WW',
  'La = Lb, W',
  'Wa > b, WL',
  'WLa, W = b',
  'a, Wc > a, w',
  'wa, WW > WLc, Wc',
  'Wa, Wb > Wc, Ww',
  'wL =',
  'WA ='
];

for (const sample of samples) {
  const bound = bindStandard(sample);
  // eslint-disable-next-line no-console
  console.log(`Encapsulation: ${sample}`);
  // eslint-disable-next-line no-console
  console.log('Standard binding:');
  // eslint-disable-next-line no-console
  console.log(renderDiagram(bound));
  // eslint-disable-next-line no-console
  console.log('');
  // eslint-disable-next-line no-console
  console.log('Random binding #1:');
  // eslint-disable-next-line no-console
  console.log(renderDiagram(bindRandom(sample, { seed: 101 })));
  // eslint-disable-next-line no-console
  console.log('');
  // eslint-disable-next-line no-console
  console.log('Random binding #2:');
  // eslint-disable-next-line no-console
  console.log(renderDiagram(bindRandom(sample, { seed: 202 })));
  // eslint-disable-next-line no-console
  console.log('');
}
