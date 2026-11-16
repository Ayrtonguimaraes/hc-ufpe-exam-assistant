import { describe, expect, it } from "vitest"
import examesData from "@/data/exames.json"
import preparosData from "@/data/preparos.json"
import { composeAnswer } from "./answer-composer"
import { STANDARD_GROUPS } from "./standard-answer"
import type { Exame, PreparosFile } from "./types"

const exams = examesData as Exame[]
const preparations = preparosData as PreparosFile
const ask = (sigla: string, question = "Qual o preparo?", profile: "patient" | "professional" = "patient") =>
  composeAnswer(question, [exams.find(e => e.sigla === sigla)!], preparations, profile)!
const DOSE = /\b\d+\s*mg\b|\b\d+\s*gotas\b|\b\d+\s*comprimidos?\b|de \d+ em \d+ horas|dulcolax|ducolax|luftal|laxol|buscop/i

describe("chat respondendo pelo formato padronizado (folhas escaneadas e preparos com remédio)", () => {
  it("todos os exames dos grupos migrados respondem ao paciente sem dose, esquema ou nome comercial", () => {
    const migrated = exams.filter(e => STANDARD_GROUPS.has(e.preparo_id))
    expect(migrated.length).toBeGreaterThan(10)
    for (const e of migrated) {
      const r = ask(e.sigla)
      expect(r.reply, e.sigla).not.toMatch(DOSE)
      expect(r.sources[0].evidenceStatus, e.sigla).toBe("documentary-only")
      expect(r.sources[0].evidence!.every(f => f.validation === "pending-udi" && f.quote.length > 0), e.sigla).toBe(true)
    }
  })

  it("urografia mostra a dieta da véspera, o jejum de 12 horas e o laxante, com a página da folha como evidência", () => {
    const r = ask("RXUR1")
    expect(r.reply).toMatch(/jantar leve/)
    expect(r.reply).toMatch(/Jejum absoluto de 12 horas/)
    expect(r.reply).toMatch(/bisacodil/)
    expect(r.sources[0].evidence!.map(f => f.locator)).toContain("p4")
  })

  it("uretrocistografia diz que é antibiótico com receita, sem dose; no exame pediátrico, a dose é do médico", () => {
    const adult = ask("RXURE").reply
    expect(adult).toMatch(/antibiótico norfloxacino/)
    expect(adult).toMatch(/precisa de receita/)
    expect(adult).not.toMatch(/400/)
    expect(ask("RXURP").reply).toMatch(/dose para criança é definida pelo médico/)
  })

  it("o profissional vê a dose da folha, a classe e a fonte", () => {
    const r = ask("RXURE", "Qual o preparo?", "professional").reply
    expect(r).toMatch(/na fonte: 400 mg de 12 em 12 horas por 3 dias/)
    expect(r).toMatch(/classe A, exige receita/)
    expect(r).toMatch(/PREPAROS_EXAMES DE RAIO X CONTRASTADOS\.pdf, p5/)
  })

  it("ultrassom de abdome mostra as duas folhas de jejum e manda confirmar; bexiga só no abdome total pelo documento geral", () => {
    const total = ask("USABT").reply
    expect(total).toMatch(/divergem.*8 horas.*4 a 6 horas/)
    expect(total).toMatch(/Comparecer com a bexiga cheia/)
    const superior = ask("USABD").reply
    expect(superior).not.toMatch(/Comparecer com a bexiga cheia/)
    expect(superior).toMatch(/folha do hospital ainda a confirmar/)
  })

  it("pergunta só de jejum traz só o jejum, com a evidência do jejum", () => {
    const r = ask("USAR", "Qual o jejum?")
    expect(r.reply).toMatch(/Jejum de 8 horas/)
    expect(r.reply).not.toMatch(/feijão|simeticona/)
    expect(r.sources[0].evidence!.map(f => f.topic)).toEqual(["jejum"])
  })

  it("Doppler renal mostra a dieta da véspera e o jejum de 8 horas", () => {
    const r = ask("USAR").reply
    expect(r).toMatch(/feijão/)
    expect(r).toMatch(/Jejum de 8 horas/)
  })

  it("todos os exames do grupo de esôfago e do trânsito trazem o jejum de 6 horas", () => {
    for (const sigla of ["RXESO", "RXEED", "RXTXC", "RXDEG", "RXTDE", "RXTIN"]) expect(ask(sigla).reply, sigla).toMatch(/[Jj]ejum de 6 horas/)
  })
})

describe("exames com folha e sem código no catálogo", () => {
  it("enema opaco responde pelas folhas, com as versões divergentes, e nunca como outro exame", async () => {
    const { noCatalogExamAnswer } = await import("./standard-answer")
    const r = noCatalogExamAnswer("vou fazer enema opaco, como me preparo?", "patient")!
    expect(r.reply).toMatch(/versões diferentes para adulto e para criança/)
    expect(r.reply).toMatch(/2126 3872/)
    expect(r.reply).not.toMatch(/tomografia|\d+\s*comprimidos|gotas/i)
    const pro = noCatalogExamAnswer("enema opaco preparo", "professional")!
    expect(pro.reply).toMatch(/Exames escaneados\.pdf, p4/)
  })

  it("biópsia pulmonar guiada por TC responde pela folha, com o contato da unidade especializada", async () => {
    const { noCatalogExamAnswer } = await import("./standard-answer")
    const r = noCatalogExamAnswer("biópsia pulmonar guiada por tomografia, como funciona?", "patient")!
    expect(r.reply).toMatch(/segundas-feiras/)
    expect(r.reply).toMatch(/até as 7h/)
    expect(r.reply).toMatch(/2126-3889/)
    expect(r.reply).not.toMatch(/Laécio/)
  })
})
