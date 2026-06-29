'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useConversation } from '@elevenlabs/react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Screen = 'identify' | 'consent' | 'voice' | 'end';

interface TranscriptMsg {
  isAgent: boolean;
  text: string;
  time: string;
}

interface ResultData {
  summary: string;
  disclaimer: string;
  supportResources: { message: string; urgent: boolean };
  isInconclusive: boolean;
  calibrationPending: boolean;
  total: { score: number | null; completeness: number; band: string | null } | null;
}

// ---------------------------------------------------------------------------
// Leaf components
// ---------------------------------------------------------------------------

function Logo() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 32, animation: 'fade-in-up 0.6s 0.1s ease both', opacity: 0 }}>
      <div style={{ width: 60, height: 60, background: '#2D4A3E', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, boxShadow: '0 4px 20px rgba(45,74,62,0.25)' }}>
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path d="M14 4C14 4 8 8 8 14.5C8 18.09 10.69 21 14 21C17.31 21 20 18.09 20 14.5C20 8 14 4 14 4Z" fill="white" opacity="0.9" />
          <circle cx="14" cy="14.5" r="3" fill="#7BAE8A" />
        </svg>
      </div>
      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 12, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7BAE8A' }}>Bem-estar no Trabalho</span>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(12px)', borderRadius: 24, padding: '36px 32px', boxShadow: '0 2px 40px rgba(45,74,62,0.10), 0 1px 0 rgba(255,255,255,0.8) inset', border: '1px solid rgba(255,255,255,0.6)' }}>
      {children}
    </div>
  );
}

function Footer({ text = 'Avaliação BAT · Powered by ElevenLabs Conversational AI' }: { text?: string }) {
  return <p style={{ textAlign: 'center', fontSize: 12, color: '#9EB5A8', marginTop: 20 }}>{text}</p>;
}

// ---------------------------------------------------------------------------
// Screen 0 — Identificação
// ---------------------------------------------------------------------------

