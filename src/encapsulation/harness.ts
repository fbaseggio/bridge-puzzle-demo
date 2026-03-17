import { bindRandom, bindStandard, normalizeEncapsulationRoundTrip, renderDiagram } from './index';

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

  const roundTrip = normalizeEncapsulationRoundTrip(sample, { verbose: process.env.DEBUG_ENCAP_TRACE === 'true' });
  // eslint-disable-next-line no-console
  console.log('Round-trip normalization:');
  // eslint-disable-next-line no-console
  console.log(`explicit_1: ${roundTrip.explicitEncap1}`);
  // eslint-disable-next-line no-console
  console.log(`explicit_2: ${roundTrip.explicitEncap2}`);
  // eslint-disable-next-line no-console
  console.log(`stable: ${roundTrip.stable ? 'yes' : 'no'}`);
  if (roundTrip.secondPassError) {
    // eslint-disable-next-line no-console
    console.log(`second-pass error: ${roundTrip.secondPassError}`);
  }
  if (roundTrip.bind1Trace) {
    // eslint-disable-next-line no-console
    console.log('bind_1_trace:');
    // eslint-disable-next-line no-console
    console.log(roundTrip.bind1Trace);
  }
  if (roundTrip.inverseTrace1) {
    // eslint-disable-next-line no-console
    console.log('inverse_trace_1:');
    // eslint-disable-next-line no-console
    console.log(roundTrip.inverseTrace1);
  }
  if (roundTrip.bind2Trace) {
    // eslint-disable-next-line no-console
    console.log('bind_2_trace:');
    // eslint-disable-next-line no-console
    console.log(roundTrip.bind2Trace);
  }
  if (roundTrip.inverseTrace2) {
    // eslint-disable-next-line no-console
    console.log('inverse_trace_2:');
    // eslint-disable-next-line no-console
    console.log(roundTrip.inverseTrace2);
  }
  if (roundTrip.traceReport) {
    // eslint-disable-next-line no-console
    console.log('roundtrip_trace:');
    // eslint-disable-next-line no-console
    console.log(roundTrip.traceReport);
  }
  // eslint-disable-next-line no-console
  console.log('');
}
