import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildMedicationReport, validateItems, validateSources } from './verify-preparation-standard.mjs'

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'))
const data = () => ({
  fontes: read('data/fontes.json'),
  standard: read('data/orientacoes-preparo.json'),
  evidence: read('data/documentary-evidence.json'),
  inpatientFlow: read('data/inpatient-flow.json'),
  conflicts: read('data/conflitos.json'),
  exams: read('data/exames.json'),
  preparations: read('data/preparos.json').preparos,
})

describe('padrão de dados de preparo', () => {
  it('todas as fontes citadas nos arquivos de dados estão no registro único', () => {
    expect(() => validateSources(data())).not.toThrow()
  })

  it('os itens são válidos e o documento gerado está atualizado', () => {
    const d = data()
    expect(validateItems(d).length).toBeGreaterThan(0)
    expect(readFileSync(new URL('../docs/medicamentos-preparo.md', import.meta.url), 'utf8')).toBe(buildMedicationReport(d))
  })

  it('as folhas escaneadas de 09/11 estão representadas', () => {
    const used = new Set(data().standard.itens.flatMap(i => [i.fonte, ...(i.fontesAdicionais ?? [])].map(f => f.id)))
    expect(used).toContain('exames-escaneados')
    expect(used).toContain('scanned-2026-11-09')
  })

  it.each([
    ['sigla inexistente', i => { i.aplicaA = { exames: ['NAOEXISTE'] } }, /Sigla inexistente/],
    ['fonte não registrada', i => { i.fonte.id = 'desconhecida' }, /Fonte inválida/],
    ['prazo fora do ISO 8601', i => { i.momento = { inicio: 'véspera' } }, /ISO 8601/],
    ['medicamento classe A não indispensável', i => { i.indispensavel = false }, /Classe A/],
    ['sem trecho literal', i => { i.fonte.trecho = '' }, /Trecho literal/],
  ])('rejeita %s', (_, mutate, error) => {
    const d = data()
    mutate(d.standard.itens.find(i => i.id === 'rx-uretro-norfloxacino'))
    expect(() => validateItems(d)).toThrow(error)
  })

  it('rejeita fonte citada por outro arquivo e ausente do registro', () => {
    const d = data()
    delete d.fontes.sources['checklist-internos']
    expect(() => validateSources(d)).toThrow(/checklist-internos/)
  })
})
