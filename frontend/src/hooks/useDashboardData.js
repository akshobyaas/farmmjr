import { useEffect, useState } from "react";
import { fetchRiskAlerts, fetchTodaysTasks } from "../api/cropTracker";

// Extracted verbatim from DashboardPage.jsx's risk-alert/tasks state,
// constants and effects (lines 21-99 of the pre-refactor file), as part of
// the frontend structure cleanup (Sub-project 1). See
// FRONTEND_REFACTOR_IMPLEMENTATION_PLAN.md Task 4.
//
// greetingKey() is NOT moved here -- it is pure presentation (time-of-day
// text), not data-fetching, so it stays in the page per the plan.

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

export function useDashboardData() {
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

  return { riskAlert, todaysTasks };
}
