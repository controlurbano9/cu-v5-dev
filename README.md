# Control Urbano V6 · Inspección N°9 · Alcaldía de Bello

App web React + esbuild para gestión de visitas urbanísticas. Servida vía **GitHub Pages**.

## Build local

```bash
npm install                  # primera vez
node build.js                # genera bundle.min.js minificado
node build.js --dev          # build con sourcemaps, sin minify
```

Tras editar cualquier `.jsx`: regenerar bundle + bumpar `?v=N` en `index.html` y `CACHE_NAME` en `sw.js`.

## Estructura

- `index.html` · entry point
- `bundle.min.js` · pre-transpilado con esbuild (~185 KB, sin Babel runtime)
- `build.js` + `package.json` · pipeline esbuild
- `*.jsx` · fuentes (12 archivos, regenerar bundle al editar)
- `api.js` · cliente del webhook Apps Script + cache + POT + catastro
- `offline-queue.js` · cola IndexedDB para escrituras sin red
- `sw.js` · Service Worker (SWR + Background Sync)
- `utils.js` · fechas, festivos CO, días hábiles
- `styles.css` · design tokens (terracota sobre crema)
- `catastro.json` · 52K polígonos + 225K fichas (37 MB)
- `informe/index.html` · generador F-GGO-43 standalone

## Documentación completa

Ver `CLAUDE.md` en el workspace padre — reglas críticas, arquitectura, mapeos de BD, flujos.
