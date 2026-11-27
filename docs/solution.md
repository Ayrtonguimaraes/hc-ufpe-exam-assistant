# Assistente Conversacional para Consulta de Exames de Imagem

**Documento da Solução Final**

> **Documento histórico de proposta.** Partes sobre Gemini, RAG, embeddings, quantidade de exames e privacidade não descrevem mais a implementação publicada. A arquitetura vigente, o fluxo entre provedores e o tratamento atual das conversas estão em [`arquitetura-atual-e-dados-de-conversa.md`](arquitetura-atual-e-dados-de-conversa.md). Este arquivo é preservado como registro do planejamento inicial.

---

## 1. Visão Geral

Este documento apresenta a solução final desenvolvida para o setor de Diagnóstico por Imagem do Hospital das Clínicas da UFPE (HC-UFPE), no âmbito da disciplina de Tópicos Avançados 4. O problema central, levantado em visitas e entrevistas com profissionais do hospital e por eles validado, é a **falha na comunicação das informações necessárias para a realização dos exames de imagem** — preparo, jejum, uso de contraste, documentação e forma correta de agendamento —, hoje dispersas entre planilhas, documentos e folhas físicas, o que gera dúvidas, remarcações e desperdício de vagas.

A solução é um **assistente conversacional (chatbot) web**, de acesso aberto e sem cadastro, que responde a perguntas em linguagem natural sobre os exames, **baseando-se exclusivamente nos documentos oficiais do hospital**, e adapta o nível da resposta ao perfil do usuário (paciente ou profissional). A arquitetura prioriza **custo operacional mínimo**: uma única aplicação Next.js, com as API routes atuando como funções serverless, hospedada na Vercel.

**Profissionais consultados:** Tiago Jornada (Físico Médico, chefe da Unidade de Diagnóstico por Imagem) e Karoline Andrade (Engenheira Biomédica, Engenharia Clínica).

## 2. Solução Proposta

### 2.1 Visão geral

A solução final é um **chatbot web de consulta**. O usuário acessa a plataforma, opcionalmente seleciona seu perfil (paciente ou profissional) e faz perguntas em linguagem natural, como "Preciso estar em jejum para a tomografia de abdome?", "Onde marco uma ressonância?" ou "Quais documentos devo levar?". O assistente responde com base nas informações oficiais dos exames do HC, ajustando o nível técnico da resposta ao perfil escolhido.

Tecnicamente, o assistente utiliza a abordagem de **RAG (Retrieval-Augmented Generation)**: as informações dos exames são indexadas e, a cada pergunta, os trechos mais relevantes são recuperados e fornecidos ao modelo de linguagem, que redige a resposta apenas a partir desse conteúdo. Isso reduz drasticamente o risco de respostas inventadas e mantém o assistente fiel à documentação do hospital.

### 2.2 Escopo

**Dentro do escopo:**

- Assistente conversacional (chatbot) sobre os exames do setor de imagem.
- Respostas fundamentadas exclusivamente nos documentos oficiais do HC (RAG).
- Adaptação do tom da resposta conforme o perfil (paciente x profissional).
- Acesso aberto, via navegador, sem cadastro ou login.

**Fora do escopo (nesta entrega):**

- **Navegação visual pelo corpo humano.** A ideia, sugerida pelos clientes, foi avaliada, mas retirada do escopo desta entrega para concentrar o esforço no chatbot. Permanece como evolução futura possível.
- Marcação ou agendamento real de exames (a plataforma orienta, mas não substitui os canais oficiais de marcação).
- Qualquer dado pessoal de paciente, prontuário ou integração com o AGHU.

### 2.3 Perfis de usuário

A plataforma não possui usuários cadastrados. O "perfil" é apenas um seletor que ajusta a forma da resposta:

