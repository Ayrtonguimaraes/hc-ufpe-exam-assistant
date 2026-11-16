"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, ClipboardCheck, Copy, Printer, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  INPATIENT_MODALITIES,
  buildInpatientChecklist,
  checklistToText,
  examLabel,
  inpatientExams,
  type ChecklistItem,
  type PatientConditions,
} from "@/lib/inpatient-checklist"
import { modalidadeLabel } from "@/lib/exam-options"
import { normalize } from "@/lib/search"
import { cn } from "@/lib/utils"

type BooleanCondition = Exclude<keyof PatientConditions, "pesoKg" | "idade">

const CONDITIONS: { key: BooleanCondition; label: string }[] = [
  { key: "diabetico", label: "Diabético (metformina)" },
  { key: "alergiaContraste", label: "Alergia a contraste" },
  { key: "sedacao", label: "Precisa de sedação" },
  { key: "hemodialise", label: "Hemodiálise" },
  { key: "isolamento", label: "Isolamento" },
  { key: "covid", label: "COVID" },
  { key: "oxigenio", label: "Uso de O2" },
  { key: "acamado", label: "Acamado / cadeirante" },
  { key: "infusao", label: "Bomba de infusão / medicação venosa" },
  { key: "curativo", label: "Curativo especial" },
  { key: "acessoCentral", label: "Só acesso venoso central" },
  { key: "instavel", label: "Paciente instável" },
]

// Demonstration cases agreed for the 11/11 checkpoint (PRO-15).
const DEMOS: { label: string; sigla: string; modalidade: string; conditions: PatientConditions }[] = [
  { label: "TC de abdome com contraste em diabético", sigla: "TCABC", modalidade: "tomografia_computadorizada", conditions: { diabetico: true } },
  { label: "RM com sedação", sigla: "RMC9", modalidade: "ressonancia_magnetica", conditions: { sedacao: true } },
  { label: "Uretrocistografia", sigla: "RXURE", modalidade: "radiologia_convencional", conditions: {} },
]

const MAX_RESULTS = 40
const ALL_EXAMS = inpatientExams()

function parseNumber(value: string): number | undefined {
  const n = Number(value.replace(",", "."))
  return value.trim() && Number.isFinite(n) && n >= 0 ? n : undefined
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
}

