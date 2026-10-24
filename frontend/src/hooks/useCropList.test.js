import { renderHook, act } from "@testing-library/react";
import { vi, describe, test, expect, beforeEach } from "vitest";
import { useCropList } from "./useCropList";
import * as cropsApi from "../api/crops";

vi.mock("../api/crops");

describe("useCropList", () => {
  beforeEach(() => vi.clearAllMocks());

  test("loads all crops on mount with an empty query", async () => {
    cropsApi.fetchCrops.mockResolvedValue([{ id: 1, name: "Rice" }]);
    const { result } = renderHook(() => useCropList());
    await act(async () => {});
    expect(cropsApi.fetchCrops).toHaveBeenCalledWith("");
    expect(result.current.crops).toEqual([{ id: 1, name: "Rice" }]);
    expect(result.current.loading).toBe(false);
  });

  test("handleSearchSubmit reloads using the current search text", async () => {
    cropsApi.fetchCrops.mockResolvedValue([]);
    const { result } = renderHook(() => useCropList());
    await act(async () => {});
    act(() => result.current.setSearch("arecanut"));
    await act(async () => {
      result.current.handleSearchSubmit({ preventDefault: () => {} });
    });
    expect(cropsApi.fetchCrops).toHaveBeenLastCalledWith("arecanut");
  });

  test("sets an error message on load failure", async () => {
    cropsApi.fetchCrops.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useCropList());
    await act(async () => {});
    expect(result.current.error).toBeTruthy();
    expect(result.current.loading).toBe(false);
  });
});
