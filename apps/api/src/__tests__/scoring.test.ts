import { computeScore } from '../scoring/scoring.service.js';
import type { ItemScoreInput } from '../scoring/scoring.service.js';
import type { InstrumentConfig } from '../shared.js';
import type { Norm } from '../db/types.js';

const INSTRUMENT_ID = 'test-instrument-id';

const batConfig: Pick<
  InstrumentConfig,
  'instrumentId' | 'scoringMethod' | 'responseScale' | 'completenessFloor' | 'totalIncludes'
> = {
  instrumentId: INSTRUMENT_ID,
  scoringMethod: 'mean',
  responseScale: { min: 1, max: 5 },
  completenessFloor: 80,
  totalIncludes: 'primary',
};

const gad7Config: Pick<
  InstrumentConfig,
  'instrumentId' | 'scoringMethod' | 'responseScale' | 'completenessFloor' | 'totalIncludes'
> = {
  instrumentId: 'gad7-id',
  scoringMethod: 'sum',
  responseScale: { min: 0, max: 3 },
  completenessFloor: 80,
  totalIncludes: 'all',
};

const noNorms: Norm[] = [];

const norms: Norm[] = [
  {
    id: 'n1',
    instrument_id: INSTRUMENT_ID,
    subscale_id: null,
    band: 'green',
    score_min: 1,
    score_max: 2.4,
    is_placeholder: false,
    created_at: new Date(),
  },
  {
    id: 'n2',
    instrument_id: INSTRUMENT_ID,
    subscale_id: null,
    band: 'orange',
    score_min: 2.5,
    score_max: 3.4,
    is_placeholder: false,
    created_at: new Date(),
  },
  {
    id: 'n3',
    instrument_id: INSTRUMENT_ID,
    subscale_id: null,
    band: 'red',
    score_min: 3.5,
    score_max: 5,
    is_placeholder: false,
    created_at: new Date(),
  },
];

function makeItem(
  overrides: Partial<ItemScoreInput> & { score: number | null },
  isPrimary = true,
): ItemScoreInput {
  return {
    itemId: `item-${Math.random()}`,
    itemNumber: 1,
    subscaleId: 'sub-primary',
    isPrimarySubscale: isPrimary,
    ...overrides,
  };
}

describe('computeScore — BAT (mean, primary only)', () => {
  test('calcula média corretamente sobre itens cobertos', () => {
    const items = [
      makeItem({ score: 2 }),
      makeItem({ score: 4 }),
      makeItem({ score: 3 }),
    ];
    const result = computeScore(items as ItemScoreInput[], batConfig as InstrumentConfig, noNorms);
    expect(result.total).toBeCloseTo(3);
    expect(result.completeness).toBe(100);
    expect(result.isInconclusive).toBe(false);
  });

  test('item null não é tratado como zero — exclui da média (BR-2)', () => {
    const items = [
      makeItem({ score: 4 }),
      makeItem({ score: null }), // não coberto
    ];
    const result = computeScore(items as ItemScoreInput[], batConfig as InstrumentConfig, noNorms);
    // média só do item coberto = 4
    expect(result.total).toBeCloseTo(4);
    // completude = 1/2 = 50% → abaixo do piso (80) → inconclusivo
    expect(result.isInconclusive).toBe(true);
    expect(result.band).toBeNull();
  });

  test('completude abaixo do piso → band nula e inconclusivo (BR-5)', () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      makeItem({ score: i < 7 ? 3 : null, itemNumber: i + 1 }),
    );
    // 7/10 = 70% < 80%
    const result = computeScore(items as ItemScoreInput[], batConfig as InstrumentConfig, noNorms);
    expect(result.isInconclusive).toBe(true);
    expect(result.band).toBeNull();
  });

  test('total do BAT ignora subescalas secundárias (BR-4)', () => {
    const primaryItems = [makeItem({ score: 5, subscaleId: 'primary' }, true)];
    const secondaryItems = [makeItem({ score: 1, subscaleId: 'secondary' }, false)];
    const all = [...primaryItems, ...secondaryItems];
    const result = computeScore(all as ItemScoreInput[], batConfig as InstrumentConfig, noNorms);
    // total = média só dos primários = 5
    expect(result.total).toBeCloseTo(5);
  });

  test('banding correto quando normas não são placeholder (BR-6)', () => {
    const items = Array.from({ length: 10 }, () => makeItem({ score: 2 }));
    const result = computeScore(items as ItemScoreInput[], batConfig as InstrumentConfig, norms);
    expect(result.band).toBe('green');
    expect(result.normIsPlaceholder).toBe(false);
  });

  test('banding null quando normas são placeholder (BR-6 guarda)', () => {
    const placeholderNorms: Norm[] = [{ ...norms[0]!, is_placeholder: true }];
    const items = Array.from({ length: 10 }, () => makeItem({ score: 2 }));
    const result = computeScore(items as ItemScoreInput[], batConfig as InstrumentConfig, placeholderNorms);
    expect(result.band).toBeNull();
    expect(result.normIsPlaceholder).toBe(true);
  });
});

describe('computeScore — GAD-7 simulado (sum, all subscales)', () => {
  test('calcula soma corretamente', () => {
    const items = [
      makeItem({ score: 1, subscaleId: 'gad7', isPrimarySubscale: true }),
      makeItem({ score: 2, subscaleId: 'gad7', isPrimarySubscale: true }),
      makeItem({ score: 3, subscaleId: 'gad7', isPrimarySubscale: true }),
    ];
    const result = computeScore(items as ItemScoreInput[], gad7Config as InstrumentConfig, noNorms);
    expect(result.total).toBe(6);
  });
});
