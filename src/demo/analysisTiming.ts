import {readSitePreferences} from './sitePreferences';

/** Website time allowances only. Node/memory/query limits and proof semantics
 * stay unchanged. Capture once per job so changing a preference cannot alter
 * an analysis already in progress. */
export function analysisTimeLimits(allowMoreAnalysisTime = false) {
 const scale = allowMoreAnalysisTime === true ? 4 : 1;
 return {
  analyzerMs: 30000 * scale,
  ddsLoadMs: 30000 * scale,
  devDdsLoadMs: 8000 * scale,
  topTricksMs: 2000 * scale,
  abstractSolveMs: 2000 * scale,
  threatAssessmentMs: 5000 * scale,
  assessmentMs: 12000 * scale,
  assessmentSolveMs: 1500 * scale,
  finderMs: 6000 * scale,
 };
}
export async function readAnalysisTimeLimits() {
 try { return analysisTimeLimits((await readSitePreferences()).allowMoreAnalysisTime); }
 catch { return analysisTimeLimits(); }
}
