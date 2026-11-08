import { normalize } from "./search"
import { wantsAggregateCount } from "./aggregate"

/** Anatomical terms that identify where a CT/MRI is done; without one, the catalog cannot pick an exam. */
export const REGION_TERMS = /barriga|cabeca|costas|abdom|cranio|encefalo|torax|pulmao|pelve|bacia|coluna|lombar|cervical|joelho|ombro|mama|mao|maos|\bpe\b|pes\b|punho|quadril|colangio|pescoco|face|orbita|perna|braco|cotovelo|tornozelo|sacro|coracao|cardiac|prostata|figado|rim|renal|bexiga|urinari|tireoide|ouvido|seios|sela|hipofise|atm|aorta|membro|coxa|torno|calcane|dedo|femur|esterno|clavicul|costela|arcos|articula|enterot|entero|vias biliares|biliar|plexo|osso/

export function deterministicIntent(message: string): "count" | "documents" | "clarify" | "attributes" | "missing" | undefined {
  if (wantsAggregateCount(message)) return "count"
  const q = normalize(message)
  if (/nao (?:esta|consta) na (?:lista|base)|fora (?:da lista|do catalogo)/.test(q)) return 'missing'
  if (['contraste', 'sedacao'].some(attribute => q.includes(`com ${attribute}`) && q.includes(`sem ${attribute}`))) return 'attributes'
  if (/document|cartao/.test(q) && !/jejum|preparo|bexiga/.test(q)) return "documents"
  // A generic MRI request lacks an anatomical target; do not select the first exam.
  if (/jeju|preparo/.test(q) && /\b(ressonancia|rm)\b/.test(q) && !REGION_TERMS.test(q)) return "clarify"
  return undefined
}

/** A specific preparation question is not a catalog listing. */
export function wantsListaRaiox(message: string): boolean {
  const q = normalize(message)
  return /\braio x\b|\brx\b|radiologia|contrastad/.test(q) &&
    /\b(?:quais|que) (?:sao os )?exames\b|\b(?:liste|listar|lista de|todos os exames)\b/.test(q)
}