| Perfil | Como a resposta é apresentada |
| --- | --- |
| Paciente | Linguagem simples e objetiva: necessidade de jejum, horários, medicamentos, documentação, local de marcação e cuidados antes e depois do exame. |
| Profissional (médico / enfermagem) | Linguagem técnica e operacional: protocolos de preparo, uso e tipo de contraste, restrições, fluxo correto de agendamento e observações específicas do procedimento. |

## 3. Arquitetura da Solução

### 3.1 Visão geral

A solução é construída como uma **única aplicação Next.js**, que reúne, no mesmo projeto, a interface (páginas em React) e a lógica de servidor (API routes). A arquitetura elimina a necessidade de manter um servidor sempre ligado e se divide em três camadas: a **interface** no navegador; as **API routes do Next.js**, que — ao serem publicadas — passam a funcionar como funções serverless, orquestrando a conversa e protegendo a chave de API; e uma **camada de dados** com o conteúdo dos exames já indexado para busca.

**Fluxo de uma pergunta:**

1. O usuário digita a pergunta e o perfil selecionado na interface de chat.
2. A API route do Next.js (que atua como função serverless) recebe a pergunta, gera sua representação vetorial (embedding) e recupera os trechos de exames mais relevantes do índice.
3. A rota monta o prompt com os trechos recuperados, a pergunta e a instrução de tom (paciente ou profissional) e chama o modelo de linguagem.
4. O modelo responde apenas com base no conteúdo fornecido; a rota retorna a resposta (e, quando aplicável, a referência do exame) para a interface.
5. Se a informação não estiver na base, o assistente orienta o usuário a procurar o setor responsável, em vez de inventar uma resposta.

### 3.2 Frontend

Aplicação web responsiva construída com Next.js (React), composta por uma tela de chat e um seletor de perfil. Pode ser acessada de computadores do hospital, celulares e outros dispositivos, sem instalação de aplicativos.

### 3.3 Backend: API routes do Next.js como funções serverless

Não há um servidor dedicado nem funções serverless escritas e implantadas "à parte". As próprias **API routes (Route Handlers) do Next.js** cumprem esse papel: quando a aplicação é publicada, cada rota é compilada automaticamente pela plataforma de hospedagem em uma **função serverless**, executada sob demanda e cobrada por uso. A rota tem duas responsabilidades: recuperar o conteúdo relevante e intermediar a chamada ao modelo de linguagem. Esse intermédio é indispensável, pois a chave de API *nunca* pode ficar exposta no frontend — ao rodar no lado servidor da rota, ela fica protegida. Recomenda-se usar o runtime Node.js na rota, por compatibilidade com as bibliotecas.

### 3.4 Deploy na Vercel

O deploy é feito na **Vercel**. Conecta-se o repositório Git e, a cada envio, a Vercel faz o build, serve a interface por CDN e **converte automaticamente cada API route em uma função serverless** — não é preciso criar nem configurar nenhuma função manualmente. A camada gratuita atende ao volume do projeto, e o arquivo de dados com os embeddings (poucos MB) acompanha o build, sendo carregado em memória quando a função inicia.

### 3.5 Camada de dados e RAG

O setor de imagem do HC possui cerca de **900 exames** — um volume pequeno do ponto de vista de dados. Por isso, não é necessário um banco de dados vetorial dedicado. As informações são consolidadas em um arquivo estruturado (JSON), os embeddings são pré-calculados uma única vez e a busca por similaridade é feita em memória dentro da API route. Um banco vetorial existe para acelerar buscas aproximadas quando há de centenas de milhares a bilhões de vetores; nessa escala (poucos milhares de trechos), a busca exata por força bruta é praticamente instantânea, e adotar um índice seria sobre-engenharia.

**Importante:** não usar banco vetorial não significa abrir mão de embeddings. Os vetores são gerados uma vez (em um passo offline) e guardados no próprio JSON; a cada pergunta, gera-se apenas o embedding da pergunta e calculam-se os produtos escalares localmente.

