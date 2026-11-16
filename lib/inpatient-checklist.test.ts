import { describe, expect, it } from "vitest"
import { asksInpatientFlow, buildInpatientChecklist, checklistToText, inpatientModalities } from "./inpatient-checklist"
import { generateMockResponse } from "./mock-response"

const section = (c: ReturnType<typeof buildInpatientChecklist>, id: string) =>
  c!.sections.find(s => s.id === id)!.items.map(i => i.text).join(" | ")

describe("checklist de preparo do internado (PRO-15)", () => {
  it("TC de abdome com contraste em diabético: AGHU, metformina, Jelco 20 e pendência do preparo", () => {
    const c = buildInpatientChecklist("TCABC", { diabetico: true }, "tomografia_computadorizada")
    expect(c).not.toBeNull()
    expect(section(c, "ao_pedir")).toMatch(/AGHU/)
    expect(section(c, "ao_pedir")).toMatch(/metformina/)
    expect(section(c, "antes_de_descer")).toMatch(/Jelco 20/)
    expect(section(c, "antes_de_descer")).not.toMatch(/Jelco 18/)
    expect(c!.alerts.map(a => a.text).join(" ")).toMatch(/não está cadastrado/)
    expect(c!.sections.flatMap(s => s.items).every(i => i.source.length > 0)).toBe(true)
  })

  it("AngioTC pede Jelco 18", () => {
    const c = buildInpatientChecklist("TCAAT", {}, "tomografia_computadorizada")
    expect(section(c, "antes_de_descer")).toMatch(/Jelco 18/)
  })

  it("RM com sedação: guia e termo, sedação em papel e jejum não reconciliado", () => {
    const c = buildInpatientChecklist("RMC9", { sedacao: true }, "ressonancia_magnetica")
    expect(section(c, "antes_de_descer")).toMatch(/guia, o termo e os questionários/)
    expect(section(c, "ao_pedir")).toMatch(/papel/)
    expect(section(c, "jejum")).toMatch(/não foram reconciliadas/)
    expect(section(c, "jejum")).not.toMatch(/jejum de \d/i)
    // The diabetes rule only shows up when the patient is diabetic.
    expect(section(c, "antecedencia")).not.toMatch(/diabetes/)
    expect(section(buildInpatientChecklist("RMC9", { diabetico: true }, "ressonancia_magnetica"), "ao_pedir")).toMatch(/diabetes/)
  })

  it("RM acima de 120 kg e criança abaixo de 8 anos geram alerta de restrição", () => {
    const c = buildInpatientChecklist("RMC9", { pesoKg: 130, idade: 5 }, "ressonancia_magnetica")
    const alerts = c!.alerts.map(a => a.text).join(" ")
    expect(alerts).toMatch(/120 kg/)
    expect(alerts).toMatch(/8 anos/)
  })

  it("uretrocistografia: medicamento a prescrever na véspera, sem acesso venoso", () => {
    const c = buildInpatientChecklist("RXURE", {}, "radiologia_convencional")
    expect(section(c, "ao_pedir")).toMatch(/Norfloxacino/)
    expect(section(c, "antecedencia")).toMatch(/véspera/)
    expect(section(c, "antes_de_descer")).not.toMatch(/Jelco/)
  })

  it("condições marcadas aparecem destacadas no que informar ao setor", () => {
    const c = buildInpatientChecklist("TCABC", { isolamento: true, oxigenio: true }, "tomografia_computadorizada")
    const informar = c!.sections.find(s => s.id === "informar_setor")!.items
    expect(informar.filter(i => i.highlight).map(i => i.text)).toEqual([expect.stringMatching(/^SIM — Isolamento/), expect.stringMatching(/^SIM — Uso de O2/)])
  })

  it("texto para copiar tem caixas de seleção, fontes e o aviso de validação", () => {
    const text = checklistToText(buildInpatientChecklist("TCABC", {}, "tomografia_computadorizada")!)
    expect(text).toMatch(/\[ \]/)
    expect(text).toMatch(/Fonte:/)
    expect(text).toMatch(/validação pendente/i)
  })

  it("exame inexistente não gera checklist", () => {
    expect(buildInpatientChecklist("NAOEXISTE")).toBeNull()
  })
})

describe("perfil profissional e fluxo do internado no chat", () => {
  it("detecta pergunta de internado, mas deixa o raio-X no fluxo próprio", () => {
    expect(asksInpatientFlow("Paciente internado vai fazer tomografia")).toBe(true)
    expect(asksInpatientFlow("Como solicitar raio-X para paciente internado?")).toBe(false)
    expect(asksInpatientFlow("Qual o preparo da tomografia de tórax?")).toBe(false)
    expect(inpatientModalities("internado na ressonância")).toEqual(["ressonancia_magnetica"])
  })

  it("responde ao profissional com o fluxo documentado do internado", () => {
    const { reply } = generateMockResponse("Paciente internado vai fazer tomografia de abdômen com contraste. Qual o fluxo?", "professional")
    expect(reply).toMatch(/AGHU/)
    expect(reply).toMatch(/véspera/)
    expect(reply).toMatch(/prescrição médica/)
    expect(reply).toMatch(/Jelco 20/)
    expect(reply).not.toMatch(/você/i)
  })

  it("alergia a contraste no perfil profissional não fala com o paciente", () => {
    const pro = generateMockResponse("Paciente com alergia a contraste iodado vai fazer tomografia de tórax com contraste", "professional").reply
    const patient = generateMockResponse("Tenho alergia a contraste iodado e vou fazer tomografia de tórax com contraste", "patient").reply
    expect(pro).not.toMatch(/com você/)
    expect(pro).toMatch(/Se o paciente tem esse histórico/)
    expect(patient).toMatch(/com você/)
  })

  it("resposta profissional de ultrassom traz o bloco do internado e a do paciente não", () => {
    const pro = generateMockResponse("Qual o preparo para ultrassom de abdômen total?", "professional").reply
    const patient = generateMockResponse("Qual o preparo para ultrassom de abdômen total?", "patient").reply
    expect(pro).toMatch(/Se o paciente estiver internado/)
    expect(pro).toMatch(/maqueiro/)
    expect(patient).not.toMatch(/internado/)
  })
})
