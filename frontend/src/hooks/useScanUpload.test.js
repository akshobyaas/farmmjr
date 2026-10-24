import { renderHook, act } from "@testing-library/react";
import { vi, describe, test, expect, beforeEach } from "vitest";
import { useScanUpload } from "./useScanUpload";
import * as scansApi from "../api/scans";

vi.mock("../api/scans");

beforeEach(() => {
  vi.clearAllMocks();
  global.URL.createObjectURL = vi.fn(() => "blob:fake-url");
  global.URL.revokeObjectURL = vi.fn();
});

describe("useScanUpload", () => {
  test("rejects a file over the 5MB preview limit without uploading", () => {
    const { result } = renderHook(() => useScanUpload());
    const big = { size: 6 * 1024 * 1024 };
    act(() => result.current.handleFileChange({ target: { files: [big] } }));
    expect(result.current.file).toBeNull();
    expect(result.current.previewUrl).toBeNull();
    expect(result.current.error).toBeTruthy();
  });

  test("accepts a file within the limit and creates a preview URL", () => {
    const { result } = renderHook(() => useScanUpload());
    const small = { size: 1024 };
    act(() => result.current.handleFileChange({ target: { files: [small] } }));
    expect(result.current.file).toBe(small);
    expect(result.current.previewUrl).toBe("blob:fake-url");
  });

  test("handleSubmit requires a file to be chosen first", async () => {
    const { result } = renderHook(() => useScanUpload());
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: () => {} });
    });
    expect(scansApi.uploadScan).not.toHaveBeenCalled();
    expect(result.current.error).toBeTruthy();
  });

  test("handleSubmit uploads the chosen file and stores the result", async () => {
    scansApi.uploadScan.mockResolvedValue({ message: "ok", scan: { id: 1 } });
    const { result } = renderHook(() => useScanUpload());
    const small = { size: 1024 };
    act(() => result.current.handleFileChange({ target: { files: [small] } }));
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: () => {} });
    });
    expect(scansApi.uploadScan).toHaveBeenCalledWith(small);
    expect(result.current.result).toEqual({ message: "ok", scan: { id: 1 } });
  });

  test("a 401 upload failure surfaces the session-expired message", async () => {
    scansApi.uploadScan.mockRejectedValue({ response: { status: 401 } });
    const { result } = renderHook(() => useScanUpload());
    const small = { size: 1024 };
    act(() => result.current.handleFileChange({ target: { files: [small] } }));
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: () => {} });
    });
    expect(result.current.error).toBe("Your session has expired. Please log in again.");
  });

  test("handleScanAnother resets file, preview, result and error", () => {
    const { result } = renderHook(() => useScanUpload());
    const small = { size: 1024 };
    act(() => result.current.handleFileChange({ target: { files: [small] } }));
    act(() => result.current.handleScanAnother());
    expect(result.current.file).toBeNull();
    expect(result.current.previewUrl).toBeNull();
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBe("");
  });
});
