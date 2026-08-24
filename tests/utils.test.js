// ═══════════════════════════════════════════════════════════════
// tests/utils.test.js — Cobertura para utils.js (fechas, festivos CO, Pascua)
// Auditoría 2026-07, hallazgo QA#3: "cero cobertura sobre festivos
// colombianos y cálculo de Pascua". Fase 0.7 del plan de implementación.
//
// Ejecutar: node --test tests/
// (usa el test runner nativo de Node, sin dependencias nuevas)
// ═══════════════════════════════════════════════════════════════
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatearFecha, parsearFecha, esDiaHabil, diasHabilesHasta, diasDesde,
  _festivosColombia, _calcularPascua, _alLunes,
} = require('../utils.js');

test('_calcularPascua — fechas de Pascua conocidas y verificables', () => {
  // Domingos de Pascua (calendario gregoriano occidental), fechas públicas conocidas.
  const p2024 = _calcularPascua(2024);
  assert.equal(p2024.getMonth(), 2, '2024: Pascua debe ser en marzo (mes índice 2)');
  assert.equal(p2024.getDate(), 31, '2024: Pascua debe ser 31 de marzo');

  const p2025 = _calcularPascua(2025);
  assert.equal(p2025.getMonth(), 3, '2025: Pascua debe ser en abril (mes índice 3)');
  assert.equal(p2025.getDate(), 20, '2025: Pascua debe ser 20 de abril');
});

test('_calcularPascua — siempre cae en domingo', () => {
  for (const anio of [2023, 2024, 2025, 2026, 2027, 2030, 2050]) {
    assert.equal(_calcularPascua(anio).getDay(), 0, `Pascua ${anio} debe ser domingo`);
  }
});

test('_alLunes — mueve cualquier fecha al lunes siguiente (o la deja igual si ya es lunes)', () => {
  // 2026-01-01 es jueves -> debe mover al lunes 2026-01-05
  const jueves = new Date(2026, 0, 1);
  const movido = _alLunes(jueves);
  assert.equal(movido.getDay(), 1, 'resultado debe ser lunes');
  assert.ok(movido >= jueves, 'el lunes resultante no puede ser anterior a la fecha original');

  // Un lunes debe quedar igual
  const lunes = new Date(2026, 0, 5);
  assert.equal(lunes.getDay(), 1, 'fixture: 2026-01-05 debe ser lunes');
  const igual = _alLunes(lunes);
  assert.equal(igual.getTime(), lunes.getTime(), 'un lunes no debe moverse');
});

test('_festivosColombia — Jueves y Viernes Santo son Pascua-3 y Pascua-2', () => {
  const anio = 2026;
  const pascua = _calcularPascua(anio);
  const festivos = _festivosColombia(anio);
  const ts = (d) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  const tsSet = festivos.map(ts);

  const juevesSanto = new Date(pascua.getTime() - 3 * 86400000);
  const viernesSanto = new Date(pascua.getTime() - 2 * 86400000);
  assert.ok(tsSet.includes(ts(juevesSanto)), 'Jueves Santo debe estar en la lista de festivos');
  assert.ok(tsSet.includes(ts(viernesSanto)), 'Viernes Santo debe estar en la lista de festivos');
});

test('_festivosColombia — festivos fijos (1 ene, 25 dic) siempre presentes', () => {
  for (const anio of [2025, 2026, 2027]) {
    const festivos = _festivosColombia(anio);
    const tieneFijo = (mes, dia) => festivos.some((f) => f.getMonth() === mes && f.getDate() === dia);
    assert.ok(tieneFijo(0, 1), `${anio}: 1 de enero debe ser festivo`);
    assert.ok(tieneFijo(11, 25), `${anio}: 25 de diciembre debe ser festivo`);
  }
});

test('esDiaHabil — sábados y domingos nunca son día hábil', () => {
  // 2026-01-03 es sábado, 2026-01-04 es domingo
  assert.equal(esDiaHabil(new Date(2026, 0, 3)), false);
  assert.equal(esDiaHabil(new Date(2026, 0, 4)), false);
});

test('esDiaHabil — 1 de enero nunca es día hábil (festivo fijo)', () => {
  for (const anio of [2025, 2026, 2027]) {
    assert.equal(esDiaHabil(new Date(anio, 0, 1)), false, `1 ene ${anio} no debe ser día hábil`);
  }
});

test('esDiaHabil — un martes cualquiera que no sea festivo sí es día hábil', () => {
  // 2026-01-13 es martes, no está en ningún festivo fijo/Emiliani/Pascua de 2026
  assert.equal(esDiaHabil(new Date(2026, 0, 13)), true);
});

test('diasHabilesHasta — 0 cuando la fecha objetivo es hoy', () => {
  const hoy = new Date();
  assert.equal(diasHabilesHasta(hoy), 0);
});

test('diasHabilesHasta — signo positivo a futuro, negativo a pasado', () => {
  const hoy = new Date();
  const futuro = new Date(hoy.getTime() + 30 * 86400000);
  const pasado = new Date(hoy.getTime() - 30 * 86400000);
  assert.ok(diasHabilesHasta(futuro) > 0, 'una fecha futura debe dar un conteo positivo');
  assert.ok(diasHabilesHasta(pasado) < 0, 'una fecha pasada debe dar un conteo negativo');
});

test('formatearFecha / parsearFecha — round-trip DD/MM/YYYY', () => {
  assert.equal(formatearFecha('2026-01-05'), '05/01/2026');
  assert.equal(formatearFecha('05/01/2026'), '05/01/2026');
  const d = parsearFecha('05/01/2026');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 0);
  assert.equal(d.getDate(), 5);
});

test('formatearFecha — vacío/null no lanza excepción', () => {
  assert.equal(formatearFecha(null), '');
  assert.equal(formatearFecha(''), '');
  assert.equal(formatearFecha(undefined), '');
});
