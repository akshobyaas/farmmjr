import { renderHook, act } from "@testing-library/react";
import { vi, describe, test, expect, beforeEach } from "vitest";
import { useLocatorSearch } from "./useLocatorSearch";
import * as locatorApi from "../api/locator";

vi.mock("../api/locator");

describe("useLocatorSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete global.navigator.geolocation;
  });

  test("handlePlaceSubmit searches by the typed place and stores origin+results", async () => {
    locatorApi.fetchNearbyServices.mockResolvedValue({
      origin: { lat: 1, lon: 2 },
      results: [{ id: 1, name: "Agro Store" }],
    });
    const { result } = renderHook(() => useLocatorSearch());
    act(() => result.current.setPlaceInput("Mysuru"));
    await act(async () => {
      await result.current.handlePlaceSubmit({ preventDefault: () => {} });
    });
    expect(locatorApi.fetchNearbyServices).toHaveBeenCalledWith({ place: "Mysuru" });
    expect(result.current.origin).toEqual({ lat: 1, lon: 2 });
    expect(result.current.results).toEqual([{ id: 1, name: "Agro Store" }]);
    expect(result.current.searched).toBe(true);
  });

  test("handlePlaceSubmit does nothing for a blank place", async () => {
    const { result } = renderHook(() => useLocatorSearch());
    act(() => result.current.setPlaceInput("   "));
    await act(async () => {
      await result.current.handlePlaceSubmit({ preventDefault: () => {} });
    });
    expect(locatorApi.fetchNearbyServices).not.toHaveBeenCalled();
  });

  test("a failed search surfaces the backend's detail message", async () => {
    locatorApi.fetchNearbyServices.mockRejectedValue({ response: { data: { detail: "not found" } } });
    const { result } = renderHook(() => useLocatorSearch());
    act(() => result.current.setPlaceInput("Nowhere"));
    await act(async () => {
      await result.current.handlePlaceSubmit({ preventDefault: () => {} });
    });
    expect(result.current.error).toBe("not found");
  });

  test("handleUseMyLocation sets an error when geolocation is unsupported", () => {
    const { result } = renderHook(() => useLocatorSearch());
    act(() => result.current.handleUseMyLocation());
    expect(result.current.error).toBeTruthy();
  });

  test("handleUseMyLocation searches by coordinates on success", async () => {
    locatorApi.fetchNearbyServices.mockResolvedValue({ origin: { lat: 3, lon: 4 }, results: [] });
    global.navigator.geolocation = {
      getCurrentPosition: (success) => success({ coords: { latitude: 3, longitude: 4 } }),
    };
    const { result } = renderHook(() => useLocatorSearch());
    await act(async () => {
      await result.current.handleUseMyLocation();
    });
    expect(locatorApi.fetchNearbyServices).toHaveBeenCalledWith({ lat: 3, lon: 4 });
    expect(result.current.origin).toEqual({ lat: 3, lon: 4 });
  });
});
