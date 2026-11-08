import { it, expect } from "vitest"
import { generateMockResponse } from "./mock-response"
import { POST } from "@/app/api/chat/route"
import exames from "@/data/exames.json"
import type { Exame } from "./types"

const say = (q: string) => generateMockResponse(q, "patient").reply

it("peso acima de 120 kg em ressonância avisa o limite do serviço", () => {
  const r = say("peso 130 kg, consigo fazer ressonância aí?")
  expect(r).toMatch(/Atenção/)
  expect(r).toMatch(/acima de 120 kg/)
  expect(r).not.toMatch(/regi[aã]o do corpo/)
})

it("peso abaixo do limite não dispara o aviso de peso", () => {
  expect(say("peso 80 kg e vou fazer ressonância de joelho")).not.toMatch(/\*\*Atenção:\*\*[\s\S]*120 kg/)
})

it("criança abaixo de 8 anos em ressonância avisa o limite de idade", () => {
  expect(say("meu filho tem 6 anos e o médico pediu ressonância de crânio")).toMatch(/menos de 8 anos/)
})

it("hemocromatose, elastografia e plexo avisam que não são realizados", () => {
  expect(say("tenho hemocromatose, posso fazer ressonância?")).toMatch(/hemocromatose/)
  expect(say("elastografia hepática por ressonância, qual o preparo?")).toMatch(/elastografia hep[aá]tica .*n[aã]o é realizada/i)
  expect(say("vocês fazem ressonância de plexo braquial?")).toMatch(/plexo braquial e sacral/)
})

it("marcapasso ou pino em ressonância pede para informar o setor, sem afirmar segurança", () => {
  for (const q of ["tenho marcapasso e vou fazer ressonância", "tenho pino de metal na perna, posso fazer ressonância?"]) {
    const r = say(q)
    expect(r, q).toMatch(/informe ao setor antes do exame/)
    expect(r, q).not.toMatch(/pode fazer|é seguro|sem problema/i)
  }
})

it("a mesma situação em tomografia não recebe restrição de ressonância", () => {
  expect(say("peso 130 kg, vou fazer tomografia de abdome")).not.toMatch(/120 kg/)
})

it("exame de ressonância escolhido no seletor lembra os limites do serviço, e o de plexo traz o aviso do plexo", async () => {
  delete process.env.CLAUDE_API_KEY
  const ask = async (e: Exame) => (await (await POST(new Request("http://x/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: `Como me preparo para ${e.nome_usual.toLowerCase()}?`, profile: "patient", history: [], examSigla: e.sigla, examModalidade: e.modalidade }) }))).json()).reply as string
  const knee = (exames as Exame[]).find(e => e.modalidade === "ressonancia_magnetica" && /JOELHO/.test(e.nome))!
  const k = await ask(knee)
  expect(k).toMatch(/Antes de vir/)
  expect(k).toMatch(/120 kg/)
  expect(k).not.toMatch(/plexo/)
  const plexo = (exames as Exame[]).find(e => /PLEXO/.test(e.nome))!
  const p = await ask(plexo)
  expect(p).toMatch(/plexo braquial e sacral/)
  expect(p).toMatch(/metal/i)
})

it("gravidez em ressonância avisa do termo, sem dizer se é seguro", () => {
  const r = say("estou grávida e tenho ressonância de joelho")
  expect(r).toMatch(/termo/)
  expect(r).toMatch(/informe ao setor/i)
  expect(r).not.toMatch(/é seguro|sem risco|contraindicad/i)
})

it("reação alérgica a contraste em tomografia avisa a contraindicação pela própria pergunta", () => {
  const r = say("já tive reação alérgica grave a contraste iodado. posso fazer tomografia com contraste?")
  expect(r).toMatch(/contraindica[cç][aã]o/)
  expect(r).not.toMatch(/regi[aã]o do corpo/)
})

it("alergia a camarão não dispara a contraindicação de contraste", () => {
  expect(say("tomografia com contraste, sou alérgico a camarão, tem problema?")).not.toMatch(/\*\*Atenção:\*\*/)
})

it("gravidez com exame identificado: aviso primeiro e orientação do exame depois", () => {
  const r = say("Estou grávida e farei ressonância sem contraste. Tem alguma exigência?")
  expect(r.indexOf("termo")).toBeGreaterThan(-1)
  expect(r).toMatch(/metal/)
  expect(r.indexOf("termo")).toBeLessThan(r.indexOf("metal"))
})

it("peso acima do limite não traz preparo depois do aviso", () => {
  expect(say("peso 130 kg, vou fazer ressonância de joelho sem contraste e sem sedação")).not.toMatch(/metal|30 minutos/)
})
