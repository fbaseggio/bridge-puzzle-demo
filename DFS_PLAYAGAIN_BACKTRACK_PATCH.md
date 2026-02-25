# DFS Play Again Backtracking Fix

## Summary
- Keeps DFS divergence policy: latest index with remaining alternatives is chosen first.
- Fixes exhaustion bookkeeping so replay-forced runtime filtering no longer erases earlier recorded alternatives.
- Availability now backtracks to earlier indices after deeper indices are exhausted.
- Adds logs for DFS candidate indices and replay recordedRemaining vs runtimeRemaining when filtered.
- Adds p004 regression tests: deep-first then backtrack, plus CA->heart forced branch at idx=0.

## Combined Diff
```diff
diff --git a/src/core/engine.ts b/src/core/engine.ts
index 41b7d51..49cdc8e 100644
--- a/src/core/engine.ts
+++ b/src/core/engine.ts
@@ -79,7 +79,8 @@ function cloneState(state: State): State {
         : null,
       cursor: state.replay.cursor,
       divergenceIndex: state.replay.divergenceIndex,
-      forcedCard: state.replay.forcedCard
+      forcedCard: state.replay.forcedCard,
+      forcedClassId: state.replay.forcedClassId
     }
   };
 }
@@ -166,6 +167,7 @@ type AutoChoice = {
   chosenBucket?: string;
   bucketCards?: CardId[];
   policyClassByCard?: Record<string, string>;
+  tierBuckets?: Partial<Record<'tier2a' | 'tier2b' | 'tier3a' | 'tier3b', CardId[]>>;
   decisionSig?: string;
   replay?: { action: 'forced' | 'disabled'; index?: number; reason?: 'sig-mismatch' | 'card-not-legal'; card?: CardId };
 };
@@ -266,11 +268,22 @@ function chooseAutoplay(state: State, policy: Policy): AutoChoice {
       replayNote = { action: 'disabled', index: rec.index, reason: 'sig-mismatch', card: rec.chosenCard };
     } else {
       const legal = legalPlays(state);
-      const forceCard =
-        state.replay.divergenceIndex !== null && state.replay.cursor === state.replay.divergenceIndex && state.replay.forcedCard
-          ? state.replay.forcedCard
-          : rec.chosenCard;
-      const forced = legal.find((p) => toCardId(p.suit, p.rank) === forceCard);
+      const isDivergence = state.replay.divergenceIndex !== null && state.replay.cursor === state.replay.divergenceIndex;
+      const legalCardIds = legal.map((p) => toCardId(p.suit, p.rank));
+      const altClassByCard = buildPolicyClassByCard(state, state.turn, rec.chosenBucket, legalCardIds);
+      let forced: Play | undefined;
+      let forceCard: CardId = rec.chosenCard;
+      if (isDivergence && state.replay.forcedClassId) {
+        const match = legal.find((p) => altClassByCard[toCardId(p.suit, p.rank)] === state.replay.forcedClassId);
+        if (match) {
+          forced = match;
+          forceCard = toCardId(match.suit, match.rank);
+        }
+      }
+      if (!forced) {
+        forceCard = isDivergence && state.replay.forcedCard ? state.replay.forcedCard : rec.chosenCard;
+        forced = legal.find((p) => toCardId(p.suit, p.rank) === forceCard);
+      }
       if (!forced) {
         const fallback = legal.find((p) => classInfoForCard(state, p.seat, toCardId(p.suit, p.rank)).classId === rec.chosenClassId);
         if (!fallback) {
@@ -281,7 +294,6 @@ function chooseAutoplay(state: State, policy: Policy): AutoChoice {
           const chosenBucket = rec.chosenBucket;
           const bucketCards = [...rec.bucketCards];
           const policyClassByCard = buildPolicyClassByCard(state, state.turn, chosenBucket, bucketCards);
-          const isDivergence = state.replay.divergenceIndex !== null && rec.index === state.replay.divergenceIndex;
           if (isDivergence) state.replay.enabled = false;
           return {
             play: fallback,
@@ -297,7 +309,6 @@ function chooseAutoplay(state: State, policy: Policy): AutoChoice {
         const chosenBucket = rec.chosenBucket;
         const bucketCards = [...rec.bucketCards];
         const policyClassByCard = buildPolicyClassByCard(state, state.turn, chosenBucket, bucketCards);
-        const isDivergence = state.replay.divergenceIndex !== null && rec.index === state.replay.divergenceIndex;
         if (isDivergence) {
           state.replay.enabled = false;
         }
@@ -434,13 +445,22 @@ function chooseAutoplay(state: State, policy: Policy): AutoChoice {
   const idx = pickRandomIndex(chosenBucket.cards.length, state.rng);
   const chosen = chosenBucket.cards[idx] ?? chosenBucket.cards[0];
   const { suit, rank } = parseCardId(chosen);
-  const policyClassByCard = buildPolicyClassByCard(state, state.turn, chosenBucket.name, chosenBucket.cards);
+  const policyClassByCard = buildPolicyClassByCard(state, state.turn, chosenBucket.name, chosenBucket.cards) ?? {};
+  for (const card of [...tiers.tier2a, ...tiers.tier2b, ...tiers.tier3a, ...tiers.tier3b]) {
+    policyClassByCard[card] = `busy:${card[0]}`;
+  }
+  const tierBuckets: Partial<Record<'tier2a' | 'tier2b' | 'tier3a' | 'tier3b', CardId[]>> = {};
+  if (tiers.tier2a.length > 0) tierBuckets.tier2a = [...tiers.tier2a];
+  if (tiers.tier2b.length > 0) tierBuckets.tier2b = [...tiers.tier2b];
+  if (tiers.tier3a.length > 0) tierBuckets.tier3a = [...tiers.tier3a];
+  if (tiers.tier3b.length > 0) tierBuckets.tier3b = [...tiers.tier3b];
   return {
     play: { seat: state.turn, suit, rank },
     preferredDiscard: pref ?? undefined,
     chosenBucket: chosenBucket.name,
     bucketCards: [...chosenBucket.cards],
     policyClassByCard,
+    tierBuckets,
     decisionSig,
     replay: replayNote
   };
@@ -455,6 +475,7 @@ function applyOnePlay(
   chosenBucket?: string,
   bucketCards?: CardId[],
   policyClassByCard?: Record<string, string>,
+  tierBuckets?: Partial<Record<'tier2a' | 'tier2b' | 'tier3a' | 'tier3b', CardId[]>>,
   decisionSig?: string,
   replay?: { action: 'forced' | 'disabled'; index?: number; reason?: 'sig-mismatch' | 'card-not-legal'; card?: CardId }
 ): EngineEvent[] {
@@ -470,7 +491,7 @@ function applyOnePlay(
   state.trick.push({ ...play });
   state.trickClassIds.push(`${play.seat}:${playedClass}`);
   if (eventType === 'autoplay') {
-    events.push({ type: eventType, play: { ...play }, preferredDiscard, chosenBucket, bucketCards, policyClassByCard, decisionSig, replay });
+    events.push({ type: eventType, play: { ...play }, preferredDiscard, chosenBucket, bucketCards, policyClassByCard, tierBuckets, decisionSig, replay });
   } else {
     events.push({ type: eventType, play: { ...play } });
   }
@@ -558,7 +579,7 @@ export function init(problem: Problem): State {
     policies: { ...problem.policies },
     preferredDiscards: normalizePreferred(problem),
     preferredDiscardUsed: {},
-    replay: { enabled: false, transcript: null, cursor: 0, divergenceIndex: null, forcedCard: null }
+    replay: { enabled: false, transcript: null, cursor: 0, divergenceIndex: null, forcedCard: null, forcedClassId: null }
   };
 
   if (allHandsEmpty(state.hands)) {
@@ -643,6 +664,7 @@ export function apply(state: State, play: Play): { state: State; events: EngineE
         auto.chosenBucket,
         auto.bucketCards,
         auto.policyClassByCard,
+        auto.tierBuckets,
         auto.decisionSig,
         auto.replay
       )
diff --git a/src/core/types.ts b/src/core/types.ts
index 38fbb4e..af0edf6 100644
--- a/src/core/types.ts
+++ b/src/core/types.ts
@@ -28,6 +28,7 @@ export type ReplayState = {
   cursor: number;
   divergenceIndex: number | null;
   forcedCard: CardId | null;
+  forcedClassId: string | null;
 };
 
 export type Hand = {
@@ -121,6 +122,7 @@ export type EngineEvent =
       chosenBucket?: string;
       bucketCards?: CardId[];
       policyClassByCard?: Record<string, string>;
+      tierBuckets?: Partial<Record<'tier2a' | 'tier2b' | 'tier3a' | 'tier3b', CardId[]>>;
       decisionSig?: string;
       replay?: { action: 'forced' | 'disabled'; index?: number; reason?: 'sig-mismatch' | 'card-not-legal'; card?: CardId };
     }
diff --git a/src/demo/main.ts b/src/demo/main.ts
index c3b8329..4f8ccd7 100644
--- a/src/demo/main.ts
+++ b/src/demo/main.ts
@@ -27,7 +27,7 @@ import {
 } from '../ai/threatModel';
 import { formatAfterPlayBlock, formatAfterTrickBlock, formatDiscardDecisionBlock, formatInitBlock } from '../ai/threatModelVerbose';
 import { getCardRankColor } from '../ui/annotations';
-import { hasUntriedAlternatives, triedAltKey } from './playAgain';
+import { divergenceCandidates, hasUntriedAlternatives, triedAltKey } from './playAgain';
 import { demoProblems } from './problems';
 
 const app = document.querySelector<HTMLDivElement>('#app');
@@ -41,6 +41,11 @@ const suitOrder: Suit[] = ['S', 'H', 'D', 'C'];
 const rankOrder: Rank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
 const suitSymbol: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
 const seatName: Record<Seat, string> = { N: 'North', E: 'East', S: 'South', W: 'West' };
+const busyBranchingLabel: Record<'strict' | 'sameLevel' | 'allBusy', string> = {
+  strict: 'Strict',
+  sameLevel: 'Same level',
+  allBusy: 'All busy'
+};
 type ProblemWithThreats = typeof demoProblems[number]['problem'] & { threatCardIds?: CardId[] };
 
 const maxSuitLineLen = Math.max(
@@ -68,6 +73,9 @@ root.style.setProperty('--trick-box-h', `${trickBoxSize}px`);
 root.style.setProperty('--table-gap-y', `${verticalGap}px`);
 root.style.setProperty('--table-gap-x', `${horizontalGap}px`);
 root.style.setProperty('--slot-offset', '12%');
+const busyBranching: 'strict' | 'sameLevel' | 'allBusy' = 'sameLevel';
+const threatDetail = false;
+const verboseCoverageDetail = false;
 
 let currentProblem = demoProblems[0].problem;
 let currentProblemId = demoProblems[0].id;
@@ -117,6 +125,7 @@ let runStatus: RunStatus = 'running';
 let playAgainAvailable = false;
 let playAgainUnavailableReason: string | null = null;
 let playAgainLastCandidateIndex: number | null = null;
+let runPlayCounter = 0;
 
 function clearSingletonAutoplayTimer(): void {
   if (singletonAutoplayTimer) {
@@ -259,6 +268,7 @@ function cloneStateForLog(src: State): State {
           cursor: src.replay.cursor,
           divergenceIndex: src.replay.divergenceIndex,
           forcedCard: src.replay.forcedCard,
+          forcedClassId: src.replay.forcedClassId,
           transcript: {
             problemId: src.replay.transcript.problemId,
             seed: src.replay.transcript.seed,
@@ -276,6 +286,7 @@ function cloneStateForLog(src: State): State {
           cursor: src.replay.cursor,
           divergenceIndex: src.replay.divergenceIndex,
           forcedCard: src.replay.forcedCard,
+          forcedClassId: src.replay.forcedClassId,
           transcript: null
         }
   };
@@ -407,6 +418,15 @@ function logLinesForStep(before: State, attemptedPlay: Play, events: EngineEvent
   const shadow = cloneStateForLog(before);
 
   for (const event of events) {
+    if (event.type === 'played' || event.type === 'autoplay') {
+      if (runPlayCounter > 0) {
+        lines.push('');
+      }
+      runPlayCounter += 1;
+      lines.push(`----- PLAY ${runPlayCounter} -----`);
+      lines.push(`play ${event.play.seat}:${toCardId(event.play.suit, event.play.rank)} (${event.type === 'played' ? 'user' : 'auto'})`);
+    }
+
     if (verboseLog && event.type === 'autoplay') {
       if (event.replay?.action === 'forced') {
         lines.push(`[PLAYAGAIN] forcing index=${event.replay.index ?? '?'} card=${event.replay.card ?? `${event.play.suit}${event.play.rank}`}`);
@@ -424,9 +444,11 @@ function logLinesForStep(before: State, attemptedPlay: Play, events: EngineEvent
           );
         }
       }
-      const leadSuit = shadow.trick[0]?.suit ?? 'none';
-      const legalCount = legalPlays(shadow).length;
-      lines.push(`autoplayDecision seat=${shadow.turn} leadSuit=${leadSuit} legal=${legalCount} chosen=${playText(event.play)}`);
+      if (threatDetail) {
+        const leadSuit = shadow.trick[0]?.suit ?? 'none';
+        const legalCount = legalPlays(shadow).length;
+        lines.push(`autoplayDecision seat=${shadow.turn} leadSuit=${leadSuit} legal=${legalCount} chosen=${playText(event.play)}`);
+      }
 
       const policy = shadow.policies[shadow.turn];
       if (
@@ -440,12 +462,15 @@ function logLinesForStep(before: State, attemptedPlay: Play, events: EngineEvent
           ? getIdleThreatThresholdRank(ls, shadow.threat as ThreatContext, shadow.threatLabels as DefenderLabels)
           : null;
         if (threshold) {
-          const below = legalPlays(shadow).filter((p) => rankOrder.indexOf(p.rank) > rankOrder.indexOf(threshold)).map((p) => `${p.suit}${p.rank}`);
-          const above = legalPlays(shadow).filter((p) => rankOrder.indexOf(p.rank) <= rankOrder.indexOf(threshold)).map((p) => `${p.suit}${p.rank}`);
-          lines.push(`[THREAT:follow] defender=${shadow.turn} ledSuit=${ls} threshold=${threshold}`);
-          lines.push(`inSuit=${inSuit.join(' ') || '-'} below=${below.join(' ') || '-'} above=${above.join(' ') || '-'} chosen=${event.play.suit}${event.play.rank}`);
+          const below = legalPlays(shadow).filter((p) => rankOrder.indexOf(p.rank) > rankOrder.indexOf(threshold));
+          const above = legalPlays(shadow).filter((p) => rankOrder.indexOf(p.rank) <= rankOrder.indexOf(threshold));
+          lines.push(
+            `[THREAT] follow seat=${shadow.turn} ledSuit=${ls} threshold=${threshold} inSuit=${inSuit.length} chosen=${event.play.suit}${event.play.rank} below=${below.length} above=${above.length}`
+          );
         } else {
-          lines.push(`[THREAT:follow] defender=${shadow.turn} ledSuit=${ls} threshold=- inSuit=${inSuit.join(' ') || '-'} chosen=${event.play.suit}${event.play.rank} (baseline)`);
+          lines.push(
+            `[THREAT] follow seat=${shadow.turn} ledSuit=${ls} threshold=- inSuit=${inSuit.length} chosen=${event.play.suit}${event.play.rank} mode=baseline`
+          );
         }
       }
 
@@ -460,32 +485,45 @@ function logLinesForStep(before: State, attemptedPlay: Play, events: EngineEvent
         const localCtx = shadow.threat as ThreatContext;
         const localLabels = shadow.threatLabels as DefenderLabels;
         const tiers = computeDiscardTiers(shadow.turn, positionFromState(shadow), ledSuit, localCtx, localLabels);
+        const tierCounts = [
+          ['t2a', tiers.tier2a.length],
+          ['t2b', tiers.tier2b.length],
+          ['t3a', tiers.tier3a.length],
+          ['t3b', tiers.tier3b.length]
+        ].filter(([, count]) => count > 0).map(([name, count]) => `${name}:${count}`).join(' ');
         lines.push(
-          formatDiscardDecisionBlock({
-            defender: shadow.turn,
-            ledSuit,
-            trumpStrain: shadow.contract.strain,
-            ctx: localCtx,
-            labels: localLabels,
-            legal: tiers.legal,
-            tier1a: tiers.tier1a,
-            tier1b: tiers.tier1b,
-            tier1c: tiers.tier1c,
-            tier2a: tiers.tier2a,
-            tier2b: tiers.tier2b,
-            tier3a: tiers.tier3a,
-            tier3b: tiers.tier3b,
-            tier4: tiers.tier4,
-            chosen: toCardId(event.play.suit, event.play.rank),
-            rngState: { seed: after.rng.seed, counter: after.rng.counter }
-          })
+          `[THREAT] discard seat=${shadow.turn} ledSuit=${ledSuit} legal=${tiers.legal.length} chosen=${event.play.suit}${event.play.rank} bucket=${event.chosenBucket ?? '-'} tiers=${tierCounts || '-'}`
         );
+        if (threatDetail) {
+          lines.push(
+            formatDiscardDecisionBlock({
+              defender: shadow.turn,
+              ledSuit,
+              trumpStrain: shadow.contract.strain,
+              ctx: localCtx,
+              labels: localLabels,
+              legal: tiers.legal,
+              tier1a: tiers.tier1a,
+              tier1b: tiers.tier1b,
+              tier1c: tiers.tier1c,
+              tier2a: tiers.tier2a,
+              tier2b: tiers.tier2b,
+              tier3a: tiers.tier3a,
+              tier3b: tiers.tier3b,
+              tier4: tiers.tier4,
+              chosen: toCardId(event.play.suit, event.play.rank),
+              rngState: { seed: after.rng.seed, counter: after.rng.counter }
+            })
+          );
+        }
       }
     }
 
-    lines.push(eventText(event));
+    if (event.type === 'illegal' || event.type === 'handComplete') {
+      lines.push(eventText(event));
+    }
 
-    if (verboseLog && (event.type === 'played' || event.type === 'autoplay')) {
+    if (verboseLog && threatDetail && (event.type === 'played' || event.type === 'autoplay')) {
       const beforeCtx = shadow.threat as ThreatContext | null;
       const beforeLabels = shadow.threatLabels as DefenderLabels | null;
       applyEventToShadow(shadow, event);
@@ -515,24 +553,28 @@ function logLinesForStep(before: State, attemptedPlay: Play, events: EngineEvent
       );
     }
 
-    if (event.type === 'trickComplete' && verboseLog && shadow.threat && shadow.threatLabels) {
-      const trickIndex = shadow.tricksWon.NS + shadow.tricksWon.EW + 1;
-      lines.push(
-        formatAfterTrickBlock({
-          trickIndex,
-          leader: shadow.leader,
-          trick: event.trick,
-          beforeCtx: shadow.threat as ThreatContext,
-          afterCtx: shadow.threat as ThreatContext,
-          beforeLabels: shadow.threatLabels as DefenderLabels,
-          afterLabels: shadow.threatLabels as DefenderLabels,
-          position: positionFromState(shadow)
-        })
-      );
+    if (event.type === 'trickComplete') {
+      lines.push(`----- TRICK COMPLETE ----- winner=${event.winner} trick=${event.trick.map(playText).join(' ')}`);
+      lines.push('');
+      if (verboseLog && threatDetail && shadow.threat && shadow.threatLabels) {
+        const trickIndex = shadow.tricksWon.NS + shadow.tricksWon.EW + 1;
+        lines.push(
+          formatAfterTrickBlock({
+            trickIndex,
+            leader: shadow.leader,
+            trick: event.trick,
+            beforeCtx: shadow.threat as ThreatContext,
+            afterCtx: shadow.threat as ThreatContext,
+            beforeLabels: shadow.threatLabels as DefenderLabels,
+            afterLabels: shadow.threatLabels as DefenderLabels,
+            position: positionFromState(shadow)
+          })
+        );
+      }
     }
   }
 
-  if (verboseLog) {
+  if (verboseLog && threatDetail) {
     lines.push(snapshotText(after));
   }
 
@@ -547,19 +589,31 @@ function appendTranscriptDecisions(before: State, events: EngineEvent[]): void {
       const bucketCards = event.bucketCards ? [...event.bucketCards] : [chosenCard];
       const policyClassByCard = event.policyClassByCard ?? {};
       const chosenBucket = event.chosenBucket ?? 'unknown';
+      const tierBuckets = event.tierBuckets ?? {};
+      let explorationCards = [...bucketCards];
+      if ((chosenBucket.startsWith('tier2') || chosenBucket.startsWith('tier3')) && busyBranching !== 'strict') {
+        const orderedKeys =
+          busyBranching === 'sameLevel'
+            ? ([`tier${chosenBucket.startsWith('tier2') ? '2' : '3'}a`, `tier${chosenBucket.startsWith('tier2') ? '2' : '3'}b`] as const)
+            : (['tier2a', 'tier2b', 'tier3a', 'tier3b'] as const);
+        const merged: CardId[] = [];
+        for (const key of orderedKeys) {
+          for (const card of tierBuckets[key] ?? []) {
+            if (!merged.includes(card)) merged.push(card);
+          }
+        }
+        if (merged.length > 0) explorationCards = merged;
+      }
       const toAltClassId = (card: CardId): string => {
         const mapped = policyClassByCard[card];
         if (mapped) return mapped;
-        if (chosenBucket.startsWith('tier1')) return 'idle:tier1';
-        if (chosenBucket.startsWith('tier2') || chosenBucket.startsWith('tier3')) return `busy:${card[0]}`;
-        if (chosenBucket.startsWith('tier4')) return `other:${card[0]}`;
         return classInfoForCard(shadow, event.play.seat, card).classId;
       };
       const classOrder: string[] = [];
       const representativeCardByClass: Record<string, CardId> = {};
       const chosenClassId = classInfoForCard(shadow, event.play.seat, chosenCard).classId;
       const chosenAltClassId = toAltClassId(chosenCard);
-      for (const card of bucketCards) {
+      for (const card of explorationCards) {
         const classId = toAltClassId(card);
         if (!classOrder.includes(classId)) classOrder.push(classId);
         if (!representativeCardByClass[classId]) representativeCardByClass[classId] = card;
@@ -567,12 +621,33 @@ function appendTranscriptDecisions(before: State, events: EngineEvent[]): void {
       if (classOrder.includes(chosenAltClassId)) {
         representativeCardByClass[chosenAltClassId] = chosenCard;
       }
-      const coveredCards = bucketCards.filter((card) => toAltClassId(card) === chosenAltClassId);
+      const sourceRec =
+        event.replay?.action === 'forced' && shadow.replay.transcript && typeof event.replay.index === 'number'
+          ? shadow.replay.transcript.decisions[event.replay.index]
+          : null;
+      const runtimeRemaining = classOrder.filter((id) => id !== chosenAltClassId);
+      if (sourceRec) {
+        const recordedClasses = [sourceRec.chosenAltClassId ?? sourceRec.chosenClassId, ...sourceRec.sameBucketAlternativeClassIds]
+          .filter((v, idx, arr) => v && arr.indexOf(v) === idx);
+        classOrder.splice(0, classOrder.length, ...recordedClasses);
+        for (const [cls, card] of Object.entries(sourceRec.representativeCardByClass)) {
+          representativeCardByClass[cls] = card;
+        }
+        if (!classOrder.includes(chosenAltClassId)) classOrder.push(chosenAltClassId);
+        representativeCardByClass[chosenAltClassId] = chosenCard;
+        if (verboseLog && runtimeRemaining.join(',') !== sourceRec.sameBucketAlternativeClassIds.join(',')) {
+          logs = [
+            ...logs,
+            `[EQC:replay] idx=${event.replay.index} recordedRemaining=${sourceRec.sameBucketAlternativeClassIds.join(',') || '-'} runtimeRemaining=${runtimeRemaining.join(',') || '-'}`
+          ].slice(-500);
+        }
+      }
+      const coveredCards = explorationCards.filter((card) => toAltClassId(card) === chosenAltClassId);
       const remainingClasses = classOrder.filter((id) => id !== chosenAltClassId);
       if (verboseLog) {
         logs = [
           ...logs,
-          `[EQC] idx=${currentRunTranscript.length} seat=${event.play.seat} bucket=${chosenBucket} classes=${classOrder.join(',') || '-'} chosen=${chosenAltClassId} covers=${coveredCards.join(',') || '-'} remaining=${remainingClasses.join(',') || '-'}`
+          `[EQC] idx=${currentRunTranscript.length} seat=${event.play.seat} scope=${busyBranching} bucket=${chosenBucket} classes=${classOrder.join(',') || '-'} chosen=${chosenAltClassId} covers=${coveredCards.join(',') || '-'} remaining=${remainingClasses.join(',') || '-'}`
         ].slice(-500);
       }
       currentRunTranscript.push({
@@ -680,17 +755,21 @@ function refreshThreatModel(problemId: string, clearLogs: boolean): void {
   if (rawThreats.length === 0) return;
 
   if (verboseLog) {
-    logs = [
-      ...logs,
-      formatInitBlock({
-        problemId,
-        threatCardIdsRaw: rawThreats,
-        position: positionFromState(state),
-        ctx: threatCtx,
-        labels: threatLabels
-      }),
-      ...seatOrder.map((seat) => `[HAND:init] ${formatHandInitSummary(state, seat)}`)
-    ].slice(-500);
+    if (threatDetail) {
+      logs = [
+        ...logs,
+        formatInitBlock({
+          problemId,
+          threatCardIdsRaw: rawThreats,
+          position: positionFromState(state),
+          ctx: threatCtx,
+          labels: threatLabels
+        }),
+        ...seatOrder.map((seat) => `[HAND:init] ${formatHandInitSummary(state, seat)}`)
+      ].slice(-500);
+    } else {
+      logs = [...logs, `[THREAT:init] problem=${problemId} raw=${rawThreats.join(',')} validation=OK`].slice(-500);
+    }
   }
 }
 
@@ -704,6 +783,7 @@ function resetGame(seed: number, reason: string): void {
   state = init({ ...currentProblem, rngSeed: currentSeed });
   logs = [...logs, `${reason} seed=${currentSeed}`].slice(-500);
   runStatus = 'running';
+  runPlayCounter = 0;
   playAgainAvailable = false;
   playAgainUnavailableReason = null;
   playAgainLastCandidateIndex = null;
@@ -725,6 +805,7 @@ function selectProblem(problemId: string): void {
   currentSeed = currentProblem.rngSeed >>> 0;
   state = init({ ...currentProblem, rngSeed: currentSeed });
   runStatus = 'running';
+  runPlayCounter = 0;
   playAgainAvailable = false;
   playAgainUnavailableReason = null;
   playAgainLastCandidateIndex = null;
@@ -830,7 +911,7 @@ function runTurn(play: Play): void {
     }
     const availability = hasUntriedAlternatives(lastSuccessfulTranscript, triedAltClass);
     playAgainAvailable = availability.ok;
-    playAgainUnavailableReason = availability.ok ? null : (availability.reason ?? 'no-untried-same-bucket-alternatives');
+    playAgainUnavailableReason = availability.ok ? null : (availability.reason ?? 'no-untried-alternatives');
     playAgainLastCandidateIndex = availability.lastCandidateIndex ?? null;
     logs = [
       ...logs,
@@ -858,7 +939,7 @@ function startPlayAgain(): void {
   clearSingletonAutoplayTimer();
   const availability = hasUntriedAlternatives(lastSuccessfulTranscript, triedAltClass);
   playAgainAvailable = availability.ok;
-  playAgainUnavailableReason = availability.ok ? null : (availability.reason ?? 'no-untried-same-bucket-alternatives');
+  playAgainUnavailableReason = availability.ok ? null : (availability.reason ?? 'no-untried-alternatives');
   playAgainLastCandidateIndex = availability.lastCandidateIndex ?? null;
   if (!availability.ok || !lastSuccessfulTranscript) {
     logs = [...logs, `[PLAYAGAIN] availability ok=false reason=${playAgainUnavailableReason}`].slice(-500);
@@ -869,39 +950,56 @@ function startPlayAgain(): void {
   const seed = lastSuccessfulTranscript?.seed ?? currentSeed;
   state = init({ ...currentProblem, rngSeed: seed });
   let divergenceIndex: number | null = null;
+  let forcedClass: string | null = null;
   let forcedCard: CardId | null = null;
+  const coverageLines: string[] = [];
+  const candidates = divergenceCandidates(lastSuccessfulTranscript, triedAltClass);
+  if (verboseLog) {
+    logs = [
+      ...logs,
+      `[PLAYAGAIN] candidates=[${candidates.map((c) => c.index).join(',')}] chosen=${candidates.length > 0 ? candidates[candidates.length - 1].index : '-'}`
+    ].slice(-500);
+  }
+  const hasTriedClassForDecision = (decisionIndex: number, classId: string): boolean => {
+    const prefix = `${lastSuccessfulTranscript.problemId}|${decisionIndex}|`;
+    const suffix = `|${classId}`;
+    for (const key of triedAltClass) {
+      if (key.startsWith(prefix) && key.endsWith(suffix)) return true;
+    }
+    return false;
+  };
   for (let i = lastSuccessfulTranscript.decisions.length - 1; i >= 0; i -= 1) {
     const rec = lastSuccessfulTranscript.decisions[i];
-    if (verboseLog) {
-      const allClasses = [rec.chosenAltClassId ?? rec.chosenClassId, ...rec.sameBucketAlternativeClassIds].filter(
-        (v, idx, arr) => v && arr.indexOf(v) === idx
-      );
-      const triedClasses = allClasses.filter((classId) =>
-        triedAltClass.has(triedAltKey(lastSuccessfulTranscript.problemId, rec.index, rec.chosenBucket, classId))
-      );
-      const remainingClasses = rec.sameBucketAlternativeClassIds.filter(
-        (classId) => !triedAltClass.has(triedAltKey(lastSuccessfulTranscript.problemId, rec.index, rec.chosenBucket, classId))
-      );
-      logs = [
-        ...logs,
+    const allClasses = [rec.chosenAltClassId ?? rec.chosenClassId, ...rec.sameBucketAlternativeClassIds].filter(
+      (v, idx, arr) => v && arr.indexOf(v) === idx
+    );
+    const triedClasses = allClasses.filter((classId) => hasTriedClassForDecision(rec.index, classId));
+    const remainingClasses = rec.sameBucketAlternativeClassIds.filter(
+      (classId) => !hasTriedClassForDecision(rec.index, classId)
+    );
+    if (verboseLog && (verboseCoverageDetail || remainingClasses.length > 0)) {
+      coverageLines.push(
         `[EQC:playagain] idx=${rec.index} tried=${triedClasses.join(',') || '-'} remaining=${remainingClasses.join(',') || '-'}`
-      ].slice(-500);
+      );
     }
     const altClass = rec.sameBucketAlternativeClassIds.find(
-      (classId) => !triedAltClass.has(triedAltKey(lastSuccessfulTranscript.problemId, rec.index, rec.chosenBucket, classId))
+      (classId) => !hasTriedClassForDecision(rec.index, classId)
     );
     if (altClass) {
       divergenceIndex = rec.index;
+      forcedClass = altClass;
       forcedCard = rec.representativeCardByClass[altClass] ?? null;
       triedAltClass.add(triedAltKey(lastSuccessfulTranscript.problemId, rec.index, rec.chosenBucket, altClass));
-      if (!forcedCard) continue;
-      logs = [...logs, `[PLAYAGAIN] divergenceIndex=${divergenceIndex} forcedCard=${forcedCard}`].slice(-500);
+      logs = [...logs, `[PLAYAGAIN] divergenceIndex=${divergenceIndex} forcedClass=${forcedClass} forcedCard=${forcedCard ?? '-'}`].slice(-500);
       break;
     }
   }
-  if (!forcedCard || divergenceIndex === null) {
+  if (verboseLog) {
+    logs = [...logs, '----- PLAY AGAIN COVERAGE -----', ...(coverageLines.length > 0 ? coverageLines : ['[EQC:playagain] none'])].slice(-500);
+  }
+  if (!forcedClass || divergenceIndex === null) {
     playAgainAvailable = false;
-    playAgainUnavailableReason = 'no-untried-same-bucket-alternatives';
+    playAgainUnavailableReason = 'no-untried-alternatives';
     playAgainLastCandidateIndex = null;
     logs = [...logs, `[PLAYAGAIN] availability ok=false reason=${playAgainUnavailableReason}`].slice(-500);
     render();
@@ -922,10 +1020,12 @@ function startPlayAgain(): void {
     },
     cursor: 0,
     divergenceIndex,
-    forcedCard
+    forcedCard,
+    forcedClassId: forcedClass
   };
   currentSeed = seed;
   runStatus = 'running';
+  runPlayCounter = 0;
   playAgainAvailable = false;
   playAgainUnavailableReason = null;
   playAgainLastCandidateIndex = null;
@@ -934,7 +1034,12 @@ function startPlayAgain(): void {
   deferredLogLines = [];
   unfreezeTrick(false);
   refreshThreatModel(currentProblemId, false);
-  logs = [...logs, '[PLAYAGAIN] replay enabled'].slice(-500);
+  logs = [
+    ...logs,
+    `===== PLAY AGAIN REPLAY ===== divergenceIdx=${divergenceIndex} forced=${forcedCard ?? '-'} forcedClass=${forcedClass}`,
+    '[PLAYAGAIN] replay enabled',
+    ''
+  ].slice(-500);
   render();
 }
 
@@ -1118,6 +1223,7 @@ function renderStatusPanel(view: State): HTMLElement {
     <div class="meta-row"><span class="k">Leader</span><span class="v turn-meta">${view.leader}</span></div>
     <div class="meta-row"><span class="k">Turn</span><span class="v turn-meta turn-emph">${view.turn}</span></div>
     <div class="meta-row"><span class="k">Seed</span><span class="v seed">${currentSeed}</span></div>
+    <div class="meta-row"><span class="k">Variations</span><span class="v turn-meta">${busyBranchingLabel[busyBranching]}</span></div>
   `;
   panel.appendChild(facts);
 
