# Oversight — repo guide for AI assistants

Asbestos abatement project oversight for field inspectors. Two apps live here:

1. **Desktop (Electron)** — the existing app. Root `main.js` (main process),
   `js/*.js` (renderer), `index.html`/`project.html`. See `AGENTS.md` for dev
   workflow, gotchas, and schema-migration rules. Data in `localStorage`,
   offline-only, no backend.
2. **iOS/macOS (SwiftUI)** — being built in `ios/`. Follow `ios/PORTING_PLAN.md`.
   The interactive spec is `ios-prototype/` (React/JSX mockup of every screen,
   sheet, and business rule — open `ios-prototype/Oversight iOS - Prototype.html`
   in a browser to see it running).

## Rules

- The prototype and desktop app define behavior; when porting, match them —
  don't invent new UX or fields.
- Never delete or lossily migrate inspector data. Additive schema changes only.
- Native app: SwiftUI + SwiftData, iOS 17+/macOS 14+, no third-party deps,
  offline-first (no backend).
- Excel import/export is desktop-only; do not port it to iOS.
- Commit per feature/phase with clear messages; branch `main`, remote
  `github.com/fernandoqv1/Oversight`.
