import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import WeatherPage from "./WeatherPage";
import * as weatherApi from "../api/weather";

vi.mock("../api/weather");

const mockWeather = {
  location: "Mangaluru, IN",
  temperature: 29.4,
  feels_like: 33.1,
  humidity: 78,
  wind_speed: 3.6,
  description: "broken clouds",
  icon: "04d",
};

describe("WeatherPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("looks up weather for a manually typed place name", async () => {
    weatherApi.fetchWeather.mockResolvedValue(mockWeather);

    render(
      <MemoryRouter>
        <WeatherPage />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByPlaceholderText(/enter a place name/i), "Mangaluru");
    await userEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() => {
      expect(screen.getByText("Mangaluru, IN")).toBeInTheDocument();
    });
    expect(screen.getByText("29°C")).toBeInTheDocument();
    expect(screen.getByText("broken clouds")).toBeInTheDocument();
    expect(weatherApi.fetchWeather).toHaveBeenCalledWith({ city: "Mangaluru" });
  });

  it("uses the browser's geolocation (with permission) when 'Use My Location' is clicked", async () => {
    weatherApi.fetchWeather.mockResolvedValue(mockWeather);
    const getCurrentPosition = vi.fn((success) => {
      success({ coords: { latitude: 12.87, longitude: 74.88 } });
    });
    vi.stubGlobal("navigator", { ...navigator, geolocation: { getCurrentPosition } });

    render(
      <MemoryRouter>
        <WeatherPage />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole("button", { name: /use my location/i }));

    await waitFor(() => {
      expect(screen.getByText("Mangaluru, IN")).toBeInTheDocument();
    });
    expect(weatherApi.fetchWeather).toHaveBeenCalledWith({ lat: 12.87, lon: 74.88 });
  });

  it("shows a plain-language message when location permission is denied", async () => {
    const getCurrentPosition = vi.fn((_success, error) => {
      error({ code: 1, message: "User denied Geolocation" });
    });
    vi.stubGlobal("navigator", { ...navigator, geolocation: { getCurrentPosition } });

    render(
      <MemoryRouter>
        <WeatherPage />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole("button", { name: /use my location/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/location permission denied/i);
    });
    expect(weatherApi.fetchWeather).not.toHaveBeenCalled();
  });

  it("shows the server's graceful fallback message when the weather API is unavailable", async () => {
    weatherApi.fetchWeather.mockRejectedValue({
      response: { status: 503, data: { detail: "Weather unavailable right now. Please try again later." } },
    });

    render(
      <MemoryRouter>
        <WeatherPage />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByPlaceholderText(/enter a place name/i), "Nowhereville");
    await userEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/weather unavailable right now/i);
    });
  });

  it("shows a fallback message and does not crash on a network failure", async () => {
    weatherApi.fetchWeather.mockRejectedValue(new Error("Network Error"));

    render(
      <MemoryRouter>
        <WeatherPage />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByPlaceholderText(/enter a place name/i), "Mangaluru");
    await userEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/weather unavailable right now/i);
    });
  });
});
