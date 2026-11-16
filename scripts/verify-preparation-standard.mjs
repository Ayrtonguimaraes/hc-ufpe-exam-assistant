#!/usr/bin/env node
// Verifica o padrão de dados de preparo (data/fontes.json + data/orientacoes-preparo.json)
// e gera docs/medicamentos-preparo.md. Uso:
//   node scripts/verify-preparation-standard.mjs          valida e confere se o documento gerado está atualizado
//   node scripts/verify-preparation-standard.mjs --write  valida e reescreve o documento gerado
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ISO = /^[+-]?P(?!$)(\d+D)?(T(?=\d)(\d+H)?(\d+M)?)?$/
const text = value => typeof value === 'string' && value.trim().length > 0
const fail = message => { throw new Error(message) }

/** Every sourceId cited by any data file must exist in data/fontes.json, with the same hash when both record one. */
export function validateSources({ fontes, evidence, inpatientFlow, conflicts }) {
  const sources = fontes?.sources ?? fail('fontes.json sem "sources"')
  for (const [id, source] of Object.entries(sources)) {
    if (!text(source.title) || !text(source.kind)) fail(`Fonte sem título ou tipo: ${id}`)
    if (source.sha256 !== null && !/^[a-f0-9]{64}$/.test(source.sha256 ?? '')) fail(`SHA-256 inválido: ${id}`)
  }
  const cited = [
    ...evidence.facts.map(f => f.sourceId),
    ...Object.keys(evidence.sources),
    ...conflicts.conflitos.flatMap(c => c.alternatives.map(a => a.sourceId)),
    ...Object.keys(inpatientFlow.sources ?? {}),
    ...JSON.stringify(inpatientFlow).match(/"sourceId":"[^"]+"/g)?.map(m => m.slice(12, -1)) ?? [],
  ]
  for (const id of new Set(cited)) if (!sources[id]) fail(`Fonte citada e não registrada em data/fontes.json: ${id}`)
  for (const [id, source] of Object.entries(evidence.sources)) {
    if (source.sha256 && sources[id].sha256 !== source.sha256) fail(`Hash divergente entre fontes.json e documentary-evidence.json: ${id}`)
  }
}

export function validateItems({ standard, fontes, exams, preparations, conflicts }) {
  const { enums, itens } = standard
  const siglas = new Set(exams.map(e => e.sigla))
  const conflictIds = new Set(conflicts.conflitos.map(c => c.id))
  const ids = new Set()
  for (const item of itens) {
    const where = item?.id ?? '(sem id)'
    if (!text(item.id) || ids.has(item.id)) fail(`ID ausente ou duplicado: ${where}`)
    ids.add(item.id)
    if (!enums.tipo.includes(item.tipo)) fail(`Tipo inválido: ${where}`)
    if (!enums.estado.includes(item.estado)) fail(`Estado inválido: ${where}`)
    if (!text(item.texto)) fail(`Texto ausente: ${where}`)
    if (!Array.isArray(item.publico) || !item.publico.length || item.publico.some(p => !enums.publico.includes(p))) fail(`Público inválido: ${where}`)
    if (typeof item.indispensavel !== 'boolean') fail(`"indispensavel" deve ser booleano: ${where}`)
    const { exames, grupo } = item.aplicaA ?? {}
    if (!exames?.length && !grupo && !text(item.semExameNoCatalogo)) fail(`Item sem exame, grupo ou justificativa: ${where}`)
    for (const sigla of exames ?? []) if (!siglas.has(sigla)) fail(`Sigla inexistente no catálogo: ${where}/${sigla}`)
    if (grupo && !preparations[grupo]) fail(`Grupo de preparo inexistente: ${where}/${grupo}`)
    for (const ref of [item.fonte, ...(item.fontesAdicionais ?? [])]) {
      if (!ref || !fontes.sources[ref.id] || !text(ref.local)) fail(`Fonte inválida: ${where}`)
    }
    if (!text(item.fonte.trecho)) fail(`Trecho literal ausente: ${where}`)
    if ((item.estado === 'sem-fonte-documental') !== (fontes.sources[item.fonte.id].kind === 'cadastro-herdado')) fail(`Estado não corresponde ao tipo de fonte: ${where}`)
    if (item.estado === 'conflito-pendente' && !conflictIds.has(item.conflito)) fail(`Conflito inexistente: ${where}/${item.conflito}`)
    if (item.conflito && !conflictIds.has(item.conflito)) fail(`Conflito inexistente: ${where}/${item.conflito}`)
    for (const value of Object.values(item.momento ?? {})) if (!ISO.test(value)) fail(`Prazo fora do ISO 8601: ${where}/${value}`)
    const isDrug = ['medicamento', 'suspensao_medicamento'].includes(item.tipo)
    if (isDrug && !item.medicamento) fail(`Item de medicamento sem bloco "medicamento": ${where}`)
    if (item.medicamento) {
      const m = item.medicamento
      if (!text(m.principioAtivo) || !text(m.posologiaNaFonte)) fail(`Medicamento incompleto: ${where}`)
      if (!Object.keys(enums.classeMedicamento).includes(m.classe)) fail(`Classe de medicamento inválida: ${where}`)
      if (typeof m.exigeReceita !== 'boolean') fail(`"exigeReceita" deve ser booleano: ${where}`)
      if (m.classe === 'A' && !item.indispensavel) fail(`Classe A deve ser indispensável: ${where}`)
    }
  }
  return itens
}

