import { evidenceText, factsForExam } from './documentary-evidence'
import { inpatientFlowMarkdown } from './inpatient-checklist'
import { normalize } from './search'
import { arrivalInstruction } from './preparation-policy'
import { REGION_TERMS } from './request-policy'
import { answerItems, standardPreparation } from './standard-answer'
import { restrictionsForExams } from './service-restrictions'
import type { Exame, PreparosFile, Profile, Source } from './types'

const medication = /medica[cç]|comprimido|gotas|\bmg\b|tomar|utilizar luftal|simeticona|polaramine|norfloxacino|suspens|suspend|analg[eé]sico|antiespasm|buscop/i
// "Não utilizar medicações sobre a pele" forbids a use; it is not a dose or schedule, so the patient must see it.
const prohibition = /^n[aã]o (utilizar|usar|aplicar|passar)\b/i
const dose = /comprimido|gotas|\bmg\b|tomar/i
const isMedicationInstruction = (s: string) => medication.test(s) && !(prohibition.test(s.trim()) && !dose.test(s))
const sentencesOf = (text: string) => text.split(/(?<=[.;])\s+/)
export function safeSentences(text: string) {
  return sentencesOf(text).filter(s => !isMedicationInstruction(s))
}
/** True when the inherited text had a medication instruction that the answer withheld. */
export function withheldMedication(text: string) {
  return sentencesOf(text).some(isMedicationInstruction)
}

/** Professional answers for CT, MRI and US carry the documented inpatient flow, which the patient answer does not need. */
export function inpatientBlock(exams: Exame[]): string {
  const modalities = [...new Set(exams.map(e => e.modalidade))]
  if (modalities.length !== 1 || !/tomografia|ressonancia|ultrassonografia/.test(modalities[0])) return ''
  const flow = inpatientFlowMarkdown(modalities[0])
  return flow ? `${flow.replace(/^\*\*[^*]+\*\*/, '**Se o paciente estiver internado**')}\n\nPara gerar o checklist por responsável e prazo (médico, véspera, jejum, enfermagem e setor), use **Checklist do internado** no topo do chat.` : ''
}

