import examesData from "@/data/exames.json"
import preparosData from "@/data/preparos.json"
import flowData from "@/data/inpatient-flow.json"
import registry from "@/data/documentary-evidence.json"
import { factsForExam } from "./documentary-evidence"
import { normalize } from "./search"
import { prettifyExamName } from "./exam-options"
import { daysBefore, fastingHours, standardItemsFor, standardSource, type StandardItem } from "./standard-preparation"
import type { Exame, PreparosFile } from "./types"

const exames = examesData as Exame[]
const preparos = preparosData as PreparosFile

type SourcedText = { text: string; sourceId: string; locator: string; modalities?: string[] }
type ReportItem = SourcedText & { condition: ReportCondition }
type FlowFile = {
  sources: Record<string, string>
  flows: Record<string, { title: string; steps: SourcedText[] }>
  nursing: { common: SourcedText[]; contrast: Record<"default" | "angio" | "central" | "mri", SourcedText> }
  report: ReportItem[]
}
const flow = flowData as FlowFile

/** Modalities with an inpatient flow or checklist content in the documents. */
export const INPATIENT_MODALITIES = [
  "tomografia_computadorizada",
  "ressonancia_magnetica",
  "ultrassonografia",
  "radiologia_convencional",
] as const

export type ReportCondition = "isolamento" | "covid" | "acamado" | "oxigenio" | "obesidade" | "infusao" | "curativo"

export type PatientConditions = {
  diabetico?: boolean
  alergiaContraste?: boolean
  sedacao?: boolean
  hemodialise?: boolean
  acessoCentral?: boolean
  instavel?: boolean
  isolamento?: boolean
  covid?: boolean
  acamado?: boolean
  oxigenio?: boolean
  infusao?: boolean
  curativo?: boolean
  /** Peso em kg. */
  pesoKg?: number
  /** Idade em anos. */
  idade?: number
}

export type ChecklistItem = {
  text: string
  /** Document and locator, or an explicit note that the catalog has a gap. */
  source: string
  /** Triggered by a condition marked by the professional. */
  highlight?: boolean
}

export type ChecklistSectionId = "ao_pedir" | "antecedencia" | "jejum" | "antes_de_descer" | "informar_setor"

export type ChecklistSection = {
  id: ChecklistSectionId
  title: string
  responsible: string
  items: ChecklistItem[]
}

/** Handover to the imaging unit in SBAR form: what was checked, by whom, before the patient is sent. */
export type Handoff = { situacao: string; historico: string; avaliacao: string[]; recomendacao: string; source: string }

export type ChecklistOptions = {
  /** Date and time of the exam; when given, each step gets a concrete start time. */
  examAt?: Date
}

export type InpatientChecklist = {
  exam: { nome: string; sigla: string; modalidade: string }
  examAt?: string
  handoff: Handoff
  alerts: ChecklistItem[]
  sections: ChecklistSection[]
  flow: { title: string; steps: ChecklistItem[] } | null
  contact: string
  disclaimer: string
}

const PENDING = "validação pendente"
const CATALOG_GAP = "Lacuna no cadastro — validar com a UDI"
const DISCLAIMER =
  "Checklist de apoio gerado a partir dos documentos do setor e do cadastro do projeto. Todos os itens estão com validação pendente pela UDI e pela enfermagem. Não substitui a prescrição, o protocolo institucional nem a avaliação do radiologista. Não contém dados de paciente nem integração com o AGHU."

const MEDICATION = /medica[cç]|comprimido|gotas|\bmg\b|polaramine|norfloxacino|bisacodil|dulcolax|laxol|luftal|simeticona/i
const DIABETES = /diabetes|metformina/i
const AHEAD = /antev[eé]spera|v[eé]spera|48\s?h|dias? antes|\d+ dias|ap[oó]s o jantar|um dia ap[oó]s/i
const FASTING = /jejum/i


const CBR_METFORMIN = "Diretrizes para o uso de meios de contraste intravenosos (equipe do curso AVR/CBR, adaptadas da ESUR v10) — divergência a decidir pela UDI"
const HANDOFF_SOURCE = "Proposta do projeto: passagem de cuidado em formato SBAR (validação pendente pela UDI e pela enfermagem)"

