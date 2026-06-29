import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

const client = new Anthropic();

// ---------------------------------------------------------------------------
// LLM-3: classificação de crise (BR-10)
// Modelo leve/rápido — corre independentemente do LLM-2.
// ---------------------------------------------------------------------------

const CrisisSignalSchema = z.object({
  type: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
});

const CrisisResultSchema = z.object({
  signals: z.array(CrisisSignalSchema),
});

export type LlmCrisisSignal = z.infer<typeof CrisisSignalSchema>;

export async function classifyCrisisSignals(transcript: string): Promise<LlmCrisisSignal[]> {
  if (!transcript.trim()) return [];

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system:
      'You are a mental health safety classifier. Analyze the transcript for crisis signals. ' +
      'Be conservative: prefer false positives over false negatives. ' +
      'Only report signals that are genuinely present in the text.',
    tools: [
      {
        name: 'report_crisis_signals',
        description:
          'Report any crisis or safety signals detected in the transcript. Return empty array if none found.',
        input_schema: {
          type: 'object' as const,
          properties: {
            signals: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: {
                    type: 'string',
                    description:
                      'Type of signal, e.g. suicidal_ideation, self_harm, severe_distress, hopelessness',
                  },
                  severity: {
                    type: 'string',
                    enum: ['low', 'medium', 'high', 'critical'],
                  },
                },
                required: ['type', 'severity'],
              },
            },
          },
          required: ['signals'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'report_crisis_signals' },
    messages: [
      {
        role: 'user',
        content: `Analyze this transcript for mental health crisis or safety signals:\n\n${transcript}`,
      },
    ],
  });

  const toolUseBlock = response.content.find((b) => b.type === 'tool_use');
  if (!toolUseBlock || toolUseBlock.type !== 'tool_use') return [];

  const parsed = CrisisResultSchema.parse(toolUseBlock.input);
  return parsed.signals;
}
