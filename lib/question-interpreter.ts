import preparosData from "@/data/preparos.json"
import { generateMockResponse } from "./mock-response"
import type { ChatMessage, PreparosFile, Profile, Source } from "./types"

/**
 * The language model only INTERPRETS the question into structured fields.
 * It never writes the answer: the fields are validated, turned into a catalog
 * query, and the existing deterministic renderer answers from the catalog.
 * Any failure (no key, timeout, invalid JSON, invalid field) returns null and
 * the caller keeps the previous behaviour.
 */

const MODALITIES = {
  tomografia_computadorizada: "tomografia",
  ressonancia_magnetica: "ressonância",
  ultrassonografia: "ultrassonografia",
  radiologia_convencional: "raio-x",
  mamografia: "mamografia",
  densitometria_ossea: "densitometria óssea",
  medicina_nuclear: "cintilografia",
} as const
type Modality = keyof typeof MODALITIES

const TOPICS = ["preparo", "jejum", "bexiga", "documentos", "chegada", "agendamento", "duracao", "acompanhante", "resultado", "outro"] as const
type Topic = (typeof TOPICS)[number]

export type Interpretation = {
  modalidade: Modality | null
  exame: string | null
  contraste: "com" | "sem" | null
  sedacao: "com" | "sem" | null
  lado: "direito" | "esquerdo" | null
  topico: Topic
  varios_exames: boolean
}

export const GROQ_MODEL = "openai/gpt-oss-120b"

/** Words that indicate the exam type, including lay ones. Without any, the model must not choose a modality. */
export const MODALITY_CUE = /\b(tomo|tomografia|tomografias|angiotomografia|tc|ressonancia|resonancia|ressonancias|rm|angioressonancia|eco|ecografia|ultrassom|ultrasom|ultrassonografia|usg|us|raio|rx|chapa|radiografia|mamo|mamografia|densitometria|osso|ossos|cintilografia|histerossalpingografia|uretrocistografia|enterotomografia)\b/

const SYSTEM = `Você interpreta perguntas de pacientes sobre exames de imagem do HC-UFPE. NÃO responda a pergunta. Devolva APENAS um JSON com estes campos:
- "modalidade": um de ${Object.keys(MODALITIES).join(", ")}, ou null se a pessoa não indicou o tipo de exame.
- "exame": a região do corpo ou o nome do procedimento no vocabulário do catálogo hospitalar (ex.: "tórax", "crânio", "abdome total", "abdome superior", "coluna lombar", "joelho", "enterotomografia", "histerossalpingografia", "vias urinárias", "tireoide"), ou null se não foi dito. Não invente região.
- "contraste": "com", "sem" ou null. "sedacao": "com", "sem" ou null. "lado": "direito", "esquerdo" ou null.
- "topico": o que a pessoa quer saber, um de ${TOPICS.join(", ")}.
- "varios_exames": true SOMENTE se a mensagem atual cita dois ou mais exames diferentes a fazer. Exames mencionados só no histórico não contam.
Regras: perguntas sobre comer, beber ou ficar sem comer são "jejum"; sobre levar documentos são "documentos"; sobre horário de chegada são "chegada"; marcar, remarcar, desmarcar ou agendar é "agendamento". Traduza linguagem leiga ("chapa", "raio x do pulmão" = radiologia_convencional + tórax; "tomo" = tomografia; "eco" ou "ultrassom" = ultrassonografia; "mamo" = mamografia; "exame de osso fraco" = densitometria_ossea). Se a mensagem atual for curta e completar a conversa (ex.: "sem sedação", "abdome"), use o histórico para preencher os campos. Não deduza a modalidade pela região do corpo: "exame de crânio" sem dizer o tipo é modalidade null. Na dúvida, use null.`

function str(v: unknown, max = 60): string | null {
  return typeof v === "string" && v.trim() && v.length <= max && !/[\n\r]/.test(v) ? v.trim() : null
}

/** Strict validation: anything outside the expected shape is dropped. */
export function parseInterpretation(raw: unknown): Interpretation | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const modalidade = o.modalidade === null || o.modalidade === undefined ? null : (Object.keys(MODALITIES).includes(o.modalidade as string) ? (o.modalidade as Modality) : undefined)
  if (modalidade === undefined) return null
  const topico = TOPICS.includes(o.topico as Topic) ? (o.topico as Topic) : null
  if (!topico) return null
  const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | null => (allowed.includes(v as T) ? (v as T) : null)
  return {
    modalidade,
    exame: str(o.exame),
    contraste: pick(o.contraste, ["com", "sem"] as const),
    sedacao: pick(o.sedacao, ["com", "sem"] as const),
    lado: pick(o.lado, ["direito", "esquerdo"] as const),
    topico,
    varios_exames: o.varios_exames === true,
  }
}