const pad = (n: number) => String(n).padStart(2, "0")
const day = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
const clock = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/** "→ sem comer nem beber a partir das 06:00 de 17/11" when the exam time is known. */
function fastingTime(text: string | StandardItem, examAt?: Date): string {
  const hours = fastingHours(text)
  if (!examAt || !hours) return ""
  const start = new Date(examAt.getTime() - hours * 3600_000)
  return ` → sem comer nem beber a partir das ${clock(start)} de ${day(start)}.`
}

/** "→ começar em 16/11 (véspera)" when the exam date is known. */
function startDay(days: number | undefined, examAt?: Date): string {
  if (days === undefined) return ""
  const label = days === 1 ? "véspera" : days === 2 ? "antevéspera" : `${days} dias antes`
  if (!examAt) return ` Começa ${days === 1 || days === 2 ? "na " : ""}${label}.`
  const start = new Date(examAt.getTime() - days * 86400_000)
  return ` → começar em ${day(start)} (${label}).`
}

/** Items that depend on a patient condition only apply when the professional marked it. */
function conditionApplies(item: StandardItem, c: PatientConditions, child: boolean): boolean {
  const cond = item.condicao ?? ""
  if (!cond) return true
  if (cond.includes("crianca")) return child
  if (cond.startsWith("diabetic")) return !!c.diabetico
  if (cond === "historico_de_alergia") return !!c.alergiaContraste
  if (cond === "hemodialise") return !!c.hemodialise
  return true
}

const CONFLICT_PREFIX = "Folhas divergentes (decisão da UDI pendente): "

/** Medication text: the dose written in the sheet is an adult dose, so it is never shown for a child unless the item is for children. */
function drugText(item: StandardItem, child: boolean): string {
  const m = item.medicamento!
  const prefix = item.estado === "conflito-pendente" ? CONFLICT_PREFIX : ""
  if (child && !item.condicao?.includes("crianca") && m.classe !== "D") {
    return `${prefix}${item.texto} Dose para criança não documentada na folha (a posologia registrada é de adulto): definir com o médico assistente e confirmar com a UDI.`
  }
  return `${prefix}${item.texto} Na fonte: ${m.posologiaNaFonte}.${m.exigeReceita ? " Exige receita." : ""}`
}

function itemText(item: StandardItem): string {
  return `${item.estado === "conflito-pendente" ? CONFLICT_PREFIX : ""}${item.texto}${item.ressalva ? ` (${item.ressalva})` : ""}`
}

function cite(item: Pick<SourcedText, "sourceId" | "locator">): string {
  return `${flow.sources[item.sourceId] ?? item.sourceId} — ${item.locator} (${PENDING})`
}

function fromSourced(item: SourcedText, highlight = false): ChecklistItem {
  return { text: item.text, source: cite(item), ...(highlight ? { highlight } : {}) }
}

function catalogSource(titulo: string): string {
  return `Cadastro de preparos — ${titulo} (${PENDING})`
}

function sentencesOf(text: string | undefined): string[] {
  return (text ?? "").split(/(?<=[.;])\s+/).map(s => s.trim()).filter(Boolean)
}

function factText(id: string): { text: string; source: string } | null {
  const fact = (registry.facts as { id: string; text: string; textProfessional?: string; sourceId: string; locator: string }[]).find(f => f.id === id)
  if (!fact) return null
  const source = registry.sources[fact.sourceId as keyof typeof registry.sources]
  return { text: fact.textProfessional ?? fact.text, source: `${source.title} — ${fact.locator} (${PENDING})` }
}

function phoneFor(modalidade: string): string {
  const tel = preparos.meta.orientacoes_gerais.telefones
  if (/tomografia|ressonancia/.test(modalidade)) return tel.tomografia_ressonancia
  if (/ultrassonografia|densitometria/.test(modalidade)) return tel.ultrassonografia_densitometria
  if (/radiologia/.test(modalidade)) return tel.raio_x_contrastado
  return tel.imagem_geral
}

