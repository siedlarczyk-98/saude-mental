import type { Kysely } from 'kysely';
import type { Database, Consent } from '../db/types.js';

export interface ConsentScopes {
  screening: boolean;
  share_aggregate: boolean;
}

export class ConsentService {
  constructor(private db: Kysely<Database>) {}

  async grant(
    participantId: string,
    scopes: ConsentScopes,
  ): Promise<Consent> {
    const row = await this.db
      .insertInto('assessment.consents')
      .values({
        participant_id: participantId,
        text_version: '1.0',
        scopes: JSON.stringify(scopes),
      })
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
}

export class ConsentRequiredError extends Error {
  constructor(participantId: string) {
    super(`No active consent for participant ${participantId}`);
    this.name = 'ConsentRequiredError';
  }
}
