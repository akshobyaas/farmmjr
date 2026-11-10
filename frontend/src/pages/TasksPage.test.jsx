import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import TasksPage from "./TasksPage";
import * as cropTrackerApi from "../api/cropTracker";

vi.mock("../api/cropTracker");

const ACTIVE_TRACKER = { id: 7, crop: 1, is_active: true };

beforeEach(() => {
  vi.clearAllMocks();
  cropTrackerApi.fetchTrackers.mockResolvedValue([ACTIVE_TRACKER]);
  cropTrackerApi.fetchCompletedTasks.mockResolvedValue({ tasks: [] });
  cropTrackerApi.fetchTodaysTasks.mockResolvedValue({ tasks: [] });
  cropTrackerApi.fetchUpcomingTasks.mockResolvedValue({ tasks: [] });
});

function renderPage() {
  return render(
    <MemoryRouter>
      <TasksPage />
    </MemoryRouter>
  );
}

describe("TasksPage", () => {
  it("renders the three Today/Upcoming/Completed tabs", async () => {
    renderPage();
    await waitFor(() => expect(cropTrackerApi.fetchTodaysTasks).toHaveBeenCalled());

    expect(screen.getByRole("button", { name: /today/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /upcoming/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /completed/i })).toBeInTheDocument();
  });

  it("loads today's tasks by default", async () => {
    cropTrackerApi.fetchTodaysTasks.mockResolvedValue({
      tasks: [{ id: 1, category: "irrigation", instruction: "Irrigate the field.", completed: false }],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText("Irrigate the field.")).toBeInTheDocument());
    expect(cropTrackerApi.fetchUpcomingTasks).not.toHaveBeenCalled();
  });

  it("switching tabs re-fetches from the matching endpoint", async () => {
    cropTrackerApi.fetchUpcomingTasks.mockResolvedValue({
      tasks: [{ id: 2, category: "fertilizer", instruction: "Apply fertilizer next week.", completed: false }],
    });

    renderPage();
    await waitFor(() => expect(cropTrackerApi.fetchTodaysTasks).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("button", { name: /upcoming/i }));

    await waitFor(() => expect(cropTrackerApi.fetchUpcomingTasks).toHaveBeenCalled());
    expect(await screen.findByText("Apply fertilizer next week.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /completed/i }));
    await waitFor(() => expect(cropTrackerApi.fetchCompletedTasks).toHaveBeenCalled());
  });

  it("a checkbox per task calls toggleComplete (POSTs a completion for the active tracker)", async () => {
    cropTrackerApi.fetchTodaysTasks.mockResolvedValue({
      tasks: [{ id: 1, category: "irrigation", instruction: "Irrigate the field.", completed: false }],
    });
    cropTrackerApi.setTaskCompletion.mockResolvedValue({ completed: true });

    renderPage();
    await waitFor(() => expect(screen.getByText("Irrigate the field.")).toBeInTheDocument());

    const checkbox = screen.getByRole("checkbox", { name: /irrigate the field/i });
    expect(checkbox).not.toBeChecked();

    await userEvent.click(checkbox);

    await waitFor(() => {
      expect(cropTrackerApi.setTaskCompletion).toHaveBeenCalledWith(1, ACTIVE_TRACKER.id, true);
    });
  });

  it("shows completed tasks with a visibly distinct checked/struck-through state", async () => {
    cropTrackerApi.fetchCompletedTasks.mockResolvedValue({
      tasks: [{ id: 3, category: "pruning", instruction: "Prune the shoots.", completed: true }],
    });

    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /completed/i }));

    const instruction = await screen.findByText("Prune the shoots.");
    const checkbox = screen.getByRole("checkbox", { name: /prune the shoots/i });

    expect(checkbox).toBeChecked();
    // Struck-through styling (line-through) is how pending vs completed
    // stay visibly distinct, per the user's "keep upcoming and completed
    // easy to distinguish" feedback.
    expect(instruction.className).toMatch(/done/i);
  });

  it("a pending task has no struck-through styling", async () => {
    cropTrackerApi.fetchTodaysTasks.mockResolvedValue({
      tasks: [{ id: 4, category: "spraying", instruction: "Spray the crop.", completed: false }],
    });

    renderPage();
    const instruction = await screen.findByText("Spray the crop.");
    const checkbox = screen.getByRole("checkbox", { name: /spray the crop/i });

    expect(checkbox).not.toBeChecked();
    expect(instruction.className).not.toMatch(/done/i);
  });

  it("shows an empty-state message when the active tab has no tasks", async () => {
    renderPage();
    await waitFor(() => expect(cropTrackerApi.fetchTodaysTasks).toHaveBeenCalled());
    expect(screen.getByText(/no tasks/i)).toBeInTheDocument();
  });

  it("shows a plain-language error and does not crash if loading tasks fails", async () => {
    cropTrackerApi.fetchTodaysTasks.mockRejectedValue(new Error("Network Error"));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/could not load/i)).toBeInTheDocument();
    });
  });

  // Fix round 1 (review finding 4) -- a toggle failure is a different,
  // non-fatal thing from a load failure: the list already rendered fine,
  // only the action failed. It must not be replaced by the generic
  // "Could not load your tasks" view.
  it("keeps the task list visible and shows a toggle-specific error when toggling fails, without the load-error view", async () => {
    cropTrackerApi.fetchTodaysTasks.mockResolvedValue({
      tasks: [{ id: 1, category: "irrigation", instruction: "Irrigate the field.", completed: false }],
    });
    cropTrackerApi.setTaskCompletion.mockRejectedValue(new Error("Network Error"));

    renderPage();
    await waitFor(() => expect(screen.getByText("Irrigate the field.")).toBeInTheDocument());

    const checkbox = screen.getByRole("checkbox", { name: /irrigate the field/i });
    await userEvent.click(checkbox);

    await waitFor(() => expect(screen.getByText(/could not update/i)).toBeInTheDocument());
    // The list is still there...
    expect(screen.getByText("Irrigate the field.")).toBeInTheDocument();
    // ...and the generic load-error view is NOT shown in its place.
    expect(screen.queryByText(/could not load/i)).not.toBeInTheDocument();
  });

  // Final-review fix (F2) -- Task 14's CropTaskSerializer now includes
  // each task's own `crop` id, so the toggle can resolve the matching
  // tracker correctly for a farmer with 2+ active trackers instead of
  // being disabled outright: the control stays enabled, and toggling
  // posts against the tracker whose crop actually matches the task.
  it("resolves the matching tracker by crop and allows the toggle when the farmer has 2+ active trackers", async () => {
    cropTrackerApi.fetchTrackers.mockResolvedValue([
      { id: 7, crop: 1, is_active: true },
      { id: 8, crop: 2, is_active: true },
    ]);
    cropTrackerApi.fetchTodaysTasks.mockResolvedValue({
      tasks: [{ id: 1, crop: 2, category: "irrigation", instruction: "Irrigate the field.", completed: false }],
    });
    cropTrackerApi.setTaskCompletion.mockResolvedValue({ completed: true });

    renderPage();
    await waitFor(() => expect(screen.getByText("Irrigate the field.")).toBeInTheDocument());

    const checkbox = screen.getByRole("checkbox", { name: /irrigate the field/i });
    expect(checkbox).not.toBeDisabled();

    await userEvent.click(checkbox);

    // Posted against tracker 8 (crop 2, matching the task), not tracker 7.
    await waitFor(() => {
      expect(cropTrackerApi.setTaskCompletion).toHaveBeenCalledWith(1, 8, true);
    });
  });

  // Reuses the single-active-tracker case already covered above ("a
  // checkbox per task calls toggleComplete...") -- confirming it, the
  // guardrail above, still leaves that path untouched.
  it("still allows the toggle with exactly one active tracker", async () => {
    cropTrackerApi.fetchTodaysTasks.mockResolvedValue({
      tasks: [{ id: 1, category: "irrigation", instruction: "Irrigate the field.", completed: false }],
    });
    cropTrackerApi.setTaskCompletion.mockResolvedValue({ completed: true });

    renderPage();
    await waitFor(() => expect(screen.getByText("Irrigate the field.")).toBeInTheDocument());

    const checkbox = screen.getByRole("checkbox", { name: /irrigate the field/i });
    expect(checkbox).not.toBeDisabled();

    await userEvent.click(checkbox);

    await waitFor(() => {
      expect(cropTrackerApi.setTaskCompletion).toHaveBeenCalledWith(1, ACTIVE_TRACKER.id, true);
    });
  });
});
