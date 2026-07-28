# Instrucciones para agentes de código (OpenCode / Aider)

Este archivo lo usan agentes de respaldo (OpenCode, y herramientas similares que
leen `AGENTS.md` automáticamente) cuando Claude Code no está disponible por
límite de uso. Para el contexto completo del proyecto —arquitectura, reglas
críticas, infraestructura— ver `../CLAUDE.md` (carpeta padre); sigue esas
mismas reglas.

**Commits:** al confirmar cambios con `git commit`, prefija siempre el mensaje
con `opencode: ` seguido de una descripción breve en español. Ejemplo:

```
opencode: corrige validacion de fechaVisita en nueva-visita.jsx
```

Esto permite identificar en `git log` qué commits vinieron de un agente de
respaldo en vez de una sesión con Claude Code.
