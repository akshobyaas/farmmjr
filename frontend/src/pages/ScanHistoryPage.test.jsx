import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ScanHistoryPage from "./ScanHistoryPage";
import * as scansApi from "../api/scans";

vi.mock("../api/scans");

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
});
