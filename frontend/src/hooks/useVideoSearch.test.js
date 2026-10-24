import { renderHook, act } from "@testing-library/react";
import { vi, describe, test, expect, beforeEach } from "vitest";
import { useVideoSearch } from "./useVideoSearch";
import * as videosApi from "../api/videos";

vi.mock("../api/videos");

describe("useVideoSearch", () => {
  beforeEach(() => vi.clearAllMocks());

  test("auto-runs a search once when given a non-blank initialQuery", async () => {
    videosApi.searchVideos.mockResolvedValue({ results: [{ video_id: "a" }] });
    const { result } = renderHook(() => useVideoSearch("blight"));
    await act(async () => {});
    expect(videosApi.searchVideos).toHaveBeenCalledWith("blight");
    expect(result.current.results).toEqual([{ video_id: "a" }]);
    expect(result.current.searched).toBe(true);
  });

  test("does not auto-run for a blank initialQuery", async () => {
    const { result } = renderHook(() => useVideoSearch(""));
    await act(async () => {});
    expect(videosApi.searchVideos).not.toHaveBeenCalled();
    expect(result.current.searched).toBe(false);
  });

  test("handleSubmit searches using the current queryInput", async () => {
    videosApi.searchVideos.mockResolvedValue({ results: [] });
    const { result } = renderHook(() => useVideoSearch(""));
    act(() => result.current.setQueryInput("pepper disease"));
    await act(async () => {
      result.current.handleSubmit({ preventDefault: () => {} });
      await Promise.resolve();
    });
    expect(videosApi.searchVideos).toHaveBeenCalledWith("pepper disease");
  });

  test("a blank query submit does not call the API", async () => {
    const { result } = renderHook(() => useVideoSearch(""));
    act(() => result.current.setQueryInput("   "));
    await act(async () => {
      result.current.handleSubmit({ preventDefault: () => {} });
    });
    expect(videosApi.searchVideos).not.toHaveBeenCalled();
  });

  test("a failed search surfaces the backend's detail message and clears results", async () => {
    videosApi.searchVideos.mockRejectedValue({ response: { data: { detail: "quota exceeded" } } });
    const { result } = renderHook(() => useVideoSearch("x"));
    await act(async () => {});
    expect(result.current.error).toBe("quota exceeded");
    expect(result.current.results).toBeNull();
  });
});
