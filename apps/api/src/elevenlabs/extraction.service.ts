import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { InstrumentConfig } from '../shared.js';
import type { Database } from '../db/types.js';

const client = new Anthropic();

// ---------------------------------------------------------------------------
// Zod schema para validar a saída estruturada do LLM-2 por item
// ---------------------------------------------------------------------------

const ItemExtractionSchema = z.object({
  item_number: z.number().int(),
  score: z.number().int().nullable(),
  frequency_set: z.boolean(),
  confidence: z.enum(['low', 'medium', 'high']),
  evidence: z.string(),
});

const ExtractionResultSchema = z.object({
  items: z.array(ItemExtractionSchema),
});

export type ItemExtraction = z.infer<typeof ItemExtractionSchema>;

export interface ExtractionResult {
  itemsRecorded: number;
}

// ---------------------------------------------------------------------------
// LLM-2: extrai pontuações de todos os itens do instrumento a partir do
// transcript completo. Usa tool-use forçado para garantir JSON estruturado.
// ---------------------------------------------------------------------------

export class ExtractionService {
  constructor(private db: Kysely<Database>) {}

  async extractAndPersist(
    assessmentId: string,
    transcript: string,
    config: InstrumentConfig,
  ): Promise<ExtractionResult> {
    const itemDescriptions = config.extractionSpec
      .map((s: { itemNumber: number; extractionPrompt: string }) => `Item ${s.itemNumber}: ${s.extractionPrompt}`)
      .join('\n');

    const systemPrompt =
      'You are a precise psychometric data extractor. ' +
      'Extract frequency scores from a voice conversation transcript following the instructions for each item exactly. ' +
      'Only score an item as frequency_set=true when the participant explicitly established HOW OFTEN something occurs. ' +
      'Intensity without frequency = frequency_set:false, score:null.';

    const userMessage =
      `TRANSCRIPT:\n${transcript}\n\n` +
      `ITEMS TO SCORE:\n${itemDescriptions}\n\n` +
      `For each item, extract: score (integer ${config.responseScale.min}-${config.responseScale.max} or null), ` +
      `frequency_set (boolean), confidence (low/medium/high), evidence (brief quote or "not mentioned").`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: systemPrompt,
      tools: [
        {
          name: 'record_item_scores',
          description: 'Record the extracted frequency scores for all BAT items.',
          input_schema: {
            type: 'object' as const,
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    item_number: { type: 'integer' },
                    score: { type: ['integer', 'null'] },
                    frequency_set: { type: 'boolean' },
                    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
                    evidence: { type: 'string' },
                  },
                  required: ['item_number', 'score', 'frequency_set', 'confidence', 'evidence'],
                },
              },
            },
            required: ['items'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'record_item_scores' },
      messages: [{ role: 'user', content: userMessage }],
    });

    // Extract tool_use block
    const toolUseBlock = response.content.find((b) => b.type === 'tool_use');
    if (!toolUseBlock || toolUseBlock.type !== 'tool_use') {
      throw new Error('LLM-2: no tool_use block in response');
    }

    const parsed = ExtractionResultSchema.parse(toolUseBlock.input);

    // Busca itens do instrumento para mapear itemNumber -> itemId
    const items = await this.db
      .selectFrom('instrument.items')
      .select(['id', 'item_number'])
      .where('instrument_id', '=', config.instrumentId)
      .execute();

    const itemByNumber = new Map(items.map((i) => [i.item_number, i.id]));

    let itemsRecorded = 0;

    for (const extraction of parsed.items) {
      const itemId = itemByNumber.get(extraction.item_number);
      if (!itemId) continue;

      const score =
        extraction.frequency_set && extraction.score !== null ? extraction.score : null;

      const [inserted] = await this.db
        .insertInto('assessment.item_responses')
        .values({
          assessment_id: assessmentId,
          item_id: itemId,
          score,
          frequency_set: extraction.frequency_set,
          raw_response: extraction.evidence,
        })
        .returning(['id'])
        .execute();

      if (inserted && extraction.evidence) {
        await this.db
          .insertInto('assessment.response_evidence')
          .values({
            item_response_id: inserted.id,
            verbatim: extraction.evidence,
          })
          .execute();
      }

      itemsRecorded++;
    }

    return { itemsRecorded };
  }
}
