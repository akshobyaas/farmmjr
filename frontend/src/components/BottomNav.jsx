import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";

/**
 * Phase 21 — UI Polish Pass.
 *
 * The design target audience (elderly / non-tech-savvy farmers) was always
 * meant to have persistent, thumb-reachable navigation, but no page had any
 * navigation at all beyond a single "Back to Dashboard" text link at the
 * bottom of the content -- every trip between sections meant going all the
 * way back to the dashboard first. This adds the missing bottom nav bar,
 * rendered on every logged-in page. Large (60px+) tap targets, icon + short
 * label so it reads at a glance, and an active-state highlight so a farmer
 * always knows which section they're in.
 */
const ITEMS = [
  { to: "/dashboard", icon: "🏠", labelKey: "nav.home", end: true },
  { to: "/crops", icon: "🌾", labelKey: "nav.crops" },
  { to: "/scan", icon: "🔍", labelKey: "nav.scan" },
  { to: "/weather", icon: "🌦️", labelKey: "nav.weather" },
  { to: "/profile", icon: "👤", labelKey: "nav.profile" },
];

export default function BottomNav() {
  const { t } = useTranslation();

  return (
    <nav className="bottom-nav" aria-label={t("nav.label")}>
      <div className="bottom-nav-inner">
        {ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `bottom-nav-item${isActive ? " active" : ""}`}
          >
            <span className="bottom-nav-icon" aria-hidden="true">{item.icon}</span>
            <span className="bottom-nav-label">{t(item.labelKey)}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
