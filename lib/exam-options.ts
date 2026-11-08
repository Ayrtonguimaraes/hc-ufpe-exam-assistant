import examesData from "@/data/exames.json"
import preparosData from "@/data/preparos.json"
import type { Exame, PreparosFile, PreparoStatus } from "./types"

const exames = examesData as Exame[]
const preparos = preparosData as PreparosFile

export type ModalidadeOption = {
  modalidade: string
  label: string
  count: number
  /** Quando a modalidade tem 1 só exame, vai direto para ele (sem passo 2). */
  singleExam?: ExamOption
}

export type ExamOption = {
  sigla: string
  label: string
  query: string
  status: PreparoStatus
}

// Rótulos amigáveis por modalidade (não expor o enum cru ao paciente).
const MODALIDADE_LABELS: Record<string, string> = {
  tomografia_computadorizada: "Tomografia (TC)",
  ressonancia_magnetica: "Ressonância (RM)",
  ultrassonografia: "Ultrassom",
  radiologia_convencional: "Raio-X",
  mamografia: "Mamografia",
  densitometria_ossea: "Densitometria óssea",
  medicina_nuclear: "Medicina nuclear",
}

// Ordem fixa (mais comum primeiro). Modalidades fora desta lista vão para o fim.
const MODALIDADE_ORDER = [
  "tomografia_computadorizada",
  "ressonancia_magnetica",
  "ultrassonografia",
  "radiologia_convencional",
  "mamografia",
  "densitometria_ossea",
  "medicina_nuclear",
]

export function modalidadeLabel(m: string): string {
  return (
    MODALIDADE_LABELS[m] ??
    m
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  )
}

// Siglas/acrônimos que devem permanecer em CAIXA ALTA no rótulo do exame.
const KEEP_UPPER = new Set(["US", "RX", "TC", "RM", "HSG", "HC", "UFPE", "SUS", "ATM"])
// Conectivos que permanecem em minúscula (exceto na 1ª palavra).
const KEEP_LOWER = new Set(["de", "da", "do", "das", "dos", "com", "sem", "e", "para", "ou", "por", "em"])

// Restauração de acentos: os nomes na base vêm em CAIXA ALTA e SEM acentos
// (ex.: "ABDOMEN", "CRANIO", "RESSONANCIA"). Mapa palavra-sem-acento → forma
// acentuada, aplicado no rótulo do paciente. Chave em minúsculas, sem acento.
// Só termos frequentes/inequívocos — typos raros ficam para curadoria.
const ACCENTS: Record<string, string> = {
  ressonancia: "ressonância",
  magnetica: "magnética",
  angioressonancia: "angiorressonância",
  colangioressonancia: "colangiorressonância",
  sedacao: "sedação",
  abdomen: "abdômen",
  abdome: "abdômen",
  abdominal: "abdominal",
  cranio: "crânio",
  torax: "tórax",
  toracica: "torácica",
  toraco: "tóraco",
  pe: "pé",
  mao: "mão",
  maos: "mãos",
  articulacao: "articulação",
  articulacoes: "articulações",
  coxo: "coxo",
  femural: "femoral",
  femurais: "femorais",
  pescoco: "pescoço",
  orgaos: "órgãos",
  regiao: "região",
  braco: "braço",
  antebraco: "antebraço",
  projecao: "projeção",
  obliqua: "oblíqua",
  obliquas: "oblíquas",
  obliquo: "oblíquo",
  obliquos: "oblíquos",
  prostata: "próstata",
  calcaneo: "calcâneo",
  biopsia: "biópsia",
  pelvica: "pélvica",
  pelvis: "pélvis",
  cardiaca: "cardíaca",
  mastoides: "mastoides",
  mastoide: "mastoide",
  sacro: "sacro",
  sacra: "sacra",
  degluticao: "deglutição",
  esofago: "esôfago",
  pielografia: "pielografia",
  iliacas: "ilíacas",
  clavicula: "clavícula",
  escapula: "escápula",
  escafoide: "escafoide",
  tibia: "tíbia",
  peronio: "perônio",
  sesamoide: "sesamoide",
  transito: "trânsito",
  urografia: "urografia",
  ossea: "óssea",
  osseo: "ósseo",
  ossos: "ossos",
  cervicais: "cervicais",
  aorta: "aorta",
  veias: "veias",
  urinario: "urinário",
  cavum: "cavum",
  vertebral: "vertebral",
  coccix: "cóccix",
  coccigea: "coccígea",
  coracao: "coração",
  dilatacao: "dilatação",
  estenoses: "estenoses",
  anastomoses: "anastomoses",
  estomago: "estômago",
  membros: "membros",
  maxilar: "maxilar",
  mandibula: "mandíbula",
  nariz: "nariz",
  mediastino: "mediastino",
  nefrostomia: "nefrostomia",
  retrope: "retropé",
  intestinal: "intestinal",
  excretora: "excretora",
  miccional: "miccional",
  pediatrica: "pediátrica",
  avaliacao: "avaliação",
  constipacao: "constipação",
  zigomatica: "zigomática",
  angulo: "ângulo",
  ascendente: "ascendente",
  angiotomografia: "angiotomografia",
  ultrassografia: "ultrassonografia",
  incidencias: "incidências",
  decubito: "decúbito",
  tunel: "túnel",
  ouvidos: "ouvidos",
  perna: "perna",
  perfil: "perfil",
  // Termos anatômicos/clínicos com acento (restaurados no rótulo do paciente).
  percutanea: "percutânea",
  percutaneo: "percutâneo",
  transicao: "transição",
  orgao: "órgão",
  puncao: "punção",
  captacao: "captação",
  aspiracao: "aspiração",
  marcacao: "marcação",
  regulacao: "regulação",
  abducao: "abdução",
  aducao: "adução",
  microcalcificacao: "microcalcificação",
  hipofise: "hipófise",
  hemitorax: "hemitórax",
  iliaca: "ilíaca",
  orbitas: "órbitas",
  orbita: "órbita",
  turcica: "túrcica",
  calcio: "cálcio",
  calculos: "cálculos",
  cirurgica: "cirúrgica",
  arterias: "artérias",
  esofagico: "esofágico",
  retrograda: "retrógrada",
  anterograda: "anterógrada",
  obstetrica: "obstétrica",
  gastrico: "gástrico",
  urinarios: "urinários",
  urinarias: "urinárias",
  sacroiliaca: "sacroilíaca",
  prostatica: "prostática",
  lesao: "lesão",
  palpavel: "palpável",
  mesenterica: "mesentérica",
  hepatica: "hepática",
  carotida: "carótida",
  morfologica: "morfológica",
  mamaria: "mamária",
  penis: "pênis",
  retroperitonio: "retroperitônio",
  esterno: "esterno",
  glandula: "glândula",
  glandulas: "glândulas",
  figado: "fígado",
  baco: "baço",
  operatoria: "operatória",
  terapeutica: "terapêutica",
  radiologico: "radiológico",
  estatica: "estática",
  dinamica: "dinâmica",
  gastroesofagico: "gastroesofágico",
  encefalo: "encéfalo",
  ortostatica: "ortostática",
  ortostatico: "ortostático",
}

