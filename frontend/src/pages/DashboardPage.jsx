import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import AppHeader from "../components/AppHeader";
import Icon from "../components/Icon";
import BottomNav from "../components/BottomNav";
import { languageName } from "../i18n/languages";
import { useDashboardData } from "../hooks/useDashboardData";
import styles from "./DashboardPage.module.css";

// Phase 22 -- "Good morning/afternoon/evening" instead of a flat "Welcome",
// based on the viewer's own local clock (new Date() reads it in whatever
// timezone the device is set to).
function greetingKey() {
  const hour = new Date().getHours();
  if (hour < 12) return "dashboard.greetingMorning";
  if (hour < 17) return "dashboard.greetingAfternoon";
  return "dashboard.greetingEvening";
}

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isAdmin = user?.role === "admin";
  // Prefer the editable display name (first_name) over the fixed login
  // username wherever the dashboard represents the user -- the username
  // is just an immutable login id (see ProfileSerializer/LanguageSwitcher
  // precedent), not meant to be shown off as someone's name. Most seeded
  // and early accounts have no first_name set, so this falls back to the
  // username exactly as before.
  const displayName = user?.first_name?.trim() || user?.username || "";
  const avatarInitial = displayName.charAt(0)?.toUpperCase() || "?";

  const { riskAlert, todaysTasks } = useDashboardData();

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
        <Link to="/profile" className={`status-card status-ok ${styles["dashboard-profile-card"]}`}>
          <span
            className={`${styles["dashboard-profile-avatar"]}${isAdmin ? ` ${styles["dashboard-profile-avatar-admin"]}` : ""}`}
            aria-hidden="true"
            data-testid="dashboard-profile-avatar"
          >
            {avatarInitial}
          </span>
          <span className={styles["dashboard-profile-text"]}>
            <p className="status-title">{t(greetingKey(), { username: displayName })}</p>
            <span className={styles["dashboard-profile-chips"]}>
              <span className={`chip${isAdmin ? ` ${styles["dashboard-chip-role-admin"]}` : ""}`}>
                {t(isAdmin ? "dashboard.roleAdmin" : "dashboard.roleFarmer")}
              </span>
              <span className={`chip ${styles["dashboard-chip-lang"]}`}>
                {languageName(user?.preferred_language)}
              </span>
            </span>
          </span>
        </Link>

        <div className={styles["dashboard-highlights"]}>
          <Link to="/weather" className={`${styles["dashboard-highlight-card"]} ${styles["dashboard-highlight-weather"]}`}>
            <span className={styles["dashboard-highlight-icon"]} aria-hidden="true">
              <Icon name="cloudSun" size={20} />
            </span>
            <span className={styles["dashboard-highlight-text"]}>
              <span className={styles["dashboard-highlight-title"]}>{t("dashboard.highlights.weatherTitle")}</span>
              <span className={styles["dashboard-highlight-desc"]}>
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
            <span className="list-row-chevron" aria-hidden="true">
              <Icon name="chevronRight" size={16} />
            </span>
          </Link>
          <Link to="/scan/history" className={`${styles["dashboard-highlight-card"]} ${styles["dashboard-highlight-activity"]}`}>
            <span className={styles["dashboard-highlight-icon"]} aria-hidden="true">
              <Icon name="history" size={20} />
            </span>
            <span className={styles["dashboard-highlight-text"]}>
              <span className={styles["dashboard-highlight-title"]}>{t("dashboard.highlights.recentTitle")}</span>
              <span className={styles["dashboard-highlight-desc"]}>{t("dashboard.highlights.recentDesc")}</span>
            </span>
            <span className="list-row-chevron" aria-hidden="true">
              <Icon name="chevronRight" size={16} />
            </span>
          </Link>
        </div>

        {todaysTasks.length > 0 && (
          <div className={styles["dashboard-tasks-card"]} data-testid="dashboard-tasks-card">
            <h2 className={styles["dashboard-section-title"]}>{t("dashboard.tasksCardTitle")}</h2>
            <ul className={styles["dashboard-task-list"]}>
              {todaysTasks.map((task) => (
                <li key={task.id} className={styles["dashboard-task-item"]}>
                  <span className={styles["dashboard-task-category"]}>
                    {t(`dashboard.taskCategories.${task.category}`, { defaultValue: task.category })}
                  </span>
                  <span className={styles["dashboard-task-instruction"]}>{task.instruction}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <h2 className={styles["dashboard-section-title"]}>{t("dashboard.quickActionsTitle")}</h2>
        <div className={styles["quick-links"]}>
          {links.map((link) =>
            link.ready ? (
              <Link key={link.label} to={link.to} className={styles["quick-link-card"]}>
                <span className={styles["quick-link-icon"]} aria-hidden="true">
                  <Icon name={link.icon} size={20} />
                </span>
                <span className={styles["quick-link-text"]}>
                  <span className={styles["quick-link-label"]}>{link.label}</span>
                  <span className={styles["quick-link-desc"]}>{link.desc}</span>
                </span>
                <span className="list-row-chevron" aria-hidden="true">
                  <Icon name="chevronRight" size={18} />
                </span>
              </Link>
            ) : (
              <div
                key={link.label}
                className={`${styles["quick-link-card"]} ${styles["quick-link-disabled"]}`}
                title="Coming in a later phase"
              >
                {link.label} <span className={styles["coming-soon-badge"]}>Coming soon</span>
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
