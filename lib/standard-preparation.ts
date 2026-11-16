import standardData from "@/data/orientacoes-preparo.json"
import sourcesData from "@/data/fontes.json"
import type { Exame } from "./types"

/** One atomic preparation item from data/orientacoes-preparo.json (see docs/padrao-dados.md). */
export type StandardItem = {
  id: string
  aplicaA: { exames?: string[]; grupo?: string }
  tipo: string
  texto: string
  momento?: { inicio?: string; fim?: string; duracao?: string; duracaoMin?: string; duracaoMax?: string }
  condicao?: string
  publico: string[]
  indispensavel: boolean
  medicamento?: { principioAtivo: string; nomeComercial?: string; posologiaNaFonte: string; classe: "A" | "B" | "C" | "D"; exigeReceita: boolean }
  fonte: { id: string; local: string; trecho: string }
  fontesAdicionais?: { id: string; local: string }[]
  estado: "documental-pendente-udi" | "conflito-pendente" | "sem-fonte-documental" | "validado-udi"
  conflito?: string
  ressalva?: string
  versao?: string
}

const items = (standardData as unknown as { itens: StandardItem[] }).itens
const sources = (sourcesData as { sources: Record<string, { title: string }> }).sources

const STATE: Record<StandardItem["estado"], string> = {
  "documental-pendente-udi": "validação pendente",
  "conflito-pendente": "folhas divergentes, decisão da UDI pendente",
  "sem-fonte-documental": "sem fonte localizada; cadastro herdado",
  "validado-udi": "validado pela UDI",
}

/** Items that apply to an exam, by its AGHU code or by its preparation group. */
export function standardItemsFor(exam: Exame): StandardItem[] {
  return items.filter(i => i.aplicaA.exames?.includes(exam.sigla) || i.aplicaA.grupo === exam.preparo_id)
}

export function standardSource(item: StandardItem): string {
  const refs = [item.fonte, ...(item.fontesAdicionais ?? [])].map(f => `${sources[f.id]?.title ?? f.id} — ${f.local}`)
  return `${refs.join("; ")} (${STATE[item.estado]})`
}

/** Days before the exam encoded as "-P1D", "-P2D"; undefined when the item has no start before the exam day. */
export function daysBefore(item: StandardItem): number | undefined {
  const m = item.momento?.inicio?.match(/^-P(\d+)D$/)
  return m ? Number(m[1]) : undefined
}

/** Fasting hours from an ISO duration ("PT12H") or from a sentence ("jejum de 4 horas", "Jejum de 4 a 6h": the longest). */
export function fastingHours(source: StandardItem | string): number | undefined {
  if (typeof source !== "string") {
    const iso = source.momento?.duracaoMax ?? source.momento?.duracao
    const m = iso?.match(/^PT(\d+)H$/)
    if (m) return Number(m[1])
    return fastingHours(source.texto)
  }
  const nums = [...source.matchAll(/(\d+)\s*(?:a\s*(\d+)\s*)?(?:h\b|horas)/gi)].map(m => Number(m[2] ?? m[1]))
  return /jejum/i.test(source) && nums.length ? Math.max(...nums) : undefined
}