diff --git a/src/demo/playAgain.ts b/src/demo/playAgain.ts
index 1551c01..7d3b1bf 100644
--- a/src/demo/playAgain.ts
+++ b/src/demo/playAgain.ts
@@ -4,19 +4,42 @@ export function triedAltKey(problemId: string, decisionIndex: number, chosenBuck
   return `${problemId}|${decisionIndex}|${chosenBucket}|${altClassId}`;
 }
 
+function hasTriedAltClass(
+  transcript: SuccessfulTranscript,
+  triedSet: Set<string>,
+  decisionIndex: number,
+  altClassId: string
+): boolean {
+  const prefix = `${transcript.problemId}|${decisionIndex}|`;
+  const suffix = `|${altClassId}`;
+  for (const key of triedSet) {
+    if (key.startsWith(prefix) && key.endsWith(suffix)) return true;
+  }
+  return false;
+}
+
 export function hasUntriedAlternatives(
   transcript: SuccessfulTranscript | null,
   triedSet: Set<string>
 ): { ok: boolean; lastCandidateIndex?: number; reason?: string } {
-  if (!transcript || transcript.decisions.length === 0) {
-    return { ok: false, reason: 'no-untried-same-bucket-alternatives' };
-  }
-  for (let i = transcript.decisions.length - 1; i >= 0; i -= 1) {
-    const rec = transcript.decisions[i];
-    const untried = rec.sameBucketAlternativeClassIds.find(
-      (altClassId) => !triedSet.has(triedAltKey(transcript.problemId, rec.index, rec.chosenBucket, altClassId))
+  const candidates = divergenceCandidates(transcript, triedSet);
+  if (candidates.length === 0) return { ok: false, reason: 'no-untried-alternatives' };
+  return { ok: true, lastCandidateIndex: candidates[candidates.length - 1].index };
+}
+
+export type DivergenceCandidate = { index: number; remainingClasses: string[] };
+
+export function divergenceCandidates(
+  transcript: SuccessfulTranscript | null,
+  triedSet: Set<string>
+): DivergenceCandidate[] {
+  if (!transcript || transcript.decisions.length === 0) return [];
+  const out: DivergenceCandidate[] = [];
+  for (const rec of transcript.decisions) {
+    const remaining = rec.sameBucketAlternativeClassIds.filter(
+      (altClassId) => !hasTriedAltClass(transcript, triedSet, rec.index, altClassId)
     );
-    if (untried) return { ok: true, lastCandidateIndex: rec.index };
+    if (remaining.length > 0) out.push({ index: rec.index, remainingClasses: remaining });
   }
-  return { ok: false, reason: 'no-untried-same-bucket-alternatives' };
+  return out;
 }
diff --git a/test/engine.test.ts b/test/engine.test.ts
index cabe7ac..a4e4bf3 100644
--- a/test/engine.test.ts
+++ b/test/engine.test.ts
@@ -2,9 +2,10 @@ import { describe, expect, test } from 'vitest';
 import { apply, classInfoForCard, init, legalPlays, type CardId, type Problem, type SuccessfulTranscript } from '../src/core';
 import { chooseDiscard, computeDiscardTiers } from '../src/ai/defenderDiscard';
 import { computeDefenderLabels, initThreatContext, type DefenderLabels } from '../src/ai/threatModel';
-import { hasUntriedAlternatives, triedAltKey } from '../src/demo/playAgain';
+import { divergenceCandidates, hasUntriedAlternatives, triedAltKey } from '../src/demo/playAgain';
 import { p001 } from '../src/puzzles/p001';
 import { p002 } from '../src/puzzles/p002';
+import { p004 } from '../src/puzzles/p004';
 
 describe('bridge engine v0.1', () => {
   test('follow suit enforcement', () => {
@@ -415,6 +416,52 @@ describe('bridge engine v0.1', () => {
     expect(sameBucketAlternativeClassIds).toEqual([]);
   });
 
+  test('p004 first west discard has heart/diamond busy classes in sameLevel exploration', () => {
+    const start = init(p004);
+    const step = apply(start, { seat: 'S', suit: 'C', rank: 'A' });
+    const wAuto = step.events.find((e) => e.type === 'autoplay' && e.play.seat === 'W');
+    expect(wAuto && wAuto.type === 'autoplay').toBe(true);
+    if (!wAuto || wAuto.type !== 'autoplay') return;
+
+    expect(wAuto.chosenBucket).toBe('tier2a');
+    const tierBuckets = wAuto.tierBuckets ?? {};
+    expect(tierBuckets.tier2a && tierBuckets.tier2a.length > 0).toBe(true);
+    expect(tierBuckets.tier2b && tierBuckets.tier2b.length > 0).toBe(true);
+    expect((tierBuckets.tier2b ?? []).some((c) => c.startsWith('H'))).toBe(true);
+    expect((tierBuckets.tier2b ?? []).some((c) => c.startsWith('D'))).toBe(true);
+
+    const chosenCard = `${wAuto.play.suit}${wAuto.play.rank}` as CardId;
+    const altClass = (card: CardId) => wAuto.policyClassByCard?.[card] ?? classInfoForCard(start, 'W', card).classId;
+    const chooseClasses = (mode: 'strict' | 'sameLevel') => {
+      const base = wAuto.bucketCards ? [...wAuto.bucketCards] : [chosenCard];
+      let exploration = [...base];
+      if (mode === 'sameLevel') {
+        const merged: CardId[] = [];
+        for (const key of ['tier2a', 'tier2b'] as const) {
+          for (const card of tierBuckets[key] ?? []) {
+            if (!merged.includes(card)) merged.push(card);
+          }
+        }
+        if (merged.length > 0) exploration = merged;
+      }
+      const classOrder: string[] = [];
+      for (const card of exploration) {
+        const cls = altClass(card);
+        if (!classOrder.includes(cls)) classOrder.push(cls);
+      }
+      const chosenAltClassId = altClass(chosenCard);
+      const sameBucketAlternativeClassIds = classOrder.filter((id) => id !== chosenAltClassId);
+      return { classOrder, sameBucketAlternativeClassIds };
+    };
+
+    const strict = chooseClasses('strict');
+    const sameLevel = chooseClasses('sameLevel');
+    expect(strict.classOrder).toEqual(['busy:D']);
+    expect(strict.sameBucketAlternativeClassIds).toEqual([]);
+    expect(sameLevel.classOrder.sort()).toEqual(['busy:D', 'busy:H']);
+    expect(sameLevel.sameBucketAlternativeClassIds.length).toBe(1);
+  });
+
   test('coordinated busy suit feeds tier2 before solo tiers', () => {
     const position = {
       hands: {
@@ -632,7 +679,7 @@ describe('bridge engine v0.1', () => {
     };
 
     const replayed = init(p001);
-    replayed.replay = { enabled: true, transcript, cursor: 0, divergenceIndex: null, forcedCard: null };
+    replayed.replay = { enabled: true, transcript, cursor: 0, divergenceIndex: null, forcedCard: null, forcedClassId: null };
     const replayStep = apply(replayed, { seat: 'S', suit: 'C', rank: 'A' });
     const replayAuto = replayStep.events.find((e) => e.type === 'autoplay' && (e.play.seat === 'E' || e.play.seat === 'W'));
     expect(replayAuto && replayAuto.type === 'autoplay' ? replayAuto.replay?.action : null).toBe('forced');
@@ -740,6 +787,7 @@ describe('bridge engine v0.1', () => {
           chosenCard: 'DA',
           chosenClassId: 'E:D:A-A',
           chosenAltClassId: 'busy:D',
+          chosenBucket: 'tier2b',
           sameBucketAlternativeClassIds: ['busy:S'],
           representativeCardByClass: { 'busy:S': 'ST', 'busy:D': 'DA' }
         }
@@ -751,4 +799,94 @@ describe('bridge engine v0.1', () => {
 
     expect(hasUntriedAlternatives(forcedRun, tried).ok).toBe(false);
   });
+
+  test('play-again DFS backtracks from deeper exhausted index to earlier remaining index', () => {
+    const transcript: SuccessfulTranscript = {
+      problemId: 'p004',
+      seed: 101,
+      decisions: [
+        {
+          index: 0,
+          seat: 'W',
+          sig: 'sig-0',
+          chosenCard: 'D7',
+          chosenClassId: 'W:D:7-7',
+          chosenAltClassId: 'busy:D',
+          chosenBucket: 'tier2a',
+          bucketCards: ['D7'],
+          sameBucketAlternativeClassIds: ['busy:H'],
+          representativeCardByClass: { 'busy:D': 'D7', 'busy:H': 'HK' }
+        },
+        {
+          index: 6,
+          seat: 'E',
+          sig: 'sig-6',
+          chosenCard: 'C4',
+          chosenClassId: 'E:C:4-4',
+          chosenAltClassId: 'raw:C4',
+          chosenBucket: 'follow:baseline',
+          bucketCards: ['C4'],
+          sameBucketAlternativeClassIds: ['raw:DQ'],
+          representativeCardByClass: { 'raw:C4': 'C4', 'raw:DQ': 'DQ' }
+        }
+      ],
+      userPlays: []
+    };
+    const tried = new Set<string>([
+      triedAltKey('p004', 0, 'tier2a', 'busy:D'),
+      triedAltKey('p004', 6, 'follow:baseline', 'raw:C4')
+    ]);
+
+    let candidates = divergenceCandidates(transcript, tried);
+    expect(candidates.map((c) => c.index)).toEqual([0, 6]);
+
+    tried.add(triedAltKey('p004', 6, 'follow:baseline', 'raw:DQ'));
+    candidates = divergenceCandidates(transcript, tried);
+    expect(candidates.map((c) => c.index)).toEqual([0]);
+  });
+
+  test('p004 replay forcing busy:H at idx0 yields CA-heart branch', () => {
+    const initial = init(p004);
+    const baselineStep = apply(initial, { seat: 'S', suit: 'C', rank: 'A' });
+    const firstAuto = baselineStep.events.find((e) => e.type === 'autoplay' && e.play.seat === 'W');
+    expect(firstAuto && firstAuto.type === 'autoplay').toBe(true);
+    if (!firstAuto || firstAuto.type !== 'autoplay') return;
+
+    const chosenCard = `${firstAuto.play.suit}${firstAuto.play.rank}` as CardId;
+    const chosenClassId = classInfoForCard(initial, 'W', chosenCard).classId;
+    const transcript: SuccessfulTranscript = {
+      problemId: p004.id,
+      seed: p004.rngSeed,
+      decisions: [
+        {
+          index: 0,
+          seat: 'W',
+          sig: firstAuto.decisionSig ?? '',
+          chosenCard,
+          chosenClassId,
+          chosenAltClassId: firstAuto.policyClassByCard?.[chosenCard] ?? `busy:${chosenCard[0]}`,
+          chosenBucket: firstAuto.chosenBucket ?? 'tier2a',
+          bucketCards: firstAuto.bucketCards ? [...firstAuto.bucketCards] : [chosenCard],
+          sameBucketAlternativeClassIds: ['busy:H'],
+          representativeCardByClass: { 'busy:D': chosenCard, 'busy:H': 'HK' }
+        }
+      ],
+      userPlays: []
+    };
+
+    const replayed = init(p004);
+    replayed.replay = {
+      enabled: true,
+      transcript,
+      cursor: 0,
+      divergenceIndex: 0,
+      forcedCard: null,
+      forcedClassId: 'busy:H'
+    };
+    const replayStep = apply(replayed, { seat: 'S', suit: 'C', rank: 'A' });
+    const replayAuto = replayStep.events.find((e) => e.type === 'autoplay' && e.play.seat === 'W');
+    expect(replayAuto && replayAuto.type === 'autoplay').toBe(true);
+    if (!replayAuto || replayAuto.type !== 'autoplay') return;
+    expect(replayAuto.play.suit).toBe('H');
+  });
 });
```
