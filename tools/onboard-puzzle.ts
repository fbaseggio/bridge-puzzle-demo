import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { renderOnboardingReport, runOnboarding, type Candidate, type DdsSolver } from './onboarding';

const HELP = `Usage: npm run puzzle:onboard -- --encap "[schd] wA' Ww > WLc, c" [options]

  --title TEXT        Candidate title
  --source TEXT       Source title/reference
  --strain NT|S|H|D|C  DDA strain (default NT)
  --leader N|S        Required for an encapsulation with flexible (=) lead
  --out PATH          Report basename; writes PATH.md and PATH.json
                      Default: logs/onboarding/<title>-<timestamp>
  --python PATH       Python with endplay (default project .venv, else python3)
  --skip-dda          Run encapsulation checks only; report remains incomplete
  --allow-additional-threats REASON
                      Explicit per-candidate permission for extra lowercase a/b/c
  --omit-original-comparison REASON
                      Explicit per-candidate permission to omit original → E1
  --help              Show this help

Exit codes: 0 automated checks passed (human review pending); 1 needs review;
2 incomplete/invalid input/solver unavailable. Never adds puzzles to a set.
`;

function main(): void {
  const { values } = parseArgs({
    options: {
      encap: { type: 'string' }, title: { type: 'string' }, source: { type: 'string' },
      strain: { type: 'string', default: 'NT' }, leader: { type: 'string' }, out: { type: 'string' },
      python: { type: 'string' }, 'skip-dda': { type: 'boolean', default: false },
      'allow-additional-threats': { type: 'string' }, 'omit-original-comparison': { type: 'string' },
      help: { type: 'boolean', default: false }
    }, strict: true
  });
  if (values.help) { console.log(HELP); return; }
  if (!values.encap?.trim()) throw new Error('--encap is required; use --help for usage');
  if (!['NT', 'S', 'H', 'D', 'C'].includes(values.strain!)) throw new Error('Invalid --strain');
  if (values.leader !== undefined && !['N', 'S'].includes(values.leader)) throw new Error('--leader must be N or S');
  for (const key of ['allow-additional-threats', 'omit-original-comparison'] as const) {
    if (values[key] !== undefined && !values[key]?.trim()) throw new Error(`--${key} requires a reason`);
  }
  const candidate: Candidate = {
    encapsulation: values.encap, title: values.title, source: values.source,
    strain: values.strain as Candidate['strain'], leader: values.leader as Candidate['leader'],
    allowAdditionalThreats: values['allow-additional-threats'], omitOriginalComparison: values['omit-original-comparison']
  };
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const venvPython = resolve(root, '.venv/bin/python');
  const python = values.python ?? (existsSync(venvPython) ? venvPython : 'python3');
  const worker = resolve(root, 'tools/onboarding_dds.py');
  let queryNumber = 0;
  const solver: DdsSolver = (request) => {
    console.log(`DDA ${++queryNumber}: ${queryNumber === 1 ? 'original deal' : 'single-tweak variant'} (target ${request.goal})`);
    const child = spawnSync(python, ['-B', worker], {
      input: JSON.stringify(request), encoding: 'utf8', timeout: 60_000, maxBuffer: 2 * 1024 * 1024,
      cwd: root, env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });
    if (child.error || child.status !== 0) {
      const details = [child.error?.message, child.signal, child.stderr?.trim(), child.stdout?.trim()].filter(Boolean).join('\n');
      throw new Error(`Local endplay failed (${python}, exit ${child.status ?? 'none'}). ${details}`);
    }
    try { return JSON.parse(child.stdout); }
    catch { throw new Error(`Local endplay returned invalid JSON: ${child.stdout.slice(0, 1000)}`); }
  };
  const report = runOnboarding(candidate, values['skip-dda'] ? undefined : solver);
  const slug = (values.title ?? 'candidate').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'candidate';
  const basename = resolve(values.out ?? resolve(root, 'logs/onboarding', `${slug}-${report.createdAt.replace(/[:.]/g, '-')}`));
  mkdirSync(dirname(basename), { recursive: true });
  writeFileSync(`${basename}.json`, JSON.stringify(report, null, 2) + '\n');
  writeFileSync(`${basename}.md`, renderOnboardingReport(report));
  console.log(`Automated checks: ${report.automatedStatus}; human review pending.`);
  console.log(`Original DDA: ${report.dda.status}${report.dda.result ? ` (${report.dda.result.maxTricksNS} tricks)` : ''}`);
  for (const cook of report.cooks) console.log(`Cook ${cook.id} ${cook.from} → ${cook.to}: ${cook.dda.status}${cook.dda.result ? ` (${cook.dda.result.maxTricksNS} tricks)` : ''}`);
  console.log(`Report: ${basename}.md\nData: ${basename}.json`);
  process.exitCode = report.automatedStatus === 'passed' ? 0 : report.automatedStatus === 'needs-review' ? 1 : 2;
}

try { main(); }
catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
