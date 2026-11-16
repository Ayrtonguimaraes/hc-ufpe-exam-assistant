import sourcesData from "@/data/fontes.json"
import { normalize } from "./search"
import standardData from "@/data/orientacoes-preparo.json"
import { standardItemsFor, type StandardItem } from "./standard-preparation"
import type { EvidenceReference, Exame, Profile } from "./types"

/**
 * Preparation groups whose chat answer comes from data/orientacoes-preparo.json (the single standardized source):
 * the contrast X-ray sheets and the ultrasound exams with medication or scanned sheets. CT and MRI still use the
 * documentary facts, because their allergy and contrast rules live there.
 */
export const STANDARD_GROUPS = new Set([
  "rx_urografia_excretora",
  "rx_uretrocistografia_adulto",
  "rx_uretrocistografia_crianca",
  "rx_histerossalpingografia",
  "rx_esofago",
  "rx_transito_intestinal",
  "us_abdômen",
  "us_doppler_arterias_renais",
])

const sources = (sourcesData as { sources: Record<string, { title: string; sha256: string | null }> }).sources
const isChild = (exam: Exame) => /pediatric|infantil|crianca/.test(normalize(exam.nome))

/** Items shown in a general answer: those that depend on a patient condition stay for the professional checklist. */
export function answerItems(exam: Exame): StandardItem[] {
  if (!STANDARD_GROUPS.has(exam.preparo_id)) return []
  return standardItemsFor(exam).filter(i => !i.condicao || i.condicao === "constipacao")
}

function cite(i: StandardItem): string {
  return [i.fonte, ...(i.fontesAdicionais ?? [])].map(f => `${sources[f.id]?.title ?? f.id}, ${f.local}`).join("; ")
}

function drugLine(i: StandardItem, profile: Profile, child: boolean): string {
  const m = i.medicamento!
  if (profile === "professional") {
    const dose = child && !i.condicao?.includes("crianca") ? "dose para criança não documentada (a da folha é de adulto)" : `na fonte: ${m.posologiaNaFonte}`
    return `${i.texto} (${dose}; classe ${m.classe}${m.exigeReceita ? ", exige receita" : ""}; fonte: ${cite(i)})`
  }
  const who = m.exigeReceita
    ? "Esse remédio precisa de receita do médico que pediu o exame; se ainda não tem, fale com ele antes."
    : "Combine com o médico que pediu o exame antes de usar."
  const kid = child ? " A dose para criança é definida pelo médico." : ""
  // The patient sees what the medicine is and when it starts, never the dose or the schedule.
  const text = i.texto.replace(/\s*de \d+ em \d+ ?h(oras)?/gi, "").replace(/\s*\d+\s*(mg|gotas|comprimidos?)\b/gi, "").replace(/\s+([,.;])/g, "$1")
  return m.classe === "A" ? `${text} ${who}${kid}` : `Se o médico indicar: ${text}${kid}`
}

const line = (i: StandardItem, profile: Profile) => {
  const conflict = i.estado === "conflito-pendente"
  if (profile === "professional") return `${conflict ? "[folhas divergentes] " : ""}${i.texto}${i.ressalva ? ` (${i.ressalva})` : ""} (fonte: ${cite(i)})`
  return conflict ? `Segundo uma folha do hospital ainda a confirmar com o setor: ${i.texto.charAt(0).toLowerCase()}${i.texto.slice(1)}` : i.texto
}

