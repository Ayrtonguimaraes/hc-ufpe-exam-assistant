import { describe, expect, it } from 'vitest'
import { validateDocumentaryEvidence } from './verify-documentary-evidence.mjs'

function fixture() {
  return {
    evidence: { sources: { scan: { clinicalApproval: 'not-demonstrated', sha256: '146d1fb27928c0298caf345ce15201e7c48e9a720ad5ff19863f736f9b140d10' } }, facts: [] },
    preparations: { prep: {} },
    exams: [],
    conflicts: {
      version: 1,
      conflitos: [{
        id: 'conflict',
        preparo_ids: ['prep'],
        status: 'pending-udi',
        linearIssue: 'PRO-34',
        alternatives: [
          { sourceId: 'scan', locator: 'página 1', quote: 'Jejum de 6h', text: 'Jejum de 6h.' },
          { sourceId: 'scan', locator: 'página 2', quote: 'Sem preparo', text: 'Sem preparo.' },
        ],
      }],
    },
  }
}

describe('validação documental de conflitos', () => {
  it('aceita um conflito pendente com fontes e preparos conhecidos', () => {
    expect(validateDocumentaryEvidence(fixture())).toBeUndefined()
  })

  it.each([
    ['ausente', undefined],
    ['vazio', ''],
    ['curto', 'abc123'],
    ['longo', 'a'.repeat(65)],
    ['não hexadecimal', 'g'.repeat(64)],
    ['tipo inválido', 123],
  ])('rejeita hash de fonte %s', (_name, hash) => {
    const input = fixture()
    input.evidence.sources.scan.sha256 = hash
    expect(() => validateDocumentaryEvidence(input)).toThrow(/SHA-256/)
  })

  it.each([
    '146d1fb27928c0298caf345ce15201e7c48e9a720ad5ff19863f736f9b140d10',
    '146D1FB27928C0298CAF345CE15201E7C48E9A720AD5FF19863F736F9B140D10',
  ])('aceita hash SHA-256 hexadecimal válido %s', hash => {
    const input = fixture()
    input.evidence.sources.scan.sha256 = hash
    expect(() => validateDocumentaryEvidence(input)).not.toThrow()
  })

  it('aceita resolução com decisão e data registradas', () => {
    const input = fixture()
    Object.assign(input.conflicts.conflitos[0], { status: 'resolvido', decision: 'Decisão documentada da UDI', resolvedAt: '2026-11-09' })
    expect(() => validateDocumentaryEvidence(input)).not.toThrow()
  })

  it.each([
    ['ID duplicado', input => input.conflicts.conflitos.push(structuredClone(input.conflicts.conflitos[0]))],
    ['ID vazio', input => input.conflicts.conflitos[0].id = ' '],
    ['preparo inexistente', input => input.conflicts.conflitos[0].preparo_ids = ['missing']],
    ['preparos ausentes', input => delete input.conflicts.conflitos[0].preparo_ids],
    ['preparos vazios', input => input.conflicts.conflitos[0].preparo_ids = []],
    ['fonte inexistente', input => input.conflicts.conflitos[0].alternatives[0].sourceId = 'missing'],
    ['estado inválido', input => input.conflicts.conflitos[0].status = 'approved'],
    ['versão inválida', input => input.conflicts.version = 2],
    ['lista ausente', input => delete input.conflicts.conflitos],
    ['menos de duas alternativas pendentes', input => input.conflicts.conflitos[0].alternatives.pop()],
    ['alternativas ausentes', input => delete input.conflicts.conflitos[0].alternatives],
    ['decisão ausente', input => Object.assign(input.conflicts.conflitos[0], { status: 'resolvido', resolvedAt: '2026-11-09' })],
    ['data ausente', input => Object.assign(input.conflicts.conflitos[0], { status: 'resolvido', decision: 'UDI' })],
    ...['sourceId', 'locator', 'quote', 'text'].map(field => [`alternativa sem ${field}`, input => input.conflicts.conflitos[0].alternatives[0][field] = ' ']),
  ])('rejeita %s', (_name, mutate) => {
    const input = fixture()
    mutate(input)
    expect(() => validateDocumentaryEvidence(input)).toThrow(/conflito|alternativa/i)
  })

  it('preserva rejeição de fatos duplicados', () => {
    const input = fixture()
    const fact = { id: 'fact', sourceId: 'scan', validation: 'pending-udi', locator: 'página 1', quote: 'Texto', text: 'Texto', appliesTo: ['EX'] }
    input.exams = [{ sigla: 'EX' }]
    input.evidence.facts = [fact, structuredClone(fact)]
    expect(() => validateDocumentaryEvidence(input)).toThrow(/Fato duplicado/)
  })

  it('preserva rejeição de referências a fatos ausentes no preparo', () => {
    const input = fixture()
    input.preparations.prep.fact_ids = ['missing']
    expect(() => validateDocumentaryEvidence(input)).toThrow(/Fato ausente/)
  })
})
