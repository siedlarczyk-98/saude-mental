import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { InstrumentConfig } from '@saude-mental/shared';
import type { Database } from '../db/types.js';
import { ScoringService } from '../scoring/scoring.service.js';
import { SafetyService } from '../safety/safety.service.js';
import { AssessmentService } from '../assessment/assessment.service.js';
import { ExtractionService } from './extraction.service.js';
import { classifyCrisisSignals } from '../safety/safety.llm.js';

// ---------------------------------------------------------------------------
// Schema do payload pós-call do ElevenLabs
// ---------------------------------------------------------------------------

export const ElevenLabsWebhookSchema = z.object({
  type: z.literal('post_call_transcription'),
  conversation_id: z.string(),
  agent_id: z.string(),
  status: z.string(),
  transcript: z.string().optional(),
  metadata: z
    .object({
      assessment_id: z.string().optional(),
    })
    .optional(),
});

export type ElevenLabsWebhookPayload = z.infer<typeof ElevenLabsWebhookSchema>;

export interface WebhookProcessResult {
  assessmentId: string;
  itemsRecorded: number;
  hasSafetyEvent: boolean;
  supportMessage: string | null;
}

export class WebhookService {
  private scoring: ScoringService;
  private safety: SafetyService;
  private assessments: AssessmentService;
  private extraction: ExtractionService;

  constructor(private db: Kysely<Database>) {
    this.scoring = new ScoringService(db);
    this.safety = new SafetyService(db);
    this.assessments = new AssessmentService(db);
    this.extraction = new ExtractionService(db);
  }

  async process(
    payload: ElevenLabsWebhookPayload,
    config: InstrumentConfig,
  ): Promise<WebhookProcessResult> {
    const assessment = await this.db
      .selectFrom('assessment.assessments')
      .selectAll()
      .where('elevenlabs_conversation_id', '=', payload.conversation_id)
      .executeTakeFirstOrThrow();

    const assessmentId = assessment.id;
    const transcript = payload.transcript ?? '';

    // Remove respostas anteriores (idempotência — webhook pode chegar mais de uma vez)
    await this.db
      .deleteFrom('assessment.item_responses')
      .where('assessment_id', '=', assessmentId)
      .execute();

    // LLM-3 (segurança) e LLM-2 (extração) correm em paralelo.
    // LLM-3 NÃO pode ser bloqueado pela falha do LLM-2 (BR-10).
    const [safetySignalsResult, extractionResult] = await Promise.allSettled([
      classifyCrisisSignals(transcript),
      this.extraction.extractAndPersist(assessmentId, transcript, config),
    ]);

    // Persiste sinais de crise independentemente do resultado da extração
    const llmSignals = safetySignalsResult.status === 'fulfilled' ? safetySignalsResult.value : [];
    const mappedSignals = llmSignals.map((s) => ({ severity: s.severity, signal: s.type }));
    const safetyCheckResult = await this.safety.checkAndRecord(assessmentId, transcript, mappedSignals);

    let itemsRecorded = 0;
    if (extractionResult.status === 'fulfilled') {
      itemsRecorded = extractionResult.value.itemsRecorded;
    } else {
      console.error('LLM-2 extraction failed:', extractionResult.reason);
    }

    // Pontua e persiste (se extração falhou, scoring usará o que houver)
    await this.scoring.scoreAndPersist(assessmentId, config);

    // Completa o assessment (ou mantém como flagged se safety o marcou)
    const refreshed = await this.db
      .selectFrom('assessment.assessments')
      .select('status')
      .where('id', '=', assessmentId)
      .executeTakeFirstOrThrow();

    if (refreshed.status !== 'flagged') {
      await this.assessments.complete(assessmentId);
    }

    return {
      assessmentId,
      itemsRecorded,
      hasSafetyEvent: safetyCheckResult.hasCrisis,
      supportMessage: safetyCheckResult.supportMessage,
    };
  }
}
