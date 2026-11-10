import { describe, expect, it } from 'vitest'
import { validateDocumentaryEvidence } from './verify-documentary-evidence.mjs'

function fixture() {
  return {
    evidence: { sources: { scan: { clinicalApproval: 'not-demonstrated' } }, facts: [] },
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
