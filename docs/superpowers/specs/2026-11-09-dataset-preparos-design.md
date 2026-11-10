# Enriquecimento documentado dos preparos

## Intenção

Incorporar ao catálogo as novas orientações documentais recebidas sem alterar a associação `preparo_id` dos exames. O paciente só deve receber orientações sustentadas por documento e sem conflito documental não resolvido.

## Objetivos

- Manter `data/exames.json` como catálogo de exames e `preparo_id` como chave para `data/preparos.json`.
- Atualizar grupos existentes em `data/preparos.json` com informações novas, documentadas e compatíveis com a orientação já cadastrada.
- Incluir os fatos usados em `data/documentary-evidence.json`, com origem, hash, localizador e trecho literal.
- Registrar cada conflito documental em `data/conflitos.json`, sem escolher uma versão clínica.
- Criar uma tarefa Linear para a UDI decidir os conflitos e indicar a atualização posterior.

## Não objetivos

- Não criar um campo de preparo em cada exame.
- Não duplicar textos de preparo entre exames.
- Não inferir preparo a partir de modalidade, região ou prática clínica.
- Não substituir instruções conflitantes antes da decisão da UDI.

## Restrições

- `preparo_id` continua a única associação do exame ao preparo.
- Fontes novas não demonstram homologação clínica; fatos entram como `documentary-only` e estados seguros permanecem `parcial` ou `pendente` quando aplicável.
- Medicamentos, restrições e instruções para internados não serão adicionados à orientação ao paciente quando não houver decisão documentada.

## Abordagens consideradas

1. Atualizar os grupos existentes, registrar evidências e isolar conflitos em arquivo próprio. **Escolhida.** Mantém uma fonte operacional por preparo e preserva rastreabilidade e segurança.
2. Substituir orientações pelos documentos escaneados. Rejeitada, porque há instruções conflitantes.
3. Apenas arquivar fontes novas. Rejeitada, porque não melhora informações já confirmadas no sistema.

## Desenho

`data/preparos.json` continuará guardando a orientação consolidada de cada grupo. Novos `fact_ids` apontarão para fatos documentais em `data/documentary-evidence.json`.

`data/conflitos.json` terá um registro por decisão pendente: identificador, assunto, grupos de preparo afetados, documentos e localizadores conflitantes, impacto e estado `pendente_udi`. Não participa da composição da resposta ao paciente.

Depois de a UDI decidir, a informação final deve ser atualizada no grupo pertinente de `data/preparos.json` e o fato correspondente em `data/documentary-evidence.json`; então o registro em `data/conflitos.json` deve apontar para a decisão e mudar para `resolvido`. Se a decisão alterar o vínculo de um exame, a mudança deve ocorrer em `data/exam-preparation-associations.json`, seguida da reingestão de `data/exames.json`.

## Verificação

- Validar a ingestão e as chaves de preparo.
- Validar hashes e referências de evidência.
- Adicionar testes de regressão para preparos enriquecidos e para a exclusão de dados conflitantes nas respostas.
