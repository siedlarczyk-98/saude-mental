import type { Kysely } from 'kysely';
import type { Database, Assessment } from '../db/types.js';

export class AssessmentService {
  constructor(private db: Kysely<Database>) {}

  async invite(opts: {
    companyId: string;
    departmentId?: string;
    instrumentId: string;
  }): Promise<{ assessmentId: string }> {
    return this.db.transaction().execute(async (trx) => {
      const participant = await trx
        .insertInto('core.participants')
        .values({
          company_id: opts.companyId,
          department_id: opts.departmentId ?? null,
          status: 'invited',
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      const assessment = await trx
        .insertInto('assessment.assessments')
        .values({
          participant_id: participant.id,
          instrument_id: opts.instrumentId,
          status: 'invited',
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return { assessmentId: assessment.id };
    });
  }

  async findByToken(token: string): Promise<Assessment | null> {
    const row = await this.db
      .selectFrom('assessment.assessments')
      .selectAll()
      .where('id', '=', token)
      .executeTakeFirst();

    return row ?? null;
  }

  async assertValidToken(token: string): Promise<Assessment> {
    const assessment = await this.findByToken(token);
    if (!assessment) throw new AssessmentNotFoundError(token);
    return assessment;
  }

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

      if (assessment.consent_id) {
        await trx
          .updateTable('assessment.consents')
          .set({
            scopes: JSON.stringify({ screening: true, share_aggregate: shareAggregate }),
          })
          .where('id', '=', assessment.consent_id)
          .execute();
      }

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
      .set({ status: 'in_progress', el_conversation_id: conversationId })
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
    super(`Assessment not found: ${token}`);
    this.name = 'AssessmentNotFoundError';
  }
}

export class AssessmentExpiredError extends Error {
  constructor(token: string) {
    super(`Assessment expired: ${token}`);
    this.name = 'AssessmentExpiredError';
  }
}
