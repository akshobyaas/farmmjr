import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchTodaysTasks,
  fetchUpcomingTasks,
  fetchCompletedTasks,
  setTaskCompletion,
  fetchTrackers,
} from "../api/cropTracker";

// Task 15 (frontend) -- the Tasks page's Today/Upcoming/Completed tabs,
// consuming Task 14's three GET endpoints plus its POST/DELETE completion
// toggle. Same "fetcher per tab" shape as useAdvisoryQueries' filter tabs
// (hooks/useAdvisoryQueries.js). `completed` is trusted as-is straight from
// whichever endpoint is active -- views_tasks.py now computes it correctly
// server-side for all three (see TodaysTasksView/UpcomingTasksView's
// `completed_task_ids` context, final-review fix F4), so no client-side
// merge against a separate /completed/ request is needed any more.
const TAB_FETCHERS = {
  today: fetchTodaysTasks,
  upcoming: fetchUpcomingTasks,
  completed: fetchCompletedTasks,
};

export function useTasks(initialTab = "today") {
  const [tab, setTab] = useState(initialTab);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Fix round 1 (review finding 4) -- kept separate from `error` (load
  // failures). `error` gates whether TasksPage renders the task list at
  // all, so routing a *toggle* failure through it used to wipe an
  // already-successfully-rendered list over a transient action failure.
  // `toggleError` is purely informational and never affects what the list
  // itself renders.
  const [toggleError, setToggleError] = useState(false);

  // Mirrors the latest `tab` into a ref so an in-flight async call (see
  // the `load()` staleness guard below) can read "what tab is the farmer
  // actually looking at right now" rather than whatever `tab` its own
  // closure captured when it started. Written from an effect rather than
  // during render itself (refs shouldn't be mutated while rendering) --
  // this still updates before any awaited network call can resolve, since
  // React flushes effects synchronously after committing a render and
  // well before the event loop gets back to a pending promise's
  // continuation.
  const tabRef = useRef(tab);
  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  // Final-review fix (F2) -- which of the farmer's own trackers a
  // completion toggle applies to. Task 14's CropTaskSerializer now
  // includes each task's own `crop` id, so for a farmer with 2+ active
  // trackers this can resolve the ACTUAL matching tracker (the one whose
  // `crop` equals the task's `crop`) instead of guessing "the first
  // active tracker" -- the guess that used to make a completion risk
  // landing against the wrong tracker, and that this hook used to simply
  // refuse to use at all (the old `multiTracker` guardrail) rather than
  // get wrong. The backend's TaskCompletionToggleView independently
  // rejects (400) a tracker/task crop mismatch too, so this is belt (here)
  // and suspenders (server) rather than the only line of defense.
  const [trackers, setTrackers] = useState([]);

  useEffect(() => {
    fetchTrackers()
      .then((data) => {
        setTrackers(Array.isArray(data) ? data.filter((tr) => tr.is_active) : []);
      })
      .catch(() => setTrackers([]));
  }, []);

  // With exactly one active tracker there is no ambiguity to resolve at
  // all -- used as-is regardless of whether a given task even carries a
  // `crop` field, which keeps this working for any caller/test that
  // predates Task 14's `crop` addition. With 2+, only a task whose `crop`
  // matches one of them resolves to that tracker; no match is a silent
  // no-op, the same fail-soft convention the rest of this hook already
  // uses for "nothing sensible to toggle against".
  const resolveTrackerForTask = useCallback(
    (task) => {
      if (trackers.length === 0) return null;
      if (trackers.length === 1) return trackers[0];
      return trackers.find((tr) => tr.crop === task.crop) || null;
    },
    [trackers]
  );

  // Guards against a slower, now-stale request (e.g. the initial "today"
  // load) overwriting a newer one's result (e.g. a quick tab switch to
  // "completed" right after mount) -- whichever `load()` call started
  // last for the CURRENTLY DISPLAYED TAB is the only one allowed to
  // commit its result or touch the loading/error flags.
  //
  // Fix round 1 (review finding 1) -- `requestId` alone orders by call
  // *sequence*, not by tab identity. `toggleComplete` below awaits a
  // network call before reloading, so by the time its reload actually
  // runs, the farmer may have already switched tabs -- but that reload
  // closes over the OLD tab's `load` (and the `tab` it captured at
  // creation time), not whatever tab is current. Being issued later, it
  // used to win the sequence check and overwrite the new tab's correctly
  // -loaded data with stale data for a tab that isn't even showing
  // anymore. Comparing the tab this call was made FOR (`loadTab`, a
  // closure variable) against `tabRef.current` (the tab actually showing
  // right now) catches exactly that case, independent of call sequence.
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const loadTab = tab;
    // Final-review fix (F1) -- this tab-match check must run BEFORE the
    // shared request-id counter is touched. A toggle's internal reload
    // closes over whichever `load` (and tab) was current when the toggle
    // itself started, and can resolve well after the farmer has since
    // switched tabs. Incrementing the counter first (the old order) meant
    // that stale call would steal the next request-id slot out from under
    // a still-in-flight load for the tab that's ACTUALLY showing now --
    // that load's own `finally` block would then fail its own isCurrent()
    // check (requestId mismatch) and never flip `loading` back to false,
    // leaving the spinner stuck forever. Bailing out here, before the
    // increment, means a superseded call never touches the counter at
    // all, so it can't invalidate a request that's still legitimately in
    // flight for the current tab.
    if (loadTab !== tabRef.current) return;
    const requestId = ++requestIdRef.current;
    const isCurrent = () => loadTab === tabRef.current && requestId === requestIdRef.current;
    setLoading(true);
    setError(false);
    setToggleError(false);
    try {
      const fetcher = TAB_FETCHERS[loadTab] || fetchTodaysTasks;
      const data = await fetcher();
      const nextTasks = Array.isArray(data?.tasks) ? data.tasks : [];
      if (!isCurrent()) return; // a newer load(), or a tab switch, superseded this one
      setTasks(nextTasks);
    } catch {
      if (!isCurrent()) return;
      setError(true);
      setTasks([]);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleComplete = useCallback(
    async (task) => {
      const tracker = resolveTrackerForTask(task);
      // No active tracker at all (still loading, or the farmer has none),
      // or (2+ trackers) none of them matches this task's crop -- nothing
      // sensible to toggle against, so this is a silent no-op, same
      // fail-soft convention as the rest of this codebase's "nice-to-
      // have, not critical path" actions (useDashboardData,
      // useActiveTrackerForCrop).
      if (tracker == null) return;
      const done = !task.completed;
      setToggleError(false);
      try {
        await setTaskCompletion(task.id, tracker.id, done);
        await load();
      } catch {
        setToggleError(true);
      }
    },
    [resolveTrackerForTask, load]
  );

  return { tasks, tab, setTab, toggleComplete, loading, error, toggleError };
}
