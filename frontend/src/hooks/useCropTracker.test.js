import { renderHook, act } from "@testing-library/react";
import { vi, describe, test, expect, beforeEach, afterEach } from "vitest";
import { useCropTracker } from "./useCropTracker";
import * as cropTrackerApi from "../api/cropTracker";
import i18n from "../i18n";

vi.mock("../api/cropTracker");

describe("useCropTracker", () => {
  beforeEach(() => vi.clearAllMocks());
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
