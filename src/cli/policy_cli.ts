/// <reference types="node" />

import { evaluatePolicy, type EvaluatePolicyInput, type EvaluatePolicyOutput } from '../ai/evaluatePolicy';
import type { CardId } from '../ai/threatModel';

type JsonDefenderLabels = {
  E: { busy: CardId[]; idle: CardId[] };
  W: { busy: CardId[]; idle: CardId[] };
};

type CliRequest = {
  schemaVersion: 1;
  policyVersion: 1;
  input: Omit<EvaluatePolicyInput, 'threatLabels'> & { threatLabels: JsonDefenderLabels | null };
};

type CliSuccess = {
  schemaVersion: 1;
  policyVersion: 1;
  ok: true;
  result: EvaluatePolicyOutput;
};

type CliFailure = {
  schemaVersion: 1;
  policyVersion: 1;
  ok: false;
  error: { message: string };
};

async function readStdin(): Promise<string> {
  let data = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

async function main(): Promise<void> {
  try {
    const raw = await readStdin();
    const parsed = JSON.parse(raw) as CliRequest;
    const normalizedInput: EvaluatePolicyInput = {
      ...parsed.input,
      threatLabels: parsed.input.threatLabels
        ? {
            E: {
              busy: new Set(parsed.input.threatLabels.E.busy),
              idle: new Set(parsed.input.threatLabels.E.idle)
            },
            W: {
              busy: new Set(parsed.input.threatLabels.W.busy),
              idle: new Set(parsed.input.threatLabels.W.idle)
            }
          }
        : null
    };
    const result = evaluatePolicy(normalizedInput);
    const out: CliSuccess = {
      schemaVersion: 1,
      policyVersion: 1,
      ok: true,
      result
    };
    process.stdout.write(`${JSON.stringify(out)}\n`);
  } catch (error) {
    const out: CliFailure = {
      schemaVersion: 1,
      policyVersion: 1,
      ok: false,
      error: { message: error instanceof Error ? error.message : String(error) }
    };
    process.stdout.write(`${JSON.stringify(out)}\n`);
  }
}

void main();