const ESTADO = { 'documental-pendente-udi': 'documental, validação UDI pendente', 'conflito-pendente': 'conflito entre folhas, decisão UDI pendente', 'sem-fonte-documental': 'sem fonte localizada', 'validado-udi': 'validado pela UDI' }
const cell = s => String(s).replace(/\|/g, '/').replace(/\n/g, ' ')

export function buildMedicationReport({ standard, fontes, exams, preparations }) {
  const nameOf = sigla => exams.find(e => e.sigla === sigla)?.nome ?? sigla
  const target = item => item.aplicaA.exames?.length ? item.aplicaA.exames.map(s => `${s} (${nameOf(s)})`).join('; ')
    : item.aplicaA.grupo ? `grupo ${preparations[item.aplicaA.grupo]?.titulo ?? item.aplicaA.grupo}` : item.semExameNoCatalogo
  const source = item => [item.fonte, ...(item.fontesAdicionais ?? [])].map(f => `${fontes.sources[f.id].title}, ${f.local}`).join('; ')
  const drugs = standard.itens.filter(i => i.medicamento)
  const order = { A: 0, B: 1, C: 2, D: 3 }
  drugs.sort((a, b) => order[a.medicamento.classe] - order[b.medicamento.classe] || a.id.localeCompare(b.id))
  const classes = standard.enums.classeMedicamento
  const count = c => drugs.filter(i => i.medicamento.classe === c).length
  const lines = [
    '# Medicamentos no preparo dos exames',
    '',
    '> Arquivo gerado por `node scripts/verify-preparation-standard.mjs --write` a partir de `data/orientacoes-preparo.json`. Não edite à mão.',
    '> Nenhum item está homologado pela UDI. A posologia é a da fonte e não substitui a prescrição.',
    `> ${standard.notaClassificacao}`,
    '',
    `Total: ${drugs.length} itens. ` + Object.entries(classes).map(([c, label]) => `Classe ${c} (${label}): ${count(c)}.`).join(' '),
    '',
    '| Classe | Exame(s) | Medicamento | Na fonte | Prazo | Receita | Condição | Situação | Fonte |',
    '|---|---|---|---|---|---|---|---|---|',
    ...drugs.map(i => `| ${i.medicamento.classe} | ${cell(target(i))} | ${cell(i.medicamento.principioAtivo + (i.medicamento.nomeComercial ? ` (${i.medicamento.nomeComercial})` : ''))} | ${cell(i.medicamento.posologiaNaFonte)} | ${cell(Object.entries(i.momento ?? {}).map(([k, v]) => `${k} ${v}`).join(', ') || '—')} | ${i.medicamento.exigeReceita ? 'sim' : 'não'} | ${cell(i.condicao ?? '—')} | ${cell(ESTADO[i.estado])}${i.ressalva ? ` — ${cell(i.ressalva)}` : ''} | ${cell(source(i))} |`),
    '',
    'Prazos em ISO 8601 relativos ao horário do exame: `-P1D` = começa na véspera; `+P2D` = vai até 2 dias depois; `PT12H` = duração de 12 horas.',
    '',
  ]
  return lines.join('\n')
}

function runCli() {
  const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'))
  const data = {
    fontes: read('data/fontes.json'),
    standard: read('data/orientacoes-preparo.json'),
    evidence: read('data/documentary-evidence.json'),
    inpatientFlow: read('data/inpatient-flow.json'),
    conflicts: read('data/conflitos.json'),
    exams: read('data/exames.json'),
    preparations: read('data/preparos.json').preparos,
  }
  validateSources(data)
  const itens = validateItems(data)
  const report = buildMedicationReport(data)
  const reportUrl = new URL('../docs/medicamentos-preparo.md', import.meta.url)
  if (process.argv.includes('--write')) writeFileSync(reportUrl, report)
  else if (readFileSync(reportUrl, 'utf8') !== report) fail('docs/medicamentos-preparo.md está desatualizado: rode com --write')
  const by = key => Object.entries(itens.reduce((acc, i) => ({ ...acc, [i[key]]: (acc[i[key]] ?? 0) + 1 }), {})).map(([k, v]) => `${k} ${v}`).join(', ')
  console.log(`Padrão verificado: ${Object.keys(data.fontes.sources).length} fontes, ${itens.length} itens (${by('estado')}).`)
  console.log(`Medicamentos: ${itens.filter(i => i.medicamento).length} itens; indispensáveis (classe A): ${itens.filter(i => i.medicamento?.classe === 'A').length}.`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) runCli()
