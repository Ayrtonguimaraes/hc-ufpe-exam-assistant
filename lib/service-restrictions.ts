import registry from '@/data/documentary-evidence.json'
import { normalize } from './search'
import type { EvidenceReference, Exame } from './types'

type Trigger = { type: 'weight' | 'age' | 'terms'; above?: number; below?: number; terms?: string[] }
type Restriction = { id: string; text: string; topic: string; appliesTo: string[]; locator: string; quote: string; sourceId: string; modality: string; trigger?: Trigger; showWithExam?: boolean }

const restrictions = (registry.facts as Restriction[]).filter(f => f.topic === 'restriction')

const MRI = /\b(ressonancia|resonancia|rm|ressonancias)\b/

function triggered(t: Trigger, q: string): boolean {
  if (t.terms?.some(term => q.includes(normalize(term)))) return true
  if (t.type === 'weight' && t.above !== undefined) {
    return [...q.matchAll(/(\d{2,3})(?:[.,]\d+)?\s*(?:kg|quilos?|kilos?)\b/g)].some(m => Number(m[1]) > t.above!)
  }
  if (t.type === 'age' && t.below !== undefined) {
    return [...q.matchAll(/\b(\d{1,2})\s*anos?\b/g)].some(m => Number(m[1]) < t.below!)
      || /\b(\d{1,2})\s*mes(es)?\b/.test(q)
  }
  return false
}

function asEvidence(r: Restriction): EvidenceReference {
  const source = registry.sources[r.sourceId as keyof typeof registry.sources]
  return { factId: r.id, text: r.text, topic: r.topic, sourceTitle: source.title, sourceHash: source.sha256, locator: r.locator, quote: r.quote, validation: 'pending-udi' }
}

/** Service restrictions the user's own words point to, in an MRI conversation. */
export function restrictionsForQuestion(question: string, exams: Exame[] = []): EvidenceReference[] {
  const q = normalize(question)
  const mriContext = MRI.test(q) || (exams.length > 0 && exams.every(e => e.modalidade === 'ressonancia_magnetica'))
  if (!mriContext) return []
  return restrictions.filter(r => r.trigger && triggered(r.trigger, q)).map(asEvidence)
}

/** Restrictions to remind whenever an MRI exam is answered (e.g. weight and age limits). */
export function restrictionsForExams(exams: Exame[]): EvidenceReference[] {
  if (!exams.length || !exams.every(e => e.modalidade === 'ressonancia_magnetica')) return []
  return restrictions.filter(r => r.showWithExam && exams.every(e => r.appliesTo.includes(e.sigla))).map(asEvidence)
}
