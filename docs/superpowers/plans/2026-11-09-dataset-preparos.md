# Preparos documentados e conflitos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar as orientações novas comprovadas no catálogo de preparos e separar todas as divergências documentais para decisão da UDI.

**Architecture:** `preparo_id` continua a ligar cada exame ao grupo em `data/preparos.json`. Fatos rastreáveis ficam em `data/documentary-evidence.json` e são usados apenas quando se aplicam ao código do exame. `data/conflitos.json` registra alternativas incompatíveis e não participa da composição de respostas; o verificador bloqueia referências quebradas ou estados de conflito inválidos.

**Tech Stack:** JSON, Node.js ESM, Vitest, Next.js existente.

**Spec:** `docs/superpowers/specs/2026-11-09-dataset-preparos-design.md`

## Global Constraints

- Não criar campo de preparo por exame nem alterar o contrato de `preparo_id`.
- Nunca escolher uma orientação clínica entre fontes conflitantes.
- Todo fato novo usa `validation: "pending-udi"`, origem, SHA-256, localizador e trecho literal.
- Não expor dose, nome comercial ou instrução de medicamento ao paciente.
- Uma decisão futura da UDI atualiza `preparos.json`, `documentary-evidence.json`, `conflitos.json` e, somente se necessário, `exam-preparation-associations.json` seguido de `npm run ingest`.

## Review Focus

- Conflito pendente não pode ser usado pela resposta ao paciente; cobrir em `lib/documentary-evidence.test.ts`.
- Todo `preparo_id` citado por conflito deve existir; cobrir em `scripts/verify-documentary-evidence.test.mjs`.
- Todo documento citado pelo conflito deve existir no registro de fontes e ter hash; cobrir no mesmo teste.
- Um fato novo de RX só aparece para seus códigos AGHU explícitos; cobrir em `lib/documentary-evidence.test.ts`.
- Um preparo com medicamento continua devolvendo orientação de confirmação, sem dose nem medicamento; cobrir em `lib/documentary-evidence.test.ts`.

---

## File Structure

- Create: `data/conflitos.json` — divergências clínicas pendentes, alternativas documentais e resolução futura.
- Modify: `data/documentary-evidence.json` — fontes dos dois PDFs escaneados e fatos não conflitantes de RX.
- Modify: `data/preparos.json` — associar somente fatos seguros aos grupos `preparo_id` já existentes.
- Modify: `scripts/verify-documentary-evidence.mjs` — validar integridade de conflitos e vínculos com fontes/preparos.
- Create: `scripts/verify-documentary-evidence.test.mjs` — testes unitários do verificador.
- Modify: `lib/documentary-evidence.test.ts` — testes de recuperação e apresentação segura dos fatos novos.

### Task 1: Validar o registro de conflitos

**Files:**
- Create: `data/conflitos.json`
- Modify: `scripts/verify-documentary-evidence.mjs`
- Create: `scripts/verify-documentary-evidence.test.mjs`

**Interfaces:**
- Consumes: `documentary-evidence.sources`, `preparos.preparos` e `conflitos.conflitos`.
- Produces: `validateDocumentaryEvidence({ evidence, preparations, exams, conflicts }): void`, exportada por `scripts/verify-documentary-evidence.mjs`; o CLI continua a imprimir o resumo atual quando os dados forem válidos.

- [ ] **Step 1: Escrever os testes que falham para conflitos válidos e inválidos**

Em `scripts/verify-documentary-evidence.test.mjs`, importar `validateDocumentaryEvidence` e criar fixtures mínimas. Verificar aceitação de um conflito `pending-udi` com `id` único, `preparo_ids` existentes, alternativas que referenciam `sourceId` conhecido e `linearIssue: "PRO-34"`. Verificar rejeição de `id` duplicado, `preparo_id` inexistente, `sourceId` inexistente, estado fora de `pending-udi|resolvido` e conflito resolvido sem `decision` e `resolvedAt`.

- [ ] **Step 2: Executar o teste para confirmar a falha**

Run: `npm test -- scripts/verify-documentary-evidence.test.mjs`

Expected: FAIL porque `validateDocumentaryEvidence` ainda não é exportada.

