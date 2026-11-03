import { renderHook, act } from "@testing-library/react";
import { vi, describe, test, expect, beforeEach } from "vitest";
import { useDashboardData } from "./useDashboardData";
import * as cropTrackerApi from "../api/cropTracker";
import * as advisoryApi from "../api/advisory";

vi.mock("../api/cropTracker");
vi.mock("../api/advisory");

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

  // Admin accounts have no crop tracker of their own, so the risk-alert/
  // today's-tasks fetches above are farmer-only data. For an admin caller,
  // fetch the one admin-relevant stat instead: how many advisory queries
  // are pending, via the existing advisory list endpoint (no new backend
  // endpoint needed).
  test("fetches pending advisory query count instead of risk alerts/tasks when isAdmin is true", async () => {
    advisoryApi.listAdvisoryQueries.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const { result } = renderHook(() => useDashboardData({ isAdmin: true }));
    await act(async () => {});
    expect(result.current.pendingQueriesCount).toBe(3);
    expect(advisoryApi.listAdvisoryQueries).toHaveBeenCalledWith("pending");
    expect(cropTrackerApi.fetchRiskAlerts).not.toHaveBeenCalled();
    expect(cropTrackerApi.fetchTodaysTasks).not.toHaveBeenCalled();
  });

  test("pendingQueriesCount is null when the pending-queries fetch fails", async () => {
    advisoryApi.listAdvisoryQueries.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useDashboardData({ isAdmin: true }));
    await act(async () => {});
    expect(result.current.pendingQueriesCount).toBeNull();
  });

  test("pendingQueriesCount stays null and listAdvisoryQueries is never called for a non-admin caller", async () => {
    cropTrackerApi.fetchRiskAlerts.mockResolvedValue({ trackers: [] });
    cropTrackerApi.fetchTodaysTasks.mockResolvedValue({ tasks: [] });
    const { result } = renderHook(() => useDashboardData());
    await act(async () => {});
    expect(result.current.pendingQueriesCount).toBeNull();
    expect(advisoryApi.listAdvisoryQueries).not.toHaveBeenCalled();
  });
});
