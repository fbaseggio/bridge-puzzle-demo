import { parseEncapsulation } from './parser';

const ABSORBED_IDLE_SYMBOLS: Record<string, string> = { a: 'io', b: 'iu', c: 'iou' };

// Compare card structure only. Lead, goal offset, and suit-level no-idle
// markers are separate metadata; A'/B'/A*/B*/g'/G' remain structural tokens.
export function authoredStructureDifferences(
  input: string,
  inverse: string,
  allowAdditionalThreats = false
): string[] {
  const original = parseEncapsulation(/[><=]/.test(input) ? input : `${input} =`);
  const recovered = parseEncapsulation(inverse);
  const differences: string[] = [];
  for (const suit of ['S', 'H', 'D', 'C'] as const) {
    const before = original.suits.find((slot) => slot.suit === suit);
    const after = recovered.suits.find((slot) => slot.suit === suit);
    const originalPattern = before?.pattern ?? '';
    const inversePattern = after?.pattern ?? '';
    const originalStructure = originalPattern.replace(/[ouim]/g, '');
    const inverseStructure = inversePattern.replace(/[ouim]/g, '');
    // Preserve the authored sequence; only unmatched lowercase a/b/c may
    // be skipped, and only for a case with explicit permission.
    let matched = 0;
    let unexpected = false;
    let absorbedIdle = '';
    for (const token of inverseStructure) {
      if (token === originalStructure[matched]) matched += 1;
      else if (allowAdditionalThreats && /[abc]/.test(token)) absorbedIdle += ABSORBED_IDLE_SYMBOLS[token];
      else unexpected = true;
    }
    if (unexpected || matched !== originalStructure.length) {
      differences.push(`${suit}: structure ${originalStructure || '(empty)'} -> ${inverseStructure || '(empty)'}`);
    }
    // Empty/omitted original suits have no authored primary-hand assignment
    // to preserve. Unpermitted new structure still fails the check above.
    if (originalPattern && before?.primary !== after?.primary) {
      differences.push(`${suit}: primary ${before?.primary} -> ${after?.primary ?? '(missing)'}`);
    }
    for (const idle of ['o', 'u', 'i', 'm']) {
      const required = [...originalPattern].filter((token) => token === idle).length;
      const found = [...inversePattern].filter((token) => token === idle).length;
      // Only added threats may absorb authored idle symbols. Count per suit,
      // independently of symbol order; never spend an original threat twice.
      const absorbed = [...absorbedIdle].filter((token) => token === idle).length;
      if (found + absorbed < required) {
        differences.push(`${suit}: authored ${idle} count ${required} -> ${found} (+${absorbed} absorbed)`);
      }
    }
  }
  return differences;
}
