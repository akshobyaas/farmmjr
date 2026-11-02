import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import WeatherPage from "./WeatherPage";
import * as weatherApi from "../api/weather";
import { recentLocationsStorage } from "../hooks/recentLocationsStorage";

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

const mockForecast = {
  hourly: [
    { time: "2026-11-02T15:00:00Z", temperature: 28, icon: "04d" },
    { time: "2026-11-02T18:00:00Z", temperature: 25, icon: "10d" },
  ],
  daily: [
    { date: "2026-11-02", temp_min: 24, temp_max: 30, icon: "04d", description: "broken clouds" },
    { date: "2026-11-03", temp_min: 22, temp_max: 29, icon: "01d", description: "clear sky" },
  ],
};

describe("WeatherPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
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

  it("shows an hourly strip and a multi-day forecast list when the forecast loads", async () => {
    weatherApi.fetchWeather.mockResolvedValue(mockWeather);
    weatherApi.fetchForecast.mockResolvedValue(mockForecast);

    render(
      <MemoryRouter>
        <WeatherPage />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByPlaceholderText(/enter a place name/i), "Mangaluru");
    await userEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() => {
      expect(screen.getByText(/today/i)).toBeInTheDocument();
    });
    // Two hourly chips, each showing its temperature.
    expect(screen.getByText("28°")).toBeInTheDocument();
    expect(screen.getByText("25°")).toBeInTheDocument();
    // Two daily rows, each showing its high/low.
    expect(screen.getByText(/5-day forecast/i)).toBeInTheDocument();
    expect(screen.getByText("30°")).toBeInTheDocument();
    expect(screen.getByText("24°")).toBeInTheDocument();
    expect(screen.getByText("29°")).toBeInTheDocument();
    expect(screen.getByText("22°")).toBeInTheDocument();
  });

  it("highlights the soonest hourly slot as the current hour", async () => {
    weatherApi.fetchWeather.mockResolvedValue(mockWeather);
    weatherApi.fetchForecast.mockResolvedValue(mockForecast);

    render(
      <MemoryRouter>
        <WeatherPage />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByPlaceholderText(/enter a place name/i), "Mangaluru");
    await userEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() => {
      expect(screen.getByText("28°")).toBeInTheDocument();
    });
    // The backend already orders hourly entries chronologically, so the
    // first slot is the soonest -- it alone gets the "current hour" marker.
    expect(screen.getByText("28°").closest("[data-current-hour]")).toHaveAttribute("data-current-hour", "true");
    expect(screen.getByText("25°").closest("[data-current-hour]")).toHaveAttribute("data-current-hour", "false");
  });

  it("does not render the hourly/daily sections when no forecast is available", async () => {
    weatherApi.fetchWeather.mockResolvedValue(mockWeather);
    weatherApi.fetchForecast.mockRejectedValue(new Error("forecast down"));

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
    expect(screen.queryByText(/today/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/5-day forecast/i)).not.toBeInTheDocument();
  });

  it("shows an introductory heading before a search, and hides it once weather loads", async () => {
    weatherApi.fetchWeather.mockResolvedValue(mockWeather);

    render(
      <MemoryRouter>
        <WeatherPage />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: /weather for your farm/i })).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText(/enter a place name/i), "Mangaluru");
    await userEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() => {
      expect(screen.getByText("Mangaluru, IN")).toBeInTheDocument();
    });
    expect(screen.queryByRole("heading", { name: /weather for your farm/i })).not.toBeInTheDocument();
  });

  it("shows a search icon inside the city field", () => {
    const { container } = render(
      <MemoryRouter>
        <WeatherPage />
      </MemoryRouter>
    );
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("does not show a recent-searches row when there are no recent locations", () => {
    render(
      <MemoryRouter>
        <WeatherPage />
      </MemoryRouter>
    );
    expect(screen.queryByText(/recent searches/i)).not.toBeInTheDocument();
  });

  it("shows recent-location chips from a prior search, and clicking one re-runs the search", async () => {
    recentLocationsStorage.add("Mysuru");
    weatherApi.fetchWeather.mockResolvedValue({ ...mockWeather, location: "Mysuru, IN" });

    render(
      <MemoryRouter>
        <WeatherPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/recent searches/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Mysuru" }));

    await waitFor(() => {
      expect(screen.getByText("Mysuru, IN")).toBeInTheDocument();
    });
    expect(weatherApi.fetchWeather).toHaveBeenCalledWith({ city: "Mysuru" });
  });

  it("shows a clear button once text is typed in the city field, and clicking it empties the field", async () => {
    render(
      <MemoryRouter>
        <WeatherPage />
      </MemoryRouter>
    );

    expect(screen.queryByRole("button", { name: /clear/i })).not.toBeInTheDocument();

    const input = screen.getByPlaceholderText(/enter a place name/i);
    await userEvent.type(input, "Mangaluru");

    const clearButton = screen.getByRole("button", { name: /clear/i });
    await userEvent.click(clearButton);

    expect(input).toHaveValue("");
    expect(screen.queryByRole("button", { name: /clear/i })).not.toBeInTheDocument();
  });
});
