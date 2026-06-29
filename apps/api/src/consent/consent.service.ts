import type { Kysely } from 'kysely';
import type { Database, Consent, NewConsent } from '../db/types.js';

export interface ConsentScopes {
  screening: boolean;
  share_aggregate: boolean;
}

export class ConsentService {
  constructor(private db: Kysely<Database>) {}

  async grant(
    participantId: string,
    instrumentId: string,
    scopes: ConsentScopes,
  ): Promise<Consent> {
    const row = await this.db
      .insertInto('assessment.consents')
      .values({
        participant_id: participantId,
        instrument_id: instrumentId,
        scopes: JSON.stringify(scopes),
        granted_at: new Date().toISOString(),
      } satisfies NewConsent)
      .returningAll()
      .executeTakeFirstOrThrow();

    return row;
  }

  async revoke(consentId: string): Promise<void> {
    await this.db
      .updateTable('assessment.consents')
      .set({ revoked_at: new Date() })
      .where('id', '=', consentId)
      .where('revoked_at', 'is', null)
      .execute();
  }

  // Retorna o consentimento ativo mais recente para o participante+instrumento.
  // "Ativo" = não revogado e com scopes.screening = true.
  async findActive(
    participantId: string,
    instrumentId: string,
  ): Promise<Consent | null> {
    const row = await this.db
      .selectFrom('assessment.consents')
      .selectAll()
      .where('participant_id', '=', participantId)
      .where('instrument_id', '=', instrumentId)
      .where('revoked_at', 'is', null)
      .orderBy('granted_at', 'desc')
      .limit(1)
      .executeTakeFirst();

    if (!row) return null;

    const scopes = row.scopes as ConsentScopes;
    if (!scopes.screening) return null;

    return row;
  }

  async assertActive(participantId: string, instrumentId: string): Promise<Consent> {
    const consent = await this.findActive(participantId, instrumentId);
    if (!consent) {
      throw new ConsentRequiredError(participantId, instrumentId);
    }
    return consent;
  }
}

export class ConsentRequiredError extends Error {
  constructor(participantId: string, instrumentId: string) {
    super(
      `No active consent for participant ${participantId} on instrument ${instrumentId}`,
    );
    this.name = 'ConsentRequiredError';
  }
}
