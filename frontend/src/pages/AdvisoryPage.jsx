import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { listAdvisoryQueries, createAdvisoryQuery, answerAdvisoryQuery } from "../api/advisory";
import AppHeader from "../components/AppHeader";
import Icon from "../components/Icon";
import BottomNav from "../components/BottomNav";

function StatusBadge({ status, t }) {
  return (
    <span className={`advisory-status-badge advisory-status-${status}`}>
      {status === "answered" ? t("advisory.statusAnswered") : t("advisory.statusPending")}
    </span>
  );
}

export default function AdvisoryPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const isAdmin = user?.role === "admin";

  const [queries, setQueries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("pending"); // admin only: "pending" | "all"

  const [question, setQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  const [drafts, setDrafts] = useState({}); // admin answer drafts, keyed by query id
  const [answering, setAnswering] = useState(null); // id currently being submitted
  const [answerError, setAnswerError] = useState("");

  const loadQueries = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listAdvisoryQueries(isAdmin && filter !== "all" ? filter : undefined);
      setQueries(data);
    } catch {
      setError(t("advisory.loadError"));
    } finally {
      setLoading(false);
    }
  }, [isAdmin, filter, t]);

  useEffect(() => {
    loadQueries();
  }, [loadQueries]);

  const handleAsk = async (e) => {
    e.preventDefault();
    const text = question.trim();
    if (!text || submitting) return;

    setSubmitting(true);
    setFormError("");
    setFormSuccess("");
    try {
      await createAdvisoryQuery(text);
      setQuestion("");
      setFormSuccess(t("advisory.sendSuccess"));
      loadQueries();
    } catch {
      setFormError(t("advisory.sendError"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAnswer = async (id) => {
    const text = (drafts[id] || "").trim();
    if (!text || answering) return;

    setAnswering(id);
    setAnswerError("");
    try {
      await answerAdvisoryQuery(id, text);
      setDrafts((prev) => ({ ...prev, [id]: "" }));
      loadQueries();
    } catch {
      setAnswerError(t("advisory.answerError"));
    } finally {
      setAnswering(null);
    }
  };

  return (
    <div className="dashboard-page">
      <AppHeader icon={<Icon name="inbox" />} title={isAdmin ? t("advisory.titleAdmin") : t("advisory.titleAsk")} />

      <main className="app-main advisory-main">
        {!isAdmin && (
          <form className="advisory-form" onSubmit={handleAsk}>
            <label htmlFor="advisory-question" className="sr-only">
              {t("advisory.questionLabel")}
            </label>
            <textarea
              id="advisory-question"
              className="advisory-textarea"
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
                {formError}
              </p>
            )}
            {formSuccess && (
              <div className="status-card status-ok">
                <p className="status-message">✅ {formSuccess}</p>
              </div>
            )}
          </form>
        )}

        {isAdmin && (
          <div className="advisory-filter-tabs">
            <button
              type="button"
              className={`advisory-toggle-btn ${filter === "pending" ? "advisory-toggle-active" : ""}`}
              onClick={() => setFilter("pending")}
            >
              {t("advisory.filterPending")}
            </button>
            <button
              type="button"
              className={`advisory-toggle-btn ${filter === "all" ? "advisory-toggle-active" : ""}`}
              onClick={() => setFilter("all")}
            >
              {t("advisory.filterAll")}
            </button>
          </div>
        )}

        {loading && <p>{t("common.loading")}</p>}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {answerError && (
          <p className="form-error" role="alert">
            {answerError}
          </p>
        )}

        {!loading && !error && queries.length === 0 && (
          <p className="status-message">
            {isAdmin ? t("advisory.noQueriesAdmin") : t("advisory.noQueriesFarmer")}
          </p>
        )}

        <ul className="advisory-list">
          {queries.map((q) => (
            <li key={q.id} className="advisory-card">
              <div className="advisory-card-top">
                {isAdmin && <span className="advisory-card-farmer">{q.farmer_username}</span>}
                <StatusBadge status={q.status} t={t} />
              </div>
              <p className="advisory-card-question">{q.question}</p>

              {q.status === "answered" && <p className="advisory-response">{q.response}</p>}

              {isAdmin && q.status === "pending" && (
                <div className="advisory-answer-form">
                  <label htmlFor={`answer-${q.id}`} className="sr-only">
                    {t("advisory.answerLabel", { name: q.farmer_username })}
                  </label>
                  <textarea
                    id={`answer-${q.id}`}
                    className="advisory-textarea"
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
