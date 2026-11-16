# Padrão de dados de preparo

O problema central do projeto é a informação dispersa. No hospital ela está em planilhas, documentos e folhas de papel. Dentro do próprio projeto, os dados já estavam em vários arquivos, cada um com o seu jeito de registrar a origem. Este padrão define **um registro de fontes** e **um formato de orientação** para todos.

## Os dois arquivos

| Arquivo | O que guarda |
|---|---|
| `data/fontes.json` | Registro único dos documentos: título, tipo e hash SHA-256 do arquivo. Todo `sourceId` usado em qualquer arquivo de `data/` precisa existir aqui. |
| `data/orientacoes-preparo.json` | Orientações de preparo atômicas: uma instrução por item, com a fonte e o estado de validação. |

O verificador `npm run data:check` falha se:
- uma fonte for citada sem estar registrada;
- um hash divergir entre arquivos;
- uma sigla não existir no catálogo AGHU;
- um prazo não estiver em ISO 8601;
- um item não tiver o trecho literal da fonte.

A lista `docs/medicamentos-preparo.md` é gerada pelo comando `npm run data:report` e conferida nos testes. Não edite à mão.

## Campos de uma orientação

| Campo | Significado |
|---|---|
| `aplicaA` | `exames` (siglas AGHU) ou `grupo` (grupo de preparo). Exame que não está no catálogo usa `semExameNoCatalogo` |
| `tipo` | jejum, dieta, medicamento, suspensão de medicamento, bexiga, restrição, exame prévio, levar, chegada, agendamento ou outro |
| `texto` | A orientação em linguagem simples, fiel à fonte |
| `momento` | Prazo relativo ao exame em ISO 8601 (`-P1D` = véspera; `PT12H` = 12 horas) |
| `condicao` | Quando a orientação só vale para alguns pacientes (diabético, criança, constipação etc.) |
| `publico` | Para quem é: paciente, médico solicitante, enfermagem do andar ou setor |
| `indispensavel` | Se o exame pode ser suspenso ou perder qualidade sem a orientação |
| `medicamento` | Princípio ativo (nome comercial só como complemento), posologia como está na fonte, classe e se exige receita |
| `fonte` | `id` no registro de fontes, `local` (página ou parágrafo) e `trecho` literal |
| `estado` | documental com validação UDI pendente; conflito pendente; sem fonte documental; ou validado pela UDI |
| `conflito` | Id em `data/conflitos.json` quando há folhas que se contradizem. O dado guarda as duas versões e não escolhe |

### Classes de medicamento

| Classe | Significado |
|---|---|
| A | Indispensável para o exame (preparo intestinal, antibiótico profilático, antialérgico obrigatório) |
| B | Ajuste de remédio de uso contínuo (metformina, cálcio): a decisão é do médico |
| C | Sintomático ou de conforto (simeticona, antiespasmódico) |
| D | Proibição de uso (medicação tópica na mama) |

## Por que este formato

Usamos um formato **inspirado** no HL7 FHIR, o padrão que a Rede Nacional de Dados em Saúde (RNDS) adota. Não implementamos FHIR.
- **Instrução com prazo, condição e responsável:** cada orientação segue a ideia de uma ação de `PlanDefinition`.
- **Origem:** segue a ideia de `Provenance`, com documento, local e trecho.
- **Ciclo de vida:** segue os estados de rascunho e ativo.

Converter para FHIR no futuro exige mapear os campos. Os nomes dos elementos FHIR não foram conferidos campo a campo.

## Estado atual (piloto)

- **Cobertura:** medicamentos de todos os exames e as folhas escaneadas recebidas em 09/11, incluindo raio-X contrastado, ultrassom abdominal e biópsia pulmonar.
- **Chat:** ainda responde a partir de `preparos.json` e `documentary-evidence.json`. Passar a ler este formato é o próximo passo.
- **Validação:** nenhum item está validado pela UDI.
