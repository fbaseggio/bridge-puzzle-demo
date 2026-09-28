import { demoProblems, resolveDemoProblem } from '../src/demo/problems';
import { buildPracticeQueue } from '../src/demo/practiceSets';
import { listEncapsulationWorkbenchEntries } from '../src/encapsulation/workbenchProblems';
import { deriveInverseThreatCards, explainPositionInverse } from '../src/encapsulation';
import { allThreats, initClassification, stoppingDefenders } from '../src/ai/threatModel';
import type { CardId, Problem } from '../src/core';
import { newspaperDiagram } from './onboarding';

const glyphs = { S: '♠', H: '♥', D: '♦', C: '♣' };
const seatNames = { N: 'North', E: 'East', S: 'South', W: 'West' };
const display = (card: string) => `${glyphs[card[0] as keyof typeof glyphs]}${card.slice(1)}`;
const entries = listEncapsulationWorkbenchEntries();
const clash = buildPracticeQueue('set5');
const clashIds = new Set(clash.map((entry) => entry.id.replace(/__standard$/, '')));
const legacy = demoProblems.filter((entry) => !clashIds.has(entry.id)
  && entries.some((authored) => authored.id === entry.id && /[ABC]/.test(authored.encapsulation))).flatMap((entry) =>
  (entry.variants?.length ? entry.variants : [undefined]).map((variant) => ({
    label: `${entry.label}${variant ? ` — ${variant.label}` : ''}`,
    problem: resolveDemoProblem(entry, variant?.id),
    draft: entry.puzzleModeId === 'draft'
  }))
);
// Keep the review focused on the authored capital-companion cases under discussion.
legacy.sort((a, b) => Number(!entries.some((entry) => entry.id === a.problem.id)) - Number(!entries.some((entry) => entry.id === b.problem.id)));

function review(problem: Problem, label: string, draft = false): string {
  const authored = entries.find((entry) => entry.id === problem.id.replace(/__standard$/, ''));
  let inferred: ReturnType<typeof explainPositionInverse> | undefined;
  let inversionError = '';
  try { inferred = explainPositionInverse({ hands: problem.hands, turn: problem.leader, threatCardIds: problem.threatCardIds }); }
  catch (error) { inversionError = String(error); }
  const output = [`### ${label}`, '', `ID: \`${problem.id}\`.${problem.source?.title ? ` Source: ${problem.source.title}.` : ''}`, '',
    ...(authored && problem.goal.n < Object.values(problem.hands.N).flat().length && authored.includeCompanionThreats === false
      ? ['Companion decision: **omit**, explicitly approved for this secondary squeeze.'] : []),
    authored ? `Authored encapsulation: \`${authored.encapsulation}\`.` : `Derived encapsulation: \`${inferred?.shortText ?? inversionError}\`.`,
    ...(authored && inferred ? [`Full inversion: \`${inferred.shortText}\`.`] : []),
    `Leader: ${seatNames[problem.leader]}. Strain: ${problem.contract.strain}. Goal: ${problem.goal.n} ${problem.goal.side} tricks.`,
    ...(draft ? ['Draft puzzle: its inversion may be incomplete.'] : []), '',
    '```text', newspaperDiagram(problem.hands), '```', '',
    `Declared threats: ${(problem.threatCardIds ?? []).map(display).join(', ') || 'none'}.`,
    `Declared resources: ${(problem.resourceCardIds ?? []).map(display).join(', ') || 'none'}.`, ''
  ];
  try {
    // Inspect the original diagram, before autoplay, without marking entry-dependent strandedness.
    const c = initClassification({ hands: problem.hands }, problem.threatCardIds ?? [], problem.resourceCardIds ?? [], undefined, problem.threatSymbolByCardId);
    output.push('| Current threat | Holder | Stored symbol | Initial stopping defenders | Role |', '| --- | --- | --- | --- | --- |');
    for (const t of allThreats(c.threat)) {
      output.push(`| ${display(t.threatCardId)} | ${seatNames[t.establishedOwner]} | ${t.symbol ? `\`${t.symbol}\`` : 'unspecified'} | ${stoppingDefenders(t, { hands: problem.hands }).map((seat) => seatNames[seat]).join(', ') || 'none'} | ${c.perCardRole[t.threatCardId]} |`);
    }
  } catch (error) { output.push(`Classification error: ${String(error)}`); }
  if (inferred) {
    const suggested = deriveInverseThreatCards(inferred).filter((card) => card.symbol.toLowerCase() !== 'f');
    const missing = suggested.filter((card) => !problem.threatCardIds?.includes(card.cardId as CardId));
    const extra = (problem.threatCardIds ?? []).filter((card) => !suggested.some((item) => item.cardId === card));
    output.push('', `Inversion-suggested threats, including capital companions: ${suggested.map((card) => `${seatNames[card.seat]} ${display(card.cardId)} (\`${card.symbol}\`)`).join('; ') || 'none recovered'}.`);
    output.push(`Suggested but not declared: ${missing.map((card) => `${seatNames[card.seat]} ${display(card.cardId)} (\`${card.symbol}\`)`).join('; ') || 'none'}.`);
    if (extra.length) output.push(`Declared but not recovered by this inversion: ${extra.map(display).join(', ')}. These remain declared pending review.`);
    const noFit = inferred.suits.filter((suit) => typeof suit.raw !== 'string' && suit.raw.type === 'no-fit').map((suit) => glyphs[suit.suit]);
    if (noFit.length) output.push(`No-fit suits: ${noFit.join(', ')}. Their suggested threat lists are incomplete.`);
  }
  return output.join('\n') + '\n';
}

console.log([
  '# Capital-companion threat review', '',
  'All five Clash puzzles and the all-tricks legacy case Wwa, WC > Wc, Ww include the implied companion. The two secondary legacy cases explicitly omit it by owner decision.', '',
  `Coverage: ${clash.length} revised Clash puzzles and ${legacy.length} relevant encapsulation-authored legacy cases.`, '',
  'Diagrams show original hands before any scripted opening or autoplay. “Initial stopping defenders” uses the current threat model on that diagram; it is not a double-dummy result. Entry-dependent strandedness is not applied in this static comparison. Symbols are relative to the threat owner. An unspecified stored symbol means the runtime infers guards from ranks and lengths.', '',
  'Inversion suggestions are review candidates, not automatic corrections. Full deals and draft diagrams may contain no-fit suits. Full inversions omit a goal offset; the authored encapsulation and explicit goal remain authoritative.', '',
  '## Revised Clash Squeezes', '',
  ...clash.map((entry, index) => review(entry.problem, `${index + 1}. ${entry.label}`)), '',
  '## Reviewed legacy capital-companion cases', '',
  ...legacy.map((entry, index) => review(entry.problem, `${index + 1}. ${entry.label}`, entry.draft)), ''
].join('\n').trimEnd());