- [ ] **Step 3: Implementar `validateDocumentaryEvidence` em `scripts/verify-documentary-evidence.mjs`**

Extrair a validação atual de fatos e associações para a função exportada. Adicionar validação de `conflitos.json`: `version: 1`, array `conflitos`, IDs únicos, estados permitidos, ao menos duas alternativas por conflito pendente, cada alternativa com `sourceId`, `locator`, `quote` e texto de orientação, referências a `preparo_ids` existentes e resolução completa quando `status` for `resolvido`. O CLI lê `data/conflitos.json` e invoca essa função antes de imprimir o resumo.

- [ ] **Step 4: Criar `data/conflitos.json` com as decisões pendentes**

Adicionar três registros `pending-udi`, todos vinculados a `PRO-34`:

- `rx-enema-opaco-pediatrico-preparo`: contrapõe a folha de criança a partir de 7 anos, com bisacodil e jejum de 6h, à folha que diz que criança não precisa de preparo; afeta `rx_enema_opaco_crianca` e `rx_enema_opaco_adulto`.
- `us-abdomen-preparo-e-contato`: contrapõe jejum de 4–6h e telefone 3884 ao jejum de 8h, simeticona, água/bexiga e telefone 3898; afeta `us_abdômen` e `us_pelvica_vias_urinarias` somente como possível escopo a decidir.
- `rx-histerossalpingografia-versao-vigente`: registra a anotação manuscrita “último” como necessidade de confirmar a versão vigente; afeta `rx_histerossalpingografia`.

Cada alternativa referencia uma fonte registrada em `documentary-evidence.json`, página ou parágrafo, citação literal, sem declarar uma orientação vencedora. Incluir no arquivo a regra de atualização pós-UDI definida na PRO-34.

- [ ] **Step 5: Executar os testes e o verificador**

Run: `npm test -- scripts/verify-documentary-evidence.test.mjs && npm run audit:evidence`

Expected: PASS; o verificador mantém a contagem de fatos e informa a contagem de conflitos pendentes.

- [ ] **Step 6: Commit**

```bash
git add data/conflitos.json scripts/verify-documentary-evidence.mjs scripts/verify-documentary-evidence.test.mjs
git commit -m "feat: track documentary preparation conflicts"
```

### Task 2: Registrar fontes e fatos não conflitantes de raio-X

**Files:**
- Modify: `data/documentary-evidence.json`
- Modify: `data/preparos.json`
- Modify: `lib/documentary-evidence.test.ts`

**Interfaces:**
- Consumes: fontes escaneadas, códigos AGHU `RXESO`, `RXTDE`, `RXTIN`, `RXUR1`, `RXUR4`, `RXURE` e `RXURP`.
- Produces: fatos `rx-esofago-jejum`, `rx-transito-intestinal-jejum`, `rx-urografia-preparo-documentado` e `rx-uretrocistografia-preparo-documentado`, ligados exclusivamente a `rx_esofago`, `rx_transito_intestinal`, `rx_urografia_excretora` e aos respectivos grupos de uretrocistografia.

- [ ] **Step 1: Escrever testes de recuperação segura que falham**

Em `lib/documentary-evidence.test.ts`, testar que o exame `RXESO` apresenta jejum de 6 horas com evidência do PDF escaneado; `RXTDE` e `RXTIN` apresentam somente o jejum de 6 horas; urografia e uretrocistografia apresentam aviso de confirmar instruções medicamentosas sem mostrar `Dulcolax`, `Norfloxacino`, dose ou horário. Assegurar que `RXHIS` e ambos os preparos de enema não recebem fatos novos enquanto seus conflitos estiverem pendentes.

- [ ] **Step 2: Executar o teste para confirmar a falha**

Run: `npm test -- lib/documentary-evidence.test.ts`

Expected: FAIL porque os novos fatos e vínculos ainda não existem.

- [ ] **Step 3: Adicionar fontes e fatos em `data/documentary-evidence.json`**

