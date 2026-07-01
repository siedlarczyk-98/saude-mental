export interface FieldSpec {
  itemNumber: number;
  extractionPrompt: string;
}

export interface ClusterDef {
  code: string;
  itemNumbers: number[];
  openingPrompts: string[];
}

export interface InstrumentConfig {
  code: string;
  instrumentId: string;
  scoringMethod: 'mean' | 'sum';
  responseScale: { min: number; max: number };
  completenessFloor: number;
  totalIncludes: 'primary' | 'all';
  clusters: ClusterDef[];
  extractionSpec: FieldSpec[];
}
