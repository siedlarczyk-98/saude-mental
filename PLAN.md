# Plan: MVP de rastreio conversacional (BAT) com arcabouço multi-escala

> Handoff para o Claude Code. Este documento é autocontido: assume apenas o
> banco de dados já criado (ver "Contexto / o que já existe"). Implementar na
> ordem das tasks. Pausar e perguntar se uma regra de negócio estiver ambígua.

---

## Goal

Um trabalhador recebe um convite, dá consentimento, conversa **por voz** com um
agente (ElevenLabs Conversational AI) e o sistema produz um **feedback
individual privado** com sua faixa de risco de burnout. Toda a lógica
(conversa, pontuação, banding) roda sobre um motor **agnóstico de instrumento**:
o BAT é o primeiro registrado, e adicionar GAD-7 ou outra escala depois é
"inserir dado de referência + um objeto de config", sem tocar no motor.

Fora do escopo deste MVP: dashboard do RH / relatórios agregados (a infra de
agregação existe no banco, mas a UI/endpoint fica para depois). Prioridade é ver
a interação por voz funcionando de verdade.

## Approach

Motor dirigido por instrumento. Conversa, pontuação e banding são serviços
genéricos parametrizados por uma `InstrumentConfig`. Nenhum código de negócio
referencia "BAT" pelo nome — só o arquivo de config e o seed do BAT fazem isso.

Para o MVP, a pontuação usa a **Data Collection pós-call** do ElevenLabs (mais
simples): cada item do instrumento vira um campo de extração que devolve o score
(mapeado para a escala de frequência) ou `null`. O loop de cobertura ao vivo
(webhook mid-call) fica como upgrade de acurácia numa v2.

**Stack: TypeScript ponta-a-ponta.** O avatar de voz do ElevenLabs roda no
browser via SDK JS de qualquer forma; manter uma linguagem só evita split,
permite compartilhar os tipos de `InstrumentConfig` entre back e front, e
simplifica o handoff. Backend: **Fastify**. Acesso a dados: **Kysely** (SQL
tipado) — não Prisma, porque o schema é multi-schema, com matview e colunas
`bytea` criptografadas, escritos à mão, e queremos manter controle total.
Validação de borda: **Zod**. Front: **Next.js** + **@elevenlabs/react** (SDK de
conversação).

---

## Contexto / o que já existe

O banco PostgreSQL (Railway) já está criado por `bat_rebuild.sql`. Schemas:

- `instrument` — dado de referência: `instruments`, `subscales`, `items`,
  `response_options`, `norms` (cutoffs). **BAT já está semeado** (32 itens, 6
  subescalas: 4 primárias + 2 secundárias; escala de frequência 1–5).
- `core` — `companies`, `departments`, `participants` (pseudônimo, sem PII).
- `identity` — `participant_identities` (PII criptografada, **atrás da fronteira
  de confiança**; nunca lido no caminho de pontuação/relatório).
- `assessment` — `consents`, `assessments`, `item_responses`,
  `response_evidence` (verbatim, sensível), `coverage_snapshots`,
  `assessment_scores`, `safety_events`.
- `analytics` — matview `dept_subscale_aggregates` com supressão por N≥5.
- `audit` — `access_log`.

Pontos-chave do schema:
- `item_responses.score` é **nullable de propósito**: `null` = item não coberto,
  nunca zero. `frequency_set` indica se a frequência foi ancorada.
- `assessment_scores.subscale_id` nulo = score total do assessment.
- `norms` tem cutoffs **PLACEHOLDER** — não são os valores validados pt-BR ainda.

### Migration pendente (Task 0)

O `CHECK (score BETWEEN 1 AND 5)` em `assessment.item_responses` é específico do
BAT (escala 1–5) e quebraria o GAD-7 (escala 0–3). Relaxar agora:

```sql
-- migrations/002_score_range.sql
ALTER TABLE assessment.item_responses DROP CONSTRAINT item_responses_score_check;
ALTER TABLE assessment.item_responses ADD CONSTRAINT item_responses_score_check
  CHECK (score BETWEEN 0 AND 5);
```

A faixa real por instrumento passa a ser validada na aplicação contra
`InstrumentConfig.responseScale` (o CHECK do banco vira só um guarda-corpo amplo).

---

## A abstração central: `InstrumentConfig`

Vive em `packages/shared`. É o único lugar onde escalas diferem.

