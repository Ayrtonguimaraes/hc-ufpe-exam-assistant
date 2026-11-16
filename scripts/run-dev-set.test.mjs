import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { check } from './run-dev-set.mjs'

const set = JSON.parse(readFileSync(new URL('../evaluation/dev-set/perguntas.json', import.meta.url), 'utf8'))

it('o conjunto tem ids únicos, resposta esperada e verificações que compilam', () => {
  expect(new Set(set.casos.map(c => c.id)).size).toBe(set.casos.length)
  for (const c of set.casos) {
    expect(c.esperado, c.id).toBeTruthy()
    expect(c.deve.length, c.id).toBeGreaterThan(0)
    for (const p of [...c.deve, ...c.naoDeve]) expect(() => new RegExp(p), `${c.id} ${p}`).not.toThrow()
  }
})

it('a verificação ignora acentos e markdown e acusa termos proibidos', () => {
  const caso = { deve: ['urografia'], naoDeve: ['ressonancia'] }
  expect(check(caso, 'Para **Urografia** excretora…').passed).toBe(true)
  expect(check(caso, 'Para **Ressonância** de vias biliares').failed).toEqual(['falta /urografia/', 'proibido /ressonancia/'])
})
