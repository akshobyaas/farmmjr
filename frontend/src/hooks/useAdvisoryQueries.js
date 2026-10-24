import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { listAdvisoryQueries, createAdvisoryQuery, answerAdvisoryQuery } from "../api/advisory";

// Extracted verbatim from AdvisoryPage.jsx's state/effect/handlers, as part
// of the frontend structure cleanup (Sub-project 1). See
// FRONTEND_REFACTOR_IMPLEMENTATION_PLAN.md Task 5. StatusBadge stays in
// the page -- it's a presentational sub-component, not page logic.
//
// `initialPrefill`/`initialScanId` replace the page's own
// `location.state?.prefill` / `location.state?.scanId` reads -- the page
// still owns useLocation(); this hook just takes the two values it needs.
export function useAdvisoryQueries({ isAdmin, initialPrefill, initialScanId }) {
  const { t } = useTranslation();

  const [queries, setQueries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState("pending"); // admin only: "pending" | "all"

  // A low-confidence scan result (LowConfidenceNudge.jsx) links here with
  // `state: { prefill, scanId }` so the farmer doesn't have to re-describe
  // what the app already knows -- lazy initializers so these only ever
  // read the location state this page was first navigated here with, not
  // on every render.
  const [question, setQuestion] = useState(() => initialPrefill || "");
  // Attached to only the next submitted question, then cleared -- a
  // follow-up question typed in later during the same visit shouldn't
  // keep claiming to be about this scan. Sending it is what makes the
  // backend notify the admin/expert (AdvisoryQuery.scan -- see
  // advisory/utils.py's should_notify_admins).
  const [pendingScanId, setPendingScanId] = useState(() => initialScanId ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(false);
  const [formSuccess, setFormSuccess] = useState(false);

  const [drafts, setDrafts] = useState({}); // admin answer drafts, keyed by query id
  const [answering, setAnswering] = useState(null); // id currently being submitted
  const [answerError, setAnswerError] = useState(false);

  const loadQueries = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listAdvisoryQueries(isAdmin && filter !== "all" ? filter : undefined);
      setQueries(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, filter, t]);

  useEffect(() => {
    loadQueries();
  }, [loadQueries]);

  const handleAsk = async (e) => {
    e.preventDefault();
    const text = question.trim();
    if (!text || submitting) return;

    setSubmitting(true);
    setFormError(false);
    setFormSuccess(false);
    try {
      await createAdvisoryQuery(text, pendingScanId);
      setQuestion("");
      setPendingScanId(null);
      setFormSuccess(true);
      loadQueries();
    } catch {
      setFormError(true);
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
      setAnswerError(true);
    } finally {
      setAnswering(null);
    }
  };

  return {
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
  };
}