```ts
interface InstrumentConfig {
  code: string;                          // 'BAT' | 'GAD-7'
  instrumentId: string;                  // uuid do registro em instrument.instruments
  scoringMethod: 'mean' | 'sum';         // BAT = mean; GAD-7 = sum
  responseScale: { min: number; max: number };  // BAT {1,5}; GAD-7 {0,3}
  completenessFloor: number;             // % mínimo de itens p/ liberar banda (ex.: 80)
  totalIncludes: 'primary' | 'all';      // BAT: total só sobre subescalas primárias
  clusters: ClusterDef[];                // como os itens viram temas de conversa
  agentPromptTemplate: string;           // system prompt do agente p/ esse instrumento
  dataCollectionSpec: FieldSpec[];       // 1 por item: nome do campo + prompt de extração
}

interface ClusterDef {
  code: string;                          // 'energy', 'work_relation', ...
  itemNumbers: number[];                 // itens cobertos por este tema
  openingPrompts: string[];              // aberturas naturais p/ o agente
}

interface FieldSpec {
  itemNumber: number;                    // liga ao item em instrument.items
  fieldName: string;                     // nome do campo de Data Collection no ElevenLabs
  extractionPrompt: string;              // instrução de extração (mapeia fala -> score | null)
}
```

Adicionar GAD-7 no futuro = (a) seed do instrumento/itens/norms no banco +
(b) um `gad7.ts` exportando uma `InstrumentConfig` + (c) registrar no registry.
Zero mudança no motor.

---

## Regras de negócio

São a especificação da lógica. Implementar como funções puras testáveis no
serviço correspondente, não espalhadas pelos handlers.

**BR-1 — Agnosticismo de instrumento.** Nenhum código de negócio referencia um
instrumento pelo nome. Tudo opera sobre `InstrumentConfig` + dado de referência.
O único acoplamento ao BAT permitido é o arquivo `configs/bat.ts` e o seed.

**BR-2 — Pontuação por item.** Cada item recebe um score na escala do
instrumento (`responseScale`) ou `null`. `null` = não coberto na conversa;
**nunca** tratado como zero; **excluído** da agregação; conta contra a completude.

**BR-3 — Pontuação por subescala.** Score da subescala = agregação dos scores
não-nulos de seus itens conforme `scoringMethod` (BAT: média; GAD-7: soma).

**BR-4 — Score total.** Agregação conforme `scoringMethod` sobre os itens das
subescalas elegíveis por `totalIncludes`. Para o BAT, `totalIncludes = 'primary'`:
o score de burnout é a média só das subescalas primárias; as secundárias
(queixas psicológicas/psicossomáticas) têm score próprio e **não** entram no total.

**BR-5 — Gating por completude.** `completeness` = % de itens (do escopo) com
score não-nulo. Se `completeness < completenessFloor`, a `band` é `null` e o
resultado é marcado como **inconclusivo** — nunca se atribui faixa de risco com
dado insuficiente.

**BR-6 — Banding por norma.** A faixa (`green`/`orange`/`red`) é determinada
buscando o score computado contra `instrument.norms` para aquele instrumento e
escopo. Faixas **nunca** são hardcoded. **Guarda:** enquanto `norms` estiver
marcada como placeholder (cutoffs não validados), o sistema mostra o score mas
rotula "calibração pendente" e **não** apresenta a faixa como clínica.

**BR-7 — Ancoragem de frequência.** Um sintoma só vira score quando a frequência
foi estabelecida (`frequency_set = true`). Intensidade sem frequência → `null`,
não um score chutado. (Reforçado no prompt de extração de cada item.)

**BR-8 — Consentimento (LGPD).** Nenhum assessment inicia sem um `consent` ativo
cujos `scopes` permitam o rastreio. Consentimento é **append-only**; revogação
seta `revoked_at` e bloqueia processamento/agregação posteriores.
Compartilhamento agregado exige `scopes.share_aggregate = true`.

**BR-9 — Fronteira de identidade.** PII vive só em `identity`. Nenhuma query de
pontuação ou relatório faz join com `identity`. O resultado individual é visível
**apenas ao próprio participante**. (Empregador só veria agregados com N≥5 — fora
do MVP, mas a regra e a matview já valem.)

**BR-10 — Segurança / crise.** Qualquer sinal de crise (ideação, sofrimento
intenso) detectado cria um `safety_event` e **dispara imediatamente** recursos de
apoio ao participante. Severidade alta/crítica pode marcar o assessment como
`flagged`. A detecção roda independentemente da completude, e o recurso **nunca**
é bloqueado ou atrasado por trás da pontuação.

**BR-11 — Entrega do resultado.** O participante recebe um resumo em linguagem
simples do **próprio** resultado, sempre com a ressalva "isto é um rastreio, não
um diagnóstico" e com enquadramento de apoio.

---

## Estrutura do projeto

```
/migrations
  001_schema.sql            (= bat_rebuild.sql, já aplicado)
  002_score_range.sql       (Task 0)
/packages
  /shared
    instrument-config.ts    (InstrumentConfig, ClusterDef, FieldSpec)
/apps
  /api                      (Fastify)
    /src
      /db                   (Kysely: conexão + tipos gerados do schema)
      /instrument
        types.ts
        registry.ts         (resolve config por code)
        configs/bat.ts      (a InstrumentConfig do BAT)
      /consent              (BR-8)
      /assessment           (ciclo de vida: invite, magic-link, estado)
      /elevenlabs           (provisionamento do agente + webhook pós-call)
      /scoring              (BR-2..BR-6: motor de pontuação)
      /safety               (BR-10)
      /http                 (rotas + validação Zod + envelope de erro)
      server.ts
  /web                      (Next.js)
    /app
      /screening/[token]    (consentimento -> widget de voz -> resumo)
```

