import type { InstrumentConfig } from '../../shared.js';

// UUID deve bater com o registro semeado em instrument.instruments para o BAT.
// Substituir pelo valor real após confirmar no banco.
const BAT_INSTRUMENT_ID = '00000000-0000-0000-0000-0000000000b1';

// ---------------------------------------------------------------------------
// extractionSpec — 1 FieldSpec por item do BAT (32 itens)
// Cada extractionPrompt instrui o LLM-2 a extrair a pontuação de frequência
// da transcrição para o valor inteiro 1-5 ou null (BR-7).
// ---------------------------------------------------------------------------

function itemSpec(
  itemNumber: number,
  theme: string,
): { itemNumber: number; extractionPrompt: string } {
  return {
    itemNumber,
    extractionPrompt:
      `For item ${itemNumber} (theme: ${theme}): extract the frequency score from the participant's speech. ` +
      `Map to integer 1 (never) 2 (rarely) 3 (sometimes) 4 (often) 5 (always). ` +
      `Return null if the participant did not address this topic OR if they described ` +
      `intensity/severity without establishing how OFTEN it occurs — frequency must be explicit.`,
  };
}

export const batConfig: InstrumentConfig = {
  code: 'BAT',
  instrumentId: BAT_INSTRUMENT_ID,
  scoringMethod: 'mean',
  responseScale: { min: 1, max: 5 },
  completenessFloor: 80,
  totalIncludes: 'primary',

  // -------------------------------------------------------------------
  // Clusters — agrupam itens por tema para a conversa guiada
  // Subescalas primárias do BAT:
  //   exhaustion (1-8), mental_distance (9-14),
  //   cognitive_impairment (15-20), emotional_impairment (21-26)
  // Secundárias:
  //   psychological_complaints (27-29), psychosomatic_complaints (30-32)
  // -------------------------------------------------------------------
  clusters: [
    {
      code: 'energy',
      itemNumbers: [1, 2, 3, 4, 5, 6, 7, 8],
      openingPrompts: [
        'Como você tem se sentido em termos de energia e disposição no trabalho ultimamente?',
        'Você consegue me contar como anda seu nível de energia durante o dia de trabalho?',
        'Fale um pouco sobre como você se sente fisicamente ao longo da semana de trabalho.',
      ],
    },
    {
      code: 'mental_distance',
      itemNumbers: [9, 10, 11, 12, 13, 14],
      openingPrompts: [
        'Como tem sido sua relação com o trabalho em si — você consegue se envolver com ele?',
        'Existe alguma distância ou frieza que você sente em relação às suas tarefas ou colegas?',
        'Me conta se você tem sentido dificuldade de se importar com o trabalho ou as pessoas ao redor.',
      ],
    },
    {
      code: 'cognitive_impairment',
      itemNumbers: [15, 16, 17, 18, 19, 20],
      openingPrompts: [
        'E quanto à sua capacidade de concentração e memória no trabalho — como está?',
        'Você tem percebido alguma dificuldade para pensar com clareza ou tomar decisões?',
        'Fale um pouco sobre como está seu foco e raciocínio nas últimas semanas.',
      ],
    },
    {
      code: 'emotional_impairment',
      itemNumbers: [21, 22, 23, 24, 25, 26],
      openingPrompts: [
        'Como você tem lidado emocionalmente com o trabalho — como estão seus sentimentos no dia a dia?',
        'Você tem se sentido mais irritado, ansioso ou emocionalmente esgotado no trabalho?',
        'Me conta sobre sua vida emocional relacionada ao trabalho.',
      ],
    },
    {
      code: 'psychological_complaints',
      itemNumbers: [27, 28, 29],
      openingPrompts: [
        'Fora do trabalho, como tem sido seu bem-estar geral — sono, humor, sensação geral?',
        'Você tem notado algum sintoma como tristeza, ansiedade ou dificuldade para dormir?',
      ],
    },
    {
      code: 'psychosomatic_complaints',
      itemNumbers: [30, 31, 32],
      openingPrompts: [
        'E fisicamente — você tem sentido algum sintoma no corpo que possa estar relacionado ao estresse do trabalho?',
        'Você tem tido dores de cabeça, tensão muscular, problemas digestivos ou outros sintomas físicos?',
      ],
    },
  ],

  agentPromptTemplate: `Você é um assistente de bem-estar ocupacional empático e profissional. Sua função é conduzir uma conversa de rastreio de burnout baseada no Burnout Assessment Tool (BAT), de forma natural e humanizada — não como um questionário mecânico.

OBJETIVO: Cobrir os 32 itens do BAT organizados em seis temas: energia/exaustão, distância mental, comprometimento cognitivo, comprometimento emocional, queixas psicológicas e queixas psicossomáticas.

ESTILO:
- Converse naturalmente, usando perguntas abertas
- Aprofunde quando o participante trouxer algo relevante
- Valide a experiência da pessoa antes de avançar para o próximo tema
- Nunca revele que está pontuando ou que há uma escala numérica
- Use linguagem acessível, em português do Brasil

COBERTURA DE FREQUÊNCIA (CRÍTICO):
- Para cada sintoma ou experiência que o participante mencionar, certifique-se de entender COM QUE FREQUÊNCIA ele ocorre (nunca, raramente, às vezes, frequentemente, sempre)
- Não assuma frequência a partir de intensidade. Se alguém diz "é muito difícil", pergunte "com que frequência isso acontece?"
- Frequência não estabelecida = dado ausente (não pontuado)

SEGURANÇA:
- Se o participante expressar pensamentos de se machucar, desesperança intensa ou sofrimento severo, priorize imediatamente oferecer recursos de apoio: "Percebo que você está passando por um momento muito difícil. Quero que saiba que há apoio disponível. O CVV atende 24h pelo telefone 188 ou pelo chat em cvv.org.br."
- Registre isso como um sinal de segurança independentemente do progresso da conversa

ENCERRAMENTO:
- Ao cobrir todos os temas, agradeça a participação
- Informe que o resultado individual será disponibilizado em breve
- Reforce que é um rastreio, não um diagnóstico: "Este rastreio ajuda a identificar padrões — se algo te preocupar, converse com um profissional de saúde."`,

  extractionSpec: [
    // Exaustão (subescala primária)
    itemSpec(1, 'physical exhaustion at work'),
    itemSpec(2, 'mental exhaustion at work'),
    itemSpec(3, 'feeling used up / depleted at end of workday'),
    itemSpec(4, 'lack of energy for work'),
    itemSpec(5, 'feeling exhausted in the morning thinking about work'),
    itemSpec(6, 'emotional exhaustion from work'),
    itemSpec(7, 'feeling completely empty after work'),
    itemSpec(8, 'inability to recover from work fatigue'),

    // Distância mental (subescala primária)
    itemSpec(9, 'struggling to find enthusiasm for work'),
    itemSpec(10, 'finding it hard to care about work'),
    itemSpec(11, 'feeling indifferent toward work'),
    itemSpec(12, 'feeling cynical about the meaning of work'),
    itemSpec(13, 'feeling distanced from colleagues or clients'),
    itemSpec(14, 'difficulty feeling involved in work'),

    // Comprometimento cognitivo (subescala primária)
    itemSpec(15, 'difficulty concentrating at work'),
    itemSpec(16, 'difficulty making decisions at work'),
    itemSpec(17, 'forgetting things or being forgetful'),
    itemSpec(18, 'difficulty thinking clearly'),
    itemSpec(19, 'making more mistakes than usual'),
    itemSpec(20, 'struggling to focus on tasks'),

    // Comprometimento emocional (subescala primária)
    itemSpec(21, 'struggling to control emotions at work'),
    itemSpec(22, 'reacting more irritably than intended'),
    itemSpec(23, 'being overly sensitive to criticism'),
    itemSpec(24, 'feeling anxious or stressed at work'),
    itemSpec(25, 'feeling fearful without knowing why'),
    itemSpec(26, 'overreacting emotionally to small things'),

    // Queixas psicológicas (subescala secundária)
    itemSpec(27, 'sleep problems related to work stress'),
    itemSpec(28, 'feeling depressed or sad'),
    itemSpec(29, 'feeling anxious outside of work'),

    // Queixas psicossomáticas (subescala secundária)
    itemSpec(30, 'headaches or migraines related to work stress'),
    itemSpec(31, 'muscle tension or physical pain related to work'),
    itemSpec(32, 'gastrointestinal or other physical symptoms related to work'),
  ],
};
