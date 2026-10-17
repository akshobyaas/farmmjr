import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import AppHeader from "../components/AppHeader";
import Icon from "../components/Icon";
import BottomNav from "../components/BottomNav";
import { languageName } from "../i18n/languages";

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
  const avatarInitial = user?.username?.charAt(0)?.toUpperCase() || "?";

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
              <span className="dashboard-highlight-desc">{t("dashboard.highlights.weatherDesc")}</span>
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
