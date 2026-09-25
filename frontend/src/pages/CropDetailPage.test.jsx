import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import CropDetailPage from "./CropDetailPage";
import * as cropsApi from "../api/crops";

vi.mock("../api/crops");

const mockCropDetail = {
  id: 1,
  name: "Tomato",
  soil_type: "Well-drained loamy soil",
  climate: "Warm, 20-27°C",
  planting_method: "Direct seeding or transplanting",
  lifecycle_stages: [
    { stage: "Germination", duration_description: "5-10 days", details: "", order: 1 },
  ],
  fertilizer_schedules: [
    { growth_stage: "Seedling", fertilizer_guidance: "Low nitrogen", irrigation_guidance: "Light watering", order: 1 },
  ],
  organic_methods: [
    { id: 1, name: "Vermicompost", materials: "Kitchen waste", steps: "Layer and wait" },
  ],
  intercropped_with: [
    { id: 2, name: "Black Pepper" },
    { id: 3, name: "Cocoa" },
  ],
};

function renderWithRoute(id = "1") {
  return render(
    <MemoryRouter initialEntries={[`/crops/${id}`]}>
      <Routes>
        <Route path="/crops/:id" element={<CropDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("CropDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads and displays full crop detail including nested lifecycle/fertilizer/organic data", async () => {
    cropsApi.fetchCropDetail.mockResolvedValue(mockCropDetail);
    renderWithRoute("1");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Tomato" })).toBeInTheDocument();
    });
    expect(screen.getByText(/germination/i)).toBeInTheDocument();
    expect(screen.getByText(/vermicompost/i)).toBeInTheDocument();
    expect(cropsApi.fetchCropDetail).toHaveBeenCalledWith("1");

    // Phase 14 — links out to the Learning Videos page, pre-filled with
    // this crop's name so the search runs automatically over there.
    const videoLink = screen.getByRole("link", { name: /watch related videos about tomato/i });
    expect(videoLink).toHaveAttribute("href", "/videos?q=Tomato");
  });

  it("shows companion crops as links when intercropped_with is present", async () => {
    cropsApi.fetchCropDetail.mockResolvedValue(mockCropDetail);
    renderWithRoute("1");

    await waitFor(() => {
      expect(screen.getByText("Grown With")).toBeInTheDocument();
    });
    const pepperLink = screen.getByRole("link", { name: "Black Pepper" });
    expect(pepperLink).toHaveAttribute("href", "/crops/2");
    expect(screen.getByRole("link", { name: "Cocoa" })).toHaveAttribute("href", "/crops/3");
  });

  it("shows a specific message for a 404 (crop not found)", async () => {
    cropsApi.fetchCropDetail.mockRejectedValue({ response: { status: 404 } });
    renderWithRoute("99999");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/could not be found/i);
    });
  });

  it("shows a generic error for non-404 failures", async () => {
    cropsApi.fetchCropDetail.mockRejectedValue({ response: { status: 500 } });
    renderWithRoute("1");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/could not load this crop/i);
    });
  });
});
