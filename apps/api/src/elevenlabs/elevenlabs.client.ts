const BASE_URL = 'https://api.elevenlabs.io/v1';

function headers() {
  const key = process.env['ELEVENLABS_API_KEY'];
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set');
  return { 'xi-api-key': key, 'Content-Type': 'application/json' };
}

export async function getSignedUrl(agentId: string): Promise<string> {
  const res = await fetch(
    `${BASE_URL}/convai/conversation/get_signed_url?agent_id=${agentId}`,
    { headers: headers() },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs signed URL failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { signed_url: string };
  return data.signed_url;
}
