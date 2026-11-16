#!/usr/bin/env node
// Gera docs/revisao-udi-medicamentos.md a partir de data/orientacoes-preparo.json, data/conflitos.json e data/fontes.json:
// o documento que a equipe da UDI revisa, item a item, para aprovar ou corrigir os preparos que envolvem medicamento.
//   node scripts/build-udi-review.mjs          confere se o documento está atualizado
//   node scripts/build-udi-review.mjs --write  reescreve o documento
import { readFileSync, writeFileSync } from 'node:fs'

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'))

export function buildReview({ standard, conflicts, fontes, exams, preparations }) {
  const name = sigla => exams.find(e => e.sigla === sigla)?.nome ?? sigla
  const target = i => i.aplicaA.exames?.length ? i.aplicaA.exames.map(s => `${name(s)} (${s})`).join('; ')
    : i.aplicaA.grupo ? `${preparations[i.aplicaA.grupo]?.titulo ?? i.aplicaA.grupo} (todos os exames do grupo)` : i.semExameNoCatalogo
  const src = i => [i.fonte, ...(i.fontesAdicionais ?? [])].map(f => `${fontes.sources[f.id].title}, ${f.local}`).join('; ')
  const CLASS = standard.enums.classeMedicamento
  const drugs = standard.itens.filter(i => i.medicamento)
  const order = { A: 0, B: 1, C: 2, D: 3 }
  drugs.sort((a, b) => order[a.medicamento.classe] - order[b.medicamento.classe] || target(a).localeCompare(target(b)))
  const lines = [
    '# Revisão da UDI: preparos de exames que envolvem medicamento',
    '',
    '> Documento gerado a partir dos dados do assistente (`npm run data:review`). Para corrigir, altere os dados e gere de novo.',
    '',
    '## Para quem revisa',
    '',
    'O assistente de preparo de exames do HC-UFPE usa as folhas e documentos da UDI listados em cada item. **Nenhum item foi validado pela equipe da UDI.** Pedimos que cada item seja marcado como correto ou corrigido. Em especial:',
    '',
    '1. **O texto da folha** está certo e é a versão vigente?',
    '2. **A classificação proposta pela equipe do projeto** está certa? Ela não está nas folhas:',
    ...Object.entries(CLASS).map(([c, l]) => `   - **${c}:** ${l}`),
    '   - **Indispensável:** sem ele, o exame é suspenso ou perde qualidade.',
    '   - **Exige receita:** o medicamento precisa de receita para ser comprado. No paciente internado, todo medicamento de preparo precisa estar na prescrição.',
    '3. **O que o assistente pode dizer ao paciente.** Hoje ele diz qual remédio faz parte do preparo, quando começa e que precisa ser combinado com o médico que pediu o exame, sem dose nem horário. O profissional vê a dose da folha e a fonte.',
    '',
    `## Medicamentos (${drugs.length} itens)`,
    '',
  ]
  drugs.forEach((i, n) => {
    const m = i.medicamento
    lines.push(
      `### ${n + 1}. ${m.principioAtivo}${m.nomeComercial ? ` (${m.nomeComercial})` : ''}: ${target(i)}`,
      '',
      `- **O que a fonte diz:** "${i.fonte.trecho}"`,
      `- **Fonte:** ${src(i)}`,
      `- **Como o assistente registra:** ${i.texto}${i.condicao ? ` Só quando: ${i.condicao.replace(/_/g, ' ')}.` : ''}`,
      `- **Classificação proposta:** classe ${m.classe} (${CLASS[m.classe]}); ${i.indispensavel ? 'indispensável' : 'não indispensável'}; ${m.exigeReceita ? 'exige receita' : 'não exige receita'}`,
      `- **Situação:** ${{ 'documental-pendente-udi': 'documental, aguardando validação', 'conflito-pendente': 'há folhas que se contradizem', 'sem-fonte-documental': 'sem folha localizada (texto herdado do cadastro anterior)', 'validado-udi': 'validado' }[i.estado]}${i.ressalva ? `. ${i.ressalva}` : ''}`,
      '- **Revisão da UDI:** ( ) correto  ( ) corrigir: ________________________________________',
      '',
    )
  })
  lines.push('## Folhas que se contradizem', '')
  conflicts.conflitos.filter(c => c.status === 'pending-udi').forEach((c, n) => {
    lines.push(`### ${n + 1}. ${c.subject}`, '', c.impact, '')
    for (const a of c.alternatives) lines.push(`- **${fontes.sources[a.sourceId]?.title ?? a.sourceId}, ${a.locator}:** "${a.quote}"`)
    lines.push('', '- **Qual vale?** ________________________________________', '')
  })
  lines.push(
    '## Outras perguntas',
    '',
    '1. **Metformina na TC com contraste.** A folha manda suspender 48h antes e 48h depois para todo paciente diabético. As diretrizes do curso AVR do CBR, adaptadas da ESUR v10, mantêm a metformina quando a TFGe é de 30 mL/min/1,73 m² ou mais. Qual regra a UDI adota? A função renal deve ser informada no pedido?',
    '2. **Alergia a contraste iodado.** O documento de TC/RM (P84) contraindica o exame contrastado para quem tem histórico de reação; os P105 a P115 indicam antialérgico obrigatório na reação grave e recomendado na leve ou moderada. Qual vale para quem já reagiu?',
    '3. **Uretrocistografia pediátrica.** A folha não distingue idade. Qual é o preparo para criança?',
    '4. **RM com contraste e densitometria.** Onde estão as folhas vigentes? Os documentos dizem "verificar no papel".',
    '5. **Enema opaco e biópsia pulmonar guiada por TC.** Quais são as siglas no AGHU?',
    '',
  )
  return lines.join('\n')
}

const data = {
  standard: read('data/orientacoes-preparo.json'),
  conflicts: read('data/conflitos.json'),
  fontes: read('data/fontes.json'),
  exams: read('data/exames.json'),
  preparations: read('data/preparos.json').preparos,
}
const out = new URL('../docs/revisao-udi-medicamentos.md', import.meta.url)
const doc = buildReview(data)
if (process.argv[1] && new URL(`file://${process.argv[1]}`).pathname.endsWith('build-udi-review.mjs')) {
  if (process.argv.includes('--write')) writeFileSync(out, doc)
  else if (readFileSync(out, 'utf8') !== doc) { console.error('docs/revisao-udi-medicamentos.md está desatualizado: rode com --write'); process.exit(1) }
  console.log('Documento de revisão da UDI conferido.')
}
