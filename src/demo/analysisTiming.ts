import {readSitePreferences} from './sitePreferences';

/** Website time allowances only. Node/memory/query limits and proof semantics
 * stay unchanged. Capture once per job so changing a preference cannot alter
 * an analysis already in progress. */
export type AnalysisAllowance = 'normal' | 'extended' | 'patient';
export function analysisTimeLimits(allowMoreAnalysisTime = false, ddsLoadingAllowance: AnalysisAllowance = allowMoreAnalysisTime ? 'extended' : 'normal') {
 // Keep the legacy boolean for saved callers; an explicit selection wins.
 const allowanceMs = {normal:30000,extended:120000,patient:600000}[ddsLoadingAllowance];
 const scale = allowanceMs / 30000;
 return {
  analyzerMs: allowanceMs,
  ddsLoadMs: allowanceMs,
  devDdsLoadMs: allowanceMs,
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