**Alternativa de evolução:** caso a equipe do hospital precise editar o conteúdo sem depender de programadores, ou caso a base cresça muito, pode-se migrar a camada de dados para um serviço gerenciado (por exemplo, Supabase com PostgreSQL e a extensão pgvector), que oferece painel de edição e busca vetorial. Essa é uma decisão de manutenção/escala, não de arquitetura essencial.

### 3.6 Por que essa arquitetura

- **Código unificado:** interface e backend no mesmo projeto Next.js, com um único repositório e um único fluxo de deploy.
- **Custo:** hospedagem com camada gratuita, API routes serverless cobradas por uso e modelo de linguagem com camada gratuita resultam em custo próximo de zero para o volume do projeto.
- **Simplicidade:** para 900 registros, busca em memória é mais simples e rápida do que manter um banco vetorial.
- **Manutenção:** sem servidor para administrar, atualizar ou monitorar.
- **Adequação:** como não há login, usuários cadastrados nem dados pessoais, a superfície de segurança e as obrigações de conformidade são mínimas.

## 4. Stack Tecnológica

### 4.1 Resumo das tecnologias

| Camada | Tecnologia sugerida | Justificativa |
| --- | --- | --- |
| Frontend | Next.js (React) | Framework full-stack: une interface e API no mesmo projeto; ecossistema dominado pela equipe. |
| Hospedagem / Deploy | Vercel | Deploy via Git; converte as API routes em funções serverless automaticamente. |
| Backend | API routes do Next.js (serverless) | As próprias rotas viram funções serverless; protegem a chave de API; sem servidor a gerenciar. |
| Dados / RAG | Arquivo JSON + embeddings em memória | Volume pequeno (≈900 exames) dispensa banco vetorial. |
| Modelo de linguagem | Google Gemini (camada gratuita) | Bom custo-benefício, suporte a português e a embeddings. |
| Ingestão de dados | Gemini multimodal (OCR + estruturação) | Digitaliza folhas físicas e já estrutura os dados em um passo. |

### 4.2 Escolha do provedor de modelo de linguagem

A recomendação é o **Google Gemini**. Sua camada gratuita não exige cartão de crédito, não expira e inclui entrada de PDFs e imagens, chamadas de função e geração de embeddings — ou seja, atende tanto à geração das respostas quanto à indexação para o RAG dentro do mesmo provedor. Os valores e limites são aproximados de meados de 2026 e mudam com frequência, portanto devem ser confirmados na documentação oficial antes da implementação.

**Atenção à privacidade:** na camada gratuita, os termos do Google permitem o uso das entradas e saídas para melhorar os modelos. Como a plataforma não trata dados de paciente e as perguntas são genéricas sobre preparo de exames, esse ponto é tolerável para o projeto — mas deve ser registrado. Em produção com requisitos de privacidade, utiliza-se a camada paga (que altera esse tratamento).

### 4.3 Comparação de provedores

Valores aproximados (por 1 milhão de tokens) de meados de 2026, apenas como ordem de grandeza:

| Provedor | Camada gratuita | Preço aprox. (modelo barato) | Português | Observação para o projeto |
| --- | --- | --- | --- | --- |
| **Gemini** (recomendado) | Sim, sem cartão (modelos Flash) | Flash-Lite ≈ US$ 0,10 / 0,40 | Ótimo | Melhor custo-benefício; embeddings inclusos no gratuito; atenção ao uso de dados para treino na camada gratuita. |
| OpenAI | Não (só créditos iniciais) | mini ≈ US$ 0,40 / 1,60 | Ótimo | Ecossistema maduro; embeddings baratíssimos; sem camada gratuita contínua. |
| Anthropic (Claude) | Não (só créditos) | Haiku ≈ US$ 1 / 5 | Ótimo | Forte em seguir instruções; não oferece modelo de embeddings próprio. |
| DeepSeek | Limitada | ≈ US$ 0,14 / 0,28 | Razoável | Muito barato, mas hospedagem na China — ponto de atenção institucional. |
| Mistral | Sim (experimental) | Modelos Small baratos | Razoável | Hospedagem europeia (GDPR); opção orientada a privacidade. |
| Groq | Sim, com limites | Modelos abertos (Llama) | Depende do modelo | Latência muito baixa; ótimo para prototipar de graça. |
| Cohere | Trial | Command R ≈ US$ 2,50 / 10 | Bom | Traz Embed e Rerank prontos — útil para RAG. |

