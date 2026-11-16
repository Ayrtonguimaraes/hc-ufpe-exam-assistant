import { expect, it } from "vitest"
import exames from "@/data/exames.json"
import { answerDropsNamedTerm, rareCatalogTerms } from "./named-terms"
import type { Exame } from "./types"

const catalog = exames as Exame[]

it("reconhece nomes técnicos raros e ignora palavras comuns", () => {
  expect(rareCatalogTerms("uretrocistografia qual o preparo", catalog)).toEqual(["uretrocistografia"])
  expect(rareCatalogTerms("vou bater uma chapa do pulmão", catalog)).toEqual([])
  expect(rareCatalogTerms("paciente com múltiplas alergias vai fazer TC com contraste", catalog)).toEqual([])
  expect(rareCatalogTerms("tomografia de abdome precisa de jejum?", catalog)).toEqual([])
})

it("acusa a resposta do modelo que troca o exame nomeado", () => {
  expect(answerDropsNamedTerm("uretrocistografia qual o preparo", [{ nome: "RESSONANCIA MAGNETICA DE VIAS BILIARES" }], catalog)).toBe(true)
  expect(answerDropsNamedTerm("uretrocistografia qual o preparo", [{ nome: "RX URETROCISTOGRAFIA PEDIÁTRICA" }], catalog)).toBe(false)
  expect(answerDropsNamedTerm("ultrassom de vias urinárias", [{ nome: "ULTRASSONOGRAFIA APARELHO URINARIO" }], catalog)).toBe(false)
  expect(answerDropsNamedTerm("ultrasom da tireoide tem preparo?", [{ nome: "ULTRASSONOGRAFIA DE TIREOIDE" }], catalog)).toBe(false)
})

it("respostas sem exame (agendamento, duração, um exame de cada vez) não contam como troca", () => {
  expect(answerDropsNamedTerm("quanto tempo demora a uretrocistografia?", [], catalog)).toBe(false)
})

it("reconhece dois exames diferentes na mesma mensagem", async () => {
  const { namesSeveralExams } = await import("./named-terms")
  expect(namesSeveralExams("vou fazer urografia e histerossalpingografia no mesmo dia", catalog)).toBe(true)
  expect(namesSeveralExams("vou fazer urografia excretora", catalog)).toBe(false)
  expect(namesSeveralExams("esôfago estômago e duodeno qual o jejum?", catalog)).toBe(false)
})