/** Contrast and sedation come from the exam name first; the preparation group is the fallback. */
export function examAttributes(exam: Exame) {
  const name = normalize(exam.nome)
  const contrast = /sem contraste/.test(name)
    ? false
    : /com contraste|angio|colangio/.test(name) || /contraste/.test(exam.preparo_id)
  const sedation = /com sedacao/.test(name) ? true : /sem sedacao/.test(name) ? false : undefined
  const angio = /angio/.test(name)
  const intravenous = contrast && /tomografia|ressonancia/.test(exam.modalidade)
  return { contrast, sedation, angio, intravenous }
}

export function inpatientExams(): Exame[] {
  return exames.filter(e => (INPATIENT_MODALITIES as readonly string[]).includes(e.modalidade))
}

export function examLabel(exam: Exame): string {
  return exam.label_paciente ?? prettifyExamName(exam.nome_usual)
}

/** Inpatient flow steps documented for a modality, with their sources. */
export function inpatientFlow(modalidade: string): { title: string; steps: ChecklistItem[] } | null {
  if (modalidade === "radiologia_convencional") {
    const rx = preparos.meta.fluxo_raiox
    if (!rx) return null
    return {
      title: "Raio-X — paciente internado",
      steps: rx.passos.map(p => ({ text: p.replace(/^\d+(\.\d+)?\.\s*/, ""), source: `Fluxo de solicitação Raio-X (cadastro do projeto) (${PENDING})` })),
    }
  }
  const f = flow.flows[modalidade]
  return f ? { title: f.title, steps: f.steps.map(s => fromSourced(s)) } : null
}

/**
 * Builds the inpatient preparation checklist split by who acts and when.
 * Pure: no patient data is stored, only the exam and the conditions ticked in the form.
 */
