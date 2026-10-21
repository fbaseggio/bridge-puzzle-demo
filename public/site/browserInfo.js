/* Coarse, voluntarily copied support information. No probes, identifiers or upload. */
export function browserInfo(nav = navigator) {
  const memory = typeof nav.deviceMemory === 'number' ? `approximately ${nav.deviceMemory} GiB (browser estimate)` : 'not exposed by this browser';
  return [
    `Browser: ${nav.userAgent || 'not reported'}`,
    `Platform: ${nav.platform || 'not reported'}`,
    `Logical processors reported: ${nav.hardwareConcurrency || 'not exposed by this browser'}`,
    `Device memory: ${memory}`,
    `Capabilities: Worker=${typeof Worker !== 'undefined'}, WebAssembly=${typeof WebAssembly !== 'undefined'}, structuredClone=${typeof structuredClone === 'function'}`,
    'Exact CPU model, installed RAM and OS version are not reliably available to this page.'
  ].join('\n');
}
