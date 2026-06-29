import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

// ---------------------------------------------------------------------------
// Schema: instrument
// ---------------------------------------------------------------------------

export interface InstrumentTable {
  id: Generated<string>;
  code: string;
  name: string;
  version: string | null;
  scoring_method: 'mean' | 'sum';
  response_scale_min: number;
  response_scale_max: number;
  completeness_floor: number;
  total_includes: 'primary' | 'all';
  created_at: ColumnType<Date, never, never>;
}

export interface SubscaleTable {
  id: Generated<string>;
  instrument_id: string;
  code: string;
  name: string;
  is_primary: boolean;
  item_count: number | null;
}

export interface ItemTable {
  id: Generated<string>;
  instrument_id: string;
  subscale_id: string;
  item_number: number;
  text: string;
  short_version: boolean;
  reverse_scored: boolean;
}

export interface ResponseOptionTable {
  id: Generated<string>;
  instrument_id: string;
  value: number;
  label: string;
}

export interface NormTable {
  id: Generated<string>;
  instrument_id: string;
  subscale_id: string | null;
  band: 'green' | 'orange' | 'red';
  score_min: number;
  score_max: number;
  is_placeholder: boolean;
  created_at: ColumnType<Date, never, never>;
}

// ---------------------------------------------------------------------------
// Schema: core
// ---------------------------------------------------------------------------

export interface CompanyTable {
  id: Generated<string>;
  name: string;
  created_at: ColumnType<Date, never, never>;
}

export interface DepartmentTable {
  id: Generated<string>;
  company_id: string;
  name: string;
}

export interface ParticipantTable {
  id: Generated<string>;
  company_id: string;
  department_id: string | null;
  pseudonym: string;
  created_at: ColumnType<Date, never, never>;
}

// ---------------------------------------------------------------------------
// Schema: identity
// ---------------------------------------------------------------------------

export interface ParticipantIdentityTable {
  id: Generated<string>;
  participant_id: string;
  encrypted_name: Buffer | null;
  encrypted_email: Buffer | null;
  encryption_key_id: string | null;
  created_at: ColumnType<Date, never, never>;
}

// ---------------------------------------------------------------------------
// Schema: assessment
// ---------------------------------------------------------------------------

export interface ConsentTable {
  id: Generated<string>;
  participant_id: string;
  instrument_id: string;
  scopes: unknown; // jsonb: { share_aggregate: boolean, ... }
  granted_at: ColumnType<Date, string, never>;
  revoked_at: Date | null;
}

export interface AssessmentTable {
  id: Generated<string>;
  participant_id: string;
  instrument_id: string;
  consent_id: string;
  status: 'invited' | 'consented' | 'in_progress' | 'completed' | 'flagged';
  magic_link_token: string;
  magic_link_expires_at: Date;
  elevenlabs_conversation_id: string | null;
  created_at: ColumnType<Date, never, never>;
  completed_at: Date | null;
}

export interface ItemResponseTable {
  id: Generated<string>;
  assessment_id: string;
  item_id: string;
  score: number | null;
  frequency_set: boolean;
  raw_response: string | null;
  created_at: ColumnType<Date, never, never>;
}

export interface ResponseEvidenceTable {
  id: Generated<string>;
  item_response_id: string;
  verbatim: string;
  created_at: ColumnType<Date, never, never>;
}

export interface CoverageSnapshotTable {
  id: Generated<string>;
  assessment_id: string;
  covered_item_ids: string[];
  completeness_pct: number;
  snapshot_at: ColumnType<Date, never, never>;
}

export interface AssessmentScoreTable {
  id: Generated<string>;
  assessment_id: string;
  subscale_id: string | null;
  score: number;
  completeness_pct: number;
  band: 'green' | 'orange' | 'red' | null;
  norm_is_placeholder: boolean;
  is_inconclusive: boolean;
  computed_at: ColumnType<Date, never, never>;
}

export interface SafetyEventTable {
  id: Generated<string>;
  assessment_id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  signal: string;
  flagged_assessment: boolean;
  created_at: ColumnType<Date, never, never>;
}

// ---------------------------------------------------------------------------
// Schema: audit
// ---------------------------------------------------------------------------

export interface AccessLogTable {
  id: Generated<string>;
  actor_type: string;
  actor_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: unknown | null;
  created_at: ColumnType<Date, never, never>;
}

// ---------------------------------------------------------------------------
// Database interface
// ---------------------------------------------------------------------------

export interface Database {
  'instrument.instruments': InstrumentTable;
  'instrument.subscales': SubscaleTable;
  'instrument.items': ItemTable;
  'instrument.response_options': ResponseOptionTable;
  'instrument.norms': NormTable;

  'core.companies': CompanyTable;
  'core.departments': DepartmentTable;
  'core.participants': ParticipantTable;

  'identity.participant_identities': ParticipantIdentityTable;

  'assessment.consents': ConsentTable;
  'assessment.assessments': AssessmentTable;
  'assessment.item_responses': ItemResponseTable;
  'assessment.response_evidence': ResponseEvidenceTable;
  'assessment.coverage_snapshots': CoverageSnapshotTable;
  'assessment.assessment_scores': AssessmentScoreTable;
  'assessment.safety_events': SafetyEventTable;

  'audit.access_log': AccessLogTable;
}

// Helpers para cada tabela
export type Instrument = Selectable<InstrumentTable>;
export type Subscale = Selectable<SubscaleTable>;
export type Item = Selectable<ItemTable>;
export type Norm = Selectable<NormTable>;
export type Participant = Selectable<ParticipantTable>;
export type Consent = Selectable<ConsentTable>;
export type Assessment = Selectable<AssessmentTable>;
export type ItemResponse = Selectable<ItemResponseTable>;
export type AssessmentScore = Selectable<AssessmentScoreTable>;
export type SafetyEvent = Selectable<SafetyEventTable>;

export type NewConsent = Insertable<ConsentTable>;
export type NewAssessment = Insertable<AssessmentTable>;
export type NewItemResponse = Insertable<ItemResponseTable>;
export type NewAssessmentScore = Insertable<AssessmentScoreTable>;
export type NewSafetyEvent = Insertable<SafetyEventTable>;
export type UpdateAssessment = Updateable<AssessmentTable>;
