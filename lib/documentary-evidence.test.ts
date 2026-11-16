import { it, expect } from 'vitest'
import { generateMockResponse } from './mock-response'
import { factsForExam } from './documentary-evidence'
import registry from '@/data/documentary-evidence.json'
import conflicts from '@/data/conflitos.json'
import exams from '@/data/exames.json'
import preparationData from '@/data/preparos.json'
import { composeAnswer } from './answer-composer'
import type { PreparosFile } from './types'
const preparations = preparationData as PreparosFile

it('biópsias, transvaginal, parede abdominal e peça cirúrgica não herdam preparo genérico', () => {
 for(const code of ['BPGUS','USBI1','USBI6','USPTV','USTDC','USGPA']) {
  const e=exams.find(e=>e.sigla===code)!
  expect(e.preparo_id).toBe('us_pendente')
  expect(e.association_review!.status).toBe('needs-review')
  const r=composeAnswer(e.nome_usual,[e],preparations,'patient')!
  expect(r.reply).not.toMatch(/bexiga cheia|Jejum de/)
  expect(r.reply).toMatch(/confirme/i)
 }
 expect(exams.find(e=>e.sigla==='MAMPC')!.preparo_id).toBe('mamografia_pendente')
})
it('fatos existentes têm fonte, aplicação exata e nenhuma aprovação clínica implícita', () => {
 expect(new Set(registry.facts.map(f=>f.id)).size).toBe(registry.facts.length)
 for(const fact of registry.facts) {
  expect(fact.validation).toBe('pending-udi')
  expect(fact.quote.length).toBeGreaterThan(10)
  expect(fact.appliesTo.every(code=>exams.some(e=>e.sigla===code))).toBe(true)
 }
 for(const e of exams) {
  const p=preparations.preparos[e.preparo_id]
  const selected=factsForExam(e,p)
  expect(selected.every(f=>registry.facts.find(original=>original.id===f.factId)!.appliesTo.includes(e.sigla))).toBe(true)
 }
})

it('pedido genérico não recupera procedimentos especializados; pedido explícito mantém o encaminhamento', () => {
 const generic=generateMockResponse('Mamografia: posso passar desodorante?', 'patient')
 expect(generic.sources.some(s=>/PEÇA|PECA/.test(s.nome))).toBe(false)
 const e=exams.find(e=>e.sigla==='MAMPC')!
 const explicit=generateMockResponse(e.nome_usual, 'professional')
 expect(explicit.reply).not.toMatch(/Não utilizar desodorante|Não utilizar talco/)
 expect(explicit.reply).toMatch(/associação|confirme/i)
})
it('vias urinárias recupera o exame geral correto mesmo após retirar a associação de regulação', () => {
 const r=generateMockResponse('Meu ultrassom é de vias urinárias. Preciso chegar de bexiga cheia?', 'patient')
 expect(r.reply).toContain('bexiga cheia')
 expect(r.sources.every(s=>s.nome==='APARELHO URINÁRIO')).toBe(true)
 expect(r.sources.flatMap(s=>s.evidence??[]).some(f=>f.factId==='us-full-abdomen-bladder')).toBe(true)
})



it('preserva os grupos de enema e RXHIS sem fatos enquanto há conflitos pendentes', () => {
 for (const preparationId of ['rx_histerossalpingografia', 'rx_enema_opaco_adulto', 'rx_enema_opaco_crianca']) {
  expect(conflicts.conflitos.some(conflict => conflict.status === 'pending-udi' && conflict.preparo_ids.includes(preparationId))).toBe(true)
  expect(preparations.preparos[preparationId].fact_ids ?? []).toEqual([])
  const affected = exams.filter(exam => exam.preparo_id === preparationId)
  for (const exam of affected) {
   expect(factsForExam(exam, preparations.preparos[preparationId])).toEqual([])
   expect(registry.facts.some(fact => fact.appliesTo.includes(exam.sigla))).toBe(false)
  }
 }
 expect(exams.find(exam => exam.sigla === 'RXHIS')!.preparo_id).toBe('rx_histerossalpingografia')
})


it('todo o catálogo preserva preparo_id e responde ao paciente sem doses, esquemas ou nomes comerciais', () => {
 const medicationDetails = /Dulcolax|Ducolax|Laxol|Luftal|polaramine|buscopam|buscopan|\b\d+\s*mg\b|\b\d+\s*gotas\b|\b\d+\s*comprimidos?\b|de \d+ em \d+ horas|às \d+h/i
 for (const exam of exams) {
  expect(preparations.preparos[exam.preparo_id], exam.sigla).toBeDefined()
  for (const question of ['Qual o preparo?', 'Qual o jejum?']) {
   const response = composeAnswer(`${exam.nome_usual}. ${question}`, [exam], preparations, 'patient')!
   expect(response, exam.sigla).not.toBeNull()
   expect(response.reply, exam.sigla).not.toMatch(medicationDetails)
   expect(response.sources.every(source => !source.sigla), exam.sigla).toBe(true)
  }
 }
})

it('enema pediátrico mantém apenas o jejum herdado e encaminha a confirmação do conflito', () => {
 const exam = {
  sigla: 'test-enema-pediatrico',
  nome: 'Enema opaco pediátrico',
  nome_usual: 'Enema opaco pediátrico',
  sinonimos: [],
  modalidade: 'radiologia_convencional',
  preparo_id: 'rx_enema_opaco_crianca',
 }
 const response = composeAnswer('Qual o preparo?', [exam], preparations, 'patient')!
 expect(response.reply).toContain('jejum de 6 horas')
 expect(response.reply).toMatch(/confirme|confirmadas/i)
 expect(response.reply).not.toMatch(/não precisa realizar preparo|dispensa preparo|jejum.{0,30}12\s*(?:h|horas)|Ducolax|Dulcolax|20h|21h/i)
 expect(response.sources.flatMap(source => source.evidence ?? [])).toEqual([])
})

it('exames do grupo de esôfago sem fato próprio mantêm o jejum herdado de 6 horas', () => {
  for (const code of ['RXEED', 'RXTXC', 'RXDEG']) {
    const exam = exams.find(exam => exam.sigla === code)!
    expect(exam.preparo_id).toBe('rx_esofago')
    const response = composeAnswer('Qual o jejum?', [exam], preparations, 'patient')!
    expect(response.reply, code).toMatch(/jejum de 6 horas/i)
    expect(response.reply, code).not.toMatch(/Não tenho essa informação específica/)
  }
})
