// ═══════════════════════════════════════════════════════════════
// build.js — Genera bundle.min.js con esbuild.
//
// - Concatena los 12 .jsx en el orden correcto (mismo que tenía
//   index.html antes del bundle).
// - Transpila JSX → React.createElement nativo.
// - Minifica (whitespace + identificadores + dead code).
// - Target ES2019 (cubre todos los navegadores modernos en uso).
//
// Resultado: bundle.min.js cargable como <script> normal, sin
// Babel-standalone en runtime → ahorra ~770 KB de descarga y ~400 ms
// de transpilación en cada arranque.
//
// Uso:
//   node build.js               → build producción minificado
//   node build.js --dev         → build sin minify, con sourcemap
//
// Tras editar JSX: re-correr este script + bumpar ?v= en index.html.
// ═══════════════════════════════════════════════════════════════
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const DEV = process.argv.includes('--dev');

const ARCHIVOS = [
  // icons.jsx primero — expone window.Icon disponible para todos los demás
  'icons.jsx',
  'modal.jsx',
  'informe-modal.jsx',
  'visita-detail-modal.jsx',
  'login.jsx',
  // visita-card.jsx antes de home/mis-visitas/buscar (que la consumen)
  'visita-card.jsx',
  'home.jsx',
  'mis-visitas.jsx',
  'buscar.jsx',
  'agenda.jsx',
  'nueva-visita.jsx',
  'consulta-norma.jsx',
  'admin.jsx',
  'app.jsx',
];

// Concatenar fuentes en un buffer único.
// Cada bloque va separado con un comentario para que el sourcemap (en --dev)
// indique de qué archivo viene cada línea.
const partes = ARCHIVOS.map(function (f) {
  const ruta = path.join(__dirname, f);
  if (!fs.existsSync(ruta)) {
    console.error('✕ Falta archivo: ' + f);
    process.exit(1);
  }
  const cuerpo = fs.readFileSync(ruta, 'utf-8');
  return '\n// ═══ ' + f + ' ═══\n' + cuerpo;
});
const codigo = partes.join('\n');

esbuild.build({
  stdin: {
    contents: codigo,
    loader: 'jsx',
    resolveDir: __dirname,
    sourcefile: 'bundle.jsx',
  },
  outfile: path.join(__dirname, 'bundle.min.js'),
  bundle: false,
  minify: !DEV,
  sourcemap: DEV ? 'linked' : false,
  jsx: 'transform',
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  target: ['es2019'],
  legalComments: 'none',
  charset: 'utf8',
}).then(function () {
  const bytes = fs.statSync(path.join(__dirname, 'bundle.min.js')).size;
  const kb = (bytes / 1024).toFixed(1);
  console.log('✓ bundle.min.js generado (' + kb + ' KB' + (DEV ? ', dev mode' : ', minificado') + ')');
}).catch(function (err) {
  console.error('✕ Error de build:', err.message || err);
  process.exit(1);
});
