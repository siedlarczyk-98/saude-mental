import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { AssessmentService } from '../assessment/assessment.service.js';
import { ConsentService } from '../consent/consent.service.js';
import { WebhookService, ElevenLabsWebhookSchema } from '../elevenlabs/webhook.service.js';
import { getSignedUrl } from '../elevenlabs/elevenlabs.client.js';
import { getInstrumentConfig, getInstrumentConfigById } from '../instrument/registry.js';

const InviteBodySchema = z.object({
  companyId: z.string().uuid(),
  departmentId: z.string().uuid().optional(),
  instrumentCode: z.string(),
  pseudonym: z.string().min(1).max(64),
});

const ConsentBodySchema = z.object({
  shareAggregate: z.boolean().default(false),
});

function badRequest(reply: FastifyReply, err: z.ZodError) {
  return reply.status(400).send({ error: 'validation_error', issues: err.issues });
}

export async function registerRoutes(app: FastifyInstance) {
  const db = getDb();
  const assessmentService = new AssessmentService(db);
  const consentService = new ConsentService(db);
  void consentService; // disponível para uso futuro

  // -------------------------------------------------------------------------
  // POST /assessments — convida participante e cria assessment
  // -------------------------------------------------------------------------
  app.post('/assessments', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = InviteBodySchema.safeParse(request.body);
    if (!parsed.success) return badRequest(reply, parsed.error);

    const { companyId, departmentId, instrumentCode, pseudonym } = parsed.data;
    const config = getInstrumentConfig(instrumentCode);

    const result = await assessmentService.invite({
      companyId,
      departmentId,
      instrumentId: config.instrumentId,
      pseudonym,
    });

    return reply.status(201).send({
      assessmentId: result.assessmentId,
      magicLinkToken: result.magicLinkToken,
    });
  });

  // -------------------------------------------------------------------------
  // GET /assessments/:token — estado do assessment
  // -------------------------------------------------------------------------
  app.get(
    '/assessments/:token',
    async (request: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) => {
      const { token } = request.params;
      const assessment = await assessmentService.findByToken(token);
      if (!assessment) return reply.status(404).send({ error: 'not_found' });

      // BR-9: sem exposição de identidade
      return reply.send({
        assessmentId: assessment.id,
        status: assessment.status,
        instrumentId: assessment.instrument_id,
        expiresAt: assessment.magic_link_expires_at,
      });
    },
  );

  // -------------------------------------------------------------------------
  // POST /assessments/:token/consent — participante aceita consentimento
  // -------------------------------------------------------------------------
  app.post(
    '/assessments/:token/consent',
    async (request: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) => {
      const { token } = request.params;
      const assessment = await assessmentService.assertValidToken(token);

      const parsed = ConsentBodySchema.safeParse(request.body);
      if (!parsed.success) return badRequest(reply, parsed.error);

      await assessmentService.recordConsent(assessment.id, parsed.data.shareAggregate);
      return reply.status(204).send();
    },
  );

  // -------------------------------------------------------------------------
  // POST /assessments/:token/call — inicia chamada, retorna signed URL
  // -------------------------------------------------------------------------
  app.post(
    '/assessments/:token/call',
    async (request: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) => {
      const { token } = request.params;
      const assessment = await assessmentService.assertValidToken(token);

      if (!['consented', 'in_progress'].includes(assessment.status)) {
        return reply.status(409).send({
          error: 'assessment_not_consented',
          status: assessment.status,
        });
      }

      const agentId = process.env['ELEVENLABS_AGENT_ID'];
      if (!agentId) return reply.status(503).send({ error: 'agent_not_configured' });

      const signedUrl = await getSignedUrl(agentId);
      return reply.send({ signedUrl, assessmentId: assessment.id });
    },
  );

  // -------------------------------------------------------------------------
  // POST /webhook/elevenlabs — payload pós-call do ElevenLabs
  // -------------------------------------------------------------------------
  app.post(
    '/webhook/elevenlabs',
    async (request: FastifyRequest<{ Querystring: { h?: string } }>, reply: FastifyReply) => {
    const secret = process.env['WEBHOOK_SECRET'];
    if (secret) {
      const querySecret = request.query.h;
      if (querySecret) {
        // ElevenLabs passa o secret via ?h=
        if (querySecret !== secret) {
          return reply.status(401).send({ error: 'invalid_signature' });
        }
      } else {
        // Fallback: validação HMAC via header
        const sig = request.headers['x-elevenlabs-signature'];
        const rawBody = (request as FastifyRequest & { rawBody?: Buffer }).rawBody;
        if (!rawBody || !sig || !verifySignature(rawBody, sig as string, secret)) {
          return reply.status(401).send({ error: 'invalid_signature' });
        }
      }
    }

    const parsed = ElevenLabsWebhookSchema.safeParse(request.body);
    if (!parsed.success) return badRequest(reply, parsed.error);

    const payload = parsed.data;
    if (payload.type !== 'post_call_transcription') {
      return reply.send({ ignored: true });
    }

    const row = await db
      .selectFrom('assessment.assessments')
      .select('instrument_id')
      .where('elevenlabs_conversation_id', '=', payload.conversation_id)
      .executeTakeFirst();

    if (!row) return reply.status(404).send({ error: 'assessment_not_found' });

    const config = getInstrumentConfigById(row.instrument_id);
    const webhookService = new WebhookService(db);
    const result = await webhookService.process(payload, config);

    return reply.send(result);
  },
  );

  // -------------------------------------------------------------------------
  // GET /assessments/:token/result — resultado individual (BR-11)
  // -------------------------------------------------------------------------
  app.get(
    '/assessments/:token/result',
    async (request: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) => {
      const { token } = request.params;
      const assessment = await assessmentService.findByToken(token);
      if (!assessment) return reply.status(404).send({ error: 'not_found' });

      if (!['completed', 'flagged'].includes(assessment.status)) {
        return reply.status(409).send({ error: 'result_not_ready', status: assessment.status });
      }

      // BR-9: sem join com identity
      const scores = await db
        .selectFrom('assessment.assessment_scores')
        .selectAll()
        .where('assessment_id', '=', assessment.id)
        .execute();

      const totalScore = scores.find((s) => s.subscale_id === null);
      const subscaleScores = scores.filter((s) => s.subscale_id !== null);

      const safetyEvents = await db
        .selectFrom('assessment.safety_events')
        .select(['severity', 'flagged_assessment'])
        .where('assessment_id', '=', assessment.id)
        .execute();

      const config = getInstrumentConfigById(assessment.instrument_id);

      return reply.send(
        buildResultResponse({
          config,
          totalScore,
          subscaleScores,
          hasCrisis: safetyEvents.length > 0,
          assessmentStatus: assessment.status,
        }),
      );
    },
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ScoreRow = {
  subscale_id: string | null;
  score: number;
  completeness_pct: number;
  band: 'green' | 'orange' | 'red' | null;
  norm_is_placeholder: boolean;
  is_inconclusive: boolean;
};

function buildResultResponse(opts: {
  config: ReturnType<typeof getInstrumentConfigById>;
  totalScore: ScoreRow | undefined;
  subscaleScores: ScoreRow[];
  hasCrisis: boolean;
  assessmentStatus: string;
}) {
  const { totalScore, hasCrisis } = opts;
  const isInconclusive = totalScore?.is_inconclusive ?? true;
  const normIsPlaceholder = totalScore?.norm_is_placeholder ?? true;

  let summaryText: string;
  if (isInconclusive) {
    summaryText =
      'A conversa não cobriu itens suficientes para gerar um resultado conclusivo. ' +
      'Isso pode acontecer se a chamada foi interrompida ou muito breve.';
  } else if (normIsPlaceholder) {
    summaryText =
      `Sua pontuação geral foi de ${totalScore?.score?.toFixed(2) ?? 'N/A'} (escala 1–5). ` +
      'Os parâmetros de referência ainda estão em calibração para a população brasileira, ' +
      'por isso não é possível apresentar uma classificação de risco neste momento.';
  } else {
    const bandLabels: Record<string, string> = {
      green: 'baixo risco de burnout',
      orange: 'risco moderado de burnout',
      red: 'alto risco de burnout',
    };
    const bandLabel = totalScore?.band ? (bandLabels[totalScore.band] ?? 'indeterminado') : 'indeterminado';
    summaryText =
      `Sua pontuação geral foi de ${totalScore?.score?.toFixed(2) ?? 'N/A'} (escala 1–5), ` +
      `indicando ${bandLabel}.`;
  }

  const disclaimer =
    'Este é um rastreio, não um diagnóstico. ' +
    'Os resultados ajudam a identificar padrões e não substituem a avaliação de um profissional de saúde. ' +
    'Se algo te preocupar, converse com um médico, psicólogo ou outro profissional de saúde.';

  const supportResources = hasCrisis
    ? {
        message:
          'Identificamos sinais de sofrimento intenso na sua conversa. ' +
          'O CVV atende 24 horas pelo telefone 188 ou em cvv.org.br.',
        urgent: true,
      }
    : {
        message: 'Se precisar de apoio, o CVV atende 24 horas pelo telefone 188 ou em cvv.org.br.',
        urgent: false,
      };

  return {
    summary: summaryText,
    disclaimer,
    supportResources,
    isInconclusive,
    calibrationPending: normIsPlaceholder,
    total: totalScore
      ? {
          score: totalScore.score,
          completeness: totalScore.completeness_pct,
          band: normIsPlaceholder ? null : totalScore.band,
        }
      : null,
    subscales: opts.subscaleScores.map((s) => ({
      subscaleId: s.subscale_id,
      score: s.score,
      band: s.norm_is_placeholder ? null : s.band,
    })),
  };
}

function verifySignature(body: Buffer, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(body);
  const expected = `sha256=${hmac.digest('hex')}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