function IdentifyScreen({ onContinue }: { onContinue: (nome: string, email: string) => void }) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [nomeActive, setNomeActive] = useState(false);
  const [emailActive, setEmailActive] = useState(false);

  return (
    <div style={{ width: '100%', maxWidth: 480, animation: 'fade-in-up 0.6s ease both' }}>
      <Logo />
      <Card>
        <h1 style={{ fontFamily: 'var(--font-dm-serif)', fontSize: 26, lineHeight: 1.25, color: '#1E3328', marginBottom: 8 }}>Olá, bem-vindo(a)</h1>
        <p style={{ fontSize: 15, color: '#4A6358', lineHeight: 1.65, marginBottom: 28 }}>Se quiser receber seu resultado por e-mail, preencha os campos abaixo. Ou continue sem se identificar.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: '#2D4A3E', letterSpacing: '0.02em' }}>Nome</label>
          <input
            type="text"
            placeholder="Seu nome completo"
            value={nome}
            onChange={e => setNome(e.target.value)}
            onFocus={() => setNomeActive(true)}
            onBlur={() => setNomeActive(false)}
            style={{ width: '100%', padding: '13px 16px', borderRadius: 12, border: `1.5px solid ${nomeActive ? '#2D4A3E' : '#D5E2DA'}`, background: 'rgba(255,255,255,0.8)', fontFamily: 'var(--font-dm-sans)', fontSize: 15, color: '#1E3328', outline: 'none', transition: 'border-color 0.2s' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 28 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: '#2D4A3E', letterSpacing: '0.02em' }}>E-mail</label>
          <input
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onFocus={() => setEmailActive(true)}
            onBlur={() => setEmailActive(false)}
            style={{ width: '100%', padding: '13px 16px', borderRadius: 12, border: `1.5px solid ${emailActive ? '#2D4A3E' : '#D5E2DA'}`, background: 'rgba(255,255,255,0.8)', fontFamily: 'var(--font-dm-sans)', fontSize: 15, color: '#1E3328', outline: 'none', transition: 'border-color 0.2s' }}
          />
        </div>

        <button onClick={() => onContinue(nome, email)} style={{ width: '100%', padding: 16, background: '#2D4A3E', color: 'white', border: 'none', borderRadius: 14, fontFamily: 'var(--font-dm-sans)', fontSize: 16, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.01em', boxShadow: '0 4px 20px rgba(45,74,62,0.30)', marginBottom: 12 }}>
          Continuar
        </button>
        <button onClick={() => onContinue('', '')} style={{ width: '100%', padding: 14, background: 'transparent', color: '#7B9E8E', border: '1.5px solid #D5E2DA', borderRadius: 14, fontFamily: 'var(--font-dm-sans)', fontSize: 14, fontWeight: 500, cursor: 'pointer', letterSpacing: '0.01em' }}>
          Continuar anonimamente
        </button>
      </Card>
      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screen 1 — Consentimento
// ---------------------------------------------------------------------------

function ConsentScreen({ onStart, loading }: { onStart: (shareAggregate: boolean) => void; loading: boolean }) {
  const [checked, setChecked] = useState(false);

  return (
    <div style={{ width: '100%', maxWidth: 480, animation: 'fade-in-up 0.6s ease both' }}>
      <Logo />
      <Card>
        <h1 style={{ fontFamily: 'var(--font-dm-serif)', fontSize: 28, lineHeight: 1.25, color: '#1E3328', marginBottom: 10 }}>Uma conversa<br /><em style={{ fontStyle: 'italic', color: '#2D4A3E' }}>sobre você</em></h1>
        <p style={{ fontSize: 15, color: '#4A6358', lineHeight: 1.65, marginBottom: 28 }}>Você foi convidado(a) para uma breve avaliação de bem-estar. A conversa leva cerca de <strong style={{ color: '#2D4A3E', fontWeight: 600 }}>5 minutos</strong> e é conduzida por um agente de voz.</p>

        <div style={{ background: '#F5F0E8', borderRadius: 14, padding: 20, marginBottom: 24 }}>
          <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7BAE8A', marginBottom: 14 }}>O que vai acontecer</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              'O agente fará perguntas sobre seu estado nas últimas semanas',
              'Você responde falando normalmente, no seu próprio ritmo',
              'Você recebe seu resultado individual, de forma privada',
            ].map((text, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ width: 26, height: 26, minWidth: 26, background: i === 2 ? '#7BAE8A' : '#2D4A3E', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 11, color: 'white', fontWeight: 600 }}>{i + 1}</span>
                </div>
                <span style={{ fontSize: 14, color: '#3D5348', lineHeight: 1.5, paddingTop: 4 }}>{text}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'rgba(123,174,138,0.10)', borderRadius: 10, padding: '14px 16px', marginBottom: 26, border: '1px solid rgba(123,174,138,0.25)' }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ minWidth: 18, marginTop: 1 }}>
            <path d="M9 1.5L2.25 4.5V9C2.25 12.75 5.1 16.245 9 17.25C12.9 16.245 15.75 12.75 15.75 9V4.5L9 1.5Z" fill="#7BAE8A" opacity="0.3" stroke="#7BAE8A" strokeWidth="1.2" />
            <path d="M6.5 9L8 10.5L11.5 7" stroke="#2D4A3E" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p style={{ fontSize: 13, color: '#4A6358', lineHeight: 1.55 }}>Suas respostas são <strong style={{ color: '#2D4A3E', fontWeight: 600 }}>confidenciais</strong>. Apenas você recebe seu resultado individual. A organização vê somente dados agregados e anônimos.</p>
        </div>

        <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 26, userSelect: 'none' }}>
          <div style={{ position: 'relative', width: 20, height: 20, minWidth: 20, marginTop: 1 }}>
            <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer', margin: 0 }} />
            <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${checked ? '#2D4A3E' : '#B8C9BE'}`, background: checked ? '#2D4A3E' : 'transparent', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              {checked && <svg width="11" height="8" viewBox="0 0 11 8" fill="none"><path d="M1 4L4 7L10 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            </div>
          </div>
          <span style={{ fontSize: 14, color: '#4A6358', lineHeight: 1.6 }}>Li e concordo com os termos de participação. Entendo que posso interromper a conversa a qualquer momento.</span>
        </label>

        <button
          onClick={() => checked && !loading && onStart(false)}
          disabled={!checked || loading}
          style={{ width: '100%', padding: 16, background: checked ? '#2D4A3E' : '#B8C9BE', color: 'white', border: 'none', borderRadius: 14, fontFamily: 'var(--font-dm-sans)', fontSize: 16, fontWeight: 600, cursor: checked && !loading ? 'pointer' : 'not-allowed', transition: 'all 0.25s', letterSpacing: '0.01em', boxShadow: checked ? '0 4px 20px rgba(45,74,62,0.35)' : 'none' }}
        >
          {loading ? 'Iniciando…' : 'Iniciar conversa por voz'}
        </button>
      </Card>
      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screen 2 — Conversa por Voz
// ---------------------------------------------------------------------------

type VoiceStatus = 'connecting' | 'connected' | 'agent' | 'user' | 'disconnected';

function VoiceScreen({ signedUrl, assessmentId, currentQuestion, totalQuestions, onEnd }: {
  signedUrl: string;
  assessmentId: string;
  currentQuestion: number;
  totalQuestions: number;
  onEnd: () => void;
}) {
  const [transcript, setTranscript] = useState<TranscriptMsg[]>([]);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('connecting');
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const now = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const conversation = useConversation({
    onConnect: () => setVoiceStatus('connected'),
    onDisconnect: () => { setVoiceStatus('disconnected'); onEnd(); },
    onMessage: (msg: { message: string; source: 'ai' | 'user' }) => {
      setTranscript(prev => [...prev, { isAgent: msg.source === 'ai', text: msg.message, time: now() }]);
    },
    onError: (err: unknown) => console.error('ElevenLabs error', err),
  });

  useEffect(() => {
    conversation.startSession({ signedUrl });
    return () => { conversation.endSession(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedUrl]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  const isAgentSpeaking = conversation.isSpeaking;
  const isUserSpeaking = voiceStatus === 'user';
  const isWaiting = !isAgentSpeaking && !isUserSpeaking;

  const statusLabel = isAgentSpeaking ? 'Agente está falando' : isUserSpeaking ? 'Sua vez de falar' : voiceStatus === 'connecting' ? 'Conectando…' : 'Aguardando…';
  const statusSub = isAgentSpeaking ? 'Ouça a pergunta e responda quando terminar' : isUserSpeaking ? 'Estou ouvindo… fale no seu próprio ritmo' : voiceStatus === 'connecting' ? 'Estabelecendo conexão de voz' : 'A conversa começará em instantes';

  const breatheDuration = isAgentSpeaking ? '2s' : '4s';

  return (
    <div style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'fade-in 0.5s ease both' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 40, animation: 'fade-in-up 0.5s 0.1s ease both', opacity: 0 }}>
        <div>
          <p style={{ fontSize: 12, fontWeight: 500, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#7BAE8A' }}>Em andamento</p>
          <p style={{ fontFamily: 'var(--font-dm-serif)', fontSize: 20, color: '#1E3328' }}>Conversa de bem-estar</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.6)', padding: '6px 12px', borderRadius: 20, border: '1px solid rgba(123,174,138,0.2)' }}>
          <div style={{ width: 7, height: 7, background: '#7BAE8A', borderRadius: '50%', animation: 'dot-blink 1.4s ease infinite' }} />
          <span style={{ fontSize: 12, color: '#4A6358', fontWeight: 500 }}>Ao vivo</span>
        </div>
      </div>

      {/* Orb */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 44, animation: 'fade-in-up 0.5s 0.2s ease both', opacity: 0 }}>
        <div style={{ position: 'absolute', width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(123,174,138,0.15) 0%, transparent 70%)', animation: `breathe3 ${breatheDuration} ease-in-out infinite` }} />
        <div style={{ position: 'absolute', width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(45,74,62,0.12) 0%, transparent 70%)', animation: `breathe2 ${breatheDuration} ease-in-out infinite 0.3s` }} />
        <div style={{ position: 'absolute', width: 120, height: 120, borderRadius: '50%', background: 'radial-gradient(circle, rgba(45,74,62,0.18) 0%, transparent 70%)', animation: `breathe ${breatheDuration} ease-in-out infinite 0.6s` }} />

        {isAgentSpeaking && (
          <div style={{ position: 'absolute', width: 90, height: 90, borderRadius: '50%', border: '2px solid rgba(123,174,138,0.5)', animation: 'pulse-ring 1.5s cubic-bezier(0.215, 0.61, 0.355, 1) infinite' }} />
        )}

        <div style={{ position: 'relative', width: 84, height: 84, borderRadius: '50%', background: 'linear-gradient(135deg, #2D4A3E 0%, #3D6B58 50%, #4A8068 100%)', boxShadow: '0 8px 32px rgba(45,74,62,0.45), 0 2px 8px rgba(45,74,62,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
          {isAgentSpeaking ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 28 }}>
              {[0, 0.1, 0.2, 0.3, 0.2, 0.1, 0].map((delay, i) => (
                <div key={i} style={{ width: 3, height: '100%', background: 'rgba(255,255,255,0.85)', borderRadius: 2, transformOrigin: 'bottom', animation: `wave-bar 0.6s ease-in-out infinite ${delay}s` }} />
              ))}
            </div>
          ) : (
            <svg width="26" height="26" viewBox="0 0 26 26" fill="none" opacity={isWaiting ? 0.5 : 1}>
              <rect x="9" y="3" width="8" height="13" rx="4" fill="white" />
              <path d="M5 13C5 17.418 8.582 21 13 21C17.418 21 21 17.418 21 13" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <line x1="13" y1="21" x2="13" y2="24" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
        </div>
      </div>

      {/* Status */}
      <div style={{ textAlign: 'center', marginBottom: 36, minHeight: 52, animation: 'fade-in-up 0.5s 0.3s ease both', opacity: 0 }}>
        <p style={{ fontFamily: 'var(--font-dm-serif)', fontSize: 22, color: '#1E3328', marginBottom: 6 }}>{statusLabel}</p>
        <p style={{ fontSize: 14, color: '#7B9E8E', lineHeight: 1.5 }}>{statusSub}</p>
      </div>

      {/* Transcript */}
      <div style={{ width: '100%', background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(10px)', borderRadius: 20, padding: 20, marginBottom: 28, border: '1px solid rgba(255,255,255,0.7)', boxShadow: '0 2px 16px rgba(45,74,62,0.07)', animation: 'fade-in-up 0.5s 0.4s ease both', opacity: 0, maxHeight: 240, overflowY: 'auto' }}>
        <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#9EB5A8', marginBottom: 14 }}>Transcrição</p>
        {transcript.map((msg, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.isAgent ? 'flex-start' : 'flex-end', marginBottom: 10, animation: 'slide-in 0.3s ease both' }}>
            <div style={{ maxWidth: '88%', background: msg.isAgent ? '#F5F0E8' : '#2D4A3E', color: msg.isAgent ? '#2D4A3E' : 'white', borderRadius: msg.isAgent ? '4px 14px 14px 14px' : '14px 4px 14px 14px', padding: '10px 14px' }}>
              <p style={{ fontSize: 13, lineHeight: 1.55 }}>{msg.text}</p>
            </div>
            <span style={{ fontSize: 11, color: '#B0C4B8', marginTop: 3, padding: '0 4px' }}>{msg.time}</span>
          </div>
        ))}
        {isAgentSpeaking && (
          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
            <div style={{ background: '#F5F0E8', borderRadius: '4px 14px 14px 14px', padding: '12px 16px', display: 'flex', gap: 5, alignItems: 'center' }}>
              {[0, 0.2, 0.4].map((delay, i) => (
                <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#7BAE8A', animation: `dot-blink 1.4s ease infinite ${delay}s` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={transcriptEndRef} />
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', animation: 'fade-in-up 0.5s 0.5s ease both', opacity: 0 }}>
        <button
          onClick={() => { conversation.endSession(); onEnd(); }}
          style={{ padding: '0 32px', height: 52, borderRadius: 26, background: 'rgba(45,74,62,0.08)', border: '1.5px solid rgba(45,74,62,0.15)', cursor: 'pointer', fontFamily: 'var(--font-dm-sans)', fontSize: 14, fontWeight: 500, color: '#2D4A3E', transition: 'all 0.2s', letterSpacing: '0.01em' }}
        >
          Encerrar conversa
        </button>
      </div>

      <p style={{ fontSize: 11, color: '#B0C4B8', marginTop: 24, textAlign: 'center' }}>Pergunta {currentQuestion} de {totalQuestions}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screen 3 — Encerramento
// ---------------------------------------------------------------------------

function EndScreen({ result, onRestart }: { result: ResultData | null; onRestart: () => void }) {
  return (
    <div style={{ width: '100%', maxWidth: 440, textAlign: 'center', animation: 'fade-in-up 0.6s ease both' }}>
      <div style={{ width: 72, height: 72, background: 'linear-gradient(135deg, #2D4A3E, #4A8068)', borderRadius: '50%', margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(45,74,62,0.30)' }}>
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path d="M8 16L13 21L24 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 style={{ fontFamily: 'var(--font-dm-serif)', fontSize: 28, color: '#1E3328', marginBottom: 10 }}>Conversa concluída</h2>

      {result ? (
        <>
          <p style={{ fontSize: 16, color: '#4A6358', lineHeight: 1.65, marginBottom: 24 }}>{result.summary}</p>

          {result.supportResources.urgent && (
            <div style={{ background: 'rgba(220,80,80,0.08)', border: '1px solid rgba(220,80,80,0.25)', borderRadius: 14, padding: '16px 20px', marginBottom: 20, textAlign: 'left' }}>
              <p style={{ fontSize: 14, color: '#8B3030', lineHeight: 1.6 }}>⚠️ {result.supportResources.message}</p>
            </div>
          )}

          <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: 18, padding: '20px 24px', border: '1px solid rgba(255,255,255,0.7)', textAlign: 'left', marginBottom: 20 }}>
            <p style={{ fontSize: 12, color: '#7B9E8E', lineHeight: 1.55 }}>{result.disclaimer}</p>
          </div>

          {!result.supportResources.urgent && (
            <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: 18, padding: '16px 20px', marginBottom: 20, textAlign: 'left' }}>
              <p style={{ fontSize: 13, color: '#4A6358' }}>{result.supportResources.message}</p>
            </div>
          )}
        </>
      ) : (
        <p style={{ fontSize: 16, color: '#4A6358', lineHeight: 1.65, marginBottom: 32 }}>Obrigado por participar. Seu resultado individual será processado em breve.</p>
      )}

      <button onClick={onRestart} style={{ padding: '14px 40px', background: '#2D4A3E', color: 'white', border: 'none', borderRadius: 12, fontFamily: 'var(--font-dm-sans)', fontSize: 15, fontWeight: 500, cursor: 'pointer', boxShadow: '0 4px 16px rgba(45,74,62,0.25)' }}>
        Recomeçar
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ScreeningPage({ params }: { params: { token: string } }) {
  const { token } = params;

  const [screen, setScreen] = useState<Screen>('identify');
  const [consentLoading, setConsentLoading] = useState(false);
  const [signedUrl, setSignedUrl] = useState('');
  const [assessmentId, setAssessmentId] = useState('');
  const [result, setResult] = useState<ResultData | null>(null);
  const [currentQuestion] = useState(1);
  const totalQuestions = 9;

  const handleIdentify = useCallback((_nome: string, _email: string) => {
    // Identity collection is optional and handled server-side via the magic link.
    setScreen('consent');
  }, []);

  const handleConsentAndStart = useCallback(async (shareAggregate: boolean) => {
    setConsentLoading(true);
    try {
      await fetch(`${API}/assessments/${token}/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareAggregate }),
      });
      const res = await fetch(`${API}/assessments/${token}/call`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to start call');
      const data: { signedUrl: string; assessmentId: string } = await res.json();
      setSignedUrl(data.signedUrl);
      setAssessmentId(data.assessmentId);
      setScreen('voice');
    } catch (err) {
      console.error(err);
      alert('Não foi possível iniciar a conversa. Tente novamente.');
    } finally {
      setConsentLoading(false);
    }
  }, [token]);

  const handleEnd = useCallback(async () => {
    setScreen('end');
    // Poll for result (ElevenLabs webhook may take a moment)
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const res = await fetch(`${API}/assessments/${token}/result`);
        if (res.ok) {
          const data: ResultData = await res.json();
          setResult(data);
          break;
        }
      } catch {
        // keep polling
      }
    }
  }, [token]);

  const handleRestart = useCallback(() => {
    setScreen('identify');
    setSignedUrl('');
    setAssessmentId('');
    setResult(null);
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'radial-gradient(ellipse at 30% 20%, #E8F0E8 0%, #F2EBE0 55%, #EDE3D6 100%)' }}>
      {screen === 'identify' && <IdentifyScreen onContinue={handleIdentify} />}
      {screen === 'consent' && <ConsentScreen onStart={handleConsentAndStart} loading={consentLoading} />}
      {screen === 'voice' && signedUrl && (
        <VoiceScreen
          signedUrl={signedUrl}
          assessmentId={assessmentId}
          currentQuestion={currentQuestion}
          totalQuestions={totalQuestions}
          onEnd={handleEnd}
        />
      )}
      {screen === 'end' && <EndScreen result={result} onRestart={handleRestart} />}
    </div>
  );
}
