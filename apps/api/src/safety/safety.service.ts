import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';

export type SafetySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface SafetySignal {
  severity: SafetySeverity;
  signal: string;
}

export interface SafetyCheckResult {
  hasCrisis: boolean;
  severity: SafetySeverity | null;
  resourcesRequired: boolean;
  supportMessage: string | null;
}

// ---------------------------------------------------------------------------
// Padrões de linguagem que sinalizam crise (BR-10)
// Detecção conservadora: prefere false-positives a false-negatives.
// ---------------------------------------------------------------------------

const CRISIS_PATTERNS: Array<{ pattern: RegExp; severity: SafetySeverity }> = [
  {
    pattern: /\b(suicíd|suicid|me matar|quero morrer|não quero mais viver|tirar minha vida)\b/i,
    severity: 'critical',
  },
  {
    pattern: /\b(me machucar|me ferir|autolesão|auto-lesão|cortar)\b/i,
    severity: 'high',
  },
  {
    pattern: /\b(não aguento mais|sem esperança|não tem saída|desespero|desesperado)\b/i,
    severity: 'high',
  },
  {
    pattern: /\b(crise|colapso|breakdown|desmoronar)\b/i,
    severity: 'medium',
  },
  {
    pattern: /\b(muito sofrimento|sofrendo muito|angústia intensa|dor muito grande)\b/i,
    severity: 'medium',
  },
];

const SEVERITY_ORDER: SafetySeverity[] = ['low', 'medium', 'high', 'critical'];

function maxSeverity(a: SafetySeverity, b: SafetySeverity): SafetySeverity {
  return SEVERITY_ORDER.indexOf(a) >= SEVERITY_ORDER.indexOf(b) ? a : b;
}

export function detectCrisisSignals(transcript: string): SafetySignal[] {
  const signals: SafetySignal[] = [];
  for (const { pattern, severity } of CRISIS_PATTERNS) {
    const match = transcript.match(pattern);
    if (match) {
      signals.push({ severity, signal: match[0] });
    }
  }
  return signals;
}

const SUPPORT_MESSAGE =
  'Percebo que você está passando por um momento muito difícil. ' +
  'Quero que saiba que há apoio disponível agora. ' +
  'O CVV (Centro de Valorização da Vida) atende 24 horas pelo telefone 188 ' +
  'ou pelo chat em cvv.org.br. Você não precisa enfrentar isso sozinho.';

export class SafetyService {
  constructor(private db: Kysely<Database>) {}

  async checkAndRecord(
    assessmentId: string,
    transcript: string,
    externalSignals: SafetySignal[] = [],
  ): Promise<SafetyCheckResult> {
    const detected = detectCrisisSignals(transcript);
    const allSignals = [...detected, ...externalSignals];

    if (allSignals.length === 0) {
      return { hasCrisis: false, severity: null, resourcesRequired: false, supportMessage: null };
    }

    // Severidade máxima dos sinais detectados
    const topSeverity = allSignals.reduce<SafetySeverity>(
      (acc, s) => maxSeverity(acc, s.severity),
      'low',
    );

    const shouldFlag = SEVERITY_ORDER.indexOf(topSeverity) >= SEVERITY_ORDER.indexOf('high');

    // Persiste safety_events — independentemente de completude (BR-10)
    await this.db.transaction().execute(async (trx) => {
      for (const s of allSignals) {
        await trx
          .insertInto('assessment.safety_events')
          .values({
            assessment_id: assessmentId,
            severity: s.severity,
            signal: s.signal,
            flagged_assessment: shouldFlag,
          })
          .execute();
      }

      if (shouldFlag) {
        await trx
          .updateTable('assessment.assessments')
          .set({ status: 'flagged' })
          .where('id', '=', assessmentId)
          .execute();
      }
    });

    return {
      hasCrisis: true,
      severity: topSeverity,
      resourcesRequired: true,
      supportMessage: SUPPORT_MESSAGE,
    };
  }
}