## 5. Pipeline de Dados

### 5.1 Fontes de informação

O conteúdo da plataforma vem de três fontes:

- **Catálogo de exames (planilha, já digital).** Lista os **914 exames** do setor, com nome, sigla, sinônimos e modalidade (campo `unidade_executora`). É a fonte principal de identificação dos exames. As modalidades são sete: Tomografia (286), Radiologia Convencional (217), Ressonância Magnética (193), Ultrassonografia (172), Medicina Nuclear (35), Mamografia (6) e Densitometria Óssea (5).
- **Documento de orientações (já digital).** Reúne as orientações organizadas **por modalidade** — gerais (comuns a todos), por modalidade e, em alguns casos, preparos específicos por exame ou grupo de exames. Atualmente cobre Ultrassonografia, Ressonância, Mamografia e Densitometria.
- **Folhas físicas (ainda por chegar).** Contêm os preparos específicos restantes, sobretudo das modalidades ainda não cobertas no documento digital (Tomografia, Radiologia Convencional e Medicina Nuclear).

### 5.2 Digitalização das folhas físicas

As folhas físicas — que concentram principalmente as orientações de Tomografia, Radiologia e Medicina Nuclear — serão digitalizadas de forma rápida, unindo OCR e estruturação em um único passo:

1. Escanear as folhas com o celular (Google Drive, Microsoft Lens ou Adobe Scan), gerando um PDF com OCR.
2. Enviar o PDF ou as imagens ao próprio Gemini, que aceita esse tipo de entrada, solicitando a extração de cada orientação em formato estruturado (preparo, jejum, contraste, medicação, documentos, onde marcar e observações).
3. **Revisar manualmente o resultado** — etapa obrigatória. Por se tratar de saúde, um integrante confere os dados extraídos contra a folha original (tempos de jejum, contraste, dosagens), pois erros de OCR neste contexto são perigosos.
4. Incorporar o resultado ao mesmo formato das demais orientações.

### 5.3 Estruturação e indexação

As orientações se organizam em **três níveis**: gerais (comuns a todos os exames), por modalidade (os sete grupos) e específicas (alguns exames ou grupos). A maioria dos 914 exames não tem preparo próprio e **herda automaticamente** a orientação geral somada à da sua modalidade; apenas um conjunto reduzido possui preparo específico. Esse modelo evita a necessidade de redigir um registro manual para cada exame.

A montagem do índice é feita por um **script de ingestão**, executado uma vez (e novamente quando o conteúdo mudar), e não exame a exame de forma manual. O script: (1) lê a planilha e identifica a modalidade de cada exame; (2) usa o modelo de linguagem para converter o documento de orientações em blocos estruturados (geral, por modalidade e específicos); (3) associa os preparos específicos aos exames correspondentes por similaridade de nomes, aproveitando a coluna de **sinônimos** da planilha — o que também ajuda o RAG a casar termos leigos com o nome técnico; (4) compõe, para cada exame, o texto final (geral + modalidade + específico, quando houver) e marca como pendentes as orientações ainda "no papel"; (5) gera o embedding de cada exame e grava o arquivo JSON final. O trabalho manual concentra-se na **revisão** dos dados extraídos, não na digitação dos registros. Esse arquivo acompanha o build e é carregado em memória pela API route para responder às perguntas.

## 6. Qualidade, Segurança e Privacidade

### 6.1 Guardrails do assistente

