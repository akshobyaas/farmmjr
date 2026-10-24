import { renderHook, act } from "@testing-library/react";
import { vi, describe, test, expect, beforeEach } from "vitest";
import { useScanDetail } from "./useScanDetail";
import * as scansApi from "../api/scans";

vi.mock("../api/scans");

describe("useScanDetail", () => {
  beforeEach(() => vi.clearAllMocks());

  test("loads the scan for the given id", async () => {
    scansApi.fetchScanDetail.mockResolvedValue({ id: 5, image: "x.jpg" });
    const { result } = renderHook(() => useScanDetail("5"));
    await act(async () => {});
    expect(scansApi.fetchScanDetail).toHaveBeenCalledWith("5");
    expect(result.current.scan).toEqual({ id: 5, image: "x.jpg" });
    expect(result.current.error).toBe("");
  });

  test("a 404 sets the not-found message", async () => {
    scansApi.fetchScanDetail.mockRejectedValue({ response: { status: 404 } });
    const { result } = renderHook(() => useScanDetail("5"));
    await act(async () => {});
    expect(result.current.error).toBe("This scan could not be found.");
    expect(result.current.scan).toBeNull();
  });

  test("a 403 also sets the not-found message, not a permissions message", async () => {
    scansApi.fetchScanDetail.mockRejectedValue({ response: { status: 403 } });
    const { result } = renderHook(() => useScanDetail("5"));
    await act(async () => {});
    expect(result.current.error).toBe("This scan could not be found.");
  });

  test("any other failure sets the generic load-error message", async () => {
    scansApi.fetchScanDetail.mockRejectedValue({ response: { status: 500 } });
    const { result } = renderHook(() => useScanDetail("5"));
    await act(async () => {});
    expect(result.current.error).toBe("Could not load this scan. Please try again.");
  });

  test("re-fetches when the id changes", async () => {
    scansApi.fetchScanDetail.mockResolvedValue({ id: 5 });
    const { rerender } = renderHook(({ id }) => useScanDetail(id), { initialProps: { id: "5" } });
    await act(async () => {});
    rerender({ id: "6" });
    await act(async () => {});
    expect(scansApi.fetchScanDetail).toHaveBeenCalledWith("6");
  });
});