export function buildInpatientChecklist(sigla: string, conditions: PatientConditions = {}, modalidade?: string, options: ChecklistOptions = {}): InpatientChecklist | null {
  const exam = exames.find(e => e.sigla === sigla && (!modalidade || e.modalidade === modalidade))
  if (!exam) return null
  const preparo = preparos.preparos[exam.preparo_id]
  const attrs = examAttributes(exam)
  const isCT = exam.modalidade === "tomografia_computadorizada"
  const isMRI = exam.modalidade === "ressonancia_magnetica"
  const isRX = exam.modalidade === "radiologia_convencional"
  const sedation = attrs.sedation ?? !!conditions.sedacao
  const pending = !preparo || preparo.status === "pendente"
  const registered = pending ? [] : sentencesOf(preparo.orientacoes).concat(sentencesOf(preparo.observacoes))
  const src = catalogSource(preparo?.titulo ?? exam.preparo_id)
  const examAt = options.examAt && !Number.isNaN(options.examAt.getTime()) ? options.examAt : undefined
  // A child, by the informed age or by the exam itself: adult doses from the sheets are never shown.
  const child = (conditions.idade !== undefined && conditions.idade < 12) || /pediatric|infantil|crianca/.test(normalize(exam.nome))
  const std = standardItemsFor(exam).filter(i => conditionApplies(i, conditions, child))
  // Same drug from two sheets (e.g. simethicone in the general document and in the scanned sheet): one line, both sources.
  const drugSources = new Map<string, string[]>()
  const stdDrugs: StandardItem[] = []
  for (const i of std.filter(i => i.medicamento && i.medicamento.classe !== "D").sort((a, b) => Number(a.estado === "conflito-pendente") - Number(b.estado === "conflito-pendente"))) {
    const key = `${i.tipo}:${i.medicamento!.principioAtivo}:${i.condicao ?? ""}`
    if (!drugSources.has(key)) { drugSources.set(key, []); stdDrugs.push(i) }
    drugSources.get(key)!.push(standardSource(i))
  }
  const drugSource = (i: StandardItem) => drugSources.get(`${i.tipo}:${i.medicamento!.principioAtivo}:${i.condicao ?? ""}`)?.join("; ") ?? standardSource(i)
  const handoffItems = new Set<string>()
  const facts = preparo ? factsForExam(exam, preparo).filter(f => f.topic === "fasting") : []

  const alerts: ChecklistItem[] = []
  const aoPedir: ChecklistItem[] = []
  const antecedencia: ChecklistItem[] = []
  const jejum: ChecklistItem[] = []
  const descer: ChecklistItem[] = []
  const informar: ChecklistItem[] = []

  // Service restrictions that rule the exam out come first.
  if (isMRI && (conditions.pesoKg ?? 0) > 120) {
    const f = factText("rm-weight-limit")
    if (f) alerts.push({ ...f, highlight: true })
  }
  if (isMRI && conditions.idade !== undefined && conditions.idade < 8) {
    const f = factText("rm-age-limit")
    if (f) alerts.push({ ...f, highlight: true })
  }
  if (attrs.sedation === false && conditions.sedacao) {
    alerts.push({ text: "O exame selecionado é sem sedação, mas o paciente foi marcado como necessitando de sedação. Confira a variante solicitada no AGHU.", source: CATALOG_GAP, highlight: true })
  }
  if (pending) {
    alerts.push(facts.length || std.length
      ? { text: `O preparo deste exame está documentado só em parte: os itens abaixo vêm dos documentos. Confirme o restante com o setor (${phoneFor(exam.modalidade)}).`, source: CATALOG_GAP, highlight: true }
      : { text: `O preparo específico deste exame não está cadastrado. Isso não significa que o exame dispense preparo; confirme com o setor (${phoneFor(exam.modalidade)}).`, source: CATALOG_GAP, highlight: true })
  }

  // 1. Ao pedir (médico)
  const requestStep = isRX ? inpatientFlow("radiologia_convencional")?.steps[0] : inpatientFlow(exam.modalidade)?.steps[0]
  if (requestStep && /aghu/i.test(requestStep.text)) aoPedir.push(requestStep)
  if (stdDrugs.length) {
    // Standardized items: medication with class, dose as written in the sheet and its source page.
    for (const i of stdDrugs) {
      const verb = i.tipo === "suspensao_medicamento" ? "Ajuste de medicação de uso contínuo" : i.medicamento!.classe === "A" ? "Prescrever o preparo (indispensável)" : "Se indicado"
      aoPedir.push({ text: `${verb}: ${drugText(i, child)}`, source: drugSource(i), highlight: i.indispensavel })
      if (i.indispensavel) handoffItems.add(`${i.tipo === "suspensao_medicamento" ? "Suspensão de" : "Medicamento do preparo:"} ${i.medicamento!.principioAtivo} prescrito e em curso`)
    }
    if (conditions.diabetico && attrs.contrast && stdDrugs.some(i => /metformina/.test(i.medicamento!.principioAtivo))) {
      aoPedir.push({ text: "As diretrizes do CBR (curso AVR, adaptadas da ESUR v10) mantêm a metformina quando a TFGe é de 30 mL/min/1,73 m² ou mais; a regra da folha é mais restritiva. Registrar a função renal do paciente e confirmar com a UDI qual regra vale.", source: CBR_METFORMIN })
    }
  } else {
    const meds = registered.filter(s => MEDICATION.test(s) && !DIABETES.test(s))
    for (const s of meds) {
      aoPedir.push(child
        ? { text: "Prescrever o medicamento do preparo previsto no cadastro. Dose para criança não documentada (a posologia registrada é de adulto): definir com o médico assistente e confirmar com a UDI.", source: src, highlight: true }
        : { text: `Prescrever o medicamento do preparo, conforme o cadastro: ${s} Confirmar dose e esquema com o protocolo da UDI (inventário de medicamentos em validação).`, source: src, highlight: true })
    }
  }
  if (conditions.diabetico && attrs.contrast && !stdDrugs.some(i => /metformina|antidiab/.test(i.medicamento!.principioAtivo))) {
    const mriRule = registered.find(s => DIABETES.test(s))
    aoPedir.push(mriRule
      ? { text: `Paciente diabético: o cadastro registra "${mriRule}" Ajustar a metformina conforme o protocolo da instituição.`, source: src, highlight: true }
      : { text: "Paciente diabético em exame com contraste: ajustar a metformina conforme o protocolo. O prazo de suspensão não está cadastrado para este exame; confirmar com a UDI.", source: CATALOG_GAP, highlight: true })
  }
  if (conditions.alergiaContraste && attrs.contrast) {
    const f = isCT ? factText("tc-contrast-allergy") : null
    if (f) alerts.push({ ...f, highlight: true })
    aoPedir.push({ text: "Alergia prévia a contraste: avaliar com o radiologista a necessidade de antialérgico antes de manter o exame.", source: f?.source ?? CATALOG_GAP, highlight: true })
  }
  if (conditions.hemodialise && attrs.contrast) {
    aoPedir.push({ text: "Paciente em hemodiálise: não há orientação cadastrada sobre contraste e diálise; discutir com o radiologista antes do exame.", source: CATALOG_GAP, highlight: true })
  }
  if (sedation) {
    aoPedir.push(isMRI
      ? { text: "Sedação: o preparo de sedação da RM está apenas em papel no setor (\"verificar no papel\"). Confirmar o protocolo com a UDI ao pedir.", source: cite({ sourceId: "orientacoes-tc-rm", locator: "P35–36" }), highlight: true }
      : { text: "Sedação: confirmar com o setor o protocolo de sedação e o horário do exame, que define o início do jejum.", source: CATALOG_GAP, highlight: true })
  }

  // 2. 48h ou véspera
  const ahead = std.filter(i => daysBefore(i) !== undefined && i.tipo !== "jejum" && i.medicamento?.classe !== "D" && (!i.medicamento || stdDrugs.includes(i)))
  if (ahead.length) {
    for (const i of ahead) {
      const m = i.medicamento
      const text = m
        ? `${i.tipo === "suspensao_medicamento" ? "Suspender" : "Iniciar"} ${m.principioAtivo} no prazo, conforme a prescrição feita ao pedir.`
        : itemText(i)
      antecedencia.push({ text: text + startDay(daysBefore(i), examAt), source: m ? drugSource(i) : standardSource(i), highlight: !!m && i.indispensavel })
      if (!m && i.indispensavel) handoffItems.add(i.texto)
    }
  } else {
    for (const s of registered.filter(s => AHEAD.test(s) && !(FASTING.test(s) && !MEDICATION.test(s)))) {
      if (DIABETES.test(s) && !conditions.diabetico) continue
      const text = MEDICATION.test(s) && child ? "Iniciar no prazo o medicamento do preparo prescrito pelo médico (dose para criança não documentada)." : MEDICATION.test(s) ? `Iniciar no prazo (medicamento prescrito): ${s}` : s
      antecedencia.push({ text, source: src, highlight: MEDICATION.test(s) })
    }
  }
  if (isCT) antecedencia.push({ text: "O setor de TC confirma com o andar só na véspera: preparos que começam antes disso precisam ser iniciados pelo andar sem esperar essa ligação.", source: cite({ sourceId: "orientacoes-tc-rm", locator: "P63; fluxograma — hipótese H1 a validar" }) })
  if (isMRI) antecedencia.push(fromSourced(flow.flows.ressonancia_magnetica.steps[1]))
  if (!antecedencia.length) antecedencia.push({ text: "Nenhum preparo com antecedência (48h, antevéspera ou véspera) registrado no cadastro para este exame.", source: pending ? CATALOG_GAP : src })

  // 3. Jejum
  const stdFasting = std.filter(i => i.tipo === "jejum")
  const unreconciledMRI = exam.preparo_id === "rm_contraste"
  if (stdFasting.length) {
    for (const i of stdFasting) jejum.push({ text: itemText(i) + fastingTime(i, examAt), source: standardSource(i), highlight: i.estado === "conflito-pendente" })
    handoffItems.add(stdFasting.length > 1 ? "Jejum conforme a folha indicada pelo setor (há folhas divergentes)" : stdFasting[0].texto)
  } else if (facts.length) {
    for (const f of facts) jejum.push({ text: f.text + fastingTime(f.text, examAt), source: `${f.sourceTitle} — ${f.locator} (${PENDING})` })
  } else if (!unreconciledMRI) {
    for (const s of registered.filter(s => FASTING.test(s))) jejum.push({ text: s + fastingTime(s, examAt), source: src })
  }
  if (!jejum.length) {
    jejum.push({ text: unreconciledMRI
      ? "O cadastro tem condições de jejum para RM com contraste que dependem do tipo de exame e ainda não foram reconciliadas. Confirmar o tempo de jejum com o setor."
      : "Jejum não cadastrado para este exame. Confirmar com o setor antes de liberar a dieta.", source: CATALOG_GAP, highlight: sedation })
  }
  jejum.push({ text: "Se o horário do exame mudar, recalcular o início do jejum a partir do novo horário.", source: "Hipótese H4 do levantamento (PRO-15) — validar com a UDI" })

  // 4. Antes de descer (enfermagem do andar)
  if (isRX) {
    descer.push({ text: "Não há checklist de internos cadastrado para raio-X. Os técnicos de plantão decidem entre exame no leito ou deslocamento; confirmar com o setor o que deve acompanhar o paciente.", source: `Fluxo de solicitação Raio-X (cadastro do projeto) (${PENDING})` })
  } else {
    for (const item of flow.nursing.common.filter(i => !i.modalities || i.modalities.includes(exam.modalidade))) {
      const highlight = /inst[aá]vel/i.test(item.text) && !!conditions.instavel
      descer.push(fromSourced(item, highlight))
    }
  }
  if (attrs.intravenous) {
    const c = flow.nursing.contrast
    descer.push(fromSourced(isMRI ? c.mri : isCT && attrs.angio ? c.angio : c.default))
    if (conditions.acessoCentral) descer.push(fromSourced(c.central, true))
  }

  // 5. Informar ao setor
  const obese = (conditions.pesoKg ?? 0) > 120
  const reportItems: ReportItem[] = isRX
    ? (["isolamento", "acamado", "oxigenio", "obesidade"] as ReportCondition[]).map(condition => ({
        ...flow.report.find(r => r.condition === condition)!,
        sourceId: "catalogo",
        locator: "fluxo de solicitação de raio-X, passo 3",
      }))
    : flow.report.filter(r => !r.modalities || r.modalities.includes(exam.modalidade))
  for (const r of reportItems) {
    const marked = r.condition === "obesidade" ? obese : !!conditions[r.condition]
    informar.push({ text: marked ? `SIM — ${r.text}` : r.text, source: cite(r), ...(marked ? { highlight: true } : {}) })
  }

  const sections: ChecklistSection[] = [
    { id: "ao_pedir", title: "Ao pedir", responsible: "Médico", items: aoPedir },
    { id: "antecedencia", title: "48h ou véspera", responsible: "Médico e enfermagem do andar", items: antecedencia },
    { id: "jejum", title: "Jejum", responsible: "Enfermagem do andar", items: jejum },
    { id: "antes_de_descer", title: "Antes de descer", responsible: "Enfermagem do andar", items: descer },
    { id: "informar_setor", title: "Informar ao setor", responsible: "Enfermagem do andar", items: informar },
  ]

  const marked = Object.entries(conditions).filter(([k, v]) => v !== undefined && v !== false && !["pesoKg", "idade"].includes(k)).map(([k]) => k)
  if (conditions.pesoKg) marked.push(`peso ${conditions.pesoKg} kg`)
  if (conditions.idade !== undefined) marked.push(`idade ${conditions.idade} anos`)
  if (!stdFasting.length) for (const i of jejum.filter(i => !/recalcular/i.test(i.text))) handoffItems.add(i.text.split(" → ")[0])
  if (!stdDrugs.length) for (const i of aoPedir.filter(i => i.highlight)) handoffItems.add(i.text.split(" Confirmar dose")[0])
  const handoff: Handoff = {
    situacao: `Paciente internado para ${exam.nome} (${exam.sigla})${examAt ? `, exame em ${day(examAt)} às ${clock(examAt)}` : ""}.`,
    historico: `Condições informadas: ${marked.length ? marked.join(", ") : "nenhuma marcada"}.`,
    avaliacao: [...handoffItems],
    recomendacao: `Se algum item indispensável não foi feito, avisar o setor (${phoneFor(exam.modalidade)}) antes de enviar o paciente, para remarcar ou ajustar o horário.`,
    source: HANDOFF_SOURCE,
  }

  return {
    exam: { nome: exam.nome, sigla: exam.sigla, modalidade: exam.modalidade },
    ...(examAt ? { examAt: `${day(examAt)} às ${clock(examAt)}` } : {}),
    handoff,
    alerts,
    sections: sections.filter(s => s.items.length),
    flow: inpatientFlow(exam.modalidade),
    contact: phoneFor(exam.modalidade),
    disclaimer: DISCLAIMER,
  }
}

