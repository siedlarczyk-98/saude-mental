import type { InstrumentConfig } from '../shared.js';

const BASE_URL = 'https://api.elevenlabs.io/v1';

function headers() {
  const key = process.env['ELEVENLABS_API_KEY'];
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set');
  return { 'xi-api-key': key, 'Content-Type': 'application/json' };
}

function buildAgentPayload(config: InstrumentConfig) {
  return {
    name: `Rastreio ${config.code}`,
    conversation_config: {
      agent: {
        prompt: {
          prompt: config.agentPromptTemplate,
        },
        language: 'pt',
      },
      asr: { quality: 'high', user_input_audio_format: 'pcm_16000' },
      tts: { voice_id: process.env['ELEVENLABS_VOICE_ID'] ?? undefined },
    },
  };
}

export async function provisionAgent(config: InstrumentConfig): Promise<string> {
  const existingAgentId = process.env['ELEVENLABS_AGENT_ID'];

  if (existingAgentId) {
    // Atualiza agente existente (PATCH)
    const res = await fetch(`${BASE_URL}/convai/agents/${existingAgentId}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify(buildAgentPayload(config)),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`ElevenLabs PATCH agent failed: ${res.status} ${body}`);
    }
    return existingAgentId;
  }

  // Cria novo agente (POST)
  const res = await fetch(`${BASE_URL}/convai/agents/create`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(buildAgentPayload(config)),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs POST agent failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { agent_id: string };
  return data.agent_id;
}

export async function getSignedUrl(agentId: string): Promise<string> {
  const res = await fetch(
    `${BASE_URL}/convai/agents/${agentId}/link`,
    { headers: headers() },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs signed URL failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { signed_url: string };
  return data.signed_url;
}
