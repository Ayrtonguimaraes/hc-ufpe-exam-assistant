# Arquitetura atual e dados de conversa

> Estado técnico verificado na `main` no commit `e45dfef` (16/11/2026). Este documento descreve o que o código faz; ele não substitui a aprovação institucional sobre privacidade, retenção ou acesso.

## 1. Visão geral

O assistente é uma aplicação Next.js sem cadastro de usuários e sem integração com prontuário ou AGHU. A interface, a API e os dados versionados ficam no mesmo projeto. Em produção, a interface é servida pela Vercel e `app/api/chat/route.ts` executa como Route Handler no runtime Node.js.

A resposta clínica-operacional é produzida prioritariamente por regras determinísticas e pelos dados documentais versionados. Os modelos de linguagem são auxiliares:

- **Groq (`openai/gpt-oss-120b`)** pode interpretar texto livre em campos estruturados. Ele não redige a orientação final.
- **Claude (`claude-sonnet-4-5`)** permanece como caminho opcional para perguntas que chegam ao compositor de contexto, como algumas listagens e fluxos. A resposta recebe um contexto restrito.
- Sem chave, timeout, resposta inválida ou falha do provedor, o sistema mantém o caminho determinístico.

Não há índice vetorial nem embeddings na implementação atual.

## 2. Componentes e responsabilidades

| Camada | Implementação | Responsabilidade |
| --- | --- | --- |
| Interface | `app/chat/chat-client.tsx` | Perfil, mensagens, seletor guiado, histórico e checklist do internado |
| Persistência local | `lib/chat-storage.ts` e `hooks/use-chat-sessions.ts` | Guardar, carregar, limitar, expirar e excluir conversas no navegador |
| API | `app/api/chat/route.ts` | Validar a requisição, escolher o caminho de resposta e proteger as chaves dos provedores |
| Interpretação opcional | `lib/question-interpreter.ts` | Converter texto livre em modalidade, exame, contraste, sedação, lado e tópico |
| Recuperação | `lib/search.ts` e `lib/conversation-query.ts` | Localizar exames e reutilizar o contexto recente quando necessário |
| Resposta determinística | `lib/mock-response.ts`, `lib/answer-composer.ts` e `lib/standard-answer.ts` | Montar a resposta a partir do catálogo e das orientações documentadas |
| Dados padronizados | `data/fontes.json`, `data/orientacoes-preparo.json` e `data/conflitos.json` | Fontes, itens atômicos, estados de validação e conflitos documentais |
| Dados legados em migração | `data/preparos.json` e `data/documentary-evidence.json` | Cobertura ainda não migrada integralmente para o formato padronizado |
| Avaliação | `evaluation/` e scripts em `scripts/` | Casos, regras, execuções reproduzíveis e relatórios |

## 3. Fluxo de uma pergunta

1. O navegador envia para `/api/chat` a mensagem atual, o perfil, o histórico completo da conversa ativa e, quando usado o seletor, a sigla e a modalidade escolhidas.
2. Quando o exame veio do seletor, a API usa diretamente esse identificador em vez de pesquisar novamente pelo texto.
3. Políticas determinísticas tratam medicamentos, restrições do serviço, fluxo do internado, ambiguidades, exames conhecidos e itens já estruturados.
4. Para texto livre elegível e com `GROQ_API_KEY`, o Groq recebe uma instrução de extração, até quatro mensagens recentes truncadas a 400 caracteres e a mensagem atual truncada a 600 caracteres. A saída precisa ser um JSON dentro do esquema aceito.
5. Os campos interpretados são validados e convertidos novamente em uma consulta ao catálogo. A resposta final continua vindo dos dados locais.
6. Algumas perguntas que não foram resolvidas pelos caminhos anteriores podem usar Claude quando `CLAUDE_API_KEY` está configurada. Nesse caminho são enviados o contexto documental montado pela API, até oito mensagens recentes e a mensagem atual.
7. A API devolve a resposta e as referências. O navegador adiciona o resultado à conversa local.

## 4. Dados de conversa no navegador

### Comportamento implementado

| Aspecto | Estado atual |
| --- | --- |
| Chave | `hc-ufpe-chat-sessions` |
| Local | `localStorage` do navegador, na origem da aplicação |
| Conteúdo | ID, perfil, título derivado da primeira pergunta, mensagens, referências e datas de criação/atualização |
| Criptografia pela aplicação | Não há |
| Prazo técnico | 7 dias após a última atividade da conversa |
| Renovação do prazo | Cada nova mensagem atualiza `updatedAt` e reinicia a contagem |
| Limite | 30 conversas, mantendo as mais recentes |
| Limpeza automática | Ocorre ao carregar o histórico; sessões expiradas são removidas |
| Exclusão manual | Uma conversa por vez, pela barra lateral |
| Conta do usuário | Não existe; o perfil paciente/profissional não é autenticação |
| Compartilhamento entre dispositivos | Não existe |