---

## Tasks

Ordenadas por dependência.

1. **Migration 002** — relaxar o CHECK de score para `0..5` — `migrations/`
2. **Setup Kysely** — conexão + geração de tipos a partir do schema existente —
   `apps/api/src/db/`
3. **Tipos compartilhados** — `InstrumentConfig`, `ClusterDef`, `FieldSpec` —
   `packages/shared/`
4. **Módulo de instrumento** — `registry.ts` + `configs/bat.ts` (clusters, prompt
   template, dataCollectionSpec dos 32 itens) — `apps/api/src/instrument/`
5. **Módulo de consentimento** (BR-8) — criar/registrar consentimento append-only,
   checar consentimento ativo — `apps/api/src/consent/`
6. **Ciclo de vida do assessment** — `POST /assessments` (cria participante +
   assessment + token de magic-link), `GET /assessments/:token` (estado) —
   `apps/api/src/assessment/` + `http/`
7. **Integração ElevenLabs** — (a) script/serviço que provisiona o agente a partir
   da `InstrumentConfig` (system prompt + campos de Data Collection); (b)
   `POST /webhooks/elevenlabs` que recebe o transcript + data collection
   pós-call, valida (Zod), normaliza e grava `item_responses` (com `frequency_set`
   e `null` quando ausente) — `apps/api/src/elevenlabs/`
8. **Serviço de pontuação** (BR-2..BR-6) — função pura
   `score(assessment, config, norms) -> { subscaleScores, total, completeness,
   band }`; persiste em `assessment_scores`; respeita o gating de completude e a
   guarda de norma placeholder — `apps/api/src/scoring/`
9. **Módulo de segurança** (BR-10) — detecção de crise sobre transcript/eventos do
   webhook, grava `safety_events`, sinaliza necessidade de recurso —
   `apps/api/src/safety/`
10. **Entrega do resultado** (BR-11) — `GET /assessments/:token/result`: resumo
    individual em linguagem simples, com ressalva e recursos —
    `apps/api/src/assessment/` + `http/`
11. **Front — fluxo do participante** — página por token: tela de consentimento →
    widget de voz (`@elevenlabs/react`) → tela de resumo. Dispara recurso de apoio
    se o backend sinalizar evento de segurança — `apps/web/app/screening/`
12. **Testes** — ver Verification.

---

## Riscos & decisões

- **Cutoffs pt-BR são placeholder.** Por BR-6, enquanto não validados, o sistema
  mostra score com "calibração pendente" e não apresenta faixa clínica. Substituir
  `instrument.norms` pelos valores oficiais antes de uso real. **(Resolvido: a
  regra cobre o estado provisório; não bloqueia o MVP.)**
- **BAT-12 vs asteriscos.** O flag `short_version` no seed seguiu os asteriscos
  fornecidos, que somaram 11 (o BAT-12 tem 12). Conferir contra o artigo de
  validação. Não afeta o MVP (que usa o BAT completo).
- **Provisionamento do agente ElevenLabs.** Decidir se o agente é criado/atualizado
  via API no deploy ou configurado uma vez no dashboard. Recomendo via API a partir
  da config, para manter o agente como derivado da `InstrumentConfig` (fonte única).
- **Detecção de crise (BR-10).** No MVP, detecção simples baseada no
  transcript/sinais do ElevenLabs é aceitável, desde que o recurso seja sempre
  oferecido. Não prometer triagem clínica.

## Verification

Entregar junto com o testing skill.

- **Unitário (scoring, o coração):** média (BAT) vs soma (GAD-7 simulado);
  completude abaixo do piso → `band` nula (inconclusivo); item `null` não conta
  como zero nem entra na média; total do BAT ignora subescalas secundárias
  (BR-4); guarda de norma placeholder não apresenta faixa clínica.
- **Unitário (consentimento):** assessment não inicia sem consentimento ativo;
  revogação bloqueia processamento (BR-8).
- **Integração (webhook):** payload fake de Data Collection → `item_responses`
  corretos, com `frequency_set` e `null` preservados.
- **Integração (segurança):** sinal de crise no payload → `safety_event` criado e
  flag de recurso retornada, independentemente da completude (BR-10).
- **Manual (E2E):** convite → consentimento → conversa de voz curta → ver o
  resumo individual com a ressalva. Confirmar que a PII nunca aparece em nenhuma
  query de pontuação/resultado (BR-9).
```