/** Plain-text version to copy or print and attach to the prescription. */
export function checklistToText(c: InpatientChecklist): string {
  const lines = [
    "CHECKLIST DE PREPARO — PACIENTE INTERNADO",
    `Exame: ${c.exam.nome} (código AGHU: ${c.exam.sigla})${c.examAt ? ` — ${c.examAt}` : ""}`,
    "",
  ]
  if (c.alerts.length) {
    lines.push("ATENÇÃO")
    for (const a of c.alerts) lines.push(`(!) ${a.text}`, `    Fonte: ${a.source}`)
    lines.push("")
  }
  for (const s of c.sections) {
    lines.push(`${s.title.toUpperCase()} — ${s.responsible}`)
    for (const i of s.items) lines.push(`[ ] ${i.highlight ? "(!) " : ""}${i.text}`, `    Fonte: ${i.source}`)
    lines.push("    Conferido por: ____________________  às __:__", "")
  }
  const h = c.handoff
  lines.push("PASSAGEM PARA O SETOR DE IMAGEM (SBAR)", `S — ${h.situacao}`, `B — ${h.historico}`, "A — Preparo:")
  for (const a of h.avaliacao) lines.push(`    [ ] feito  [ ] não feito — ${a}`)
  lines.push(`R — ${h.recomendacao}`, `    Fonte: ${h.source}`, "")
  lines.push(`Contato do setor: ${c.contact}`, "Responsável pela checagem: ____________________   Data: ___/___/_____", "", c.disclaimer)
  return lines.join("\n")
}

