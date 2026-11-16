import { expect, it } from "vitest"
import { generateMockResponse } from "./mock-response"

it("mamografia mantém a proibição de medicação na pele e não mostra aviso de remédio", () => {
  const r = generateMockResponse("mamografia bilateral qual o preparo", "patient", []).reply
  expect(r).toMatch(/Não utilizar medicações sobre a pele na região da mama/)
  expect(r).not.toMatch(/\*\*Medicamentos:\*\*/)
})

it("histerossalpingografia mostra os remédios do preparo sem dose", () => {
  const r = generateMockResponse("histerossalpingografia qual o preparo", "patient", []).reply
  expect(r).toMatch(/\*\*Remédios do preparo:\*\*/)
  expect(r).toMatch(/bisacodil/)
  expect(r).not.toMatch(/\b5 ?mg\b|comprimidos|40 gotas|dulcolax/i)
  expect(r).toMatch(/absorvente/)
})