Registrar `Exames escaneados.pdf` com SHA-256 `146d1fb27928c0298caf345ce15201e7c48e9a720ad5ff19863f736f9b140d10` e `Scanned 9 Nov 2026 at 180448.pdf` com SHA-256 `7831ddb32cad3a72141b707ccb8c157c1a2789fe3d718d47555330fab87fbae0`; ambas devem indicar aprovação clínica não demonstrada.

Adicionar somente fatos confirmados pelas folhas e sem conflito: jejum de 6h para esôfago (`RXESO`) e trânsito intestinal (`RXTDE`, `RXTIN`); para urografia (`RXUR1`, `RXUR4`) e uretrocistografia (`RXURE`, `RXURP`), registrar que há um preparo documentado que envolve medicamento e exige confirmação com a UDI, sem transcrever medicamento, dose ou cronograma. Cada fato recebe página, trecho literal, `validation: "pending-udi"` e modalidade `radiologia_convencional`.

- [ ] **Step 4: Ligar os fatos aos grupos existentes em `data/preparos.json`**

Acrescentar os IDs em `fact_ids` de `rx_esofago`, `rx_transito_intestinal`, `rx_urografia_excretora`, `rx_uretrocistografia_adulto` e `rx_uretrocistografia_crianca`. Manter `status` atual e não mudar `preparo_id`, `orientacoes` herdadas ou os grupos de enema/histerossalpingografia enquanto há conflito pendente.

- [ ] **Step 5: Executar testes de dados e regressão**

Run: `npm test -- lib/documentary-evidence.test.ts && npm run ingest:check && npm run audit:evidence`

Expected: PASS; os fatos novos têm origem verificável, cada código recebe somente seu preparo e nenhuma resposta do paciente exibe medicamento/dose.

- [ ] **Step 6: Commit**

```bash
git add data/documentary-evidence.json data/preparos.json lib/documentary-evidence.test.ts
git commit -m "feat: trace documented radiology preparations"
```

### Task 3: Verificar catálogo completo e preservar a fronteira clínica

**Files:**
- Modify: `lib/documentary-evidence.test.ts`
- Modify: `evaluation/cases.json`

**Interfaces:**
- Consumes: fatos ligados aos preparos e conflitos pendentes.
- Produces: regressão automatizada que impede expor alternativas conflitantes ou medicamentos em respostas ao paciente.

- [ ] **Step 1: Escrever casos de avaliação que falham**

Adicionar casos provisórios para esôfago e trânsito intestinal que esperam jejum de 6 horas com confirmação da UDI. Adicionar casos para enema pediátrico e ultrassom abdominal que proíbem escolher entre alternativas conflitantes novas; a resposta deve permanecer na orientação já documentada e indicar confirmação com o setor.

- [ ] **Step 2: Executar avaliação para confirmar a falha**

Run: `npm run eval:fallback`

Expected: FAIL ou diferença no relatório enquanto os casos novos não estiverem cobertos.

- [ ] **Step 3: Ajustar somente a lógica necessária de composição**

Se os testes revelarem que um `fact_ids` novo substitui indevidamente conteúdo seguro do grupo, ajustar `lib/answer-composer.ts` para mesclar apenas fatos aplicáveis e não medicamentosos, preservando o aviso de confirmação. Não alterar busca, identificação de exame ou o contrato de `preparo_id`.

- [ ] **Step 4: Executar a verificação final**

Run: `npm test && npm run ingest:check && npm run audit:catalog:check && npm run audit:evidence && npm run eval:fallback`

Expected: todos os comandos passam; não há FK inválida, evidência quebrada, orientação clínica inferida ou medicamento exposto.

- [ ] **Step 5: Commit**

```bash
git add lib/documentary-evidence.test.ts evaluation/cases.json lib/answer-composer.ts
git commit -m "test: cover documented preparation conflicts"
```

## Self-Review

- A estrutura do plano cobre o uso contínuo de `preparo_id`, fatos com origem, conflitos isolados e a tarefa PRO-34.
- Cada risco do Review Focus possui um teste na tarefa responsável.
- As únicas interfaces novas são o validador exportado e o formato estático de `conflitos.json`; não há serviço, dependência ou campo por exame novo.
- A Task 2 não atualiza conflitos como se fossem decisões clínicas; a Task 3 só altera o compositor se a nova evidência revelar substituição indevida.
