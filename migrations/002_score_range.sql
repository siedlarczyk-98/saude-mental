-- Relaxa o CHECK de score para acomodar instrumentos com escala 0-3 (ex: GAD-7).
-- A validação da faixa real por instrumento é feita na aplicação via InstrumentConfig.responseScale.
ALTER TABLE assessment.item_responses DROP CONSTRAINT item_responses_score_check;
ALTER TABLE assessment.item_responses ADD CONSTRAINT item_responses_score_check
  CHECK (score BETWEEN 0 AND 5);
