import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useProfileForm } from "../hooks/useProfileForm";
import { useDeleteAccountForm } from "../hooks/useDeleteAccountForm";
import { useAuth } from "../context/AuthContext";
import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";
import PageSkeleton from "../components/PageSkeleton";
import Icon from "../components/Icon";
import styles from "./ProfilePage.module.css";

// Grouped-settings-list redesign: each editable field is still a real
// <label>/<input> pair for accessibility (ProfilePage.test.jsx finds them
// by accessible label, same as before), just laid out as an icon-prefixed
// row inside one rounded card with hairline dividers, instead of five
// separate boxed fields with gaps between them.
const FIELD_ROWS = [
  { id: "username", icon: "user", nameKey: "username", editable: false, type: "text" },
  { id: "first_name", icon: "user", nameKey: "firstName", editable: true, type: "text" },
  { id: "last_name", icon: "user", nameKey: "lastName", editable: true, type: "text" },
  { id: "phone_number", icon: "call", nameKey: "phoneNumber", editable: true, type: "tel" },
  { id: "home_location", icon: "pin", nameKey: "homeLocation", editable: true, type: "text" },
  {
    id: "units_area", icon: "landscape", nameKey: "areaUnit", editable: true, type: "select",
    options: ["acre", "hectare"],
  },
  {
    id: "units_weight", icon: "leaf", nameKey: "weightUnit", editable: true, type: "select",
    options: ["kg", "tonne"],
  },
];

export default function ProfilePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { form, error, success, submitting, isDirty, handleChange, handleSubmit } = useProfileForm();
  const {
    confirming, startConfirming, cancelConfirming,
    password, setPassword, error: deleteError, submitting: deleting, handleDelete,
  } = useDeleteAccountForm();

  // Same "prefer the editable display name over the login username"
  // precedent as DashboardPage's greeting/avatar.
  const displayName = form?.first_name?.trim() || form?.username || "";
  const avatarInitial = displayName.charAt(0)?.toUpperCase() || "?";

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  // Log Out is always available from this page -- it's not gated behind
  // whether the profile loaded or has unsaved changes, so it renders before
  // that loading-screen early return, not after it.
  const logoutButton = (
    <button type="button" className="btn-secondary" onClick={handleLogout}>
      {t("common.logOut")}
    </button>
  );

  if (!form && !error) {
    return (
      <div className="dashboard-page">
        <AppHeader title={t("profile.title")} />
        <main className="app-main">
          <PageSkeleton label={t("common.loading")} inline />
          {logoutButton}
        </main>
        <BottomNav />
      </div>
    );
  }

  // Phase 21 -- Profile used to be the one protected page still styled like
  // a logged-out auth screen (centered card, no header, no nav): it now
  // shares the same header + bottom-nav shell as every other logged-in
  // page, for a consistent experience.
  return (
    <div className="dashboard-page">
      <AppHeader title={t("profile.title")} />

      <main className="app-main">
        {form && (
          <div className={styles["profile-summary-card"]}>
            <span className={styles["profile-summary-avatar"]} aria-hidden="true">{avatarInitial}</span>
            <span className={styles["profile-summary-text"]}>
              <span className={styles["profile-summary-name"]}>{displayName}</span>
              <span className={styles["profile-summary-sub"]}>{form.email}</span>
            </span>
          </div>
        )}

        <div className={`status-card ${styles["profile-card"]}`}>
          {form && (
            <form onSubmit={handleSubmit} noValidate>
              <div className={styles["profile-field-group"]}>
                {FIELD_ROWS.map((field) => (
                  <div className={styles["profile-field-row"]} key={field.id}>
                    <span className={styles["profile-field-icon"]} aria-hidden="true">
                      <Icon name={field.icon} size={20} />
                    </span>
                    <span className={styles["profile-field-content"]}>
                      <label className={styles["profile-field-label"]} htmlFor={field.id}>
                        {t(`profile.${field.nameKey}`)}
                      </label>
                      {field.type === "select" ? (
                        <select
                          id={field.id}
                          name={field.id}
                          className={styles["profile-field-input"]}
                          value={form[field.id]}
                          onChange={handleChange}
                        >
                          {field.options.map((option) => (
                            <option key={option} value={option}>
                              {t(`profile.units.${option}`)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          id={field.id}
                          name={field.id}
                          type={field.type}
                          className={styles["profile-field-input"]}
                          value={form[field.id]}
                          onChange={field.editable ? handleChange : undefined}
                          disabled={!field.editable}
                          readOnly={!field.editable}
                        />
                      )}
                    </span>
                  </div>
                ))}
              </div>

              <p className="form-label" style={{ marginTop: 20, color: "var(--color-text-secondary)" }}>
                {t("profile.emailNote", { email: form.email })}
              </p>

              {error && <p className="form-error" role="alert">{error}</p>}
              {success && (
                <div className="status-card status-ok" style={{ marginTop: 16 }}>
                  <p className="status-message">✅ Profile updated successfully.</p>
                </div>
              )}

              {isDirty && (
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? t("common.saving") : t("common.save")}
                </button>
              )}
            </form>
          )}
          {error && !form && <p className="form-error" role="alert">{error}</p>}

          {form && (
            <div className="danger-zone">
              <p className="danger-zone-text">{t("profile.deleteAccountWarning")}</p>
              {confirming ? (
                <form onSubmit={handleDelete} noValidate>
                  <div className="field-box">
                    <label className="field-box-label" htmlFor="delete-confirm-password">
                      {t("profile.confirmPassword")}
                    </label>
                    <input
                      id="delete-confirm-password"
                      type="password"
                      className="field-box-input"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                    />
                  </div>
                  {deleteError && <p className="form-error" role="alert">{deleteError}</p>}
                  <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                    <button type="submit" className="btn-danger" disabled={deleting}>
                      {deleting ? t("profile.deleting") : t("profile.deleteMyAccount")}
                    </button>
                    <button type="button" className="btn-secondary" onClick={cancelConfirming}>
                      {t("profile.cancel")}
                    </button>
                  </div>
                </form>
              ) : (
                <button type="button" className="btn-danger" onClick={startConfirming}>
                  {t("profile.deleteAccount")}
                </button>
              )}
            </div>
          )}
        </div>
        {logoutButton}
      </main>
      <BottomNav />
    </div>
  );
}
