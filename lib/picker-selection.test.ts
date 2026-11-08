import { test, expect } from "vitest"
import { POST } from "@/app/api/chat/route"
import exames from "@/data/exames.json"
import preparos from "@/data/preparos.json"
import { buildQuery } from "@/lib/exam-options"
import type { Exame } from "@/lib/types"

const all = exames as Exame[]
const P = (preparos as any).preparos
const ask = async (e: Exame) => {
  delete process.env.CLAUDE_API_KEY
  const r = await POST(new Request("http://x/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: buildQuery(e), profile: "patient", history: [], examSigla: e.sigla, examModalidade: e.modalidade }) }))
  return r.json()
}

test("clique no seletor, em qualquer dos 814 exames, nunca devolve pergunta de esclarecimento", async () => {
  const visible = all
  const bad: string[] = []
  for (const e of visible) {
    const b = await ask(e)
    if (b.reason !== "picker-selection" || /qual regi[aã]o|qual destes|preciso confirmar qual exame|com ou sem (sedação|contraste)/i.test(b.reply)) bad.push(e.nome)
  }
  expect(bad).toEqual([])
}, 120000)

test("sigla desconhecida cai no caminho antigo", async () => {
  const r = await POST(new Request("http://x/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "ultrassom de abdômen total", profile: "patient", history: [], examSigla: "NAOEXISTE" }) }))
  expect((await r.json()).reason).not.toBe("picker-selection")
})

test("seletor lista todos os 814 exames, inclusive os pendentes", async () => {
  const { getModalidades, getExamsForModalidade } = await import("@/lib/exam-options")
  const total = getModalidades().reduce((n, m) => n + getExamsForModalidade(m.modalidade).length, 0)
  expect(total).toBe(all.length)
})

test("exame pendente escolhido no seletor informa que não há preparo e indica o telefone", async () => {
  const e = all.find((x) => x.sigla === "TCTX")!
  const b = await ask(e)
  expect(b.reply).toMatch(/n[aã]o tenho o preparo espec[ií]fico cadastrado/i)
  expect(b.reply).toMatch(/\(81\) 2126 3873/)
  expect(b.reply).not.toMatch(/dispensa preparo\.$/)
})
