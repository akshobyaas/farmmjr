import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ScanUploadPage from "./ScanUploadPage";
import * as scansApi from "../api/scans";

vi.mock("../api/scans");

// jsdom doesn't implement object URLs — stub them so the preview logic
// (URL.createObjectURL / revokeObjectURL) has something to call.
beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => "blob:mock-preview-url");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeImageFile(name = "leaf.jpg", size = 1024, type = "image/jpeg") {
  const file = new File([new Uint8Array(size)], name, { type });
  return file;
}

async function selectFile(file) {
  const input = document.getElementById("scan-image");
  await userEvent.upload(input, file);
}

describe("ScanUploadPage", () => {
  it("offers a direct camera capture option alongside the gallery picker", async () => {
    render(
      <MemoryRouter>
        <ScanUploadPage />
      </MemoryRouter>
    );

    // capture="environment" is what makes this input open the camera
    // directly on a phone, instead of the ambiguous "choose a file"
    // chooser the existing #scan-image gallery input shows.
    const cameraInput = document.getElementById("scan-image-camera");
    expect(cameraInput).toHaveAttribute("capture", "environment");
    expect(cameraInput).toHaveAttribute("accept", "image/*");

    await userEvent.upload(cameraInput, makeImageFile());

    await waitFor(() => {
      expect(screen.getByAltText(/selected crop preview/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /upload photo/i })).not.toBeDisabled();
  });

  it("shows a preview and enables upload once a photo is chosen", async () => {
    render(
      <MemoryRouter>
        <ScanUploadPage />
      </MemoryRouter>
    );

    const uploadButton = screen.getByRole("button", { name: /upload photo/i });
    expect(uploadButton).toBeDisabled();

    await selectFile(makeImageFile());

    await waitFor(() => {
      expect(screen.getByAltText(/selected crop preview/i)).toBeInTheDocument();
    });
    expect(uploadButton).not.toBeDisabled();
  });

  it("uploads the chosen file and shows the placeholder processing message", async () => {
    scansApi.uploadScan.mockResolvedValue({
      message: "Image uploaded successfully. Processing not yet connected — disease detection arrives in a later phase.",
      scan: { id: 1, image: "http://localhost:8000/media/scans/2026/09/abc123.jpg" },
    });

    render(
      <MemoryRouter>
        <ScanUploadPage />
      </MemoryRouter>
    );

    const file = makeImageFile();
    await selectFile(file);
    await userEvent.click(screen.getByRole("button", { name: /upload photo/i }));

    await waitFor(() => {
      expect(screen.getByText(/processing not yet connected/i)).toBeInTheDocument();
    });
    expect(scansApi.uploadScan).toHaveBeenCalledWith(file);
  });

  it("shows the full recommendation (symptoms, prevention, treatment) when a real prediction comes back", async () => {
    scansApi.uploadScan.mockResolvedValue({
      message: "Prediction: Brown Spot (Rice) — 84.8% confidence.",
      scan: {
        id: 1,
        image: "http://localhost:8000/media/scans/2026/09/abc123.jpg",
        confidence: 0.848,
        predicted_disease: {
          id: 6,
          name: "Brown Spot",
          crop_name: "Rice",
          symptoms: "Circular to oval brown spots with a yellow halo and gray centers on leaves and grains",
          prevention: "Use resistant varieties, treat seeds with hot water before sowing",
          treatment_info: "Fungicide sprays such as propiconazole or azoxystrobin",
        },
      },
    });

    render(
      <MemoryRouter>
        <ScanUploadPage />
      </MemoryRouter>
    );

    await selectFile(makeImageFile());
    await userEvent.click(screen.getByRole("button", { name: /upload photo/i }));

    await waitFor(() => {
      expect(screen.getByText("Brown Spot — Rice")).toBeInTheDocument();
    });
    expect(screen.getByText(/Confidence: 84\.8%/)).toBeInTheDocument();
    expect(screen.getByText(/circular to oval brown spots/i)).toBeInTheDocument();
    expect(screen.getByText(/resistant varieties/i)).toBeInTheDocument();
    expect(screen.getByText(/propiconazole/i)).toBeInTheDocument();
  });

  it("nudges the farmer to Ask an Expert when the prediction confidence is low", async () => {
    scansApi.uploadScan.mockResolvedValue({
      message: "Prediction: Blast (Rice) — 38.4% confidence.",
      scan: {
        id: 2,
        image: "http://localhost:8000/media/scans/2026/09/def456.jpg",
        confidence: 0.384,
        predicted_disease: { id: 7, name: "Blast", crop_name: "Rice" },
      },
    });

    render(
      <MemoryRouter>
        <ScanUploadPage />
      </MemoryRouter>
    );

    await selectFile(makeImageFile());
    await userEvent.click(screen.getByRole("button", { name: /upload photo/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/not very sure/i);
    });
    expect(screen.getByRole("link", { name: /ask expert/i })).toBeInTheDocument();
  });

  it("does not show the low-confidence nudge for a confident prediction", async () => {
    scansApi.uploadScan.mockResolvedValue({
      message: "Prediction: Brown Spot (Rice) — 84.8% confidence.",
      scan: {
        id: 1,
        image: "http://localhost:8000/media/scans/2026/09/abc123.jpg",
        confidence: 0.848,
        predicted_disease: { id: 6, name: "Brown Spot", crop_name: "Rice" },
      },
    });

    render(
      <MemoryRouter>
        <ScanUploadPage />
      </MemoryRouter>
    );

    await selectFile(makeImageFile());
    await userEvent.click(screen.getByRole("button", { name: /upload photo/i }));

    await waitFor(() => {
      expect(screen.getByText("Brown Spot — Rice")).toBeInTheDocument();
    });
    expect(screen.queryByRole("link", { name: /ask expert/i })).not.toBeInTheDocument();
  });

  it("shows the server's validation message for an oversized or invalid file", async () => {
    scansApi.uploadScan.mockRejectedValue({
      response: { status: 400, data: { image: ["This file is not a valid image."] } },
    });

    render(
      <MemoryRouter>
        <ScanUploadPage />
      </MemoryRouter>
    );

    await selectFile(makeImageFile("fake.jpg", 500, "image/jpeg"));
    await userEvent.click(screen.getByRole("button", { name: /upload photo/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/this file is not a valid image/i);
    });
  });

  it("rejects an oversized file client-side before ever calling the API", async () => {
    render(
      <MemoryRouter>
        <ScanUploadPage />
      </MemoryRouter>
    );

    const bigFile = makeImageFile("big.jpg", 6 * 1024 * 1024, "image/jpeg");
    await selectFile(bigFile);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/image too large/i);
    });
    expect(screen.getByRole("button", { name: /upload photo/i })).toBeDisabled();
    expect(scansApi.uploadScan).not.toHaveBeenCalled();
  });

  it("shows a plain-language error and does not crash on a network failure", async () => {
    scansApi.uploadScan.mockRejectedValue(new Error("Network Error"));

    render(
      <MemoryRouter>
        <ScanUploadPage />
      </MemoryRouter>
    );

    await selectFile(makeImageFile());
    await userEvent.click(screen.getByRole("button", { name: /upload photo/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/could not reach the server/i);
    });
  });
});
