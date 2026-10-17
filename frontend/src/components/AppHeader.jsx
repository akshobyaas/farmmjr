import { useTranslation } from "react-i18next";
import logo from "../assets/logo.png";

/**
 * Phase 21 — UI Polish Pass.
 *
 * Every protected page had its own copy-pasted <header className="app-header">
 * block (12 pages, 12 near-identical copies). Extracted into one shared,
 * tested component so the header markup can never drift between pages again.
 *
 * Later updated (see assets/logo.png and its own notes) to always show the
 * app's logo as a persistent brand mark instead of a per-page icon -- every
 * page's header now looks the same except for its title, matching the app
 * icon shown on the login/register pages and the browser tab. The component
 * no longer takes an `icon` prop; callers only pass `title` (and an optional
 * `className` for the handful of pages with extra header styling).
 */
export default function AppHeader({ title, className = "" }) {
  const { t } = useTranslation();
  return (
    <header className={`app-header ${className}`.trim()}>
      <span className="app-header-icon">
        <img src={logo} alt={t("common.appName")} className="app-header-logo" />
      </span>
      <h1>{title}</h1>
    </header>
  );
}
