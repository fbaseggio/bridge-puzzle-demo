import { describe, expect, it } from 'vitest';
import { waitForRequiredDdsReady, type DdsRuntimeStatus } from '../../src/demo/ddsAvailabilityGate';

describe('ddsAvailabilityGate', () => {
  it('immediately resolves ready when DDS is not required', async () => {
    let ensureCalls = 0;
    const result = await waitForRequiredDdsReady({
      requirement: 'optional',
      getRuntimeStatus: () => 'failed',
      ensureRuntime: async () => {
        ensureCalls += 1;
        return false;
      }
    });

    expect(result).toEqual({
      phase: 'ready',
      attempts: 0,
      elapsedMs: 0,
      runtimeStatus: 'failed'
    });
    expect(ensureCalls).toBe(0);
  });

  it('retries and becomes ready when runtime starts within budget', async () => {
    let runtimeStatus: DdsRuntimeStatus = 'idle';
    let nowMs = 0;
    let ensureCalls = 0;
    let sleepCalls = 0;
    const progressPhases: string[] = [];
    const result = await waitForRequiredDdsReady({
      requirement: 'required',
      getRuntimeStatus: () => runtimeStatus,
      ensureRuntime: async () => {
        ensureCalls += 1;
        if (ensureCalls >= 2) runtimeStatus = 'ready';
        return runtimeStatus === 'ready';
      },
      maxAttempts: 4,
      maxWaitMs: 2000,
      retryDelayMs: 300,
      now: () => nowMs,
      sleep: async (ms) => {
        sleepCalls += 1;
        nowMs += ms;
      },
      onProgress: (update) => {
        progressPhases.push(update.phase);
      }
    });

    expect(result.phase).toBe('ready');
    expect(result.attempts).toBe(2);
    expect(ensureCalls).toBe(2);
    expect(sleepCalls).toBe(1);
    expect(progressPhases).toEqual(['waiting', 'retrying']);
  });

  it('enters blocked phase when retries are exhausted', async () => {
    let nowMs = 0;
    let ensureCalls = 0;
    const result = await waitForRequiredDdsReady({
      requirement: 'required',
      getRuntimeStatus: () => 'failed',
      ensureRuntime: async () => {
        ensureCalls += 1;
        return false;
      },
      maxAttempts: 3,
      maxWaitMs: 2000,
      retryDelayMs: 250,
      now: () => nowMs,
      sleep: async (ms) => {
        nowMs += ms;
      }
    });

    expect(result.phase).toBe('blocked');
    expect(result.attempts).toBe(3);
    expect(ensureCalls).toBe(3);
    expect(result.runtimeStatus).toBe('failed');
  });
});
