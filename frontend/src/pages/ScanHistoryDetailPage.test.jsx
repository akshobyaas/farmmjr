import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ScanHistoryDetailPage from "./ScanHistoryDetailPage";
import * as scansApi from "../api/scans";
import * as cropsApi from "../api/crops";
import * as cropTrackerApi from "../api/cropTracker";
import * as diaryApi from "../api/diary";

vi.mock("../api/scans");
vi.mock("../api/crops");
vi.mock("../api/cropTracker");
vi.mock("../api/diary");

const mockScan = {
  id: 5,
  image: "http://localhost:8000/media/scans/2026/09/a.jpg",
  predicted_disease: {
    id: 6,
    name: "Brown Spot",
    crop_name: "Rice",
    symptoms: "Small brown lesions on leaves.",
    prevention: "Use resistant varieties and hot-water seed treatment.",
    treatment_info: "Apply propiconazole or azoxystrobin fungicides.",
  },
  confidence: 0.848,
  created_at: "2026-09-10T10:00:00Z",
};

function renderWithRoute(id = "5") {
  return render(
    <MemoryRouter initialEntries={[`/scan/history/${id}`]}>
      <Routes>
        <Route path="/scan/history/:id" element={<ScanHistoryDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ScanHistoryDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the full recommendation (disease, crop, confidence, symptoms, prevention, treatment)", async () => {
    scansApi.fetchScanDetail.mockResolvedValue(mockScan);
    renderWithRoute("5");

    await waitFor(() => {
      expect(screen.getByText(/Brown Spot — Rice/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Confidence: 84\.8%/)).toBeInTheDocument();
    expect(screen.getByText(/small brown lesions/i)).toBeInTheDocument();
    expect(screen.getByText(/hot-water seed treatment/i)).toBeInTheDocument();
    expect(screen.getByText(/propiconazole/i)).toBeInTheDocument();
    expect(scansApi.fetchScanDetail).toHaveBeenCalledWith("5");
  });

  it("nudges the farmer to Ask an Expert when the prediction confidence is low", async () => {
    scansApi.fetchScanDetail.mockResolvedValue({ ...mockScan, confidence: 0.384 });
    renderWithRoute("5");

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/not very sure/i);
    });
    expect(screen.getByRole("link", { name: /ask expert/i })).toBeInTheDocument();
  });

  it("does not show the low-confidence nudge for a confident prediction", async () => {
    scansApi.fetchScanDetail.mockResolvedValue(mockScan); // confidence: 0.848
    renderWithRoute("5");

    await waitFor(() => {
      expect(screen.getByText(/Brown Spot — Rice/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("link", { name: /ask expert/i })).not.toBeInTheDocument();
  });

  it("shows a fallback message when a scan has no prediction", async () => {
    scansApi.fetchScanDetail.mockResolvedValue({ ...mockScan, predicted_disease: null, confidence: null });
    renderWithRoute("5");

    await waitFor(() => {
      expect(screen.getByText(/prediction unavailable for this scan/i)).toBeInTheDocument();
    });
  });

  it("shows a Save to Diary button for an active tracker's crop, and names the scan's OWN date in the confirmation (not today's)", async () => {
    scansApi.fetchScanDetail.mockResolvedValue(mockScan); // created_at: 2026-09-10
    cropsApi.fetchCrops.mockResolvedValue([{ id: 3, name: "Rice" }]);
    cropTrackerApi.fetchTrackers.mockResolvedValue([{ id: 9, crop: 3, is_active: true }]);
    diaryApi.saveDiaryEntry.mockResolvedValue({ id: 101 });

    renderWithRoute("5");

    const saveButton = await screen.findByRole("button", { name: /save to diary/i });
    await userEvent.click(saveButton);

    await waitFor(() => {
      // Same call shape as ScanUploadPage -- still today's entry, just
      // a different crop-side button triggering it.
      expect(diaryApi.saveDiaryEntry).toHaveBeenCalledWith(9, { scanId: 5 });
    });

    // The confirmation must name the scan's OWN date (Sep 10, 2026), never
    // implying the diary entry itself is backdated -- the backend always
    // writes it under today regardless of this scan's date.
    await waitFor(() => {
      expect(screen.getByText(/Sep 10, 2026/)).toBeInTheDocument();
    });
    expect(screen.getByText(/today/i)).toBeInTheDocument();
  });

  it("does not show a Save to Diary button when there is no active tracker for the scan's crop", async () => {
    scansApi.fetchScanDetail.mockResolvedValue(mockScan);
    cropsApi.fetchCrops.mockResolvedValue([{ id: 3, name: "Rice" }]);
    cropTrackerApi.fetchTrackers.mockResolvedValue([]);

    renderWithRoute("5");

    await waitFor(() => {
      expect(screen.getByText(/Brown Spot — Rice/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /save to diary/i })).not.toBeInTheDocument();
  });

  it("does not show a Save to Diary button when the matching tracker is inactive (is_active: false)", async () => {
    scansApi.fetchScanDetail.mockResolvedValue(mockScan);
    cropsApi.fetchCrops.mockResolvedValue([{ id: 3, name: "Rice" }]);
    cropTrackerApi.fetchTrackers.mockResolvedValue([{ id: 9, crop: 3, is_active: false }]);

    renderWithRoute("5");

    await waitFor(() => {
      expect(screen.getByText(/Brown Spot — Rice/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /save to diary/i })).not.toBeInTheDocument();
  });

  it("treats a 404 as 'not found' without leaking whose scan it is", async () => {
    scansApi.fetchScanDetail.mockRejectedValue({ response: { status: 404 } });
    renderWithRoute("999");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/could not be found/i);
    });
  });

  it("treats a 403 (another farmer's scan) the same as a 404", async () => {
    scansApi.fetchScanDetail.mockRejectedValue({ response: { status: 403 } });
    renderWithRoute("6");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/could not be found/i);
    });
  });

  it("shows a generic error for other failures", async () => {
    scansApi.fetchScanDetail.mockRejectedValue(new Error("Network Error"));
    renderWithRoute("5");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/could not load this scan/i);
    });
  });
});
