import { it, expect, afterEach } from "vitest"
import { parseInterpretation, queryFromInterpretation, interpretQuestion, answerFromInterpretation } from "./question-interpreter"

const fake = (content: unknown, ok = true) => (async () => ({ ok, json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }) })) as unknown as typeof fetch
afterEach(() => { delete process.env.GROQ_API_KEY })

it("aceita só campos válidos e descarta o resto", () => {
  expect(parseInterpretation({ modalidade: "radiologia_convencional", exame: "tórax", topico: "preparo" })?.modalidade).toBe("radiologia_convencional")
  expect(parseInterpretation({ modalidade: "pet_ct", topico: "preparo" })).toBeNull()
  expect(parseInterpretation({ modalidade: null, topico: "inventado" })).toBeNull()
  expect(parseInterpretation({ modalidade: null, exame: "x".repeat(200), topico: "preparo" })?.exame).toBeNull()
  expect(parseInterpretation("texto")).toBeNull()
})

it("monta a consulta ao catálogo apenas com os campos", () => {
  expect(queryFromInterpretation({ modalidade: "tomografia_computadorizada", exame: "abdome superior", contraste: "sem", sedacao: null, lado: null, topico: "jejum", varios_exames: false }))
    .toBe("tomografia abdome superior sem contraste precisa de jejum")
})

it("sem chave, não chama o modelo", async () => {
  let called = false
  const r = await interpretQuestion("chapa do pulmão", [], (async () => { called = true }) as unknown as typeof fetch)
  expect(r).toBeNull(); expect(called).toBe(false)
})

it("erro ou JSON inválido do modelo volta null (comportamento antigo)", async () => {
  process.env.GROQ_API_KEY = "test"
  expect(await interpretQuestion("x", [], fake({}, false))).toBeNull()
  expect(await interpretQuestion("x", [], (async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: "não é json" } }] }) })) as unknown as typeof fetch)).toBeNull()
})

it("linguagem leiga interpretada vira resposta do catálogo, sem texto do modelo", async () => {
  process.env.GROQ_API_KEY = "test"
  const i = await interpretQuestion("vou bater uma chapa do pulmão, precisa de alguma coisa?", [], fake({ modalidade: "radiologia_convencional", exame: "tórax", contraste: null, sedacao: null, lado: null, topico: "preparo", varios_exames: false }))
  const r = answerFromInterpretation(i!, "patient", [])!
  expect(r.reply).toMatch(/raio-x simples|n[aã]o exige preparo/i)
  expect(r.reply).not.toMatch(/tomografia/i)
})

it("assuntos sem cadastro encaminham ao setor, e vários exames pedem um de cada vez", () => {
  const base = { modalidade: "ressonancia_magnetica" as const, exame: null, contraste: null, sedacao: null, lado: null, varios_exames: false }
  expect(answerFromInterpretation({ ...base, topico: "duracao" }, "patient", [], "quanto tempo demora a ressonância?")!.reply).toMatch(/N[aã]o tenho essa informa[cç][aã]o cadastrada[\s\S]*2126 3873/)
  expect(answerFromInterpretation({ ...base, topico: "preparo", varios_exames: true }, "patient", [], "ressonância do joelho e da coluna")!.reply).toMatch(/um de cada vez/)
  expect(answerFromInterpretation({ ...base, exame: "abdome", topico: "preparo", varios_exames: true }, "patient", [], "sem sedação")!.reply).not.toMatch(/um de cada vez/)
  expect(answerFromInterpretation({ ...base, modalidade: null, topico: "jejum" }, "patient", [])!.reply).toMatch(/qual exame/i)
})

it("região que só repete a modalidade não entra na consulta", async () => {
  const i = { modalidade: "mamografia" as const, exame: "mama", contraste: null, sedacao: null, lado: null, topico: "preparo" as const, varios_exames: false }
  expect(queryFromInterpretation(i)).toBe("mamografia qual o preparo")
  expect(answerFromInterpretation(i, "patient", [])!.reply).toMatch(/desodorante/)
})

it("assunto fora do preparo sem palavra correspondente vira preparo; vazio com tipo de exame volta ao catálogo", () => {
  const base = { modalidade: "radiologia_convencional" as const, exame: "tórax", contraste: null, sedacao: null, lado: null, varios_exames: false }
  expect(answerFromInterpretation({ ...base, topico: "agendamento" }, "patient", [], "vou bater uma chapa do pulmão")!.reply).toMatch(/n[aã]o exige preparo/)
  expect(answerFromInterpretation({ ...base, modalidade: null, exame: null, topico: "preparo" }, "patient", [], "preparo para ressonância de dragão de komodo")).toBeNull()
})

it("assunto documentos sem palavra correspondente vira preparo", () => {
  const base = { modalidade: "radiologia_convencional" as const, exame: "tórax", contraste: null, sedacao: null, lado: null, varios_exames: false }
  expect(answerFromInterpretation({ ...base, topico: "documentos" }, "patient", [], "vou bater uma chapa do pulmão, precisa de alguma coisa?")!.reply).toMatch(/n[aã]o exige preparo/)
  expect(answerFromInterpretation({ ...base, topico: "documentos" }, "patient", [], "raio x do tórax, quais documentos levo?")!.reply).toMatch(/O que levar/)
})
