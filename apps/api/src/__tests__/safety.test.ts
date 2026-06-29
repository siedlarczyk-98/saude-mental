import { detectCrisisSignals } from '../safety/safety.service.js';

describe('detectCrisisSignals', () => {
  test('detecta ideação suicida como critical', () => {
    const signals = detectCrisisSignals('eu estou pensando em me matar');
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.some((s) => s.severity === 'critical')).toBe(true);
  });

  test('detecta desespero como high', () => {
    const signals = detectCrisisSignals('eu simplesmente não aguento mais');
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.some((s) => s.severity === 'high')).toBe(true);
  });

  test('texto neutro não gera sinais', () => {
    const signals = detectCrisisSignals(
      'estou cansado do trabalho mas me sinto bem com minha família',
    );
    expect(signals).toHaveLength(0);
  });

  test('retorna sinal mesmo quando pontuação seria inconclusiva (BR-10)', () => {
    // A detecção não depende de completude
    const transcript = 'só tenho um item mas quero morrer';
    const signals = detectCrisisSignals(transcript);
    expect(signals.length).toBeGreaterThan(0);
  });
});
