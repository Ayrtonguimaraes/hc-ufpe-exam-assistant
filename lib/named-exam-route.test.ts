import { afterEach, expect, it, vi } from "vitest"
import { POST } from "@/app/api/chat/route"

// The model is simulated: it returns the loose translation observed in production on 15/11/2026.
const loose = { modalidade: "radiologia_convencional", exame: "vias urinárias", contraste: "com", sedacao: null, lado: null, topico: "preparo", varios_exames: false }
const ask = (message: string) => POST(new Request("http://localhost/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, profile: "patient", history: [] }) }))

afterEach(() => { vi.unstubAllGlobals(); delete process.env.GROQ_API_KEY })

it.each([
  ["vou fazer urografia excretora, qual o preparo?", /urografia/i],
  ["esôfago estômago e duodeno qual o jejum?", /jejum de 6 horas/i],
  ["histerossalpingografia preparo", /histerossalpingografia/i],
])("uma mensagem que nomeia um único exame do catálogo não passa pelo modelo: %s", async (message, expected) => {
  process.env.GROQ_API_KEY = "test"
  const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(loose) } }] }) }))
  vi.stubGlobal("fetch", fetchSpy)
  const data = await (await ask(message)).json()
  expect(fetchSpy).not.toHaveBeenCalled()
  expect(data.reason).not.toBe("llm-interpretation")
  expect(data.reply).toMatch(expected)
  // The exam heading must not switch modality (production answered "ressonância de vias biliares" to urography).
  expect(data.reply.split("\n")[0]).not.toMatch(/ressonancia|ressonância|ultrassonografia/i)
})

it("nome técnico com mais de um exame no catálogo não aceita a troca feita pelo modelo", async () => {
  process.env.GROQ_API_KEY = "test"
  const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(loose) } }] }) }))
  vi.stubGlobal("fetch", fetchSpy)
  const data = await (await ask("uretrocistografia qual o preparo")).json()
  expect(fetchSpy).toHaveBeenCalledTimes(1)
  expect(data.reason).not.toBe("llm-interpretation")
  expect(data.reply).toMatch(/uretrocistografia/i)
  expect(data.reply.split("\n")[0]).not.toMatch(/ressonancia|ressonância|ultrassonografia/i)
})

it("linguagem leiga, com vários candidatos no catálogo, continua passando pelo modelo", async () => {
  process.env.GROQ_API_KEY = "test"
  const lay = { modalidade: "radiologia_convencional", exame: "tórax", contraste: null, sedacao: null, lado: null, topico: "preparo", varios_exames: false }
  const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(lay) } }] }) }))
  vi.stubGlobal("fetch", fetchSpy)
  const data = await (await ask("vou bater uma chapa do pulmão, precisa de alguma coisa?")).json()
  expect(fetchSpy).toHaveBeenCalledTimes(1)
  expect(data.reason).toBe("llm-interpretation")
})

it.each(["quanto tempo demora a urografia excretora?", "como marco uma histerossalpingografia?"])("assunto fora do preparo continua indo ao modelo: %s", async message => {
  process.env.GROQ_API_KEY = "test"
  const topic = /marco/.test(message) ? "agendamento" : "duracao"
  const reply = { modalidade: "radiologia_convencional", exame: null, contraste: null, sedacao: null, lado: null, topico: topic, varios_exames: false }
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(reply) } }] }) })))
  const data = await (await ask(message)).json()
  expect(data.reason).toBe("llm-interpretation")
  expect(data.reply).toMatch(/Não tenho essa informação cadastrada/)
})

it("dois nomes técnicos na mesma mensagem pedem um exame de cada vez", async () => {
  const data = await (await ask("vou fazer urografia e histerossalpingografia no mesmo dia")).json()
  expect(data.reason).toBe("several-exams")
  expect(data.reply).toMatch(/um de cada vez/)
})
