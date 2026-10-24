import { renderHook, act } from "@testing-library/react";
import { vi, describe, test, expect, beforeEach } from "vitest";
import { useWeather } from "./useWeather";
import * as weatherApi from "../api/weather";

vi.mock("../api/weather");

describe("useWeather", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete global.navigator.geolocation;
  });

  test("handleCitySubmit fetches weather for the typed city", async () => {
    weatherApi.fetchWeather.mockResolvedValue({ location: "Mysuru", temperature: 28 });
    const { result } = renderHook(() => useWeather());
    act(() => result.current.setCityInput("Mysuru"));
    await act(async () => {
      await result.current.handleCitySubmit({ preventDefault: () => {} });
    });
    expect(weatherApi.fetchWeather).toHaveBeenCalledWith({ city: "Mysuru" });
    expect(result.current.weather).toEqual({ location: "Mysuru", temperature: 28 });
    expect(result.current.loading).toBe(false);
  });

  test("handleCitySubmit does nothing for a blank/whitespace-only city", async () => {
    const { result } = renderHook(() => useWeather());
    act(() => result.current.setCityInput("   "));
    await act(async () => {
      await result.current.handleCitySubmit({ preventDefault: () => {} });
    });
    expect(weatherApi.fetchWeather).not.toHaveBeenCalled();
  });

  test("a failed fetch surfaces the backend's detail message", async () => {
    weatherApi.fetchWeather.mockRejectedValue({ response: { data: { detail: "City not found" } } });
    const { result } = renderHook(() => useWeather());
    act(() => result.current.setCityInput("Nowhere"));
    await act(async () => {
      await result.current.handleCitySubmit({ preventDefault: () => {} });
    });
    expect(result.current.error).toBe("City not found");
    expect(result.current.weather).toBeNull();
  });

  test("handleUseMyLocation sets an error when geolocation is unsupported", () => {
    const { result } = renderHook(() => useWeather());
    act(() => result.current.handleUseMyLocation());
    expect(result.current.error).toBeTruthy();
  });

  test("handleUseMyLocation fetches weather by coordinates on success", async () => {
    weatherApi.fetchWeather.mockResolvedValue({ location: "Here", temperature: 20 });
    global.navigator.geolocation = {
      getCurrentPosition: (success) => success({ coords: { latitude: 12.3, longitude: 76.6 } }),
    };
    const { result } = renderHook(() => useWeather());
    await act(async () => {
      await result.current.handleUseMyLocation();
    });
    expect(weatherApi.fetchWeather).toHaveBeenCalledWith({ lat: 12.3, lon: 76.6 });
    expect(result.current.weather).toEqual({ location: "Here", temperature: 20 });
  });

  test("handleUseMyLocation sets an error when the browser denies permission", async () => {
    global.navigator.geolocation = {
      getCurrentPosition: (_success, failure) => failure(new Error("denied")),
    };
    const { result } = renderHook(() => useWeather());
    await act(async () => {
      result.current.handleUseMyLocation();
    });
    expect(result.current.error).toBeTruthy();
    expect(result.current.loading).toBe(false);
  });
});
