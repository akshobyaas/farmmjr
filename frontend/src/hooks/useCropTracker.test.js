import { renderHook, act, waitFor } from "@testing-library/react";
import { vi, describe, test, expect, beforeEach, afterEach } from "vitest";
import { useCropTracker } from "./useCropTracker";
import * as cropTrackerApi from "../api/cropTracker";
import { useAuth } from "../context/AuthContext";
import i18n from "../i18n";

vi.mock("../api/cropTracker");

// Fix round 1 (Task 19 review finding): handleTrackerSubmit now needs to
// read the current farmer's onboarding_status and call updateProfile via
// useAuth() after a successful tracker CREATE -- see the mock pattern in
// ProtectedRoute.test.jsx/WelcomePage.test.jsx for why this is a partial
// mock (importActual keeps the real AuthContext export; only the useAuth
// hook itself is replaced).
vi.mock("../context/AuthContext", async () => {
  const actual = await vi.importActual("../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});

describe("useCropTracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({
      user: { username: "testfarmer1", onboarding_status: "completed" },
      updateProfile: vi.fn().mockResolvedValue({}),
    });
  });
  // The tracker-fetch effect's deps are [cropId] only, deliberately not
  // [cropId, t] -- see the ruling documented in useCropTracker.js above
  // the effect. This test locks that in: a language switch must not
  // re-trigger the tracker fetch.
  afterEach(() => i18n.changeLanguage("en"));

  test("fetches trackers on mount and selects the one matching cropId", async () => {
    cropTrackerApi.fetchTrackers.mockResolvedValue([
      { id: 1, crop: 5, current_stage: null },
      { id: 2, crop: 9, current_stage: null },
    ]);
    const { result } = renderHook(() => useCropTracker("9"));
    await act(async () => {});
    expect(result.current.tracker).toEqual({ id: 2, crop: 9, current_stage: null });
  });

  test("tracker stays null when there is no matching tracker", async () => {
    cropTrackerApi.fetchTrackers.mockResolvedValue([{ id: 1, crop: 5, current_stage: null }]);
    const { result } = renderHook(() => useCropTracker("9"));
    await act(async () => {});
    expect(result.current.tracker).toBeNull();
  });

  test("tracker stays null when the fetch fails", async () => {
    cropTrackerApi.fetchTrackers.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useCropTracker("9"));
    await act(async () => {});
    expect(result.current.tracker).toBeNull();
  });

  test("does not re-fetch trackers when only the UI language changes", async () => {
    cropTrackerApi.fetchTrackers.mockResolvedValue([{ id: 2, crop: 9, current_stage: null }]);
    renderHook(() => useCropTracker("9"));
    await act(async () => {});
    expect(cropTrackerApi.fetchTrackers).toHaveBeenCalledTimes(1);

    await act(async () => {
      await i18n.changeLanguage("kn");
    });

    expect(cropTrackerApi.fetchTrackers).toHaveBeenCalledTimes(1);
  });

  test("openTrackerForm pre-fills planting date and stage from the existing tracker", async () => {
    cropTrackerApi.fetchTrackers.mockResolvedValue([
      { id: 2, crop: 9, planting_date: "2026-05-01", current_stage: { id: 7, name: "Flowering" } },
    ]);
    const { result } = renderHook(() => useCropTracker("9"));
    await act(async () => {});
    act(() => result.current.openTrackerForm());
    expect(result.current.showTrackerForm).toBe(true);
    expect(result.current.plantingDate).toBe("2026-05-01");
    expect(result.current.selectedStageId).toBe("7");
  });

  test("handleTrackerSubmit creates a day-based tracker when none exists yet", async () => {
    cropTrackerApi.fetchTrackers.mockResolvedValue([]);
    cropTrackerApi.createTracker.mockResolvedValue({ id: 3, crop: 9 });
    const { result } = renderHook(() => useCropTracker("9"));
    await act(async () => {});
    act(() => result.current.setPlantingDate("2026-06-01"));
    await act(async () => {
      await result.current.handleTrackerSubmit(
        { preventDefault: () => {} },
        { isDayBasedCrop: true, crop: { id: 9 } }
      );
    });
    expect(cropTrackerApi.createTracker).toHaveBeenCalledWith({ cropId: 9, plantingDate: "2026-06-01" });
    expect(result.current.tracker).toEqual({ id: 3, crop: 9 });
    expect(result.current.showTrackerForm).toBe(false);
  });

  // Fix round 1 (Task 19 review finding): a successful tracker CREATE
  // while the farmer is still mid-onboarding ("in_progress") is what
  // actually flips onboarding_status to "completed" now -- not
  // WelcomePage's "Get Started" button (see WelcomePage.jsx/.test.jsx).
  test("handleTrackerSubmit marks onboarding completed after creating a tracker while in_progress", async () => {
    const mockUpdateProfile = vi.fn().mockResolvedValue({ onboarding_status: "completed" });
    useAuth.mockReturnValue({
      user: { username: "testfarmer1", onboarding_status: "in_progress" },
      updateProfile: mockUpdateProfile,
    });
    cropTrackerApi.fetchTrackers.mockResolvedValue([]);
    cropTrackerApi.createTracker.mockResolvedValue({ id: 3, crop: 9 });
    const { result } = renderHook(() => useCropTracker("9"));
    await act(async () => {});
    act(() => result.current.setPlantingDate("2026-06-01"));
    await act(async () => {
      await result.current.handleTrackerSubmit(
        { preventDefault: () => {} },
        { isDayBasedCrop: true, crop: { id: 9 } }
      );
    });
    await waitFor(() =>
      expect(mockUpdateProfile).toHaveBeenCalledWith({ onboarding_status: "completed" })
    );
  });

  test("handleTrackerSubmit does not touch onboarding_status when creating a tracker while already completed", async () => {
    const mockUpdateProfile = vi.fn().mockResolvedValue({});
    useAuth.mockReturnValue({
      user: { username: "testfarmer1", onboarding_status: "completed" },
      updateProfile: mockUpdateProfile,
    });
    cropTrackerApi.fetchTrackers.mockResolvedValue([]);
    cropTrackerApi.createTracker.mockResolvedValue({ id: 3, crop: 9 });
    const { result } = renderHook(() => useCropTracker("9"));
    await act(async () => {});
    act(() => result.current.setPlantingDate("2026-06-01"));
    await act(async () => {
      await result.current.handleTrackerSubmit(
        { preventDefault: () => {} },
        { isDayBasedCrop: true, crop: { id: 9 } }
      );
    });
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  test("handleTrackerSubmit does not touch onboarding_status when creating a tracker while skipped or not_started", async () => {
    for (const onboarding_status of ["skipped", "not_started"]) {
      const mockUpdateProfile = vi.fn().mockResolvedValue({});
      useAuth.mockReturnValue({
        user: { username: "testfarmer1", onboarding_status },
        updateProfile: mockUpdateProfile,
      });
      cropTrackerApi.fetchTrackers.mockResolvedValue([]);
      cropTrackerApi.createTracker.mockResolvedValue({ id: 3, crop: 9 });
      const { result } = renderHook(() => useCropTracker("9"));
      await act(async () => {});
      act(() => result.current.setPlantingDate("2026-06-01"));
      await act(async () => {
        await result.current.handleTrackerSubmit(
          { preventDefault: () => {} },
          { isDayBasedCrop: true, crop: { id: 9 } }
        );
      });
      expect(mockUpdateProfile).not.toHaveBeenCalled();
    }
  });

  test("handleTrackerSubmit does not touch onboarding_status when UPDATING an existing tracker, even if in_progress", async () => {
    const mockUpdateProfile = vi.fn().mockResolvedValue({});
    useAuth.mockReturnValue({
      user: { username: "testfarmer1", onboarding_status: "in_progress" },
      updateProfile: mockUpdateProfile,
    });
    cropTrackerApi.fetchTrackers.mockResolvedValue([
      { id: 2, crop: 9, planting_date: "2026-05-01", current_stage: null },
    ]);
    cropTrackerApi.updateTracker.mockResolvedValue({ id: 2, crop: 9 });
    const { result } = renderHook(() => useCropTracker("9"));
    await act(async () => {});
    act(() => result.current.setPlantingDate("2026-06-10"));
    await act(async () => {
      await result.current.handleTrackerSubmit(
        { preventDefault: () => {} },
        { isDayBasedCrop: true, crop: { id: 9 } }
      );
    });
    expect(cropTrackerApi.updateTracker).toHaveBeenCalled();
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  test("handleTrackerSubmit surfaces the backend's field error message on failure", async () => {
    cropTrackerApi.fetchTrackers.mockResolvedValue([]);
    cropTrackerApi.createTracker.mockRejectedValue({
      response: { data: { planting_date: ["This field is required."] } },
    });
    const { result } = renderHook(() => useCropTracker("9"));
    await act(async () => {});
    await act(async () => {
      await result.current.handleTrackerSubmit(
        { preventDefault: () => {} },
        { isDayBasedCrop: true, crop: { id: 9 } }
      );
    });
    expect(result.current.trackerError).toBe("This field is required.");
  });
});