export function composeAnswer(message: string, candidates: Exame[], data: PreparosFile, profile: Profile, requestedMessage = message) {
  const q = normalize(message)
  const asked = /^(com|sem) (contraste|sedacao)[ .!]*$/.test(normalize(requestedMessage)) ? q : normalize(requestedMessage)
  // Specialized protocols must not be introduced by a generic query.
  const matched = candidates.filter(e => !/pre transplante/.test(normalize(e.nome)) || /transplante/.test(q))
  if (!matched.length) return null
  const sources: Source[] = matched.map(e => profile === 'professional' ? {nome:e.nome,sigla:e.sigla,evidenceStatus:'legacy-untraced'} : {nome:e.nome,evidenceStatus:'legacy-untraced'})
  const phoneMap = data.meta.orientacoes_gerais.telefones
  const phones = [...new Set(matched.map(e => /tomografia|ressonancia/.test(e.modalidade) ? phoneMap.tomografia_ressonancia : /ultrassonografia|densitometria/.test(e.modalidade) ? phoneMap.ultrassonografia_densitometria : /radiologia/.test(e.modalidade) ? phoneMap.raio_x_contrastado : phoneMap.imagem_geral))]
  const contact = `**Contato do setor:** ${phones.join('; ')}.`
  const inpatient = profile === 'professional' ? inpatientBlock(matched) : ''
  const withInpatient = (text: string) => inpatient ? `${text}\n\n${inpatient}` : text
  const ps = matched.map(e => data.preparos[e.preparo_id])
  // An exam is pending only if its group has no registered content AND no documentary fact applies to it.
  const pending = ps.every((p, i) => p?.status === 'pendente' && !factsForExam(matched[i], p).length)
  const sedationUnknown = !/com sedacao|sem sedacao/.test(q) && matched.some(e => /com sedacao/.test(normalize(e.nome)))
  const contrastUnknown = !/com contraste|sem contraste/.test(q) && matched.some(e => /com contraste/.test(normalize(e.nome))) && matched.some(e => /sem contraste/.test(normalize(e.nome)))
  const options = [...new Set(matched.map(e => e.nome_usual))].map(name => `- ${name}`).join('\n')
  const different = new Set(matched.map(e => e.preparo_id)).size > 1
  if (pending && matched.some(exam => exam.association_review?.status === 'needs-review')) return {reply:'A associação deste procedimento com as orientações disponíveis ainda precisa de revisão. Não tenho um preparo específico documentado para apresentar com segurança; confirme com o setor antes do exame.\n\n' + withInpatient(contact),sources}
  if (pending) return {reply:`Não tenho o preparo específico cadastrado para informar ${/jeju/.test(q) ? 'o jejum deste exame' : 'as orientações deste exame'}. Isso não significa que o exame dispense preparo. Confirme com o setor antes do exame.${sedationUnknown ? '\n\nO pedido informa com ou sem sedação? Essa informação ajuda a identificar a variante.' : ''}\n\n${withInpatient(contact)}`,sources}
  // CT/MRI asked without a body region: the top search hits are arbitrary, so ask the region instead of listing them.
  const regionMissing = matched.length > 1 && matched.every(e => /tomografia|ressonancia/.test(e.modalidade)) && !REGION_TERMS.test(normalize(requestedMessage)) && !REGION_TERMS.test(q)
  const askRegion = {reply:'Para identificar o exame, preciso saber a região do corpo que consta no pedido (por exemplo: abdome, tórax, crânio, coluna ou joelho). Se tiver o pedido em mãos, pode copiar o nome do exame aqui.\n\n' + contact, sources: []}
  if (regionMissing && (sedationUnknown || contrastUnknown || different)) return askRegion
  if (sedationUnknown || contrastUnknown || different) return {reply:`Preciso confirmar qual exame consta no pedido antes de detalhar o preparo. ${sedationUnknown ? 'É com ou sem sedação? ' : ''}${contrastUnknown ? 'É com ou sem contraste? ' : ''}${different ? 'Qual destes exames consta no pedido?\n\n' + options : ''}\n\n${contact}`,sources}
  const factSets = matched.map((exam, i) => factsForExam(exam, ps[i]))
  // Several exams of the same migrated group with the same items (e.g. the two urography codes) share one answer.
  const sameItems = answerItems(matched[0]).length > 0 && matched.every(e => e.preparo_id === matched[0].preparo_id && JSON.stringify(answerItems(e).map(i => i.id)) === JSON.stringify(answerItems(matched[0]).map(i => i.id)))
  if (!sameItems && new Set(factSets.map(fs => fs.map(f => f.factId).sort().join(','))).size > 1) return regionMissing ? askRegion : {reply:'Encontrei variantes com informações diferentes. Qual delas consta no pedido?\n\n' + options + '\n\n' + contact,sources}
  const p = ps[0]
  if (!p) return null
  const specificQuestion = /jeju|bexiga|antecedencia|quanto tempo.*cheg|com quanto tempo/.test(asked) && !/qual.*preparo|como.*prepar/.test(asked)
  if (matched.some(e => e.preparo_id === 'rm_contraste') && /jeju/.test(asked)) return {
    reply: 'O cadastro herdado contém orientações de jejum que dependem do tipo de ressonância, mas a fonte dessas condições ainda não foi reconciliada. Não consigo confirmar o tempo de jejum aplicável ao seu exame. Confirme com o setor antes do exame, informando a região, o contraste e a sedação constantes no pedido.\n\n' + contact,
    sources,
  }
  if (/\bdiu\b/.test(asked) && matched.every(e => e.preparo_id === 'rx_histerossalpingografia')) return {
    reply: 'O cadastro registra uma restrição para histerossalpingografia em pessoas que usam DIU. Isso precisa ser confirmado pela equipe do hospital; o chat não pode autorizar a realização do exame. Se usa DIU, informe isso ao setor antes do exame.\n\n' + contact,
    sources,
  }
  // Exams migrated to the standardized single source (data/orientacoes-preparo.json) are answered from it.
  const standard = sameItems ? standardPreparation(matched[0], profile, asked) : null
  if (standard) {
    for (const source of sources) { source.evidence = standard.evidence; source.evidenceStatus = 'documentary-only' }
    const arrival = arrivalInstruction([p.orientacoes])
    const out = [
      profile === 'patient' ? `Olá! Para **${(matched.length === 1 ? matched[0].nome_usual : p.titulo).toLowerCase()}**, estas são as orientações dos documentos do hospital:` : `**${p.titulo}**`,
      ...standard.lines,
      profile === 'patient'
        ? `**Importante:** estas orientações ainda precisam ser confirmadas pela equipe do hospital e não representam o preparo completo${standard.conflict ? '; há folhas com orientações diferentes' : ''}. Confirme com o setor antes do exame.`
        : `**Situação da informação:** itens do formato padronizado, com fonte e validação da UDI pendente${standard.conflict ? '; há folhas divergentes' : ''}. A dose e a classe são as da folha e da classificação proposta pela equipe.`,
    ]
    if (profile === 'professional') out.push(matched.map(e => `${e.nome} (código: ${e.sigla})`).join('\n'))
    if (profile === 'patient' && !specificQuestion) out.push('**O que levar:**\n\n- Documento de identificação com foto\n- Cartão do SUS\n- Cartão do Hospital\n- Pedido médico original\n- Exames anteriores relacionados, se houver', `**Quando chegar:** ${arrival}`)
    out.push(contact)
    if (inpatient) out.push(inpatient)
    if (profile === 'patient') out.push('Se tiver outra dúvida sobre o exame, pode perguntar. Estou à disposição!')
    return { reply: out.filter(Boolean).join('\n\n'), sources }
  }
  const documented = !!p.fact_ids?.length
  let usedFacts = factSets[0] ?? []
  // RM com contraste: as condições de jejum do cadastro herdado não foram reconciliadas; as demais instruções não medicamentosas podem ser mostradas.
  const mriContrast = matched.some(e => e.preparo_id === 'rm_contraste')
  // A group registered as "ok" keeps its inherited instructions for exams that no documentary fact covers
  // (e.g. the other exams of the esophagus group, whose fact applies only to RXESO).
  const keepInherited = documented && p.status === 'ok' && !usedFacts.length
  let sentences = documented ? [...usedFacts.map(f => evidenceText(f, profile)), ...(keepInherited ? safeSentences(p.orientacoes) : [])] : safeSentences(p.orientacoes)
  if (mriContrast) sentences = sentences.filter(s => !/jeju/i.test(s))
  if (specificQuestion) {
    sentences = sentences.filter(s => (/jeju/.test(asked) && /jeju/i.test(s)) || (/bexiga/.test(asked) && /bexiga/i.test(s)) || (/cheg|antecedencia/.test(asked) && /antecedencia|chegar|comparecer/i.test(normalize(s))))
    usedFacts = usedFacts.filter(f => sentences.includes(evidenceText(f, profile)))
  }
  // Tomography: facts cover only some exams, so say when fasting is not registered instead of staying silent.
  if (documented && !specificQuestion && matched.every(e => /^tc_/.test(e.preparo_id)) && !usedFacts.some(f => f.topic === 'fasting')) sentences.push('Não tenho o jejum deste exame cadastrado. Confirme com o setor.')
  if (documented) sources.forEach((source,i) => {
    source.evidence = factSets[i].filter(f => usedFacts.some(used => used.factId === f.factId))
    source.evidenceStatus = source.evidence.length ? 'documentary-only' : 'legacy-untraced'
  })
  const arrival = arrivalInstruction([p.orientacoes])
  if (/cheg|antecedencia/.test(asked) && !sentences.some(s => /antecedencia|chegar ao servico/.test(normalize(s)))) sentences.push(arrival)
  if (!sentences.length) sentences.push(/bexiga/.test(asked) ? 'Não tenho uma orientação específica sobre bexiga cadastrada para este exame. Isso não permite concluir que esse cuidado seja dispensado. Confirme com o setor.' : 'Não tenho essa informação específica registrada. Confirme com o setor.')
  if (profile === 'patient') sentences = sentences.filter(s => !/aghu|apac|ubs|secretaria de saude/i.test(normalize(s)))
  const blocks = [profile === 'patient' ? `Olá! Para **${(matched.length === 1 ? matched[0].nome_usual : p.titulo).toLowerCase()}**, estas são as informações cadastradas:` : `**${p.titulo}**`, sentences.map(s => /antecedencia|chegar ao servico/i.test(normalize(s)) ? `**Quando chegar:** ${s.replace(/^Comparecer/, 'Compareça')}` : /jejum/i.test(s) ? `**Jejum:** ${s}` : `- ${s}`).join('\n\n')]
  if (mriContrast && !specificQuestion) blocks.splice(1, 0, '**Jejum:** o cadastro herdado tem condições de jejum que dependem do tipo de ressonância e ainda não foram reconciliadas. Não consigo confirmar o tempo de jejum ' + (profile === 'patient' ? 'do seu exame' : 'deste exame') + '; confirme com o setor.')
  if (!documented && !specificQuestion && p.observacoes) blocks.push(safeSentences(p.observacoes).filter(s => profile !== 'patient' || !/aghu|apac|ubs|secretaria de saude/.test(normalize(s))).join(' '))
  if (withheldMedication(p.orientacoes + ' ' + (p.observacoes ?? '')) && !specificQuestion) blocks.push(profile === 'patient' ? '**Medicamentos:** orientações sobre medicamentos precisam ser confirmadas com o médico ou com a UDI; não altere seu tratamento com base no chat.' : '**Medicamentos:** o cadastro cita medicamentos neste preparo. Dose e esquema precisam ser confirmados com o protocolo da UDI antes da prescrição; no paciente internado, eles precisam constar na prescrição enviada junto.')
  if (documented) blocks.push(profile === 'patient' ? '**Importante:** estas orientações ainda precisam ser confirmadas pela equipe do hospital e não representam o preparo completo. Confirme com o setor antes do exame, inclusive sobre medicamentos, se houver.' : '**Situação da informação:** trechos localizados no documento recebido, com validação da UDI pendente. Estas informações são parciais; confirme o preparo completo com o setor, inclusive orientações adicionais e sobre medicamentos, quando houver.')
  else if (p.status === 'parcial') blocks.push('O cadastro é parcial. Confirme com o setor as orientações não registradas.')
  else blocks.push('**Origem da informação:** cadastro herdado do projeto; a fonte documental deste conteúdo ainda não foi reconciliada.')
  const serviceLimits = specificQuestion ? [] : restrictionsForExams(matched)
  if (serviceLimits.length) blocks.push((profile === 'patient' ? '**Antes de vir:**' : '**Restrições do serviço:**') + '\n\n' + serviceLimits.map(r => `- ${evidenceText(r, profile)}`).join('\n'))
  if (profile === 'professional') blocks.push(matched.map(e => `${e.nome} (código: ${e.sigla})`).join('\n'))
  if (profile === 'patient') {
    blocks.push('**O que levar:**\n\n- Documento de identificação com foto\n- Cartão do SUS\n- Cartão do Hospital\n- Pedido médico original\n- Exames anteriores relacionados, se houver')
    if (!sentences.some(s => /antecedencia|chegar ao servico/i.test(normalize(s)))) blocks.push(`**Quando chegar:** ${arrival}`)
  }
  blocks.push(contact)
  if (inpatient) blocks.push(inpatient)
  if (profile === 'patient') blocks.push('Se tiver outra dúvida sobre o exame, pode perguntar. Estou à disposição!')
  return {reply:blocks.filter(Boolean).join('\n\n'), sources}
}
