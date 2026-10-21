import {readSitePreferences} from './sitePreferences';

/** Website time allowances only. Node/memory/query limits and proof semantics
 * stay unchanged. Capture once per job so changing a preference cannot alter
 * an analysis already in progress. */
export function analysisTimeLimits(allowMoreAnalysisTime = false, ddsLoadingAllowance: 'normal'|'extended'|'patient' = 'normal') {
 const scale = allowMoreAnalysisTime === true ? 4 : 1;
 return {
  analyzerMs: 30000 * scale,
  ddsLoadMs: {normal:30000,extended:120000,patient:600000}[ddsLoadingAllowance],
  devDdsLoadMs: {normal:30000,extended:120000,patient:600000}[ddsLoadingAllowance],
  topTricksMs: 2000 * scale,
  abstractSolveMs: 2000 * scale,
  threatAssessmentMs: 5000 * scale,
  assessmentMs: 12000 * scale,
  assessmentSolveMs: 1500 * scale,
  finderMs: 6000 * scale,
 };
}
export async function readAnalysisTimeLimits() {
 try { const p=await readSitePreferences();return analysisTimeLimits(p.allowMoreAnalysisTime,p.ddsLoadingAllowance); }
 catch { return analysisTimeLimits(); }
}