export async function interpretQuestion(message: string, history: ChatMessage[], fetchImpl: typeof fetch = fetch): Promise<Interpretation | null> {
  const key = process.env.GROQ_API_KEY
  if (!key) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetchImpl("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0,
        max_completion_tokens: 600,
        reasoning_effort: "low",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          ...history.slice(-4).map((m) => ({ role: m.role, content: m.content.slice(0, 400) })),
          { role: "user", content: message.slice(0, 600) },
        ],
      }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const content = data.choices?.[0]?.message?.content
    return content ? parseInterpretation(JSON.parse(content)) : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const TOPIC_WORDS: Record<Topic, string> = {
  preparo: "qual o preparo", jejum: "precisa de jejum", bexiga: "bexiga cheia", documentos: "quais documentos levar",
  chegada: "com quanto tempo chegar", agendamento: "", duracao: "", acompanhante: "", resultado: "", outro: "qual o preparo",
}

const REDUNDANT: Record<string, RegExp> = {
  mamografia: /^(mamas?|seios?|peito)$/,
  densitometria_ossea: /^(ossos?|[oó]ssea|corpo inteiro)$/,
}

/** Catalog query built only from validated fields. */
export function queryFromInterpretation(i: Interpretation): string {
  const parts = [
    i.modalidade ? MODALITIES[i.modalidade] : "",
    // "mama" in a mammography or "osso" in a densitometry repeats the modality and is absent from catalog names.
    i.exame && !(REDUNDANT[i.modalidade ?? ""]?.test(i.exame.toLowerCase())) ? i.exame : "",
    i.contraste ? `${i.contraste} contraste` : "",
    i.sedacao ? `${i.sedacao} sedação` : "",
    i.lado ?? "",
    TOPIC_WORDS[i.topico],
  ]
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim()
}

const preparos = preparosData as PreparosFile
function phoneFor(modalidade: Modality | null): string {
  const t = preparos.meta.orientacoes_gerais.telefones
  if (modalidade === "tomografia_computadorizada" || modalidade === "ressonancia_magnetica") return t.tomografia_ressonancia
  if (modalidade === "ultrassonografia" || modalidade === "densitometria_ossea") return t.ultrassonografia_densitometria
  return t.imagem_geral
}

/** Guard against the model reading several exams from the history: the current message must name at least two. */
function severalExamsInMessage(message: string): boolean {
  const q = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  if (!q) return true
  const hits = q.match(/\b(tomografia|tomo|ressonancia|resonancia|rm|ultrassom|ultrassonografia|eco|raio ?x|rx|mamografia|densitometria|cintilografia|joelho|coluna|cranio|torax|abdome|abdomen|ombro|punho|quadril|pelve|mama)\b/g) ?? []
  return new Set(hits).size >= 2 || /\be (da|do|de) /.test(q) && hits.length >= 1
}

const NOT_PREPARATION: Topic[] = ["agendamento", "duracao", "acompanhante", "resultado"]
/** A non-preparation topic only counts when the message itself has a matching word. */
const TOPIC_CUE: Partial<Record<Topic, RegExp>> = {
  agendamento: /\b(marc\w*|remarc\w*|desmarc\w*|agend\w*|vaga|horario)\b/,
  duracao: /\b(demora|dura|duracao|quanto tempo leva|leva quanto)\b/,
  acompanhante: /\bacompanhante/,
  resultado: /\b(resultado|laudo)\b/,
  documentos: /\b(document\w*|levar|leva|levo|cartao|identidade|rg|cpf|pedido|guia|sus)\b/,
}
const plain = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

export function answerFromInterpretation(i: Interpretation, profile: Profile, history: ChatMessage[], message = ""): { reply: string; sources: Source[] } | null {
  const greet = (text: string) => (profile === "patient" && !history.length ? "Olá!\n\n" : "") + text + (profile === "patient" ? "\n\nSe tiver outra dúvida sobre o exame, pode perguntar. Estou à disposição!" : "")
  if (i.varios_exames && severalExamsInMessage(message)) return { reply: greet("Você mencionou mais de um exame. Vamos um de cada vez para eu não misturar as orientações: qual deles você quer ver primeiro? Se puder, copie o nome como está no pedido."), sources: [] }
  const cue = TOPIC_CUE[i.topico]
  if ((NOT_PREPARATION.includes(i.topico) || i.topico === "documentos") && cue && !cue.test(plain(message))) i = { ...i, topico: "preparo" }
  if (NOT_PREPARATION.includes(i.topico)) return {
    reply: greet(`Não tenho essa informação cadastrada. O setor pode responder: ${phoneFor(i.modalidade)}.`),
    sources: [],
  }
  // The message names an exam type the model could not place: let the catalog search answer (e.g. "not in the catalog").
  if (!i.modalidade && !i.exame && MODALITY_CUE.test(plain(message))) return null
  if (!i.modalidade && !i.exame) return { reply: greet("Para eu responder, preciso saber qual exame você vai fazer. Pode me dizer o nome que está no pedido médico?"), sources: [] }
  return generateMockResponse(queryFromInterpretation(i), profile, history)
}
