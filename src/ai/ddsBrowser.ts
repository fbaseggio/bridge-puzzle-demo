import type { Contract, Hand, Seat, Suit } from '../core/types';

export type DdsPlay = {
  suit: string;
  rank: string;
  score?: number;
  equals?: string[];
};

export type DdsResult = {
  player?: 'N' | 'E' | 'S' | 'W';
  tricks?: { ns: number; ew: number };
  plays?: DdsPlay[];
};

type NextPlaysFn = (pbn: string, trump: string, plays: string[]) => DdsResult;

declare global {
  interface Window {
    nextPlays?: NextPlaysFn;
    Module?: Record<string, unknown>;
    e?: Record<string, unknown>;
  }
}

const SEAT_ORDER: Seat[] = ['N', 'E', 'S', 'W'];
const RANK_ORDER = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

let loadAttempted = false;
const scriptLoadBySrc = new Map<string, Promise<void>>();
let ddsRuntimeStatus: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
let ddsRuntimePromise: Promise<boolean> | null = null;

function rotateSeatsFromLeader(leader: Seat): Seat[] {
  const idx = SEAT_ORDER.indexOf(leader);
  return [SEAT_ORDER[idx], SEAT_ORDER[(idx + 1) % 4], SEAT_ORDER[(idx + 2) % 4], SEAT_ORDER[(idx + 3) % 4]];
}

function handToPbn(hand: Hand): string {
  const suitParts: string[] = [];
  for (const suit of ['S', 'H', 'D', 'C'] as const) {
    const sorted = [...hand[suit]].sort((a, b) => RANK_ORDER.indexOf(a) - RANK_ORDER.indexOf(b));
    suitParts.push(sorted.join(''));
  }
  return suitParts.join('.');
}

function toDdsTrump(strain: Contract['strain']): string {
  if (strain === 'NT') return 'N';
  return strain;
}

function toDdsPlay(cardId: string): string {
  const suit = cardId.slice(0, 1);
  const rank = cardId.slice(1);
  return `${rank}${suit}`;
}

function startDdsRuntimeLoad(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (ddsRuntimeStatus === 'ready') return Promise.resolve(true);
  if (ddsRuntimePromise) return ddsRuntimePromise;
  loadAttempted = true;
  ddsRuntimeStatus = 'loading';
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  const outSrc = `${base}dds/out.js`;
  const ddsSrc = `${base}dds/dds.js`;
  console.info(`[DDS-LOAD] start base=${base}`);
  if (!window.Module) {
    window.Module = {};
    console.info('[DDS-LOAD] initialized window.Module');
  }

  const loadScript = (src: string): Promise<void> => {
    const existing = scriptLoadBySrc.get(src);
    if (existing) return existing;

    const promise = new Promise<void>((resolve, reject) => {
      const already = document.querySelector(`script[data-dds-src=\"${src}\"]`) as HTMLScriptElement | null;
      if (already) {
        if ((already as HTMLScriptElement).dataset.ddsLoaded === '1') {
          resolve();
          return;
        }
        already.addEventListener('load', () => resolve(), { once: true });
        already.addEventListener('error', () => reject(new Error(`DDS load failed: ${src}`)), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.ddsSrc = src;
      script.onload = () => {
        script.dataset.ddsLoaded = '1';
        console.info(`[DDS-LOAD] loaded ${src}`);
        resolve();
      };
      script.onerror = () => {
        console.warn(`[DDS-LOAD] failed ${src}`);
        reject(new Error(`DDS load failed: ${src}`));
      };
      document.head.appendChild(script);
    });

    scriptLoadBySrc.set(src, promise);
    return promise;
  };

  ddsRuntimePromise = loadScript(outSrc)
    .then(() => {
      if (window.e && typeof window.e === 'object') {
        window.Module = window.e;
        console.info('[DDS-LOAD] aliased window.Module <- window.e');
      } else {
        console.info('[DDS-LOAD] window.e missing after out.js load');
      }
      return loadScript(ddsSrc);
    })
    .then(() => {
      console.info(
        `[DDS-LOAD] ready typeof nextPlays=${typeof window.nextPlays} module=${window.Module ? 'yes' : 'no'}`
      );
      ddsRuntimeStatus = typeof window.nextPlays === 'function' ? 'ready' : 'failed';
      return ddsRuntimeStatus === 'ready';
    })
    .catch(() => {
      console.info('[DDS-LOAD] optional runtime unavailable');
      ddsRuntimeStatus = 'failed';
      return false;
    });
  return ddsRuntimePromise;
}

export function warmDdsRuntime(): void {
  if (typeof window === 'undefined') return;
  void startDdsRuntimeLoad();
}

export function ensureDdsRuntime(): Promise<boolean> {
  return startDdsRuntimeLoad();
}

export function getDdsRuntimeStatus(): 'idle' | 'loading' | 'ready' | 'failed' {
  return ddsRuntimeStatus;
}

export type DdsQueryInput = {
  openingLeader: Seat;
  initialHands: Record<Seat, Hand>;
  contract: Contract;
  playedCardIds: string[];
};

export type DdsQueryResult =
  | { ok: true; result: DdsResult; pbn: string; trump: string; plays: string[] }
  | { ok: false; reason: 'runtime-missing' | 'runtime-error'; detail?: string };

export function queryDdsNextPlays(input: DdsQueryInput): DdsQueryResult {
  if (typeof window === 'undefined' || typeof window.nextPlays !== 'function') {
    return { ok: false, reason: 'runtime-missing' };
  }

  const rotated = rotateSeatsFromLeader(input.openingLeader);
  const pbn = `${input.openingLeader}:${rotated.map((seat) => handToPbn(input.initialHands[seat])).join(' ')}`;
  const trump = toDdsTrump(input.contract.strain);
  const plays = input.playedCardIds.map(toDdsPlay);

  try {
    const result = window.nextPlays(pbn, trump, plays);
    return { ok: true, result, pbn, trump, plays };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: 'runtime-error', detail };
  }
}
