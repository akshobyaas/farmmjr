import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import AppHeader from "../components/AppHeader";
import Icon from "../components/Icon";
import BottomNav from "../components/BottomNav";
import { languageName } from "../i18n/languages";
import { fetchRiskAlerts, fetchTodaysTasks } from "../api/cropTracker";

// Phase 22 -- "Good morning/afternoon/evening" instead of a flat "Welcome",
// based on the viewer's own local clock (new Date() reads it in whatever
// timezone the device is set to).
function greetingKey() {
  const hour = new Date().getHours();
  if (hour < 12) return "dashboard.greetingMorning";
  if (hour < 17) return "dashboard.greetingAfternoon";
  return "dashboard.greetingEvening";
}

// Matches backend/crops/risk_engine.py's _RISK_LEVEL_ORDER: lower number =
// higher priority. A farmer can have more than one active tracker (e.g.
// Rice and Arecanut -- no uniqueness constraint across crops), each with
// its own alerts, so picking "the first tracker's alert" is not enough --
// the dashboard needs the single most urgent alert across ALL of them.
const RISK_LEVEL_RANK = { high: 0, moderate: 1, low: 2 };
const UNKNOWN_RISK_LEVEL_RANK = Object.keys(RISK_LEVEL_RANK).length;

function riskLevelRank(alert) {
  const level = alert?.risk_level?.toLowerCase?.();
  return level in RISK_LEVEL_RANK ? RISK_LEVEL_RANK[level] : UNKNOWN_RISK_LEVEL_RANK;
}