/** Short markdown summary of the documented flow, used in the professional chat. */
export function inpatientFlowMarkdown(modalidade: string): string | null {
  const f = inpatientFlow(modalidade)
  if (!f) return null
  return `**${f.title}** (documentos do setor, validação pendente):\n\n` + f.steps.map((s, i) => `${i + 1}. ${s.text}`).join("\n")
}

const INPATIENT_CUE = /\binternad[oa]s?\b|\binternacao\b|\benfermaria\b|\bandar\b|\bleito\b|\bmaqueiro\b|\bjelco\b|acesso venoso|prescricao junto|checklist/
const RX_CUE = /\braio\s?x\b|\brx\b|radiologia|radiografia/

/** A professional asking how an inpatient exam (CT, MRI, US) is requested and sent. Raio-X keeps its own flow. */
export function asksInpatientFlow(message: string): boolean {
  const q = normalize(message)
  return INPATIENT_CUE.test(q) && !RX_CUE.test(q)
}

const MODALITY_WORDS: [string, RegExp][] = [
  ["tomografia_computadorizada", /\b(tomo|tomografia|tc|angiotomografia|angiotc)\b/],
  ["ressonancia_magnetica", /\b(ressonancia|resonancia|rm|angioressonancia)\b/],
  ["ultrassonografia", /\b(ultrassom|ultrasom|ultrassonografia|usg|us|eco|ecografia)\b/],
]

/** Modalities named in the message, or the ones of the identified exams. */
export function inpatientModalities(message: string, exams: Exame[] = []): string[] {
  const fromExams = [...new Set(exams.map(e => e.modalidade))].filter(m => m in flow.flows)
  if (fromExams.length) return fromExams
  const q = normalize(message)
  const named = MODALITY_WORDS.filter(([, re]) => re.test(q)).map(([m]) => m)
  return named.length ? named : ["tomografia_computadorizada", "ressonancia_magnetica", "ultrassonografia"]
}
