export type DdsRequirement = 'optional' | 'required';
export type DdsRuntimeStatus = 'idle' | 'loading' | 'ready' | 'failed';
export type DdsAvailabilityPhase = 'ready' | 'waiting' | 'retrying' | 'blocked';

export type WaitForRequiredDdsReadyInput = {
  requirement: DdsRequirement;
  getRuntimeStatus: () => DdsRuntimeStatus;
  ensureRuntime: () => Promise<boolean>;
  maxAttempts?: number;
  maxWaitMs?: number;
  retryDelayMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onProgress?: (update: {
    phase: 'waiting' | 'retrying';
    attempts: number;
    elapsedMs: number;
    runtimeStatus: DdsRuntimeStatus;
  }) => void;
};

export type WaitForRequiredDdsReadyResult = {
  phase: 'ready' | 'blocked';
  attempts: number;
  elapsedMs: number;
  runtimeStatus: DdsRuntimeStatus;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForRequiredDdsReady(
  input: WaitForRequiredDdsReadyInput
): Promise<WaitForRequiredDdsReadyResult> {
  if (input.requirement !== 'required') {
    return {
      phase: 'ready',
      attempts: 0,
      elapsedMs: 0,
      runtimeStatus: input.getRuntimeStatus()
    };
  }

  const maxAttempts = Math.max(1, input.maxAttempts ?? 4);
  const maxWaitMs = Math.max(0, input.maxWaitMs ?? 2500);
  const retryDelayMs = Math.max(0, input.retryDelayMs ?? 250);
  const now = input.now ?? Date.now;
  const sleep = input.sleep ?? defaultSleep;
  const start = now();

  let attempts = 0;
  while (attempts < maxAttempts && now() - start <= maxWaitMs) {
    if (input.getRuntimeStatus() === 'ready') {
      return {
        phase: 'ready',
        attempts,
        elapsedMs: Math.max(0, now() - start),
        runtimeStatus: input.getRuntimeStatus()
      };
    }

    input.onProgress?.({
      phase: attempts === 0 ? 'waiting' : 'retrying',
      attempts,
      elapsedMs: Math.max(0, now() - start),
      runtimeStatus: input.getRuntimeStatus()
    });

    attempts += 1;
    const ready = await input.ensureRuntime();
    if (ready || input.getRuntimeStatus() === 'ready') {
      return {
        phase: 'ready',
        attempts,
        elapsedMs: Math.max(0, now() - start),
        runtimeStatus: input.getRuntimeStatus()
      };
    }

    if (attempts >= maxAttempts) break;
    if (now() - start >= maxWaitMs) break;
    await sleep(retryDelayMs);
  }

  return {
    phase: 'blocked',
    attempts,
    elapsedMs: Math.max(0, now() - start),
    runtimeStatus: input.getRuntimeStatus()
  };
}