// Task 13 -- pulls the single highest-priority alert out of GET
// /crops/risk-alerts/'s response, or null when there's nothing to show.
// Handles every documented response shape without throwing:
//   - {"trackers": []} (no active tracker) -> null
//   - {"detail": "..."} (active tracker(s), but home_location isn't set
//     yet -- a normal incomplete-setup state, not an error) -> null.
//     Profile already has the home-location field (Task 7); nagging
//     about it on every dashboard load wasn't asked for, so this is
//     treated exactly like "no alert to show".
//   - {"trackers": [{..., "risk_alerts": [{"disease_name", "risk_level",
//     ...}, ...]}, ...]} (the real Task 12 endpoint shape -- each tracker
//     nests its own already-sorted-highest-risk-first alert list) -- each
//     tracker's own first alert is its most urgent, so only that one needs
//     comparing across trackers to find the overall most urgent.
//   - a tracker entry with "disease_name"/"risk_level" directly on it
//     (no "risk_alerts" nesting) is also accepted, so this stays in sync
//     with the flatter shape this task's own brief/tests use.
function extractRiskAlert(data) {
  const trackers = data?.trackers;
  if (!Array.isArray(trackers)) return null;

  let best = null;
  for (const tracker of trackers) {
    const candidate = tracker?.disease_name
      ? tracker
      : Array.isArray(tracker?.risk_alerts) && tracker.risk_alerts.length > 0
        ? tracker.risk_alerts[0]
        : null;
    if (candidate && (best === null || riskLevelRank(candidate) < riskLevelRank(best))) {
      best = candidate;
    }
  }
  return best;
}

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isAdmin = user?.role === "admin";
  const avatarInitial = user?.username?.charAt(0)?.toUpperCase() || "?";

  // Task 13 -- fetched once on mount; failures (including the plain
  // {"detail": ...} no-home-location shape, handled inside
  // extractRiskAlert) just keep riskAlert null, so the card quietly
  // falls back to its existing static copy rather than breaking the
  // dashboard over a nice-to-have proactive nudge.
  const [riskAlert, setRiskAlert] = useState(null);

  // Task 18 -- fetched once on mount alongside the risk-alerts fetch
  // above. A fetch failure just leaves the list empty, so the card
  // quietly doesn't render rather than breaking the dashboard -- same
  // "fail soft" treatment as fetchRiskAlerts.
  const [todaysTasks, setTodaysTasks] = useState([]);

  useEffect(() => {
    fetchRiskAlerts()
      .then((data) => setRiskAlert(extractRiskAlert(data)))
      .catch(() => setRiskAlert(null));
  }, []);

  useEffect(() => {
    fetchTodaysTasks()
      .then((data) => setTodaysTasks(Array.isArray(data?.tasks) ? data.tasks : []))
      .catch(() => setTodaysTasks([]));
  }, []);

  const quickLinks = [
    { label: t("dashboard.links.profile"), desc: t("dashboard.links.profileDesc"), icon: "user", to: "/profile", ready: true },
    { label: t("dashboard.links.crops"), desc: t("dashboard.links.cropsDesc"), icon: "leaf", to: "/crops", ready: true },
    { label: t("dashboard.links.scan"), desc: t("dashboard.links.scanDesc"), icon: "search", to: "/scan", ready: true },
    { label: t("dashboard.links.scanHistory"), desc: t("dashboard.links.scanHistoryDesc"), icon: "history", to: "/scan/history", ready: true },
    { label: t("dashboard.links.weather"), desc: t("dashboard.links.weatherDesc"), icon: "cloudSun", to: "/weather", ready: true },
    { label: t("dashboard.links.videos"), desc: t("dashboard.links.videosDesc"), icon: "play", to: "/videos", ready: true },
    { label: t("dashboard.links.locator"), desc: t("dashboard.links.locatorDesc"), icon: "pin", to: "/locator", ready: true },
    { label: t("dashboard.links.chatbot"), desc: t("dashboard.links.chatbotDesc"), icon: "chat", to: "/chatbot", ready: true },
  ];

  const links =
    user?.role === "admin"
      ? [...quickLinks, { label: t("dashboard.links.advisoryAdmin"), desc: t("dashboard.links.advisoryAdminDesc"), icon: "inbox", to: "/advisory", ready: true }]
      : [...quickLinks, { label: t("dashboard.links.advisoryAsk"), desc: t("dashboard.links.advisoryAskDesc"), icon: "inbox", to: "/advisory", ready: true }];

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="dashboard-page">
      <AppHeader title={t("common.appName")} />

      <main className="app-main">
        <Link to="/profile" className="status-card status-ok dashboard-profile-card">
          <span
            className={`dashboard-profile-avatar${isAdmin ? " dashboard-profile-avatar-admin" : ""}`}
            aria-hidden="true"
          >
            {avatarInitial}
          </span>
          <span className="dashboard-profile-text">
            <p className="status-title">{t(greetingKey(), { username: user?.username })}</p>
            <span className="dashboard-profile-chips">
              <span className={`chip${isAdmin ? " dashboard-chip-role-admin" : ""}`}>
                {t(isAdmin ? "dashboard.roleAdmin" : "dashboard.roleFarmer")}
              </span>
              <span className="chip dashboard-chip-lang">
                {languageName(user?.preferred_language)}
              </span>
            </span>
          </span>
        </Link>

        <div className="dashboard-highlights">
          <Link to="/weather" className="dashboard-highlight-card dashboard-highlight-weather">
            <span className="dashboard-highlight-icon" aria-hidden="true">
              <Icon name="cloudSun" size={20} />
            </span>
            <span className="dashboard-highlight-text">
              <span className="dashboard-highlight-title">{t("dashboard.highlights.weatherTitle")}</span>
              <span className="dashboard-highlight-desc">
                {riskAlert
                  ? t("dashboard.highlights.riskAlertText", {
                      disease: riskAlert.disease_name,
                      risk: riskAlert.risk_level
                        ? riskAlert.risk_level.charAt(0).toUpperCase() + riskAlert.risk_level.slice(1)
                        : "",
                    })
                  : t("dashboard.highlights.weatherDesc")}
              </span>
            </span>
          </Link>
          <Link to="/scan/history" className="dashboard-highlight-card dashboard-highlight-activity">
            <span className="dashboard-highlight-icon" aria-hidden="true">
              <Icon name="history" size={20} />
            </span>
            <span className="dashboard-highlight-text">
              <span className="dashboard-highlight-title">{t("dashboard.highlights.recentTitle")}</span>
              <span className="dashboard-highlight-desc">{t("dashboard.highlights.recentDesc")}</span>
            </span>
          </Link>
        </div>

        {todaysTasks.length > 0 && (
          <div className="dashboard-tasks-card" data-testid="dashboard-tasks-card">
            <h2 className="dashboard-section-title">{t("dashboard.tasksCardTitle")}</h2>
            <ul className="dashboard-task-list">
              {todaysTasks.map((task) => (
                <li key={task.id} className="dashboard-task-item">
                  <span className="dashboard-task-category">
                    {t(`dashboard.taskCategories.${task.category}`, { defaultValue: task.category })}
                  </span>
                  <span className="dashboard-task-instruction">{task.instruction}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <h2 className="dashboard-section-title">{t("dashboard.quickActionsTitle")}</h2>
        <div className="quick-links">
          {links.map((link) =>
            link.ready ? (
              <Link key={link.label} to={link.to} className="quick-link-card">
                <span className="quick-link-icon" aria-hidden="true">
                  <Icon name={link.icon} size={20} />
                </span>
                <span className="quick-link-text">
                  <span className="quick-link-label">{link.label}</span>
                  <span className="quick-link-desc">{link.desc}</span>
                </span>
              </Link>
            ) : (
              <div key={link.label} className="quick-link-card quick-link-disabled" title="Coming in a later phase">
                {link.label} <span className="coming-soon-badge">Coming soon</span>
              </div>
            )
          )}
        </div>

        <button className="btn-secondary" onClick={handleLogout}>
          {t("common.logOut")}
        </button>
      </main>
      <BottomNav />
    </div>
  );
}
