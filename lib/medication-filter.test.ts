import { expect, it } from "vitest"
import { generateMockResponse } from "./mock-response"

it("mamografia mantém a proibição de medicação na pele e não mostra aviso de remédio", () => {
  const r = generateMockResponse("mamografia bilateral qual o preparo", "patient", []).reply
  expect(r).toMatch(/Não utilizar medicações sobre a pele na região da mama/)
  expect(r).not.toMatch(/\*\*Medicamentos:\*\*/)
})

it("histerossalpingografia não deixa instrução de remédio solta", () => {
  const r = generateMockResponse("histerossalpingografia qual o preparo", "patient", []).reply
  expect(r).not.toMatch(/analg[eé]sico|antiespasm|buscop|bisacodil|dulcolax/i)
  expect(r).toMatch(/\*\*Medicamentos:\*\*/)
  expect(r).toMatch(/absorvente/)
})