/** The preparation part of the answer, built from the standardized items. Returns null when the exam is not in a migrated group. */
export function standardPreparation(exam: Exame, profile: Profile, asked: string): { lines: string[]; evidence: EvidenceReference[]; conflict: boolean } | null {
  let items = answerItems(exam)
  if (!items.length) return null
  if (/jeju/.test(asked) && !/preparo/.test(asked)) items = items.filter(i => i.tipo === "jejum")
  else if (/bexiga/.test(asked) && !/preparo/.test(asked)) items = items.filter(i => i.tipo === "bexiga")
  const child = isChild(exam)
  const lines: string[] = []

  const fasting = items.filter(i => i.tipo === "jejum")
  const fastingConflict = fasting.some(i => i.estado === "conflito-pendente") && fasting.length > 1
  if (fastingConflict) {
    lines.push(`**Jejum:** as orientações do hospital divergem: ${fasting.map(i => `${i.versao ?? "documento"} — ${i.texto.replace(/\s*\(.*\)\.?$/, "").replace(/\.$/, "")}`).join("; ")}. Confirme com o setor qual vale.${profile === "professional" ? ` (fontes: ${fasting.map(cite).join("; ")})` : ""}`)
  } else {
    for (const i of fasting) lines.push(`**Jejum:** ${line(i, profile)}`)
  }

  // One line per kind of instruction: the bladder appears in the general document and in the scanned sheet.
  const seen = new Set<string>()
  const others = items
    .filter(i => i.tipo !== "jejum" && !i.medicamento)
    .sort((a, b) => Number(a.estado === "conflito-pendente") - Number(b.estado === "conflito-pendente"))
  for (const i of others) {
    if (i.tipo === "bexiga" && seen.has("bexiga")) continue
    seen.add(i.tipo)
    lines.push(`- ${line(i, profile)}`)
  }

  const drugs: StandardItem[] = []
  for (const i of items.filter(i => i.medicamento).sort((a, b) => Number(a.estado === "conflito-pendente") - Number(b.estado === "conflito-pendente"))) {
    if (i.medicamento!.classe === "D") { lines.push(`- ${line(i, profile)}`); continue }
    if (!drugs.some(d => d.medicamento!.principioAtivo === i.medicamento!.principioAtivo)) drugs.push(i)
  }
  if (drugs.length) {
    lines.push(`**Remédios do preparo:**\n\n${drugs.map(i => `- ${drugLine(i, profile, child)}`).join("\n")}`)
  }

  const evidence: EvidenceReference[] = items.map(i => ({
    factId: i.id,
    text: i.texto,
    topic: i.tipo,
    sourceTitle: sources[i.fonte.id]?.title ?? i.fonte.id,
    sourceHash: sources[i.fonte.id]?.sha256 ?? "",
    locator: i.fonte.local,
    quote: i.fonte.trecho,
    validation: "pending-udi",
  }))
  return { lines, evidence, conflict: items.some(i => i.estado === "conflito-pendente") }
}

const allItems = (standardData as unknown as { itens: StandardItem[] }).itens

/**
 * Exams that have preparation sheets but no code in the AGHU catalog received (contrast enema, CT-guided lung biopsy).
 * Without this, the search answers with another exam (e.g. contrast CT for "enema opaco").
 */
export function noCatalogExamAnswer(message: string, profile: Profile): { reply: string; sources: { nome: string; evidenceStatus: "documentary-only"; evidence: EvidenceReference[] }[] } | null {
  const q = normalize(message)
  const greet = (text: string) => (profile === "patient" ? "Olá!\n\n" : "") + text + (profile === "patient" ? "\n\nSe tiver outra dúvida sobre o exame, pode perguntar. Estou à disposição!" : "")
  const evidenceOf = (items: StandardItem[]): EvidenceReference[] => items.map(i => ({ factId: i.id, text: i.texto, topic: i.tipo, sourceTitle: sources[i.fonte.id]?.title ?? i.fonte.id, sourceHash: sources[i.fonte.id]?.sha256 ?? "", locator: i.fonte.local, quote: i.fonte.trecho, validation: "pending-udi" }))
  if (/\b(enema|clister)\b/.test(q)) {
    const items = allItems.filter(i => /rx_enema_opaco/.test(i.aplicaA.grupo ?? ""))
    const body = profile === "patient"
      ? "O enema opaco não aparece no catálogo de exames que recebemos do hospital, mas existem folhas de preparo para ele, com versões diferentes para adulto e para criança. Em todas, o preparo tem dieta nos dias anteriores, laxantes que precisam ser orientados pelo médico que pediu o exame e jejum no dia do exame. Peça a folha de preparo ao setor e confirme qual versão vale para você.\n\n**Contato do setor (raio-X contrastado):** (81) 2126 3872."
      : "**Enema opaco** (sem código no catálogo AGHU recebido; folhas divergentes, decisão da UDI pendente):\n\n" + items.map(i => `- [${i.versao ?? (i.condicao ? "criança" : "")}] ${i.texto}${i.medicamento ? ` (na fonte: ${i.medicamento.posologiaNaFonte})` : ""} (fonte: ${cite(i)})`).join("\n") + "\n\n**Contato do setor:** (81) 2126 3872."
    return { reply: greet(body), sources: [{ nome: "ENEMA OPACO (folhas de preparo, sem código no catálogo)", evidenceStatus: "documentary-only", evidence: evidenceOf(items) }] }
  }
  if (/biopsia/.test(q) && /pulm/.test(q)) {
    const items = allItems.filter(i => /^tc-biopsia-pulmonar/.test(i.id))
    const body = `**Biópsia pulmonar guiada por tomografia** (folha do hospital, validação pendente; o exame não tem código no catálogo recebido):\n\n${items.map(i => `- ${line(i, profile)}`).join("\n")}\n\n**Contato:** Unidade de Diagnóstico por Imagem Especializada, (81) 2126-3889, conforme a folha.`
    return { reply: greet(body), sources: [{ nome: "BIÓPSIA PULMONAR GUIADA POR TOMOGRAFIA (folha, sem código no catálogo)", evidenceStatus: "documentary-only", evidence: evidenceOf(items) }] }
  }
  return null
}
