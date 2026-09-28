import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { handleThreatStateRequest, type ThreatStateRequest } from '../../src/cli/threat_state_io';
import { initClassification, type Position } from '../../src/ai/threatModel';

const position: Position = {
  hands: {
    N: { S: ['A', 'Q'], H: [], D: [], C: [] },
    E: { S: ['K', 'J'], H: [], D: [], C: [] },
    S: { S: [], H: ['A'], D: [], C: ['A'] },
    W: { S: ['T'], H: ['K'], D: [], C: [] }
  }
};

const request: ThreatStateRequest = {
  mode: 'init',
  position,
  threatCardIds: ['SQ'],
  resourceCardIds: ['SA'],
  goalContext: { goal: { type: 'minTricks', side: 'NS', n: 2 }, tricksWon: { NS: 0, EW: 0 } },
  runtimeContext: { trick: [], trumpSuit: null }
};

describe('threat-state JSON interface', () => {
  test('passes resources and runtime context to classification', () => {
    const result = handleThreatStateRequest(request);
    const expected = initClassification(position, ['SQ'], ['SA'], {
      ...request.runtimeContext,
      ...request.goalContext
    });
    expect(result.ok).toBe(true);
    expect(result.state.resource).toEqual(expected.resource);
    expect(result.state.threat).toEqual(expected.threat);
    expect(result.state.perCardRole).toEqual(expected.perCardRole);
    expect(result.state.labels.E.busy).toEqual([...expected.labels.E.busy]);
  });

  test('preserves resources across a serialized update and accepts legacy state', () => {
    const initial = handleThreatStateRequest(request);
    const state = JSON.parse(JSON.stringify(initial.state)) as typeof initial.state;
    const afterPlay: Position = {
      hands: { ...position.hands, S: { ...position.hands.S, C: [] } }
    };
    const updated = handleThreatStateRequest({ mode: 'update', position: afterPlay, state, playedCardId: 'CA' });
    expect(updated.state.resource).toEqual(initial.state.resource);
    expect(updated.state.resource?.resourceCardIds).toEqual(['SA']);

    delete state.resource;
    const legacy = handleThreatStateRequest({ mode: 'update', position: afterPlay, state, playedCardId: 'CA' });
    expect(legacy.state.resource).toEqual({ resourceCardIds: [], resourcesBySuit: {} });
  });

  test.each(['threat_state_cli', 'threat_state_server'])('%s accepts init requests without optional resources', (script) => {
    const { resourceCardIds: _, ...legacyRequest } = request;
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const output = execFileSync(process.execPath, ['node_modules/vite-node/vite-node.mjs', `src/cli/${script}.ts`], {
      cwd: root,
      input: `${JSON.stringify(legacyRequest)}\n`,
      encoding: 'utf8'
    });
    const response = JSON.parse(output.trim());
    expect(response.ok).toBe(true);
    expect(response.state.resource.resourceCardIds).toEqual([]);
    expect(response.state.threat.threatCardIds).toEqual(['SQ']);
  });
});
