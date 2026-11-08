import registry from '@/data/documentary-evidence.json'
import type { EvidenceReference, Exame, Preparo } from './types'

type Fact = { id: string; text: string; topic: string; appliesTo: string[]; locator: string; quote: string; sourceId: string; modality: string; supersedes?: string[] }
const facts = registry.facts as Fact[]

/**
 * Each fact is bound to explicit exam identifiers, never inferred from a shared preparation.
 * A fact may supersede others (e.g. a notice that two fasting rules conflict): when it applies
 * to the exam, the superseded facts are not shown.
 */
export function factsForExam(exam: Exame, preparation: Preparo): EvidenceReference[] {
  const selected = new Set(preparation.fact_ids ?? [])
  const applicable = facts.filter(f => selected.has(f.id) && f.modality === exam.modalidade && f.appliesTo.includes(exam.sigla))
  const hidden = new Set(applicable.flatMap(f => f.supersedes ?? []))
  return applicable.filter(f => !hidden.has(f.id)).map(f => {
    const source = registry.sources[f.sourceId as keyof typeof registry.sources]
    return {factId:f.id,text:f.text,topic:f.topic,sourceTitle:source.title,sourceHash:source.sha256,locator:f.locator,quote:f.quote,validation:'pending-udi'}
  })
}
