import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

// ---------------------------------------------------------------------------
// Schema: instrument
// ---------------------------------------------------------------------------

export interface InstrumentTable {
  id: Generated<string>;
  code: string;
  variant: string;
  version: string;
  language: string;
  created_at: ColumnType<Date, never, never>;
}

export interface SubscaleTable {
  id: Generated<string>;
  instrument_id: string;
  code: string;
  name: string;
  type: string;
  display_order: number;
}

export interface ItemTable {
  id: Generated<string>;
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
  scope: string;
  band: 'green' | 'orange' | 'red';
  min_score: number;
  max_score: number;
  source_note: string | null;
}

// ---------------------------------------------------------------------------
// Schema: core
// ---------------------------------------------------------------------------

export interface CompanyTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  created_at: ColumnType<Date, never, never>;
}

export interface DepartmentTable {
  id: Generated<string>;
  company_id: string;
  name: string;
  created_at: ColumnType<Date, never, never>;
}

export interface ParticipantTable {
  id: Generated<string>;
  company_id: string;
  department_id: string | null;
  status: string;
  created_at: ColumnType<Date, never, never>;
}

// ---------------------------------------------------------------------------
// Schema: identity
// ---------------------------------------------------------------------------

export interface ParticipantIdentityTable {
  participant_id: string;
  enc_name: Buffer | null;
  enc_email: Buffer | null;
  enc_cpf: Buffer | null;
  created_at: ColumnType<Date, never, never>;
}

// ---------------------------------------------------------------------------
// Schema: assessment
// ---------------------------------------------------------------------------

export interface ConsentTable {
  id: Generated<string>;
  participant_id: string;
  text_version: string;
  scopes: unknown;
  granted_at: ColumnType<Date, never, never>;
  revoked_at: Date | null;
  ip_address: string | null;
}

export interface AssessmentTable {
  id: Generated<string>;
  participant_id: string;
  instrument_id: string;
  consent_id: string | null;
  status: 'invited' | 'consented' | 'in_progress' | 'completed' | 'flagged';
  channel: ColumnType<string, string | undefined, string>;
  el_conversation_id: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: ColumnType<Date, never, never>;
}

export interface ItemResponseTable {
  id: Generated<string>;
  assessment_id: string;
  item_id: string;
  score: number | null;
  confidence: string | null;
  frequency_set: boolean;
  source: string | null;
  extractor_model: string | null;
  extracted_at: Date | null;
}

export interface ResponseEvidenceTable {
  item_response_id: string;
  enc_quote: Buffer | null;
  verbatim: string;
  created_at: ColumnType<Date, never, never>;
}

export interface CoverageSnapshotTable {
  id: Generated<string>;
  assessment_id: string;
  state: unknown;
  captured_at: ColumnType<Date, never, never>;
}

export interface AssessmentScoreTable {
  id: Generated<string>;
  assessment_id: string;
  subscale_id: string | null;
  mean_score: number | null;
  completeness: number;
  band: 'green' | 'orange' | 'red' | null;
  computed_at: ColumnType<Date, never, never>;
}

export interface SafetyEventTable {
  id: Generated<string>;
  assessment_id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  action_taken: ColumnType<string, string | undefined, string>;
  detected_at: ColumnType<Date, never, never>;
  resolved: ColumnType<boolean, boolean | undefined, boolean>;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Schema: audit
// ---------------------------------------------------------------------------

export interface AccessLogTable {
  id: ColumnType<bigint, never, never>;
  actor: string;
  action: string;
  object_schema: string;
  object_table: string;
  object_id: string | null;
  occurred_at: ColumnType<Date, never, never>;
  detail: unknown | null;
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

export type NewAssessment = Insertable<AssessmentTable>;
export type NewItemResponse = Insertable<ItemResponseTable>;
export type NewAssessmentScore = Insertable<AssessmentScoreTable>;
export type NewSafetyEvent = Insertable<SafetyEventTable>;
export type UpdateAssessment = Updateable<AssessmentTable>;
