import { test, expect } from "vitest"
import { POST } from "@/app/api/chat/route"
import exames from "@/data/exames.json"
import { buildQuery } from "@/lib/exam-options"
import type { Exame } from "@/lib/types"

const mri = (exames as Exame[]).filter((e) => e.preparo_id === "rm_contraste")
const ask = async (e: Exame, message = buildQuery(e)) => {
  delete process.env.CLAUDE_API_KEY
  const r = await POST(new Request("http://x/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, profile: "patient", history: [], examSigla: e.sigla }) }))
  return (await r.json()).reply as string
}

test("RM com contraste mostra itens seguros e segura jejum e remédios", async () => {
  for (const e of mri) {
    const t = await ask(e)
    expect(t, e.nome).toMatch(/30 minutos/)
    expect(t, e.nome).toMatch(/metal/i)
    expect(t, e.nome).toMatch(/acompanhante/i)
    expect(t, e.nome).toMatch(/creatinina/i)
    expect(t, e.nome).toMatch(/Jejum:\*\* o cadastro herdado/)
    expect(t, e.nome).not.toMatch(/\b4 ?h\b|\b8 ?h\b|polaramine|diabetes|\bmg\b/i)
    expect(t, e.nome).toMatch(/Medicamentos/)
  }
})

test("pergunta sobre jejum continua sem número", async () => {
  const t = await ask(mri[0], "Qual o jejum?")
  expect(t).toMatch(/n[aã]o consigo confirmar/i)
  expect(t).not.toMatch(/\b4 ?h\b|\b8 ?h\b/i)
})
