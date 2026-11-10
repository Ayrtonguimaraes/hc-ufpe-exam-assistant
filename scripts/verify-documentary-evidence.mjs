import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'))
const norm = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const hasText = value => typeof value === 'string' && value.trim().length > 0

export function validateDocumentaryEvidence({ evidence, preparations, exams, conflicts }) {
  const ids = new Set()
  for (const fact of evidence.facts) {
    if (ids.has(fact.id)) throw new Error(`Fato duplicado: ${fact.id}`)
    ids.add(fact.id)
    if (!Object.hasOwn(evidence.sources, fact.sourceId) || fact.validation !== 'pending-udi' || !fact.locator || !fact.quote || !fact.text.trim()) {
      throw new Error(`Evidência inválida: ${fact.id}`)
    }
    if (!fact.appliesTo.length || fact.appliesTo.some(code => !exams.some(exam => exam.sigla === code))) {
      throw new Error(`Aplicação ausente no catálogo: ${fact.id}`)
    }
  }

  // A lista appliesTo deve corresponder exatamente à regra no catálogo atual.
  for (const fact of evidence.facts) {
    for (const other of fact.supersedes ?? []) {
      if (!ids.has(other)) throw new Error(`Fato substituído inexistente: ${fact.id}/${other}`)
    }
    if (!fact.rule) continue
    const computed = exams.filter(exam =>
      exam.modalidade === fact.rule.modality &&
      fact.rule.nameAll.every(term => norm(exam.nome).includes(term)) &&
      !(fact.rule.nameNone ?? []).some(term => norm(exam.nome).includes(term))
    ).map(exam => exam.sigla)
    const listed = [...new Set(fact.appliesTo)].sort()
    const expected = [...new Set(computed)].sort()
    if (JSON.stringify(listed) !== JSON.stringify(expected)) {
      throw new Error(`appliesTo de ${fact.id} não corresponde à regra: lista ${listed.length}, regra ${expected.length}. Regenerar a lista.`)
    }
  }
  for (const [id, preparation] of Object.entries(preparations)) {
    for (const fact of preparation.fact_ids ?? []) {
      if (!ids.has(fact)) throw new Error(`Fato ausente: ${id}/${fact}`)
    }
  }

  if (conflicts?.version !== 1 || !Array.isArray(conflicts.conflitos)) {
    throw new Error('Registro de conflitos inválido: requer version 1 e array conflitos')
  }
  const conflictIds = new Set()
  for (const conflict of conflicts.conflitos) {
    if (!hasText(conflict?.id) || conflictIds.has(conflict.id)) {
      throw new Error(`ID de conflito inválido ou duplicado: ${conflict?.id}`)
    }
    conflictIds.add(conflict.id)
    if (!['pending-udi', 'resolvido'].includes(conflict.status)) {
      throw new Error(`Estado de conflito inválido: ${conflict.id}`)
    }
    if (!Array.isArray(conflict.preparo_ids) || !conflict.preparo_ids.length ||
        conflict.preparo_ids.some(id => !Object.hasOwn(preparations, id))) {
      throw new Error(`Preparo de conflito ausente: ${conflict.id}`)
    }
    if (!Array.isArray(conflict.alternatives) ||
        (conflict.status === 'pending-udi' && conflict.alternatives.length < 2)) {
      throw new Error(`Alternativas de conflito insuficientes: ${conflict.id}`)
    }
    for (const alternative of conflict.alternatives) {
      if (!alternative || !['sourceId', 'locator', 'quote', 'text'].every(field => hasText(alternative[field])) ||
          !Object.hasOwn(evidence.sources, alternative.sourceId)) {
        throw new Error(`Alternativa de conflito inválida: ${conflict.id}`)
      }
      const hash = evidence.sources[alternative.sourceId]?.sha256
      if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/i.test(hash)) {
        throw new Error(`SHA-256 de fonte de conflito inválido: ${conflict.id}/${alternative.sourceId}`)
      }
    }
    if (conflict.status === 'resolvido' && (!hasText(conflict.decision) || !hasText(conflict.resolvedAt))) {
      throw new Error(`Resolução de conflito incompleta: ${conflict.id}`)
    }
  }
}

function runCli() {
  const evidence = read('data/documentary-evidence.json')
  const preparations = read('data/preparos.json').preparos
  const exams = read('data/exames.json')
  const conflicts = read('data/conflitos.json')
  validateDocumentaryEvidence({ evidence, preparations, exams, conflicts })

  const bindings = read('data/exam-preparation-associations.json').bindings
  for (const [key, binding] of Object.entries(bindings)) {
    const exam = exams.find(exam => `${exam.modalidade}:${exam.sigla}` === key)
    if (!exam || exam.preparo_id !== binding.preparo_id || !preparations[binding.preparo_id]) {
      throw new Error(`Associação inconsistente: ${key}`)
    }
  }
  const pending = conflicts.conflitos.filter(conflict => conflict.status === 'pending-udi').length
  console.log(`Verificado: ${evidence.facts.length} fatos, ${Object.keys(bindings).length} associações explícitas; nenhuma homologação clínica.`)
  console.log(`Conflitos pendentes de decisão da UDI: ${pending}.`)

  // Verificação local opcional sem exigir ou publicar o documento original.
  if (process.argv[2]) {
    const hash = createHash('sha256').update(readFileSync(process.argv[2])).digest('hex')
    if (hash !== evidence.sources['orientacoes-exames'].sha256) {
      throw new Error('O arquivo não corresponde à versão documental registrada')
    }
    console.log('Hash do documento original conferido.')
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli()
