import type { Kysely } from 'kysely';
import type { InstrumentConfig } from '../shared.js';
import type { Database, Norm } from '../db/types.js';

// ---------------------------------------------------------------------------
// Tipos do motor de pontuação
// ---------------------------------------------------------------------------

export interface ItemScoreInput {
  itemId: string;
  itemNumber: number;
  subscaleId: string;
  isPrimarySubscale: boolean;
  score: number | null; // null = não coberto (BR-2)
}

export interface SubscaleScoreResult {
  subscaleId: string;
  score: number | null;
  itemCount: number;
  coveredCount: number;
  band: 'green' | 'orange' | 'red' | null;
  normIsPlaceholder: boolean;
}

export interface ScoringResult {
  subscaleScores: SubscaleScoreResult[];
  total: number | null;
  completeness: number; // 0-100
  band: 'green' | 'orange' | 'red' | null;
  normIsPlaceholder: boolean;
  isInconclusive: boolean;
}

// ---------------------------------------------------------------------------
// Motor puro (sem efeitos colaterais — testável unitariamente)
// ---------------------------------------------------------------------------

export function computeScore(
  items: ItemScoreInput[],
  config: InstrumentConfig,
  norms: Norm[],
): ScoringResult {
  // Agrupa itens por subescala
  const bySubscale = new Map<string, ItemScoreInput[]>();
  for (const item of items) {
    const bucket = bySubscale.get(item.subscaleId) ?? [];
    bucket.push(item);
    bySubscale.set(item.subscaleId, bucket);
  }

  const subscaleScores: SubscaleScoreResult[] = [];

  for (const [subscaleId, subscaleItems] of bySubscale) {
    const covered = subscaleItems.filter((i) => i.score !== null);
    const rawScore = aggregate(
      covered.map((i) => i.score as number),
      config.scoringMethod,
    );

    const norm = norms.find((n) => n.instrument_id === config.instrumentId);

    const band = rawScore !== null && norm ? bandFromNorm(rawScore, norms, config.instrumentId) : null;
    const normIsPlaceholder = !norm;

    subscaleScores.push({
      subscaleId,
      score: rawScore,
      itemCount: subscaleItems.length,
      coveredCount: covered.length,
      band: normIsPlaceholder ? null : band,
      normIsPlaceholder,
    });
  }

  // Score total (BR-4)
  const eligibleItems =
    config.totalIncludes === 'primary'
      ? items.filter((i) => i.isPrimarySubscale)
      : items;

  const eligibleCovered = eligibleItems.filter((i) => i.score !== null);
  const total = aggregate(
    eligibleCovered.map((i) => i.score as number),
    config.scoringMethod,
  );

  // Completude (BR-5): % sobre o escopo elegível para o total
  const completeness =
    eligibleItems.length === 0
      ? 0
      : (eligibleCovered.length / eligibleItems.length) * 100;

  const isInconclusive = completeness < config.completenessFloor;

  // Banding total
  const totalNorm = norms.find((n) => n.instrument_id === config.instrumentId);
  const totalNormIsPlaceholder = !totalNorm;

  let totalBand: 'green' | 'orange' | 'red' | null = null;
  if (total !== null && !isInconclusive && !totalNormIsPlaceholder) {
    totalBand = bandFromNorm(total, norms, config.instrumentId);
  }

  return {
    subscaleScores,
    total,
    completeness,
    band: totalBand,
    normIsPlaceholder: totalNormIsPlaceholder,
    isInconclusive,
  };
}

function aggregate(scores: number[], method: 'mean' | 'sum'): number | null {
  if (scores.length === 0) return null;
  const sum = scores.reduce((a, b) => a + b, 0);
  return method === 'mean' ? sum / scores.length : sum;
}

function bandFromNorm(
  score: number,
  norms: Norm[],
  instrumentId: string,
): 'green' | 'orange' | 'red' | null {
  const match = norms.find(
    (n) =>
      n.instrument_id === instrumentId &&
      score >= n.min_score &&
      score <= n.max_score,
  );
  return match?.band ?? null;
}

// ---------------------------------------------------------------------------
// Serviço com persistência
// ---------------------------------------------------------------------------

export class ScoringService {
  constructor(private db: Kysely<Database>) {}

  async scoreAndPersist(
    assessmentId: string,
    config: InstrumentConfig,
  ): Promise<ScoringResult> {
    // Busca respostas do assessment
    const responses = await this.db
      .selectFrom('assessment.item_responses as ir')
      .innerJoin('instrument.items as i', 'i.id', 'ir.item_id')
      .innerJoin('instrument.subscales as s', 's.id', 'i.subscale_id')
      .select([
        'ir.item_id',
        'i.item_number',
        'i.subscale_id',
        's.type as subscale_type',
        'ir.score',
      ])
      .where('ir.assessment_id', '=', assessmentId)
      .execute();

    const itemInputs: ItemScoreInput[] = responses.map((r) => ({
      itemId: r.item_id,
      itemNumber: r.item_number,
      subscaleId: r.subscale_id,
      isPrimarySubscale: r.subscale_type === 'primary',
      score: r.score,
    }));

    // Busca normas do instrumento
    const norms = await this.db
      .selectFrom('instrument.norms')
      .selectAll()
      .where('instrument_id', '=', config.instrumentId)
      .execute();

    const result = computeScore(itemInputs, config, norms);

    // Persiste scores (total + por subescala)
    await this.db.transaction().execute(async (trx) => {
      // Remove scores anteriores (re-score idempotente)
      await trx
        .deleteFrom('assessment.assessment_scores')
        .where('assessment_id', '=', assessmentId)
        .execute();

      // Score total
      await trx
        .insertInto('assessment.assessment_scores')
        .values({
          assessment_id: assessmentId,
          subscale_id: null,
          mean_score: result.total,
          completeness: result.completeness,
          band: result.band,
        })
        .execute();

      // Scores por subescala
      for (const ss of result.subscaleScores) {
        await trx
          .insertInto('assessment.assessment_scores')
          .values({
            assessment_id: assessmentId,
            subscale_id: ss.subscaleId,
            mean_score: ss.score,
            completeness: (ss.coveredCount / ss.itemCount) * 100,
            band: ss.band,
          })
          .execute();
      }
    });

    return result;
  }
}
