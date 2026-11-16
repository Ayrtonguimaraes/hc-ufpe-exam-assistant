import { normalize } from "./search"
import type { Exame, Source } from "./types"

// Words that name a modality or attribute appear in hundreds of exam names and say nothing about which exam it is.
const GENERIC = new Set(["tomografia", "ressonancia", "ultrassonografia", "ultrassom", "radiografia", "mamografia", "densitometria", "cintilografia", "contraste", "contrastado", "sedacao", "magnetica", "computadorizada", "esquerdo", "esquerda", "direito", "direita", "superior", "inferior", "preparo", "precisa", "exame", "exames", "paciente", "pacientes", "internado", "criança", "crianca"])
const MAX_EXAMS = 20
// Compares word stems so that "urinárias" matches "URINARIO" and "hepática" matches "HEPATICO".
const stem = (w: string) => w.slice(0, w.length >= 9 ? w.length - 2 : w.length - 1)

/**
 * Technical exam words from the message that are rare in the catalog (e.g. "uretrocistografia", "urografia"):
 * when the user writes one, the answer must be about an exam whose name contains it.
 */
export function rareCatalogTerms(message: string, exames: Exame[]): string[] {
  const names = exames.map(e => normalize(`${e.nome} ${e.nome_usual ?? ""}`))
  const words = [...new Set(normalize(message).split(/[^a-z0-9]+/).filter(w => w.length >= 7 && !GENERIC.has(w)))]
  return words.filter(w => {
    const hits = names.filter(n => n.includes(stem(w))).length
    return hits > 0 && hits <= MAX_EXAMS
  })
}

/** True when the message names a rare catalog term and none of the answer's exams carries it. */
export function answerDropsNamedTerm(message: string, sources: Source[], exames: Exame[]): boolean {
  const terms = rareCatalogTerms(message, exames)
  if (!terms.length) return false
  const answered = sources.map(s => normalize(s.nome))
  return !terms.some(t => answered.some(n => n.includes(stem(t))))
}
