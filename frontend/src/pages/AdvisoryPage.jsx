import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { useAdvisoryQueries } from "../hooks/useAdvisoryQueries";
import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";
import styles from "./AdvisoryPage.module.css";

function StatusBadge({ status, t }) {
  return (
    <span className={`${styles["advisory-status-badge"]} ${styles[`advisory-status-${status}`]}`}>
      {status === "answered" ? t("advisory.statusAnswered") : t("advisory.statusPending")}
    </span>
  );
}

export default function AdvisoryPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();
  const isAdmin = user?.role === "admin";

  const {
    queries,
    loading,
    error,
    filter,
    setFilter,
    question,
    setQuestion,
    submitting,
    formError,
    formSuccess,
    handleAsk,
    drafts,
    setDrafts,
    answering,
    answerError,
    handleAnswer,
  } = useAdvisoryQueries({
    isAdmin,
    initialPrefill: location.state?.prefill,
    initialScanId: location.state?.scanId,
  });

  return (
    <div className="dashboard-page">
      <AppHeader title={isAdmin ? t("advisory.titleAdmin") : t("advisory.titleAsk")} />

      <main className={`app-main ${styles["advisory-main"]}`}>
        {!isAdmin && (
          <form className={styles["advisory-form"]} onSubmit={handleAsk}>
            <label htmlFor="advisory-question" className="sr-only">
              {t("advisory.questionLabel")}
            </label>
            <textarea
              id="advisory-question"
              className={styles["advisory-textarea"]}
              placeholder={t("advisory.questionPlaceholder")}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={submitting}
              rows={3}
            />
            <button type="submit" className="btn-primary" disabled={submitting || !question.trim()}>
              {submitting ? t("advisory.sending") : t("advisory.askButton")}
            </button>
            {formError && (
              <p className="form-error" role="alert">
                {t("advisory.sendError")}
              </p>
            )}
            {formSuccess && (
              <div className="status-card status-ok">
                <p className="status-message">✅ {t("advisory.sendSuccess")}</p>
              </div>
            )}
          </form>
        )}

        {isAdmin && (
          <div className={styles["advisory-filter-tabs"]}>
            <button
              type="button"
              className={`${styles["advisory-toggle-btn"]} ${filter === "pending" ? styles["advisory-toggle-active"] : ""}`}
              onClick={() => setFilter("pending")}
            >
              {t("advisory.filterPending")}
            </button>
            <button
              type="button"
              className={`${styles["advisory-toggle-btn"]} ${filter === "all" ? styles["advisory-toggle-active"] : ""}`}
              onClick={() => setFilter("all")}
            >
              {t("advisory.filterAll")}
            </button>
          </div>
        )}

        {loading && <p>{t("common.loading")}</p>}
        {error && (
          <p className="form-error" role="alert">
            {t("advisory.loadError")}
          </p>
        )}
        {answerError && (
          <p className="form-error" role="alert">
            {t("advisory.answerError")}
          </p>
        )}

        {!loading && !error && queries.length === 0 && (
          <p className="status-message">
            {isAdmin ? t("advisory.noQueriesAdmin") : t("advisory.noQueriesFarmer")}
          </p>
        )}

        <ul className={styles["advisory-list"]}>
          {queries.map((q) => (
            <li key={q.id} className={styles["advisory-card"]}>
              <div className={styles["advisory-card-top"]}>
                {isAdmin && <span className={styles["advisory-card-farmer"]}>{q.farmer_username}</span>}
                <StatusBadge status={q.status} t={t} />
              </div>
              <p className={styles["advisory-card-question"]}>{q.question}</p>

              {q.status === "answered" && <p className={styles["advisory-response"]}>{q.response}</p>}

              {isAdmin && q.status === "pending" && (
                <div className={styles["advisory-answer-form"]}>
                  <label htmlFor={`answer-${q.id}`} className="sr-only">
                    {t("advisory.answerLabel", { name: q.farmer_username })}
                  </label>
                  <textarea
                    id={`answer-${q.id}`}
                    className={styles["advisory-textarea"]}
                    placeholder={t("advisory.answerPlaceholder")}
                    value={drafts[q.id] || ""}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    disabled={answering === q.id}
                    rows={2}
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => handleAnswer(q.id)}
                    disabled={answering === q.id || !(drafts[q.id] || "").trim()}
                  >
                    {answering === q.id ? t("advisory.sending") : t("advisory.sendAnswerButton")}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>

        <p className="auth-switch">
          <Link to="/dashboard">{t("common.backToDashboard")}</Link>
        </p>
      </main>
      <BottomNav />
    </div>
  );
}
