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

it('corrige abdômen total com bexiga cheia e evidência por informação', () => {
 const r=generateMockResponse('Vou fazer ultrassom de abdômen total. Qual o preparo?', 'patient')
 expect(r.reply).toContain('bexiga cheia')
 expect(r.reply).toContain('Jejum de 4 a 6h')
 expect(r.reply).toContain('confirmadas pela equipe do hospital')
 const facts=r.sources.flatMap(s=>s.evidence??[])
 expect(facts.some(f=>f.factId==='us-full-abdomen-bladder' && f.locator==='parágrafos 34–35')).toBe(true)
 expect(facts.every(f=>f.validation==='pending-udi' && f.sourceHash.length===64)).toBe(true)
 expect(r.reply).not.toMatch(/40 gotas|simeticona|suspend/i)
})
it('não transfere bexiga cheia de total para superior nem mistura candidatos de fatos diferentes', () => {
 const e=exams.find(e=>e.sigla==='USABD')!
 const r=composeAnswer('Ultrassom abdominal superior', [e], preparations,'patient')!
 expect(r.reply).not.toContain('bexiga cheia')
 expect(r.sources.flatMap(s=>s.evidence??[]).map(f=>f.factId)).toEqual(['us-abdomen-fasting'])
 const both=composeAnswer('Ultrassom de abdômen', [e,exams.find(e=>e.sigla==='USABT')!], preparations,'patient')!
 expect(both.reply).toContain('Qual delas consta no pedido?')
 expect(both.reply).toContain('ULTRASSONOGRAFIA ABDOMINAL SUPERIOR')
 expect(both.reply).toContain('ULTRASSONOGRAFIA DE ABDOMEN TOTAL')
 expect(both.reply).not.toContain('Jejum de')
})
it('Doppler renal tem o próprio trecho de jejum, sem virar preparo urinário', () => {
 const e=exams.find(e=>e.sigla==='USAR')!
 expect(e.preparo_id).toBe('us_doppler_arterias_renais')
 const r=composeAnswer('Doppler de artérias renais', [e], preparations,'patient')!
 expect(r.reply).toContain('8h')
 expect(r.reply).not.toContain('bexiga cheia')
 expect(r.sources[0].evidence?.[0].locator).toBe('parágrafos 24–25')
})
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
it('pergunta somente sobre jejum não atribui a uma fonte fato que não foi apresentado', () => {
 const e=exams.find(e=>e.sigla==='USABT')!
 const r=composeAnswer('Ultrassom de abdômen total, qual o jejum?', [e], preparations, 'patient')!
 expect(r.sources.flatMap(s=>s.evidence??[]).map(f=>f.factId)).toEqual(['us-abdomen-fasting'])
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

it('muda a apresentação por perfil sem eliminar a evidência ou inventar validação', () => {
 const patient=generateMockResponse('Vou fazer ultrassom de abdômen total. Qual o preparo?', 'patient')
 const professional=generateMockResponse('Vou fazer ultrassom de abdômen total. Qual o preparo?', 'professional')
 expect(patient.reply).not.toMatch(/parágrafos|SHA-256|validação da UDI pendente/)
 expect(patient.reply).toContain('não representam o preparo completo')
 expect(professional.reply).toContain('validação da UDI pendente')
 expect(patient.sources.flatMap(s=>s.evidence??[])).toEqual(professional.sources.flatMap(s=>s.evidence??[]))
})

it.each([
 ['RXESO', 'rx_esofago', 'rx-esofago-jejum', 'Exames escaneados.pdf', '146d1fb27928c0298caf345ce15201e7c48e9a720ad5ff19863f736f9b140d10', 'página 5, instrução de jejum', 'REALIZAR JEJUM DE 6H ANTES DA REALIZAÇÃO DO EXAME.'],
 ['RXTDE', 'rx_transito_intestinal', 'rx-transito-intestinal-jejum', 'Scanned 9 Nov 2026 at 180448.pdf', '7831ddb32cad3a72141b707ccb8c157c1a2789fe3d718d47555330fab87fbae0', 'página 5, seção no dia do exame', 'O PACIENTE DEVERÁ ESTAR EM JEJUM POR 6h'],
 ['RXTIN', 'rx_transito_intestinal', 'rx-transito-intestinal-jejum', 'Scanned 9 Nov 2026 at 180448.pdf', '7831ddb32cad3a72141b707ccb8c157c1a2789fe3d718d47555330fab87fbae0', 'página 5, seção no dia do exame', 'O PACIENTE DEVERÁ ESTAR EM JEJUM POR 6h'],
])('%s recupera somente o jejum documentado de 6 horas para seu grupo', (code, preparationId, factId, sourceTitle, sourceHash, locator, quote) => {
 const exam = exams.find(exam => exam.sigla === code)!
 expect(exam.preparo_id).toBe(preparationId)
 const response = composeAnswer('Qual o preparo?', [exam], preparations, 'patient')!
 expect(response.reply).toContain('Jejum de 6 horas antes do exame.')
 expect(response.reply).toContain('confirmadas pela equipe do hospital')
 expect(response.sources.flatMap(source => source.evidence ?? [])).toEqual([
  { factId, text: 'Jejum de 6 horas antes do exame.', topic: 'fasting', sourceTitle, sourceHash, locator, quote, validation: 'pending-udi' },
 ])
 expect(response.reply).not.toMatch(/não há necessidade|nenhum preparo|12 horas|bexiga cheia|Dulcolax|Norfloxacino/i)
})

it.each([
 ['RXUR1', 'rx_urografia_excretora', 'rx-urografia-preparo-documentado', 'Exames escaneados.pdf', '146d1fb27928c0298caf345ce15201e7c48e9a720ad5ff19863f736f9b140d10', 'página 2, título e cabeçalho de medicações', 'PREPARO UROGRAFIA EXCRETORA / MEDICAÇÕES PARA TOMAR:'],
 ['RXUR4', 'rx_urografia_excretora', 'rx-urografia-preparo-documentado', 'Exames escaneados.pdf', '146d1fb27928c0298caf345ce15201e7c48e9a720ad5ff19863f736f9b140d10', 'página 2, título e cabeçalho de medicações', 'PREPARO UROGRAFIA EXCRETORA / MEDICAÇÕES PARA TOMAR:'],
 ['RXURE', 'rx_uretrocistografia_adulto', 'rx-uretrocistografia-preparo-documentado', 'Scanned 9 Nov 2026 at 180448.pdf', '7831ddb32cad3a72141b707ccb8c157c1a2789fe3d718d47555330fab87fbae0', 'página 4, título e cabeçalho de medicamento', 'PREPARO EXAME DE URETROCISTOGRAFIA MICCIONAL / TOMAR O MEDICAMENTO:'],
 ['RXURP', 'rx_uretrocistografia_crianca', 'rx-uretrocistografia-preparo-documentado', 'Scanned 9 Nov 2026 at 180448.pdf', '7831ddb32cad3a72141b707ccb8c157c1a2789fe3d718d47555330fab87fbae0', 'página 4, título e cabeçalho de medicamento', 'PREPARO EXAME DE URETROCISTOGRAFIA MICCIONAL / TOMAR O MEDICAMENTO:'],
])('%s apresenta preparo documentado e encaminha instruções medicamentosas à UDI', (code, preparationId, factId, sourceTitle, sourceHash, locator, quote) => {
 const exam = exams.find(exam => exam.sigla === code)!
 expect(exam.preparo_id).toBe(preparationId)
 const response = composeAnswer('Qual o preparo?', [exam], preparations, 'patient')!
 expect(response.reply).toContain('Há preparo documentado que envolve medicamento. Confirme as instruções medicamentosas com a UDI antes do exame.')
 expect(response.sources.flatMap(source => source.evidence ?? [])).toEqual([
  { factId, text: 'Há preparo documentado que envolve medicamento. Confirme as instruções medicamentosas com a UDI antes do exame.', topic: 'medication-confirmation', sourceTitle, sourceHash, locator, quote, validation: 'pending-udi' },
 ])
 expect(JSON.stringify(response)).not.toMatch(/Dulcolax|Ducolax|Norfloxacino|\bmg\b|comprimidos?|gotas|12\s*(?:h|horas)|3 dias|18h|após o jantar|na véspera/i)
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

it.each(['USABT', 'USABD'])('%s mantém a orientação cadastrada sem promover alternativas pendentes', code => {
 const exam = exams.find(exam => exam.sigla === code)!
 expect(exam.preparo_id).toBe('us_abdômen')
 const response = composeAnswer('Qual o preparo?', [exam], preparations, 'patient')!
 expect(response.reply).toMatch(/confirme|confirmadas/i)
 expect(response.reply).toContain('Jejum de 4 a 6h')
 expect(response.reply).not.toMatch(/jejum.{0,30}8\s*(?:h|horas)|3898/i)
 expect(JSON.stringify(response)).not.toMatch(/Ducolax|Dulcolax|simeticona|Luftal|40 gotas|20h|21h/i)
})

it('todo o catálogo preserva preparo_id e responde ao paciente sem medicamentos, doses ou esquemas', () => {
 const medicationDetails = /Dulcolax|Ducolax|Laxol|Luftal|simeticona|polaramine|norfloxacino|bisacodil|buscopam|buscopan|metformina|leite de magnésia|\b\d+\s*mg\b|\b\d+\s*gotas\b|\b\d+\s*comprimidos?\b|de \d+ em \d+ horas|às \d+h/i
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
