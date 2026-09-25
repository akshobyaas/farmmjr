import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import LocatorPage from "./LocatorPage";
import * as locatorApi from "../api/locator";

vi.mock("../api/locator");

// react-leaflet needs real browser layout (container sizing, panes) that
// jsdom doesn't provide -- consistent with how ScanUploadPage.test.jsx
// stubs browser APIs jsdom lacks (URL.createObjectURL), we stub the map
// library itself here so we can verify OUR component wires it correctly
// (right center, right marker count/positions) without fighting jsdom.
vi.mock("react-leaflet", () => ({
  MapContainer: ({ center, children }) => (
    <div data-testid="map-container" data-center={JSON.stringify(center)}>
      {children}
    </div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  Marker: ({ position, children }) => (
    <div data-testid="marker" data-position={JSON.stringify(position)}>
      {children}
    </div>
  ),
  Popup: ({ children }) => <div data-testid="popup">{children}</div>,
}));

const mockOrigin = { lat: 12.87, lon: 74.88 };
const mockResults = [
  { id: 1, name: "Ganesh Agro Centre", category: "Agricultural Supply Shop", lat: 12.88, lon: 74.89, distance_km: 1.2, address: "" },
  { id: 2, name: "Taluk Agriculture Office", category: "Agriculture Office", lat: 12.87, lon: 74.88, distance_km: 0.0, address: "Main Road" },
];

describe("LocatorPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("searches by a manually typed place and shows results in list view by default", async () => {
    locatorApi.fetchNearbyServices.mockResolvedValue({ origin: mockOrigin, results: mockResults });

    render(
      <MemoryRouter>
        <LocatorPage />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByPlaceholderText(/enter a place name/i), "Puttur");
    await userEvent.click(screen.getByRole("button", { name: /^search$/i }));

    await waitFor(() => {
      expect(screen.getByText("Ganesh Agro Centre")).toBeInTheDocument();
    });
    expect(screen.getByText("Taluk Agriculture Office")).toBeInTheDocument();
    expect(screen.getByText(/1.2 km away/i)).toBeInTheDocument();
    expect(locatorApi.fetchNearbyServices).toHaveBeenCalledWith({ place: "Puttur" });
    // Map isn't rendered until the Map tab is selected
    expect(screen.queryByTestId("map-container")).not.toBeInTheDocument();
  });

  it("switches to map view and renders a marker for the origin and each result", async () => {
    locatorApi.fetchNearbyServices.mockResolvedValue({ origin: mockOrigin, results: mockResults });

    render(
      <MemoryRouter>
        <LocatorPage />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByPlaceholderText(/enter a place name/i), "Puttur");
    await userEvent.click(screen.getByRole("button", { name: /^search$/i }));
    await waitFor(() => {
      expect(screen.getByText("Ganesh Agro Centre")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("tab", { name: /map/i }));

    const map = screen.getByTestId("map-container");
    expect(JSON.parse(map.dataset.center)).toEqual([12.87, 74.88]);
    // 1 origin marker + 2 result markers
    expect(screen.getAllByTestId("marker")).toHaveLength(3);
  });

  it("uses the browser's geolocation (with permission) when 'Use My Location' is clicked", async () => {
    locatorApi.fetchNearbyServices.mockResolvedValue({ origin: mockOrigin, results: mockResults });
    const getCurrentPosition = vi.fn((success) => {
      success({ coords: { latitude: 12.87, longitude: 74.88 } });
    });
    vi.stubGlobal("navigator", { ...navigator, geolocation: { getCurrentPosition } });

    render(
      <MemoryRouter>
        <LocatorPage />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole("button", { name: /use my location/i }));

    await waitFor(() => {
      expect(screen.getByText("Ganesh Agro Centre")).toBeInTheDocument();
    });
    expect(locatorApi.fetchNearbyServices).toHaveBeenCalledWith({ lat: 12.87, lon: 74.88 });
  });

  it("shows a plain-language message when location permission is denied", async () => {
    const getCurrentPosition = vi.fn((_success, error) => {
      error({ code: 1, message: "User denied Geolocation" });
    });
    vi.stubGlobal("navigator", { ...navigator, geolocation: { getCurrentPosition } });

    render(
      <MemoryRouter>
        <LocatorPage />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole("button", { name: /use my location/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/location permission denied/i);
    });
    expect(locatorApi.fetchNearbyServices).not.toHaveBeenCalled();
  });

  it("shows a clear empty-state message with no results, not a broken screen", async () => {
    locatorApi.fetchNearbyServices.mockResolvedValue({ origin: mockOrigin, results: [] });

    render(
      <MemoryRouter>
        <LocatorPage />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByPlaceholderText(/enter a place name/i), "Remote Village");
    await userEvent.click(screen.getByRole("button", { name: /^search$/i }));

    await waitFor(() => {
      expect(screen.getByText(/no agricultural services found nearby/i)).toBeInTheDocument();
    });
  });

  it("shows the server's graceful fallback message when the locator service is unavailable", async () => {
    locatorApi.fetchNearbyServices.mockRejectedValue({
      response: { status: 503, data: { detail: "Nearby services are unavailable right now. Please try again later." } },
    });

    render(
      <MemoryRouter>
        <LocatorPage />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByPlaceholderText(/enter a place name/i), "Puttur");
    await userEvent.click(screen.getByRole("button", { name: /^search$/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/nearby services are unavailable/i);
    });
  });
});
