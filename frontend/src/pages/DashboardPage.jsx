import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import AppHeader from "../components/AppHeader";
import Icon from "../components/Icon";
import BottomNav from "../components/BottomNav";

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const quickLinks = [
    { label: t("dashboard.links.profile"), to: "/profile", ready: true },
    { label: t("dashboard.links.crops"), to: "/crops", ready: true },
    { label: t("dashboard.links.scan"), to: "/scan", ready: true },
    { label: t("dashboard.links.scanHistory"), to: "/scan/history", ready: true },
    { label: t("dashboard.links.weather"), to: "/weather", ready: true },
    { label: t("dashboard.links.videos"), to: "/videos", ready: true },
    { label: t("dashboard.links.locator"), to: "/locator", ready: true },
    { label: t("dashboard.links.chatbot"), to: "/chatbot", ready: true },
  ];

  const links =
    user?.role === "admin"
      ? [...quickLinks, { label: t("dashboard.links.advisoryAdmin"), to: "/advisory", ready: true }]
      : [...quickLinks, { label: t("dashboard.links.advisoryAsk"), to: "/advisory", ready: true }];

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="dashboard-page">
      <AppHeader icon={<Icon name="leaf" />} title={t("common.appName")} />

      <main className="app-main">
        <div className="status-card status-ok">
          <p className="status-title">{t("dashboard.welcome", { username: user?.username })}</p>
          <p className="status-message">
            {t("dashboard.roleLanguage", { role: user?.role, language: user?.preferred_language })}
          </p>
        </div>

        <div className="quick-links">
          {links.map((link) =>
            link.ready ? (
              <Link key={link.label} to={link.to} className="quick-link-card">
                {link.label}
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
        <p className="phase-note">{t("dashboard.phaseNote")}</p>
      </main>
      <BottomNav />
    </div>
  );
}
