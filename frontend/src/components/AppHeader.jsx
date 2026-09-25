/**
 * Phase 21 — UI Polish Pass.
 *
 * Every protected page had its own copy-pasted <header className="app-header">
 * block (12 pages, 12 near-identical copies). Extracted into one shared,
 * tested component so the header markup can never drift between pages again.
 * Renders exactly the same DOM every page already used, so no visual change.
 */
export default function AppHeader({ icon, title, className = "" }) {
  return (
    <header className={`app-header ${className}`.trim()}>
      <span className="app-header-icon">{icon}</span>
      <h1>{title}</h1>
    </header>
  );
}
