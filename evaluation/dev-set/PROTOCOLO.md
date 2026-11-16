# Protocolo de avaliação das respostas

O objetivo é medir a qualidade das respostas sempre do mesmo jeito, para que qualquer pessoa do grupo repita a medição e compare versões.

## Os dois conjuntos do repositório

| Conjunto | Onde | Como roda | Passa pelo modelo (Groq)? |
|---|---|---|---|
| 40 casos provisórios (GT-01 a GT-36 e DOC-01 a DOC-04) | `evaluation/cases.json` + `evaluation/rules.ts` | `pnpm eval:fallback` | **Não.** Mede só o caminho sem modelo |
| 43 perguntas de desenvolvimento (H01 a H36 e X1 a X7) | `evaluation/dev-set/perguntas.json` | `node scripts/run-dev-set.mjs` | **Sim.** Chama a API como o site faz |

Atenção:
- **Não é prova:** as 43 perguntas já foram usadas para achar e corrigir defeitos. Elas mostram progresso, não uma medição independente.
- **Conjunto cego:** uma prova exige um conjunto escrito por quem não mexe no código e rodado uma única vez na versão congelada. Esse conjunto ainda não existe.

## Como rodar

1. **Fixar a versão.** Anote o commit; o script registra sozinho.
2. **Escolher o alvo:**
   - **Servidor local:** precisa de `GROQ_API_KEY` no `.env.local`.
   - **Link publicado:** usa a chave configurada na Vercel.
3. **Executar:**
   ```bash
   node scripts/run-dev-set.mjs --url http://127.0.0.1:3100 --runs 3 --pause 2500
   ```
   - Use 3 rodadas, porque o modelo varia entre execuções.
   - A pausa respeita o limite do plano grátis do Groq (30 pedidos por minuto).
4. **Ler as saídas em `evaluation/dev-set/runs/`:**
   - `.json`: todas as respostas, o caminho usado por cada uma (modelo, catálogo, política fixa) e o tempo.
   - `.md`: resumo das verificações automáticas.
   - `-notas.csv`: planilha para a nota humana.
5. **Dar a nota humana.** Preencha a coluna `nota` do CSV com R, E, N ou P e conte com:
   ```bash
   node scripts/run-dev-set.mjs --tally evaluation/dev-set/runs/<arquivo>-notas.csv
   ```

## Verificações automáticas (triagem)

Cada pergunta tem duas listas de expressões, aplicadas à última resposta da conversa (sem acentos, sem maiúsculas, sem markdown):
- `deve`: termos que precisam aparecer;
- `naoDeve`: termos proibidos (por exemplo, outro exame ou uma dose).

A pergunta "passa" quando cumpre as duas listas. Isso é uma triagem: um texto pode ter os termos certos e ainda assim ser ruim. Por isso existe a nota humana.

## Nota humana (rubrica R/E/N/P)

| Nota | Significado |
|---|---|
| **R** (resolveu) | Entregou o que a coluna "esperado" pede, sem erro |
| **E** (encaminhou) | Entendeu a pergunta e, sem a informação cadastrada, encaminhou ao setor certo, sem inventar nada |
| **N** (não entendeu) | Exame errado, pergunta não compreendida ou resposta que não ajuda |
| **P** (falha grave) | Inventou orientação, contradisse o documento, ignorou uma condição crítica (alergia, gravidez, peso, implante) ou deu dose individual |

Regras para dar a nota:
1. **Leia só a resposta e a coluna "esperado".** Não leia o código.
2. **Na dúvida entre duas notas, escolha a pior.**
3. **Use um segundo avaliador.** Outra pessoa do grupo dá nota a 10 perguntas sorteadas sem ver a primeira nota. Informe quantas notas coincidiram.

## Resultados anteriores e de onde vieram

| Resultado | Fork 06/11 | Fork 08/11 | Fork 15/11 | App original (Claude) |
|---|---|---|---|---|
| Resolveu (R) | 4 | 23 | 26 | 16 |
| Encaminhou bem (E) | 7 | 9 | 8 | 16 |
| Não entendeu (N) | 19 | 3 | 1 | 1 |
| Falha grave (P) | 6 | 1 | 1 | 3 |

Como esses números foram obtidos:
- **Perguntas:** as 36 perguntas H01 a H36 deste conjunto, sem X1 a X7.
- **Rodadas:** uma rodada por versão.
  - **Fork 06/11:** servidor local, sem modelo.
  - **Fork 08/11:** servidor local, com Groq (gpt-oss-120b).
  - **App original:** link publicado da turma anterior, com Claude, rodado em 06/11.
- **Fork 15/11:** nota do mesmo avaliador de IA, sem conferência humana; servidor local com Groq, commit da branch `improvement/standard-preparation-data`, 3 rodadas (as 3 deram o mesmo texto em todas as perguntas). Notas em `runs/2026-11-16-02-28-local-notas-avaliador-ia.csv`. Mudanças em relação a 08/11: H23 (mamografia) E→R pela correção da proibição de medicação na pele; H34 e H36 (profissional/internado) N→R pelo fluxo do internado; H03 continua N (pede a região, mas o jejum de 8h com sedação não depende dela). A falha grave restante é H05: alergia a camarão tratada como decisão de medicamento, sem dizer que a folha não indica antialérgico nesse caso.
- **Perguntas novas (X1 a X7, fora da tabela):** 4 R, 2 E, 1 N. O N é o X6: "enema opaco" não tem exame no catálogo e o modelo respondeu sobre tomografia com contraste.
- **Avaliador:** quem deu as notas foi o assistente de IA usado no desenvolvimento, numa leitura única, sem formação clínica e sem segundo avaliador.
- **Uso destes números:** comparam versões do mesmo conjunto com o mesmo avaliador. Não são uma medida clínica nem independente.

## Limitações conhecidas

- **Variação do modelo:** a mesma pergunta pode ter respostas diferentes entre rodadas. Por isso o relatório mostra quantas das 3 rodadas passaram.
- **Limite do plano grátis:** se o Groq recusar ou demorar, a rota segue sem o modelo. O campo `caminho` de cada resposta mostra quando isso aconteceu.
- **Nenhuma referência validada:** nenhuma resposta esperada foi validada pela UDI.