/**
 * Os nomes na base estão em CAIXA ALTA e sem acentos. Converte para forma
 * legível: aplica capitalização, mantém acrônimos em maiúscula, conectivos
 * em minúscula e RESTAURA acentos de termos conhecidos (ACCENTS).
 * Ex.: "RESSONANCIA DE ABDOMEN" -> "Ressonância de Abdômen"
 */
export function prettifyExamName(nomeUsual: string): string {
  const words = nomeUsual.trim().toLowerCase().split(/\s+/)
  return words
    .map((word, i) => prettifyWord(word, i === 0))
    .join(" ")
}

function prettifyWord(word: string, isFirst: boolean): string {
  // Trata parênteses: "(adulto)" -> "(Adulto)"
  const m = word.match(/^(\(*)([^()]*)(\)*)$/)
  if (!m) return capitalize(applyAccent(word))
  const [, open, core, close] = m
  const upperCore = core.toUpperCase()

  let out: string
  if (KEEP_UPPER.has(upperCore)) {
    out = upperCore
  } else if (!isFirst && open === "" && KEEP_LOWER.has(core)) {
    out = core
  } else {
    out = capitalize(applyAccent(core))
  }
  return `${open}${out}${close}`
}

/** Restaura o acento de um termo (minúsculo, sem acento) se estiver no mapa. */
function applyAccent(core: string): string {
  return ACCENTS[core] ?? core
}

function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** `Como me preparo para <nome_usual em minúsculas>?` — resolve top-1 no searchExames. */
export function buildQuery(e: Exame): string {
  // Usa o nome curado (acentuado) na pergunta visível ao paciente.
  // A busca (lib/search) normaliza acentos, então o match continua igual.
  const nome = e.label_paciente ?? e.nome_usual.toLowerCase()
  return `Como me preparo para ${nome}?`
}

function toExamOption(e: Exame): ExamOption {
  const status = preparos.preparos[e.preparo_id]?.status ?? "pendente"
  return {
    sigla: e.sigla,
    // Prefere o nome curado (com acentos). Fallback: prettify do nome cru.
    label: e.label_paciente ?? prettifyExamName(e.nome_usual),
    query: buildQuery(e),
    status,
  }
}

// Todos os exames do catálogo aparecem, inclusive os sem preparo cadastrado:
// a resposta deles informa que o preparo não está cadastrado e indica o telefone
// do setor, em vez de esconder o exame e deixar o paciente sem caminho.
export function getExamsForModalidade(modalidade: string): ExamOption[] {
  return exames
    .filter((e) => e.modalidade === modalidade)
    .map(toExamOption)
}

export function getModalidades(): ModalidadeOption[] {
  const present = Array.from(new Set(exames.map((e) => e.modalidade)))
  present.sort((a, b) => {
    const ia = MODALIDADE_ORDER.indexOf(a)
    const ib = MODALIDADE_ORDER.indexOf(b)
    return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib)
  })

  return present
    .map((modalidade) => {
      const list = getExamsForModalidade(modalidade)
      return {
        modalidade,
        label: modalidadeLabel(modalidade),
        count: list.length,
        singleExam: list.length === 1 ? list[0] : undefined,
      }
    })
    .filter((m) => m.count > 0)
}
