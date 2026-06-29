import crypto from 'node:crypto';
import type { Kysely } from 'kysely';
import type { Database, Assessment, NewAssessment } from '../db/types.js';
import { ConsentService } from '../consent/consent.service.js';

const TOKEN_TTL_HOURS = 72;

export class AssessmentService {
  private consentService: ConsentService;

  constructor(private db: Kysely<Database>) {
    this.consentService = new ConsentService(db);
  }

  // Cria participante (se necessário) + consentimento + assessment.
  // Retorna o token de magic-link para envio ao participante.
  async invite(opts: {
    companyId: string;
    departmentId?: string;
    instrumentId: string;
    pseudonym: string;
  }): Promise<{ assessmentId: string; magicLinkToken: string }> {
    return this.db.transaction().execute(async (trx) => {
      // Participante
      const participant = await trx
        .insertInto('core.participants')
        .values({
          company_id: opts.companyId,
          department_id: opts.departmentId ?? null,
          pseudonym: opts.pseudonym,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Consentimento (pré-grant — o participante confirma na UI)
      // O assessment só muda para 'consented' após o participante aceitar na web.
      const consent = await trx
        .insertInto('assessment.consents')
        .values({
          participant_id: participant.id,
          instrument_id: opts.instrumentId,
          scopes: JSON.stringify({ screening: true, share_aggregate: false }),
          granted_at: new Date().toISOString(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + TOKEN_TTL_HOURS);

      const assessment = await trx
        .insertInto('assessment.assessments')
        .values({
          participant_id: participant.id,
          instrument_id: opts.instrumentId,
          consent_id: consent.id,
          status: 'invited',
          magic_link_token: token,
          magic_link_expires_at: expiresAt,
        } satisfies NewAssessment)
        .returningAll()
        .executeTakeFirstOrThrow();

      return { assessmentId: assessment.id, magicLinkToken: token };
    });
  }

  async findByToken(token: string): Promise<Assessment | null> {
    const row = await this.db
      .selectFrom('assessment.assessments')
      .selectAll()
      .where('magic_link_token', '=', token)
      .executeTakeFirst();

    return row ?? null;
  }

  async assertValidToken(token: string): Promise<Assessment> {
    const assessment = await this.findByToken(token);
    if (!assessment) throw new AssessmentNotFoundError(token);
    if (new Date() > assessment.magic_link_expires_at) {
      throw new AssessmentExpiredError(token);
    }
    return assessment;
  }

  // Participante confirmou consentimento na UI — avança o status.
  async recordConsent(
    assessmentId: string,
    shareAggregate: boolean,
  ): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      const assessment = await trx
        .selectFrom('assessment.assessments')
        .selectAll()
        .where('id', '=', assessmentId)
        .executeTakeFirstOrThrow();

      // Atualiza scopes do consentimento conforme escolha do participante
      await trx
        .updateTable('assessment.consents')
        .set({
          scopes: JSON.stringify({ screening: true, share_aggregate: shareAggregate }),
        })
        .where('id', '=', assessment.consent_id)
        .execute();

      await trx
        .updateTable('assessment.assessments')
        .set({ status: 'consented' })
        .where('id', '=', assessmentId)
        .where('status', '=', 'invited')
        .execute();
    });
  }

  async startCall(assessmentId: string, conversationId: string): Promise<void> {
    await this.db
      .updateTable('assessment.assessments')
      .set({ status: 'in_progress', elevenlabs_conversation_id: conversationId })
      .where('id', '=', assessmentId)
      .where('status', 'in', ['consented', 'in_progress'])
      .execute();
  }

  async complete(assessmentId: string): Promise<void> {
    await this.db
      .updateTable('assessment.assessments')
      .set({ status: 'completed', completed_at: new Date() })
      .where('id', '=', assessmentId)
      .execute();
  }

  async flag(assessmentId: string): Promise<void> {
    await this.db
      .updateTable('assessment.assessments')
      .set({ status: 'flagged' })
      .where('id', '=', assessmentId)
      .execute();
  }
}

export class AssessmentNotFoundError extends Error {
  constructor(token: string) {
    super(`Assessment not found for token: ${token}`);
    this.name = 'AssessmentNotFoundError';
  }
}

export class AssessmentExpiredError extends Error {
  constructor(token: string) {
    super(`Magic link expired for token: ${token}`);
    this.name = 'AssessmentExpiredError';
  }
}
