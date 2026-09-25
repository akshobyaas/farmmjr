import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ScanHistoryDetailPage from "./ScanHistoryDetailPage";
import * as scansApi from "../api/scans";

vi.mock("../api/scans");

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

  it("shows a fallback message when a scan has no prediction", async () => {
    scansApi.fetchScanDetail.mockResolvedValue({ ...mockScan, predicted_disease: null, confidence: null });
    renderWithRoute("5");

    await waitFor(() => {
      expect(screen.getByText(/prediction unavailable for this scan/i)).toBeInTheDocument();
    });
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
