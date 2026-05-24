#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# _bundle.sh — Regenera bundle.min.js con esbuild.
# Correr tras editar cualquier .jsx (igual que se bumpea ?v= en index.html).
# Requiere Node >= 18 y haber corrido 'npm install' una vez.
# ═══════════════════════════════════════════════════════════════
set -e
cd "$(dirname "$0")"
node build.js
