import { renderHook, act } from "@testing-library/react";
import { vi, describe, test, expect, beforeEach } from "vitest";
import { useDashboardData } from "./useDashboardData";
import * as cropTrackerApi from "../api/cropTracker";

vi.mock("../api/cropTracker");

describe("useDashboardData", () => {
  beforeEach(() => vi.clearAllMocks());

  test("picks the highest-priority risk alert across trackers", async () => {
    cropTrackerApi.fetchRiskAlerts.mockResolvedValue({
      trackers: [
        { disease_name: "Leaf Spot", risk_level: "low" },
        { disease_name: "Blight", risk_level: "high" },
      ],
    });
    cropTrackerApi.fetchTodaysTasks.mockResolvedValue({ tasks: [] });
    const { result } = renderHook(() => useDashboardData());
    await act(async () => {});
    expect(result.current.riskAlert).toEqual({ disease_name: "Blight", risk_level: "high" });
  });

  test("riskAlert is null when the home_location detail shape comes back", async () => {
    cropTrackerApi.fetchRiskAlerts.mockResolvedValue({ detail: "no home_location" });
    cropTrackerApi.fetchTodaysTasks.mockResolvedValue({ tasks: [] });
    const { result } = renderHook(() => useDashboardData());
    await act(async () => {});
    expect(result.current.riskAlert).toBeNull();
  });

  test("riskAlert is null when the fetch fails", async () => {
    cropTrackerApi.fetchRiskAlerts.mockRejectedValue(new Error("network"));
    cropTrackerApi.fetchTodaysTasks.mockResolvedValue({ tasks: [] });
    const { result } = renderHook(() => useDashboardData());
    await act(async () => {});
    expect(result.current.riskAlert).toBeNull();
  });

  test("todaysTasks reflects the fetched list", async () => {
    cropTrackerApi.fetchRiskAlerts.mockResolvedValue({ trackers: [] });
    cropTrackerApi.fetchTodaysTasks.mockResolvedValue({ tasks: [{ id: 1, category: "irrigation" }] });
    const { result } = renderHook(() => useDashboardData());
    await act(async () => {});
    expect(result.current.todaysTasks).toEqual([{ id: 1, category: "irrigation" }]);
  });

  test("todaysTasks defaults to [] when the fetch fails", async () => {
    cropTrackerApi.fetchRiskAlerts.mockResolvedValue({ trackers: [] });
    cropTrackerApi.fetchTodaysTasks.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useDashboardData());
    await act(async () => {});
    expect(result.current.todaysTasks).toEqual([]);
  });
});
