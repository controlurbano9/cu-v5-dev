// ═══════════════════════════════════════════════════════════════
// icons.jsx — Biblioteca de íconos unificada (Heroicons outline)
//
// Stroke-width 1.6 · currentColor · viewBox 0 0 24 24
// Tamaño por defecto 20px; override con className="ico-sm|lg|xl"
// o style={{ width, height }}.
//
// Uso:
//   <Icon.Home className="ico" />
//   <Icon.Plus />  →  <Icon name="plus" />
// ═══════════════════════════════════════════════════════════════

function _svg(children, size = 20) {
  return React.createElement('svg', {
    width: size, height: size,
    viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.6,
    strokeLinecap: 'round', strokeLinejoin: 'round',
  }, children);
}

const Icon = {
  // ── Navegación principal ────────────────────────────────
  Home:   (p) => _svg([
    React.createElement('path',     { key: 1, d: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }),
    React.createElement('polyline', { key: 2, points: '9 22 9 12 15 12 15 22' }),
  ], p?.size),
  Visits: (p) => _svg([
    React.createElement('rect',  { key: 1, x: 3, y: 4, width: 18, height: 18, rx: 2 }),
    React.createElement('line',  { key: 2, x1: 16, y1: 2, x2: 16, y2: 6 }),
    React.createElement('line',  { key: 3, x1: 8,  y1: 2, x2: 8,  y2: 6 }),
    React.createElement('line',  { key: 4, x1: 3,  y1: 10, x2: 21, y2: 10 }),
  ], p?.size),
  Search: (p) => _svg([
    React.createElement('circle', { key: 1, cx: 11, cy: 11, r: 8 }),
    React.createElement('line',   { key: 2, x1: 21, y1: 21, x2: 16.65, y2: 16.65 }),
  ], p?.size),
  Norma:  (p) => _svg([
    React.createElement('path',     { key: 1, d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
    React.createElement('polyline', { key: 2, points: '14 2 14 8 20 8' }),
    React.createElement('line',     { key: 3, x1: 9, y1: 13, x2: 15, y2: 13 }),
    React.createElement('line',     { key: 4, x1: 9, y1: 17, x2: 15, y2: 17 }),
  ], p?.size),
  Agenda: (p) => _svg([
    React.createElement('rect', { key: 1, x: 3, y: 4, width: 18, height: 18, rx: 2 }),
    React.createElement('line', { key: 2, x1: 16, y1: 2, x2: 16, y2: 6 }),
    React.createElement('line', { key: 3, x1: 8,  y1: 2, x2: 8,  y2: 6 }),
    React.createElement('line', { key: 4, x1: 3,  y1: 10, x2: 21, y2: 10 }),
    React.createElement('circle',{key: 5, cx: 12, cy: 15, r: 1.5, fill: 'currentColor' }),
  ], p?.size),
  Admin: (p) => _svg([
    React.createElement('circle', { key: 1, cx: 12, cy: 12, r: 3 }),
    React.createElement('path',   { key: 2, d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9 1.65 1.65 0 0 0 4.27 7.18l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' }),
  ], p?.size),

  // ── Acciones ─────────────────────────────────────────────
  Plus:    (p) => _svg([
    React.createElement('line', { key: 1, x1: 12, y1: 5,  x2: 12, y2: 19 }),
    React.createElement('line', { key: 2, x1: 5,  y1: 12, x2: 19, y2: 12 }),
  ], p?.size),
  Check:   (p) => _svg([
    React.createElement('polyline', { key: 1, points: '20 6 9 17 4 12' }),
  ], p?.size),
  Close:   (p) => _svg([
    React.createElement('line', { key: 1, x1: 18, y1: 6,  x2: 6,  y2: 18 }),
    React.createElement('line', { key: 2, x1: 6,  y1: 6,  x2: 18, y2: 18 }),
  ], p?.size),
  Chevron: (p) => _svg([
    React.createElement('polyline', { key: 1, points: '6 9 12 15 18 9' }),
  ], p?.size),
  ChevronUp: (p) => _svg([
    React.createElement('polyline', { key: 1, points: '18 15 12 9 6 15' }),
  ], p?.size),
  ChevronLeft: (p) => _svg([
    React.createElement('polyline', { key: 1, points: '15 18 9 12 15 6' }),
  ], p?.size),
  ChevronRight:(p) => _svg([
    React.createElement('polyline', { key: 1, points: '9 18 15 12 9 6' }),
  ], p?.size),
  Refresh: (p) => _svg([
    React.createElement('polyline', { key: 1, points: '23 4 23 10 17 10' }),
    React.createElement('polyline', { key: 2, points: '1 20 1 14 7 14' }),
    React.createElement('path',     { key: 3, d: 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15' }),
  ], p?.size),
  Trash:   (p) => _svg([
    React.createElement('polyline', { key: 1, points: '3 6 5 6 21 6' }),
    React.createElement('path',     { key: 2, d: 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }),
  ], p?.size),
  Edit:    (p) => _svg([
    React.createElement('path', { key: 1, d: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' }),
    React.createElement('path', { key: 2, d: 'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' }),
  ], p?.size),
  Save:    (p) => _svg([
    React.createElement('path',     { key: 1, d: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z' }),
    React.createElement('polyline', { key: 2, points: '17 21 17 13 7 13 7 21' }),
    React.createElement('polyline', { key: 3, points: '7 3 7 8 15 8' }),
  ], p?.size),

  // ── Acciones adicionales (migración H-06 desde ICO legacy) ─
  Play:    (p) => _svg([
    React.createElement('circle',  { key: 1, cx: 12, cy: 12, r: 10 }),
    React.createElement('polygon', { key: 2, points: '10 8 16 12 10 16 10 8', fill: 'currentColor' }),
  ], p?.size),
  Eye:     (p) => _svg([
    React.createElement('path',   { key: 1, d: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z' }),
    React.createElement('circle', { key: 2, cx: 12, cy: 12, r: 3 }),
  ], p?.size),
  Folder:  (p) => _svg([
    React.createElement('path', { key: 1, d: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' }),
  ], p?.size),
  Undo:    (p) => _svg([
    React.createElement('polyline', { key: 1, points: '9 14 4 9 9 4' }),
    React.createElement('path',     { key: 2, d: 'M20 20v-7a4 4 0 0 0-4-4H4' }),
  ], p?.size),
  ArrowUp: (p) => _svg([
    React.createElement('line',     { key: 1, x1: 12, y1: 19, x2: 12, y2: 5 }),
    React.createElement('polyline', { key: 2, points: '5 12 12 5 19 12' }),
  ], p?.size),

  // ── Estados / info ───────────────────────────────────────
  Alert:   (p) => _svg([
    React.createElement('circle', { key: 1, cx: 12, cy: 12, r: 10 }),
    React.createElement('line',   { key: 2, x1: 12, y1: 8,  x2: 12, y2: 12 }),
    React.createElement('line',   { key: 3, x1: 12, y1: 16, x2: 12.01, y2: 16 }),
  ], p?.size),
  Clock:   (p) => _svg([
    React.createElement('circle',   { key: 1, cx: 12, cy: 12, r: 10 }),
    React.createElement('polyline', { key: 2, points: '12 6 12 12 16 14' }),
  ], p?.size),
  Calendar:(p) => _svg([
    React.createElement('rect', { key: 1, x: 3, y: 4, width: 18, height: 18, rx: 2 }),
    React.createElement('line', { key: 2, x1: 16, y1: 2, x2: 16, y2: 6 }),
    React.createElement('line', { key: 3, x1: 8,  y1: 2, x2: 8,  y2: 6 }),
    React.createElement('line', { key: 4, x1: 3,  y1: 10, x2: 21, y2: 10 }),
  ], p?.size),
  Info:    (p) => _svg([
    React.createElement('circle', { key: 1, cx: 12, cy: 12, r: 10 }),
    React.createElement('line',   { key: 2, x1: 12, y1: 16, x2: 12, y2: 12 }),
    React.createElement('line',   { key: 3, x1: 12, y1: 8,  x2: 12.01, y2: 8 }),
  ], p?.size),

  // ── Dominio: GPS, foto, documento ───────────────────────
  Pin:     (p) => _svg([
    React.createElement('path',   { key: 1, d: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z' }),
    React.createElement('circle', { key: 2, cx: 12, cy: 10, r: 3 }),
  ], p?.size),
  Camera:  (p) => _svg([
    React.createElement('path',   { key: 1, d: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z' }),
    React.createElement('circle', { key: 2, cx: 12, cy: 13, r: 4 }),
  ], p?.size),
  File:    (p) => _svg([
    React.createElement('path',     { key: 1, d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
    React.createElement('polyline', { key: 2, points: '14 2 14 8 20 8' }),
  ], p?.size),
  ExternalLink:(p) => _svg([
    React.createElement('path',     { key: 1, d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }),
    React.createElement('polyline', { key: 2, points: '15 3 21 3 21 9' }),
    React.createElement('line',     { key: 3, x1: 10, y1: 14, x2: 21, y2: 3 }),
  ], p?.size),
  Filter:  (p) => _svg([
    React.createElement('polygon', { key: 1, points: '22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3' }),
  ], p?.size),
  User:    (p) => _svg([
    React.createElement('path',   { key: 1, d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' }),
    React.createElement('circle', { key: 2, cx: 12, cy: 7, r: 4 }),
  ], p?.size),
  UserAdd: (p) => _svg([
    React.createElement('path',   { key: 1, d: 'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' }),
    React.createElement('circle', { key: 2, cx: 8.5, cy: 7, r: 4 }),
    React.createElement('line',   { key: 3, x1: 20, y1: 8,  x2: 20, y2: 14 }),
    React.createElement('line',   { key: 4, x1: 23, y1: 11, x2: 17, y2: 11 }),
  ], p?.size),
  LogOut:  (p) => _svg([
    React.createElement('path',     { key: 1, d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' }),
    React.createElement('polyline', { key: 2, points: '16 17 21 12 16 7' }),
    React.createElement('line',     { key: 3, x1: 21, y1: 12, x2: 9, y2: 12 }),
  ], p?.size),
};

// Helper unificado: <Icon name="home" /> en lugar de <Icon.Home />
function IconByName({ name, ...rest }) {
  const k = (name || '').toString();
  // PascalCase: 'home' → 'Home', 'user-add' → 'UserAdd'
  const pascal = k.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase());
  const fn = Icon[pascal];
  return fn ? fn(rest) : null;
}

// Export al global scope (mismo patrón que el resto del bundle)
window.Icon = Icon;
window.IconByName = IconByName;
