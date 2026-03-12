/// <reference types="node" />

import { executePolicyRequest, type PolicyCliRequest } from './policy_io';
import type { DdDecisionTrace } from '../ai/evaluatePolicy';
import { getDdDatasetDiagnostics } from '../ai/ddPolicy';

function formatDdTraceLine(trace: DdDecisionTrace): string {
  const optimalPart = trace.found ? ` optimal=[${(trace.optimal ?? []).join(',')}]` : '';
  return (
    `[TS-DD-TRACE] pos=${trace.pos} trick=${trace.trick} seat=${trace.seat} sig=${trace.sig} ` +
    `legal=[${trace.legal.join(',')}] base=[${trace.base.join(',')}] ` +
    `lookup=${trace.lookup ? 'yes' : 'no'} found=${trace.found ? 'yes' : 'no'} ` +
    `path=${trace.path}${optimalPart} after=[${trace.after.join(',')}] chosen=${trace.chosen}`
  );
}

async function main(): Promise<void> {
  let ddConfigLogged = false;
  process.stdin.setEncoding('utf8');
  let buffer = '';
  for await (const chunk of process.stdin) {
    buffer += String(chunk);
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const req = JSON.parse(trimmed) as PolicyCliRequest;
        const response = executePolicyRequest(req) as any;
        const debugLines: string[] = [];
        const includeDdTrace = req.debug?.ddTrace ?? true;
        if (!ddConfigLogged) {
          const effectiveDdSource = req.input.policy.ddSource ?? 'runtime';
          debugLines.push(`[TS-DD-CONFIG] ddSource=${effectiveDdSource}`);
          const diag = getDdDatasetDiagnostics((req.input as any).problemId);
          const loaded = effectiveDdSource === 'runtime' ? (diag.loaded ? 'yes' : 'no') : 'no';
          const records = effectiveDdSource === 'runtime' ? String(diag.records) : '0';
          const source = effectiveDdSource === 'runtime' && diag.loaded ? diag.source : 'none';
          debugLines.push(`[TS-DD-DATA] problem=${diag.problemId} ddSource=${effectiveDdSource} loaded=${loaded} records=${records} source=${source}`);
          if (effectiveDdSource === 'runtime' && diag.loaded && diag.firstKey) {
            debugLines.push(`[TS-DD-SAMPLE] firstKey=${diag.firstKey}`);
          }
          ddConfigLogged = true;
        }
        const trace = response?.ok ? response?.result?.ddTrace : null;
        if (includeDdTrace && trace && typeof trace === 'object') {
          debugLines.push(formatDdTraceLine(trace as DdDecisionTrace));
        }
        if (debugLines.length > 0) response.debugLines = debugLines;
        process.stdout.write(`${JSON.stringify(response)}\n`);
      } catch (error) {
        process.stdout.write(
          `${JSON.stringify({
            schemaVersion: 1,
            policyVersion: 1,
            ok: false,
            error: { message: error instanceof Error ? error.message : String(error) }
          })}\n`
        );
      }
    }
  }
  const tail = buffer.trim();
  if (tail) {
    try {
      const req = JSON.parse(tail) as PolicyCliRequest;
      const response = executePolicyRequest(req) as any;
      const debugLines: string[] = [];
      const includeDdTrace = req.debug?.ddTrace ?? true;
      if (!ddConfigLogged) {
        const effectiveDdSource = req.input.policy.ddSource ?? 'runtime';
        debugLines.push(`[TS-DD-CONFIG] ddSource=${effectiveDdSource}`);
        const diag = getDdDatasetDiagnostics((req.input as any).problemId);
        const loaded = effectiveDdSource === 'runtime' ? (diag.loaded ? 'yes' : 'no') : 'no';
        const records = effectiveDdSource === 'runtime' ? String(diag.records) : '0';
        const source = effectiveDdSource === 'runtime' && diag.loaded ? diag.source : 'none';
        debugLines.push(`[TS-DD-DATA] problem=${diag.problemId} ddSource=${effectiveDdSource} loaded=${loaded} records=${records} source=${source}`);
        if (effectiveDdSource === 'runtime' && diag.loaded && diag.firstKey) {
          debugLines.push(`[TS-DD-SAMPLE] firstKey=${diag.firstKey}`);
        }
        ddConfigLogged = true;
      }
      const trace = response?.ok ? response?.result?.ddTrace : null;
      if (includeDdTrace && trace && typeof trace === 'object') {
        debugLines.push(formatDdTraceLine(trace as DdDecisionTrace));
      }
      if (debugLines.length > 0) response.debugLines = debugLines;
      process.stdout.write(`${JSON.stringify(response)}\n`);
    } catch (error) {
      process.stdout.write(
        `${JSON.stringify({
          schemaVersion: 1,
          policyVersion: 1,
          ok: false,
          error: { message: error instanceof Error ? error.message : String(error) }
        })}\n`
      );
    }
  }
}

void main();
