import { renderHook, act } from "@testing-library/react";
import { vi, describe, test, expect, beforeEach } from "vitest";
import { useScanHistory } from "./useScanHistory";
import * as scansApi from "../api/scans";

vi.mock("../api/scans");

describe("useScanHistory", () => {
  beforeEach(() => vi.clearAllMocks());

  test("loads page 1 on mount", async () => {
    scansApi.fetchScanHistory.mockResolvedValue({
      results: [{ id: 1 }],
      count: 1,
      next: null,
      previous: null,
    });
    const { result } = renderHook(() => useScanHistory());
    await act(async () => {});
    expect(scansApi.fetchScanHistory).toHaveBeenCalledWith(1);
    expect(result.current.results).toEqual([{ id: 1 }]);
    expect(result.current.count).toBe(1);
    expect(result.current.hasNext).toBe(false);
    expect(result.current.hasPrevious).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  test("sets hasNext/hasPrevious from the paginated response", async () => {
    scansApi.fetchScanHistory.mockResolvedValue({
      results: [{ id: 1 }],
      count: 30,
      next: "https://api/scans/history/?page=2",
      previous: "https://api/scans/history/?page=1",
    });
    const { result } = renderHook(() => useScanHistory());
    await act(async () => {});
    expect(result.current.hasNext).toBe(true);
    expect(result.current.hasPrevious).toBe(true);
  });

  test("advancing the page re-fetches with the new page number", async () => {
    scansApi.fetchScanHistory.mockResolvedValue({ results: [], count: 0, next: null, previous: null });
    const { result } = renderHook(() => useScanHistory());
    await act(async () => {});
    act(() => result.current.setPage((p) => p + 1));
    await act(async () => {});
    expect(scansApi.fetchScanHistory).toHaveBeenLastCalledWith(2);
    expect(result.current.page).toBe(2);
  });

  test("sets an error message on load failure", async () => {
    scansApi.fetchScanHistory.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useScanHistory());
    await act(async () => {});
    expect(result.current.error).toBeTruthy();
    expect(result.current.loading).toBe(false);
  });
});
