import { evaluatePolicy, type EvaluatePolicyInput, type EvaluatePolicyOutput } from '../ai/evaluatePolicy';
import type { CardId } from '../ai/threatModel';

type JsonDefenderLabels = {
  E: { busy: CardId[]; idle: CardId[] };
  W: { busy: CardId[]; idle: CardId[] };
};

export type PolicyCliRequest = {
  schemaVersion: 1;
  policyVersion: 1;
  input: Omit<EvaluatePolicyInput, 'threatLabels'> & { threatLabels: JsonDefenderLabels | null };
};

export type PolicyCliSuccess = {
  schemaVersion: 1;
  policyVersion: 1;
  ok: true;
  result: EvaluatePolicyOutput;
};

export type PolicyCliFailure = {
  schemaVersion: 1;
  policyVersion: 1;
  ok: false;
  error: { message: string };
};

export type PolicyCliResponse = PolicyCliSuccess | PolicyCliFailure;

export function executePolicyRequest(req: PolicyCliRequest): PolicyCliResponse {
  try {
    const normalizedInput: EvaluatePolicyInput = {
      ...req.input,
      threatLabels: req.input.threatLabels
        ? {
            E: {
              busy: new Set(req.input.threatLabels.E.busy),
              idle: new Set(req.input.threatLabels.E.idle)
            },
            W: {
              busy: new Set(req.input.threatLabels.W.busy),
              idle: new Set(req.input.threatLabels.W.idle)
            }
          }
        : null
    };
    const result = evaluatePolicy(normalizedInput);
    return {
      schemaVersion: 1,
      policyVersion: 1,
      ok: true,
      result
    };
  } catch (error) {
    return {
      schemaVersion: 1,
      policyVersion: 1,
      ok: false,
      error: { message: error instanceof Error ? error.message : String(error) }
    };
  }
}
