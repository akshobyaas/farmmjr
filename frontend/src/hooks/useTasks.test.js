import { renderHook, act, waitFor } from "@testing-library/react";
import { vi, describe, test, expect, beforeEach } from "vitest";
import { useTasks } from "./useTasks";
import * as cropTrackerApi from "../api/cropTracker";

vi.mock("../api/cropTracker");

// One active tracker, matching the common single-crop farmer case this
// hook is built around (see useTasks.js's own comment on the
// multi-tracker ambiguity the backend's task endpoints leave unresolved).
const ACTIVE_TRACKER = { id: 7, crop: 1, is_active: true };

describe("useTasks", () => {
  beforeEach(() => {
    // resetAllMocks (not clearAllMocks) -- a couple of tests below queue
    // a `mockResolvedValueOnce` that this hook's tab-mismatch guard never
    // actually consumes (the call it was queued for correctly bails out
    // before reaching the fetcher at all). clearAllMocks only resets call
    // counts, not that leftover once-queue, so an unconsumed value would
    // otherwise silently leak into and corrupt the NEXT test's first call.
    vi.resetAllMocks();
    cropTrackerApi.fetchTrackers.mockResolvedValue([ACTIVE_TRACKER]);
    cropTrackerApi.fetchCompletedTasks.mockResolvedValue({ tasks: [] });
  });

  test("defaults to the 'today' tab and fetches today's tasks", async () => {
    cropTrackerApi.fetchTodaysTasks.mockResolvedValue({
      tasks: [{ id: 1, category: "irrigation", instruction: "Irrigate.", completed: false }],
    });

    const { result } = renderHook(() => useTasks());

    expect(result.current.tab).toBe("today");
    await waitFor(() => expect(cropTrackerApi.fetchTodaysTasks).toHaveBeenCalled());
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    expect(result.current.tasks[0].instruction).toBe("Irrigate.");
    expect(cropTrackerApi.fetchUpcomingTasks).not.toHaveBeenCalled();
    // Final-review fix (F4) -- TodaysTasksView now computes `completed`
    // correctly itself (see views_tasks.py), so this hook no longer needs
    // an extra /completed/ request to cross-reference for the "today" tab.
    expect(cropTrackerApi.fetchCompletedTasks).not.toHaveBeenCalled();
  });

  test("switching to the 'upcoming' tab re-fetches from the upcoming endpoint", async () => {
    cropTrackerApi.fetchTodaysTasks.mockResolvedValue({ tasks: [] });
    cropTrackerApi.fetchUpcomingTasks.mockResolvedValue({
      tasks: [{ id: 2, category: "fertilizer", instruction: "Apply fertilizer.", completed: false }],
    });

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(cropTrackerApi.fetchTodaysTasks).toHaveBeenCalled());

    act(() => result.current.setTab("upcoming"));

    expect(result.current.tab).toBe("upcoming");
    await waitFor(() => expect(cropTrackerApi.fetchUpcomingTasks).toHaveBeenCalled());
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    expect(result.current.tasks[0].instruction).toBe("Apply fertilizer.");
  });

  test("switching to the 'completed' tab re-fetches from the completed endpoint", async () => {
    cropTrackerApi.fetchTodaysTasks.mockResolvedValue({ tasks: [] });
    cropTrackerApi.fetchCompletedTasks.mockResolvedValue({
      tasks: [{ id: 3, category: "pruning", instruction: "Prune the shoots.", completed: true }],
    });

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(cropTrackerApi.fetchTodaysTasks).toHaveBeenCalled());

    act(() => result.current.setTab("completed"));

    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    expect(result.current.tasks[0].completed).toBe(true);
  });

  // Final-review fix (F4) -- TodaysTasksView/UpcomingTasksView now pass
  // per-tracker completion context server-side (views_tasks.py), so
  // `completed` for a genuinely-completed task comes back `true` straight
  // from the "today"/"upcoming" response itself. This hook must trust it
  // as-is and no longer make an extra /completed/ request to cross-
  // reference and override it (the old mergeCompletedOverride workaround).
  test("trusts `completed` directly from the today/upcoming response, with no extra /completed/ request", async () => {
    cropTrackerApi.fetchTodaysTasks.mockResolvedValue({
      tasks: [{ id: 1, category: "irrigation", instruction: "Irrigate.", completed: true }],
    });

    const { result } = renderHook(() => useTasks());

    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    expect(result.current.tasks[0].completed).toBe(true);
    expect(cropTrackerApi.fetchCompletedTasks).not.toHaveBeenCalled();
  });

  test("toggleComplete posts a completion for the farmer's active tracker, then reloads", async () => {
    cropTrackerApi.fetchTodaysTasks.mockResolvedValue({
      tasks: [{ id: 1, category: "irrigation", instruction: "Irrigate.", completed: false }],
    });
    cropTrackerApi.setTaskCompletion.mockResolvedValue({ completed: true });

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));

    await act(async () => {
      await result.current.toggleComplete(result.current.tasks[0]);
    });

    expect(cropTrackerApi.setTaskCompletion).toHaveBeenCalledWith(1, ACTIVE_TRACKER.id, true);
    // Reloaded after the toggle -- called at least twice (initial + after toggle).
    expect(cropTrackerApi.fetchTodaysTasks.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  test("toggleComplete on an already-completed task sends done=false (DELETE path)", async () => {
    cropTrackerApi.fetchTodaysTasks.mockResolvedValue({ tasks: [] });
    cropTrackerApi.fetchCompletedTasks.mockResolvedValue({
      tasks: [{ id: 3, category: "pruning", instruction: "Prune.", completed: true }],
    });
    cropTrackerApi.setTaskCompletion.mockResolvedValue({ completed: false });

    const { result } = renderHook(() => useTasks());
    act(() => result.current.setTab("completed"));
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));

    await act(async () => {
      await result.current.toggleComplete(result.current.tasks[0]);
    });

    expect(cropTrackerApi.setTaskCompletion).toHaveBeenCalledWith(3, ACTIVE_TRACKER.id, false);
  });

  // Fix round 1 (review finding 1) -- `toggleComplete`'s internal reload
  // used to close over whichever `load` function existed for the tab that
  // was active when the toggle was *started*, not the tab the farmer is
  // actually looking at once the toggle's network request resolves. Since
  // the shared request-id counter only orders by call sequence, that stale
  // reload (issued later, by sequence, than the tab-switch's own fetch)
  // used to win the race and silently overwrite the correctly-displayed
  // new-tab data with stale old-tab data. This reproduces that exact
  // sequence: toggle a "today" task (POST left pending), switch to
  // "upcoming" before it resolves, then let the toggle resolve.
  test("a toggle's reload does not clobber the display after switching tabs while the toggle request is in flight", async () => {
    const todayTask = { id: 1, category: "irrigation", instruction: "Irrigate.", completed: false };
    const upcomingTask = { id: 2, category: "fertilizer", instruction: "Apply fertilizer.", completed: false };

    cropTrackerApi.fetchTodaysTasks
      .mockResolvedValueOnce({ tasks: [todayTask] }) // initial "today" load
      .mockResolvedValueOnce({ tasks: [todayTask] }); // the toggle's stale reload, issued after the tab moved on
    cropTrackerApi.fetchUpcomingTasks.mockResolvedValue({ tasks: [upcomingTask] });

    let resolveToggle;
    cropTrackerApi.setTaskCompletion.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveToggle = resolve;
        })
    );

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toEqual([todayTask]));

    // Start the toggle on the "today" task -- its POST never resolves yet.
    let togglePromise;
    act(() => {
      togglePromise = result.current.toggleComplete(todayTask);
    });

    // Switch tabs before the toggle's request resolves.
    act(() => result.current.setTab("upcoming"));
    await waitFor(() => expect(result.current.tasks).toEqual([upcomingTask]));
    expect(result.current.tab).toBe("upcoming");

    // Now let the toggle's POST resolve -- it triggers its own internal
    // reload. That reload must not be allowed to overwrite the
    // correctly-displayed "upcoming" data with stale "today" data.
    await act(async () => {
      resolveToggle({ completed: true });
      await togglePromise;
    });

    expect(result.current.tab).toBe("upcoming");
    expect(result.current.tasks).toEqual([upcomingTask]);
  });

  // Final-review fix (F1) -- `load()` used to bump the shared
  // `requestIdRef` counter BEFORE checking whether the call it's running
  // for still matches the currently-selected tab. A toggle's internal
  // reload (closed over whichever tab was active when the toggle started)
  // can resolve well after the farmer has already switched tabs; once it
  // does, that reorder meant it would steal the next request-id slot out
  // from under a still-in-flight load for the tab that's ACTUALLY showing
  // now, before bailing out on the tab mismatch. The in-flight load's own
  // `finally` block then fails its own isCurrent() check too (its request
  // id no longer matches) and never flips `loading` back to `false` --
  // the spinner sticks forever even once that load's GET resolves. This
  // reproduces that exact sequence with the "upcoming" tab's own fetch
  // deliberately left pending until after the stale "today" reload runs.
  test("a stale tab's reload does not leave a still-in-flight load for the current tab stuck in `loading`", async () => {
    const todayTask = { id: 1, category: "irrigation", instruction: "Irrigate.", completed: false };
    const upcomingTask = { id: 2, category: "fertilizer", instruction: "Apply fertilizer.", completed: false };

    cropTrackerApi.fetchTodaysTasks
      .mockResolvedValueOnce({ tasks: [todayTask] }) // initial "today" load
      .mockResolvedValueOnce({ tasks: [todayTask] }); // the toggle's stale reload, issued after the tab moved on

    let resolveUpcoming;
    cropTrackerApi.fetchUpcomingTasks.mockReturnValue(
      new Promise((resolve) => {
        resolveUpcoming = resolve;
      })
    );

    let resolveToggle;
    cropTrackerApi.setTaskCompletion.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveToggle = resolve;
        })
    );

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toEqual([todayTask]));

    // Start the toggle on the "today" task -- its POST never resolves yet.
    let togglePromise;
    act(() => {
      togglePromise = result.current.toggleComplete(todayTask);
    });

    // Switch tabs before the toggle's request resolves. "upcoming"'s own
    // load() starts here, but its GET is left pending (controlled above).
    act(() => result.current.setTab("upcoming"));
    expect(result.current.loading).toBe(true);

    // Now let the toggle's POST resolve -- it triggers its own internal,
    // now-stale "today" reload.
    await act(async () => {
      resolveToggle({ completed: true });
      await togglePromise;
    });

    // The "upcoming" tab's own GET finally resolves.
    await act(async () => {
      resolveUpcoming({ tasks: [upcomingTask] });
    });

    // Before the fix: `loading` stays stuck `true` forever, because the
    // stale "today" reload already stole the request-id slot the
    // legitimate "upcoming" load needed to pass its own isCurrent() check
    // in `finally`.
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tasks).toEqual([upcomingTask]);
  });

  // Final-review fix (F2) -- Task 14's CropTaskSerializer now includes
  // each task's own `crop` id, so a farmer with 2+ active trackers no
  // longer needs the toggle disabled outright: this hook can resolve the
  // ACTUAL matching tracker (the one whose `crop` equals the task's
  // `crop`) instead of guessing "the first active tracker" the way it
  // used to. The backend's own crop/tracker cross-check (views_tasks.py)
  // is the belt-and-suspenders backstop if this ever resolved wrong.
  test("resolves the matching tracker by crop and posts against it when the farmer has 2+ active trackers", async () => {
    cropTrackerApi.fetchTrackers.mockResolvedValue([
      { id: 7, crop: 1, is_active: true },
      { id: 8, crop: 2, is_active: true },
    ]);
    cropTrackerApi.fetchTodaysTasks.mockResolvedValue({
      tasks: [
        { id: 1, crop: 1, category: "irrigation", instruction: "Irrigate rice.", completed: false },
        { id: 2, crop: 2, category: "spraying", instruction: "Spray arecanut.", completed: false },
      ],
    });
    cropTrackerApi.setTaskCompletion.mockResolvedValue({ completed: true });

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(2));

    await act(async () => {
      await result.current.toggleComplete(result.current.tasks[1]); // crop 2's task
    });

    // Posted against tracker 8 (crop 2), NOT tracker 7 (crop 1) -- the old
    // "first active tracker" guess would have wrongly used 7 here.
    expect(cropTrackerApi.setTaskCompletion).toHaveBeenCalledWith(2, 8, true);
  });

  test("silently no-ops when a 2+-tracker farmer's task matches none of their trackers' crops", async () => {
    cropTrackerApi.fetchTrackers.mockResolvedValue([
      { id: 7, crop: 1, is_active: true },
      { id: 8, crop: 2, is_active: true },
    ]);
    cropTrackerApi.fetchTodaysTasks.mockResolvedValue({
      tasks: [{ id: 9, crop: 99, category: "irrigation", instruction: "Orphaned task.", completed: false }],
    });

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));

    await act(async () => {
      await result.current.toggleComplete(result.current.tasks[0]);
    });

    expect(cropTrackerApi.setTaskCompletion).not.toHaveBeenCalled();
  });

  test("with exactly one active tracker, toggling still works even for a task with no `crop` field (unchanged behavior)", async () => {
    cropTrackerApi.fetchTodaysTasks.mockResolvedValue({
      tasks: [{ id: 1, category: "irrigation", instruction: "Irrigate.", completed: false }],
    });
    cropTrackerApi.setTaskCompletion.mockResolvedValue({ completed: true });

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));

    await act(async () => {
      await result.current.toggleComplete(result.current.tasks[0]);
    });

    expect(cropTrackerApi.setTaskCompletion).toHaveBeenCalledWith(1, ACTIVE_TRACKER.id, true);
  });

  // Fix round 1 (review finding 4) -- a toggle failure must not be
  // reported through the same `error` flag a load failure uses, since
  // TasksPage hides the whole task list whenever `error` is true.
  test("a toggleComplete failure surfaces via `toggleError`, not `error`, and leaves `tasks` alone", async () => {
    cropTrackerApi.fetchTodaysTasks.mockResolvedValue({
      tasks: [{ id: 1, category: "irrigation", instruction: "Irrigate.", completed: false }],
    });
    cropTrackerApi.setTaskCompletion.mockRejectedValue(new Error("Network Error"));

    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));

    await act(async () => {
      await result.current.toggleComplete(result.current.tasks[0]);
    });

    expect(result.current.toggleError).toBe(true);
    expect(result.current.error).toBe(false);
    expect(result.current.tasks).toHaveLength(1);
  });

  test("surfaces a fetch failure via `error` without throwing", async () => {
    cropTrackerApi.fetchTodaysTasks.mockRejectedValue(new Error("Network Error"));

    const { result } = renderHook(() => useTasks());

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.tasks).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  test("loading is true while the fetch is in flight and false once it resolves", async () => {
    let resolveFetch;
    cropTrackerApi.fetchTodaysTasks.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    const { result } = renderHook(() => useTasks());
    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveFetch({ tasks: [] });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
  });
});
