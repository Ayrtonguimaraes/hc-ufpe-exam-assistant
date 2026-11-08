import { it, expect } from "vitest"
import { deterministicIntent } from "./request-policy"
import { generateMockResponse } from "./mock-response"
import { wantsAggregateCount } from "./aggregate"
import exames from "@/data/exames.json"

it("distingue horas de jejum de contagem do catálogo", () => {
  expect(wantsAggregateCount("Ressonância de abdômen com contraste, jejum de quanto tempo?")).toBe(false)
  expect(wantsAggregateCount("Quantas horas de jejum para tomografia?")).toBe(false)
  expect(wantsAggregateCount("Quantos exames há na base?")).toBe(true)
  expect(generateMockResponse("Quantos exames há na base?", "professional").reply).toContain(String(exames.length))
})
it("esclarece RM genérica sem indicar horas", () => {
  expect(deterministicIntent("Vou fazer ressonância. Precisa de jejum?")).toBe("clarify")
  const result = generateMockResponse("Vou fazer ressonância. Precisa de jejum?", "patient")
  expect(result.reply).toContain("região")
  expect(result.reply).not.toMatch(/\d/)
  expect(result.sources).toEqual([])
})
it("responde documentos gerais sem exigir nome do exame", () => {
  expect(generateMockResponse("Que documentos preciso levar para meu exame?", "patient").reply).toContain("Cartão do SUS")
})

it("tomografia ou ressonância sem região pergunta a região em vez de listar exames arbitrários", () => {
  for (const q of ["vou fazer uma tomografia", "quanto tempo demora uma tomografia?", "tenho marcapasso e vou fazer ressonância"]) {
    const r = generateMockResponse(q, "patient")
    expect(r.reply, q).toMatch(/regi[aã]o do corpo/)
    expect(r.reply, q).not.toMatch(/Qual destes exames|CONDUTOS|ARTICULA/i)
  }
})

it("com região informada não pede a região de novo", () => {
  const r = generateMockResponse("tomografia de abdome precisa de jejum?", "patient")
  expect(r.reply).not.toMatch(/regi[aã]o do corpo/)
})
