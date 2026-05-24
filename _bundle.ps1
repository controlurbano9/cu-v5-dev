#  ═══════════════════════════════════════════════════════════════
#  _bundle.ps1 — Regenera bundle.min.js con esbuild.
#  Uso: powershell -ExecutionPolicy Bypass -File .\_bundle.ps1
#  Requiere Node >= 18 y haber corrido 'npm install' una vez.
#  ═══════════════════════════════════════════════════════════════
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

# Si Node no está en PATH, buscarlo en ruta estándar de Windows
$nodeCmd = (Get-Command node -ErrorAction SilentlyContinue)
if (-not $nodeCmd) {
  $candidato = "C:\Program Files\nodejs\node.exe"
  if (Test-Path $candidato) {
    & $candidato build.js
  } else {
    Write-Error "Node.js no encontrado. Instala desde https://nodejs.org/ y reintenta."
    exit 1
  }
} else {
  node build.js
}
