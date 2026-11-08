import { it, expect } from "vitest"
import { POST } from "@/app/api/chat/route"
import exames from "@/data/exames.json"
import registry from "@/data/documentary-evidence.json"
import type { Exame } from "@/lib/types"

const all = exames as Exame[]
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
const ask = async (e: Exame) => {
  delete process.env.CLAUDE_API_KEY
  const r = await POST(new Request("http://x/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: `Como me preparo para ${e.nome_usual.toLowerCase()}?`, profile: "patient", history: [], examSigla: e.sigla, examModalidade: e.modalidade }) }))
  return (await r.json()) as { reply: string; sources: { evidence?: { factId: string }[] }[] }
}
const by = (sigla: string) => all.find((e) => e.sigla === sigla)!

it("abdômen sem sedação: jejum de 4 horas, sem o de 8", async () => {
  const b = await ask(by("TCASS"))
  expect(b.reply).toMatch(/Jejum de 4 horas/)
  expect(b.reply).not.toMatch(/8 horas/)
  expect(b.sources[0].evidence?.map((f) => f.factId)).toContain("tc-abdomen-fasting")
})

it("sedação sem abdômen: jejum de 8 horas", async () => {
  const e = all.find((x) => x.sigla === "TRXSC")!
  const b = await ask(e)
  expect(b.reply).toMatch(/8 horas/)
  expect(b.reply).not.toMatch(/4 horas/)
})

it("abdômen com sedação: mostra o conflito e não escolhe 4 nem 8 horas", async () => {
  for (const s of ["TCAS1", "TCAS2", "TCABS", "TCAIC", "TCAIS"]) {
    const b = await ask(by(s))
    expect(b.reply, s).toMatch(/duas orienta[cç][õo]es de jejum diferentes/)
    expect(b.reply, s).not.toMatch(/Jejum de [48] horas|jejum de [48] horas/)
  }
})

it("enterotomografia: 8 horas e preparo adicional, sem nomear medicamento", async () => {
  const b = await ask(by("ENTTC"))
  expect(b.reply).toMatch(/8 horas/)
  expect(b.reply).toMatch(/preparo adicional/)
  expect(b.reply).not.toMatch(/muvinlax|macrogol|caixa/i)
})

it("exame com contraste sem jejum documentado: mostra alergia e hidratação e diz que o jejum não está cadastrado", async () => {
  const e = all.find((x) => /^TOMOGRAFIA DO TORAX COM CONTRASTE$/.test(x.nome))!
  const b = await ask(e)
  expect(b.reply).toMatch(/contraindica[cç][ãa]o/i)
  expect(b.reply).toMatch(/bastante l[ií]quido/)
  expect(b.reply).toMatch(/n[aã]o tenho o jejum deste exame cadastrado/i)
  expect(b.reply).not.toMatch(/[0-9]+ horas/)
})

it("abdômen com contraste: jejum de 4 horas junto com alergia e hidratação", async () => {
  const b = await ask(by("TCABC"))
  expect(b.reply).toMatch(/Jejum de 4 horas/)
  expect(b.reply).toMatch(/contraindica[cç][ãa]o/i)
})

it("tomografia de tórax sem contraste e sem sedação continua sem inventar jejum", async () => {
  const b = await ask(by("TCTX"))
  expect(b.reply).toMatch(/n[aã]o tenho o preparo espec[ií]fico cadastrado/i)
  expect(b.reply).not.toMatch(/[0-9]+ horas/)
})

it("nenhuma resposta de tomografia traz medicamento ou dose", async () => {
  for (const e of all.filter((x) => x.modalidade === "tomografia_computadorizada")) {
    const b = await ask(e)
    expect(b.reply, e.nome).not.toMatch(/metformina|antial[eé]rgico|muvinlax|macrogol|\bmg\b|polaramine|suspend/i)
  }
}, 120000)

it("a lista de exames de cada fato é exatamente a que sua regra produz", () => {
  for (const f of registry.facts as any[]) {
    if (!f.rule) continue
    const computed = all
      .filter((e) => e.modalidade === f.rule.modality && f.rule.nameAll.every((t: string) => norm(e.nome).includes(t)) && !(f.rule.nameNone ?? []).some((t: string) => norm(e.nome).includes(t)))
      .map((e) => e.sigla)
    expect([...new Set(f.appliesTo)].sort(), f.id).toEqual([...new Set(computed)].sort())
  }
})