Uma conversa nova só passa a ser persistida depois da primeira mensagem. Limpar os dados do site no navegador também remove o histórico. Como o armazenamento é local e não criptografado pela aplicação, qualquer script executado na mesma origem pode acessá-lo; a segurança depende também do dispositivo, do navegador e da proteção contra código malicioso.

## 5. Dados enviados para servidor e terceiros

| Destino | Dados que o código pode enviar | Persistência controlada pelo projeto |
| --- | --- | --- |
| Route Handler `/api/chat` | Mensagem, perfil, histórico da conversa ativa e identificador do exame selecionado | O código não grava conversas em banco ou arquivo no servidor |
| Groq | Instrução de interpretação, mensagem atual truncada e até quatro mensagens recentes truncadas | Não definida no repositório; depende do contrato e das configurações do provedor |
| Anthropic | Contexto documental, mensagem atual e até oito mensagens recentes | Não definida no repositório; depende do contrato e das configurações do provedor |
| Vercel Analytics | Componente padrão habilitado em produção; não há eventos customizados com conteúdo da conversa | Depende das configurações da conta Vercel |
| Logs da aplicação | Mensagem de erro do provedor quando a IA falha; o código não registra deliberadamente pergunta e resposta | Retenção e acesso dos logs dependem da plataforma |

As chaves `GROQ_API_KEY` e `CLAUDE_API_KEY` ficam somente no ambiente do servidor. Elas não são enviadas ao navegador.

## 6. Limitações e riscos atuais

- A interface não impede que alguém digite nome, prontuário ou outra informação pessoal ou de saúde.
- Não há aviso específico pedindo para não informar dados identificáveis.
- Não há consentimento ou política de privacidade apresentada no fluxo do chat.
- O prazo de sete dias e o limite de trinta conversas são decisões técnicas existentes, ainda não uma política institucional aprovada.
- Não há botão para excluir todas as conversas de uma vez nem exportação do histórico.
- Não há autenticação ou controle de acesso: qualquer pessoa com acesso ao mesmo perfil do navegador pode abrir as conversas salvas.
- O projeto não controla, pelo código, a retenção realizada por Groq, Anthropic, Vercel Analytics ou logs da Vercel.
- As orientações documentais ainda possuem itens com validação da UDI pendente e conflitos explícitos.

## 7. Decisões pendentes dos responsáveis

Estas decisões precisam de participação dos responsáveis pelo projeto, da UDI e, se aplicável, da área institucional de privacidade/LGPD. A equipe técnica pode implementar o resultado, mas não deve aprová-lo sozinha.

| Decisão | Comportamento técnico atual | Responsável a confirmar | Situação |
| --- | --- | --- | --- |
| Prazo oficial do histórico local | 7 dias após a última atividade | Responsável pelo produto/UDI | Pendente |
| Quantidade de conversas | Máximo de 30 | Responsável pelo produto | Pendente |
| Conteúdo permitido | Campo livre, sem bloqueio de identificadores | UDI e privacidade/LGPD | Pendente |
| Aviso e consentimento | Só há aviso clínico geral; não há aviso de privacidade específico | UDI e privacidade/LGPD | Pendente |
| Acesso ao histórico local | Qualquer pessoa com acesso ao mesmo navegador | Responsável pelo produto e segurança | Pendente |
| Exclusão | Uma conversa por vez | Responsável pelo produto | Pendente |
| Uso do Groq | Interpretação opcional de texto livre e histórico recente | Responsável institucional/privacidade | Pendente |
| Uso do Anthropic | Geração opcional em caminhos residuais | Responsável institucional/privacidade | Pendente |
| Analytics e logs | Configuração da conta Vercel não está documentada no repositório | Administrador da Vercel | Pendente |
| Atendimento a solicitações do titular | Não existe processo documentado | Responsável institucional/privacidade | Pendente |

## 8. Critério para concluir a Task 23

A parte técnica da documentação estará pronta quando este documento e o README refletirem o código publicado. A Task 23 só deve ser marcada como concluída quando:

- os responsáveis responderem às decisões da seção 7;
- as decisões tiverem responsável e data registrados;
- divergências entre a decisão e o comportamento atual virarem tarefas de implementação;
- a política aprovada for comunicada ao usuário na interface ou em documento acessível, quando aplicável.