export function InpatientChecklistPanel({ onClose }: { onClose: () => void }) {
  const [modalidade, setModalidade] = useState<string>("tomografia_computadorizada")
  const [query, setQuery] = useState("")
  const [sigla, setSigla] = useState<string>("")
  const [conditions, setConditions] = useState<PatientConditions>({})
  const [peso, setPeso] = useState("")
  const [idade, setIdade] = useState("")
  const [feedback, setFeedback] = useState("")

  const options = useMemo(() => {
    const q = normalize(query)
    return ALL_EXAMS.filter((e) => e.modalidade === modalidade)
      .filter((e) => !q || normalize(`${e.nome} ${e.nome_usual} ${e.sigla} ${e.sinonimos.join(" ")}`).includes(q))
      .slice(0, MAX_RESULTS)
  }, [modalidade, query])

  const checklist = useMemo(
    () => (sigla ? buildInpatientChecklist(sigla, { ...conditions, pesoKg: parseNumber(peso), idade: parseNumber(idade) }, modalidade) : null),
    [sigla, conditions, peso, idade, modalidade],
  )

  function selectModality(m: string) {
    setModalidade(m)
    setSigla("")
    setQuery("")
  }

  function applyDemo(demo: (typeof DEMOS)[number]) {
    setModalidade(demo.modalidade)
    setQuery("")
    setSigla(demo.sigla)
    setConditions(demo.conditions)
    setPeso("")
    setIdade("")
  }

  async function copy() {
    if (!checklist) return
    try {
      await navigator.clipboard.writeText(checklistToText(checklist))
      setFeedback("Checklist copiado.")
    } catch {
      setFeedback("Não foi possível copiar. Use o botão Imprimir.")
    }
  }

  function print() {
    if (!checklist) return
    const win = window.open("", "_blank", "width=800,height=900")
    if (!win) {
      setFeedback("O navegador bloqueou a janela de impressão.")
      return
    }
    win.document.write(
      `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Checklist do internado — ${escapeHtml(checklist.exam.sigla)}</title>` +
        `<style>body{font:13px/1.5 system-ui,sans-serif;margin:24px;color:#111}pre{white-space:pre-wrap;font:inherit}</style></head>` +
        `<body><pre>${escapeHtml(checklistToText(checklist))}</pre></body></html>`,
    )
    win.document.close()
    win.focus()
    win.print()
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30" role="dialog" aria-modal="true" aria-labelledby="inpatient-checklist-title">
      <div className="flex h-full w-full max-w-3xl flex-col overflow-hidden bg-background shadow-xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 id="inpatient-checklist-title" className="flex items-center gap-2 font-serif text-lg text-ink">
              <ClipboardCheck className="size-5 text-azure" aria-hidden="true" />
              Checklist do internado
            </h2>
            <p className="mt-1 text-xs text-steel">
              Escolha o exame e marque as condições do paciente. Nenhum dado do paciente é salvo ou enviado.
            </p>
          </div>
          <button type="button" onClick={onClose} className="flex size-9 shrink-0 items-center justify-center rounded-lg text-steel hover:bg-mist" aria-label="Fechar checklist">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <section aria-label="Casos de demonstração" className="flex flex-wrap gap-2">
            {DEMOS.map((d) => (
              <button key={d.sigla} type="button" onClick={() => applyDemo(d)} className="rounded-full border border-border px-3 py-1 text-xs text-azure-deep hover:border-azure hover:bg-mist">
                {d.label}
              </button>
            ))}
          </section>

          <section aria-label="Exame" className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-steel">1. Exame</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {INPATIENT_MODALITIES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => selectModality(m)}
                  aria-pressed={modalidade === m}
                  className={cn("rounded-lg border px-3 py-1.5 text-sm", modalidade === m ? "border-azure bg-mist text-azure-deep" : "border-border hover:bg-mist")}
                >
                  {modalidadeLabel(m)}
                </button>
              ))}
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrar por nome ou código AGHU"
              className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-azure"
              aria-label="Filtrar exames"
            />
            <select
              value={sigla}
              onChange={(e) => setSigla(e.target.value)}
              className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-azure"
              aria-label="Exame solicitado"
            >
              <option value="">Selecione o exame ({options.length}{options.length === MAX_RESULTS ? "+" : ""} opções)</option>
              {options.map((e) => (
                <option key={`${e.modalidade}:${e.sigla}`} value={e.sigla}>
                  {examLabel(e)} — {e.sigla}
                </option>
              ))}
            </select>
          </section>

          <section aria-label="Condições do paciente" className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-steel">2. Condições do paciente</p>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {CONDITIONS.map((c) => (
                <label key={c.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!conditions[c.key]}
                    onChange={(e) => setConditions((prev) => ({ ...prev, [c.key]: e.target.checked }))}
                  />
                  {c.label}
                </label>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-3">
              <label className="flex items-center gap-2 text-sm">
                Peso (kg)
                <input inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} className="w-20 rounded-lg border border-input bg-background px-2 py-1 text-sm" aria-label="Peso em kg" />
              </label>
              <label className="flex items-center gap-2 text-sm">
                Idade (anos)
                <input inputMode="numeric" value={idade} onChange={(e) => setIdade(e.target.value)} className="w-20 rounded-lg border border-input bg-background px-2 py-1 text-sm" aria-label="Idade em anos" />
              </label>
            </div>
          </section>

          {checklist ? (
            <section aria-label="Checklist gerado" className="mt-5 rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-ink">{checklist.exam.nome}</p>
                  <p className="text-xs text-steel">Código AGHU: {checklist.exam.sigla} · Contato do setor: {checklist.contact}</p>
                </div>
                <span className="rounded-full bg-warning-bg px-2 py-0.5 text-[11px] text-warning-foreground">Validação pendente</span>
              </div>

              {checklist.alerts.length > 0 && (
                <div className="mt-3 rounded-lg border border-warning-foreground/30 bg-warning-bg p-3" role="alert">
                  {checklist.alerts.map((a, i) => (
                    <div key={i} className="flex gap-2 text-sm text-warning-foreground">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      <div>
                        <p>{a.text}</p>
                        <p className="text-[11px] opacity-80">Fonte: {a.source}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {checklist.sections.map((s) => (
                <div key={s.id} className="mt-4">
                  <h3 className="text-sm font-semibold text-azure-deep">
                    {s.title} <span className="font-normal text-steel">— {s.responsible}</span>
                  </h3>
                  <ul className="mt-1.5 flex flex-col gap-1.5">
                    {s.items.map((item, i) => (
                      <Item key={i} item={item} />
                    ))}
                  </ul>
                </div>
              ))}

              {checklist.flow && (
                <details className="mt-4 text-sm">
                  <summary className="cursor-pointer font-medium text-azure-deep">{checklist.flow.title}: fluxo segundo os documentos</summary>
                  <ol className="mt-2 list-decimal pl-5">
                    {checklist.flow.steps.map((s, i) => (
                      <li key={i} className="mt-1">
                        {s.text}
                        <span className="block text-[11px] text-steel">Fonte: {s.source}</span>
                      </li>
                    ))}
                  </ol>
                </details>
              )}

              <p className="mt-4 text-[11px] leading-relaxed text-steel">{checklist.disclaimer}</p>
            </section>
          ) : (
            <p className="mt-5 text-sm text-steel">Selecione um exame para gerar o checklist.</p>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-5 py-3">
          <p className="text-xs text-steel" aria-live="polite">{feedback}</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={copy} disabled={!checklist}>
              <Copy className="size-4" aria-hidden="true" /> Copiar
            </Button>
            <Button type="button" onClick={print} disabled={!checklist}>
              <Printer className="size-4" aria-hidden="true" /> Imprimir
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Item({ item }: { item: ChecklistItem }) {
  return (
    <li className={cn("flex gap-2 rounded-lg px-2 py-1.5 text-sm", item.highlight && "bg-mist")}>
      <span aria-hidden="true" className="mt-0.5 size-4 shrink-0 rounded border border-steel/60" />
      <div>
        <p className={cn(item.highlight && "font-medium text-ink")}>{item.text}</p>
        <p className="text-[11px] text-steel">Fonte: {item.source}</p>
      </div>
    </li>
  )
}