- Responder estritamente com base no conteúdo recuperado dos documentos oficiais.
- Quando a informação não existir na base, orientar o usuário a procurar o setor responsável, sem inventar respostas.
- Não emitir diagnóstico nem recomendação clínica; o assistente trata apenas de orientações operacionais e de preparo dos exames.

### 6.2 Privacidade e LGPD

A plataforma não coleta nem armazena dados pessoais ou de saúde de pacientes, não possui cadastro de usuários e não se integra ao prontuário ou ao AGHU. Isso reduz substancialmente as obrigações relativas à LGPD. O único ponto a registrar é o tratamento de dados pela camada gratuita do provedor do modelo de linguagem, conforme observado na seção 4.2.

### 6.3 Aviso ao usuário

A interface deve exibir, de forma visível, um aviso de que o assistente fornece orientações de apoio com base na documentação do hospital e não substitui a orientação da equipe de saúde responsável pelo exame.

## 7. Riscos e Limitações

| Risco / limitação | Mitigação |
| --- | --- |
| Ausência de testes com usuários finais (restrição do projeto). | Validação concentrada com os profissionais do HC; interface simples e autoexplicativa. |
| Orientações digitais ainda não cobrem Tomografia, Radiologia e Medicina Nuclear (mais da metade dos exames, ~530). | Esses exames partem da orientação geral; a base é ampliada de forma incremental, priorizando essas modalidades conforme as folhas físicas chegarem e forem revisadas. |
| Erros de OCR na digitalização das folhas físicas. | Revisão humana obrigatória dos dados extraídos antes de entrarem na base. |
| Divergência de nomes entre a planilha e as orientações. | Associação por similaridade apoiada na coluna de sinônimos, com conferência manual dos casos não resolvidos. |
| Respostas incorretas ou inventadas pelo modelo. | RAG com fundamentação obrigatória nos documentos e recusa explícita quando não há informação. |
| Mudança de preços/limites do provedor de IA. | Arquitetura desacoplada do provedor; possibilidade de troca de modelo com baixo esforço. |

## 8. Benefícios Esperados

- Redução de exames remarcados por falta ou erro de orientação.
- Centralização das informações dos exames em um único ponto de acesso.
- Comunicação mais clara entre os setores e com o paciente.
- Acesso rápido e em linguagem adequada a cada público.
- Menor desperdício de vagas e maior eficiência do fluxo de exames.
- Melhora na experiência do paciente.

## 9. Roadmap e Próximos Passos

### 9.1 Escopo do terceiro checkpoint

Para a apresentação navegável, o mínimo aceitável é a interface de chat funcionando sobre um subconjunto de exames já estruturados — preferencialmente das modalidades já cobertas pelo documento de orientações (Ultrassonografia e Ressonância) —, demonstrando a recuperação de informação e a adaptação de tom por perfil. Como atalho, é possível iniciar sem o RAG, fornecendo o conteúdo diretamente no contexto do modelo (viável pelo amplo limite de contexto do Gemini), e evoluir para o RAG na versão final.

### 9.2 Evolução futura

- Preencher prioritariamente as orientações de Tomografia, Radiologia Convencional e Medicina Nuclear, conforme as folhas físicas forem digitalizadas e revisadas.
- Ampliar a base até a totalidade dos 914 exames.
- Adotar RAG completo com índice de embeddings persistido.
- Avaliar a reintrodução da navegação visual pelo corpo humano.
- Avaliar painel de edição de conteúdo para a equipe do hospital (ex.: Supabase).

## 10. Considerações Finais

A solução final concentra o esforço da equipe em um entregável coeso e de alto valor: um assistente conversacional que centraliza e comunica corretamente as orientações dos exames de imagem do HC-UFPE. As escolhas de arquitetura priorizam custo mínimo, simplicidade e segurança, mantendo o caminho aberto para evoluções como a navegação pelo corpo humano e um painel de manutenção de conteúdo.
