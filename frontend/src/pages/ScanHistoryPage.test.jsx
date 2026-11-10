import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ScanHistoryPage from "./ScanHistoryPage";
import * as scansApi from "../api/scans";

vi.mock("../api/scans");

// Task 12 fix round 1 -- same renderWithRoute(initialPath) pattern as
// VideosPage.test.jsx, needed here so useSearchParams() inside the page
// actually sees a ?crop= query string from the URL.
function renderWithRoute(initialPath = "/scan/history") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/scan/history" element={<ScanHistoryPage />} />
      </Routes>
    </MemoryRouter>
  );
}

const scan1 = {
  id: 5,
  image: "http://localhost:8000/media/scans/2026/09/a.jpg",
  disease_name: "Brown Spot",
  crop_name: "Rice",
  confidence: 0.848,
  created_at: "2026-09-10T10:00:00Z",
};

const scan2 = {
  id: 4,
  image: "http://localhost:8000/media/scans/2026/09/b.jpg",
  disease_name: null,
  crop_name: null,
  confidence: null,
  created_at: "2026-09-05T10:00:00Z",
};

describe("ScanHistoryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the empty state with a link to scan when there is no history", async () => {
    scansApi.fetchScanHistory.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });

    render(
      <MemoryRouter>
        <ScanHistoryPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/haven't scanned any crops yet/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /scan one now/i })).toHaveAttribute("href", "/scan");
  });

  it("lists scans newest-first with disease name, crop, confidence and date, linking to the detail page", async () => {
    scansApi.fetchScanHistory.mockResolvedValue({
      count: 2,
      next: null,
      previous: null,
      results: [scan1, scan2],
    });

    render(
      <MemoryRouter>
        <ScanHistoryPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/2 scans total/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Brown Spot — Rice/i)).toBeInTheDocument();
    expect(screen.getByText(/84\.8%/)).toBeInTheDocument();
    expect(screen.getByText(/prediction unavailable/i)).toBeInTheDocument();

    const links = screen.getAllByRole("link").filter((a) => a.getAttribute("href")?.startsWith("/scan/history/"));
    expect(links.map((a) => a.getAttribute("href"))).toEqual(
      expect.arrayContaining(["/scan/history/5", "/scan/history/4"])
    );
  });

  it("pages forward and back using the server's next/previous cursors", async () => {
    scansApi.fetchScanHistory.mockResolvedValueOnce({
      count: 11,
      next: "http://localhost:8000/api/scans/history/?page=2",
      previous: null,
      results: [scan1],
    });

    render(
      <MemoryRouter>
        <ScanHistoryPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/page 1/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /next/i })).not.toBeDisabled();

    scansApi.fetchScanHistory.mockResolvedValueOnce({
      count: 11,
      next: null,
      previous: "http://localhost:8000/api/scans/history/?page=1",
      results: [scan2],
    });

    await userEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByText(/page 2/i)).toBeInTheDocument();
    });
    expect(scansApi.fetchScanHistory).toHaveBeenLastCalledWith(2);
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
  });

  it("shows a plain-language error on failure", async () => {
    scansApi.fetchScanHistory.mockRejectedValue(new Error("Network Error"));

    render(
      <MemoryRouter>
        <ScanHistoryPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/could not load your scan history/i);
    });
  });

  describe("crop filter from the URL (Task 12 fix round 1)", () => {
    // Regression test for the reviewed finding: CropDetailPage's "View all"
    // link navigates to /scan/history?crop=<id>, but this page used to
    // never read that param, so it silently rendered the farmer's entire
    // unfiltered history instead of the crop-filtered one.
    it("reads ?crop= from the URL and passes it through to the scan history fetch", async () => {
      scansApi.fetchScanHistory.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });

      renderWithRoute("/scan/history?crop=5");

      await waitFor(() => {
        expect(scansApi.fetchScanHistory).toHaveBeenCalled();
      });
      // useSearchParams().get("crop") naturally yields a string, not a
      // number -- asserting the real type rather than guessing.
      expect(scansApi.fetchScanHistory).toHaveBeenCalledWith(1, "5");
    });

    it("fetches the unfiltered history (no crop arg) when there is no ?crop= param", async () => {
      scansApi.fetchScanHistory.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });

      renderWithRoute("/scan/history");

      await waitFor(() => {
        expect(scansApi.fetchScanHistory).toHaveBeenCalled();
      });
      // No second argument at all here -- matching fetchScanHistory's own
      // backward-compatible default (crop undefined -> dropped from the
      // query string), same as every pre-existing call in this file.
      expect(scansApi.fetchScanHistory).toHaveBeenCalledWith(1);
    });
  });
});
