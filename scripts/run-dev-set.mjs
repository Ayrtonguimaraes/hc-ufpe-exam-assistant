#!/usr/bin/env node
// Roda o conjunto de perguntas contra a API do chat (local ou publicada), como um usuário faria.
// Passa pelo mesmo caminho do site, inclusive o modelo (Groq) quando a chave existe no servidor.
//
//   node scripts/run-dev-set.mjs --url http://127.0.0.1:3100 --runs 3
//   node scripts/run-dev-set.mjs --url https://hc-ufpe-exam-assistant-blush.vercel.app --runs 1 --pause 3000
//   node scripts/run-dev-set.mjs --recheck evaluation/dev-set/runs/<arquivo>.json   (reaplica as verificações atuais)
//   node scripts/run-dev-set.mjs --tally evaluation/dev-set/runs/<arquivo>-notas.csv
//
// Saída em evaluation/dev-set/runs/: JSON completo, resumo em Markdown e planilha CSV para a nota humana (R/E/N/P).
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback }
export const normalize = text => (text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[*_`#]/g, '').replace(/\s+/g, ' ')

export function check(caso, reply) {
  const r = normalize(reply)
  const failed = [
    ...caso.deve.filter(p => !new RegExp(p).test(r)).map(p => `falta /${p}/`),
    ...caso.naoDeve.filter(p => new RegExp(p).test(r)).map(p => `proibido /${p}/`),
  ]
  return { passed: failed.length === 0, failed }
}

const csvCell = s => `"${String(s ?? '').replace(/"/g, '""').replace(/\s+/g, ' ')}"`

function tally(path) {
  const rows = readFileSync(path, 'utf8').trim().split('\n').slice(1)
  const notes = rows.map(line => line.split(',').at(-1).replace(/"/g, '').trim().toUpperCase())
  const count = Object.fromEntries(['R', 'E', 'N', 'P', ''].map(k => [k || 'sem nota', notes.filter(n => n === k).length]))
  console.log(count)
}

function writeReports(base, meta, results) {
  const { url, commit, rodadas: runs, pausaMs: pause, alvo: target } = meta
  const stamp = base.split('/').at(-1).replace(/-(local|publicado)$/, '')
  writeFileSync(`${base}.json`, JSON.stringify({ meta, results }, null, 2))
  const all = results.length
  const stable = results.filter(r => r.aprovadas === runs).length
  const never = results.filter(r => r.aprovadas === 0).map(r => r.id)
  const variable = results.filter(r => r.aprovadas > 0 && r.aprovadas < runs).map(r => r.id)
  const paths = results.flatMap(r => r.rodadas.map(x => x.turnos.at(-1).caminho ?? 'sem caminho'))
  const md = [
    `# Rodada ${stamp} (${target})`, '',
    `URL: ${url} · commit ${commit} · ${runs} rodada(s) por pergunta · pausa ${pause} ms`, '',
    `Verificações automáticas: ${stable}/${all} perguntas passaram em todas as rodadas; ${variable.length} variaram; ${never.length} nunca passaram.`, '',
    `Variaram: ${variable.join(', ') || '—'}`, '', `Nunca passaram: ${never.join(', ') || '—'}`, '',
    `Caminhos usados (última resposta de cada rodada): ${Object.entries(paths.reduce((a, p) => ({ ...a, [p]: (a[p] ?? 0) + 1 }), {})).map(([k, v]) => `${k} ${v}`).join(', ')}`, '',
    'As verificações automáticas são triagem (presença ou ausência de termos). A nota de qualidade é humana: preencha o CSV ao lado com R, E, N ou P (ver PROTOCOLO.md).', '',
    '| Caso | Aprovadas | Falhas (1ª rodada) |', '|---|---|---|',
    ...results.map(r => `| ${r.id} | ${r.aprovadas}/${runs} | ${r.rodadas[0].failed.join('; ') || '—'} |`), '',
  ]
  writeFileSync(`${base}.md`, md.join('\n'))
  const csv = ['id,grupo,esperado,resposta (1ª rodada),caminho,nota']
  for (const r of results) csv.push([r.id, r.grupo, r.esperado, r.rodadas[0].turnos.at(-1).resposta, r.rodadas[0].turnos.at(-1).caminho, ''].map(csvCell).join(','))
  writeFileSync(`${base}-notas.csv`, csv.join('\n') + '\n')
  return { stable, all }
}

/** Re-applies the current checks of perguntas.json to the answers stored in a previous run and rewrites its reports. */
function recheck(path) {
  const set = JSON.parse(readFileSync(new URL('../evaluation/dev-set/perguntas.json', import.meta.url), 'utf8'))
  const { meta, results } = JSON.parse(readFileSync(path, 'utf8'))
  for (const r of results) {
    const caso = set.casos.find(c => c.id === r.id)
    for (const x of r.rodadas) Object.assign(x, check(caso, x.turnos.at(-1).resposta))
    r.aprovadas = r.rodadas.filter(x => x.passed).length
  }
  meta.reverificadoEm = new Date().toISOString()
  const { stable, all } = writeReports(path.replace(/\.json$/, ''), meta, results)
  console.log(`${stable}/${all} estáveis após reaplicar as verificações`)
}

async function run() {
  const url = arg('url', 'http://127.0.0.1:3100').replace(/\/$/, '')
  const runs = Number(arg('runs', '3'))
  const pause = Number(arg('pause', '2500'))
  const set = JSON.parse(readFileSync(new URL('../evaluation/dev-set/perguntas.json', import.meta.url), 'utf8'))
  const commit = (() => { try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return 'desconhecido' } })()
  const results = []
  for (const caso of set.casos) {
    const rodadas = []
    for (let k = 0; k < runs; k++) {
      const history = []
      const turnos = []
      for (const message of caso.turnos) {
        const start = Date.now()
        let data
        try {
          const res = await fetch(`${url}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, profile: caso.perfil, history }) })
          data = await res.json()
        } catch (error) { data = { reply: `[ERRO ${error.message}]`, sources: [] } }
        turnos.push({ pergunta: message, resposta: data.reply, caminho: data.reason ?? null, fontes: (data.sources ?? []).map(s => s.nome), ms: Date.now() - start })
        history.push({ role: 'user', content: message }, { role: 'assistant', content: data.reply ?? '' })
        await new Promise(r => setTimeout(r, pause))
      }
      rodadas.push({ turnos, ...check(caso, turnos.at(-1).resposta) })
    }
    const ok = rodadas.filter(r => r.passed).length
    results.push({ id: caso.id, grupo: caso.grupo, esperado: caso.esperado, aprovadas: ok, rodadas })
    console.log(`${caso.id} ${ok}/${runs} ${rodadas.map(r => r.turnos.at(-1).caminho).join(',')}`)
  }
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
  const target = /127\.0\.0\.1|localhost/.test(url) ? 'local' : 'publicado'
  const base = fileURLToPath(new URL(`../evaluation/dev-set/runs/${stamp}-${target}`, import.meta.url))
  mkdirSync(new URL('../evaluation/dev-set/runs/', import.meta.url), { recursive: true })
  const meta = { data: new Date().toISOString(), url, alvo: target, commit, rodadas: runs, pausaMs: pause, conjunto: set.nome }
  const { stable, all } = writeReports(base, meta, results)
  console.log(`\n${stable}/${all} estáveis; relatórios em ${base}.{json,md} e -notas.csv`)
}

if (process.argv.includes('--tally')) tally(arg('tally'))
else if (process.argv.includes('--recheck')) recheck(arg('recheck'))
else if (process.argv[1] === fileURLToPath(import.meta.url)) run()
