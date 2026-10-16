import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LowConfidenceNudge, { LOW_CONFIDENCE_THRESHOLD } from "./LowConfidenceNudge";

function renderNudge(scan) {
  return render(
    <MemoryRouter>
      <LowConfidenceNudge scan={scan} />
    </MemoryRouter>
  );
}

describe("LowConfidenceNudge", () => {
  it("renders nothing when confidence is at or above the threshold", () => {
    const { container } = renderNudge({
      confidence: LOW_CONFIDENCE_THRESHOLD,
      predicted_disease: { name: "Brown Spot" },
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when confidence is missing", () => {
    const { container } = renderNudge({ predicted_disease: { name: "Brown Spot" } });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when scan itself is null/undefined", () => {
    const { container } = renderNudge(null);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the warning and an Ask Expert link when confidence is below the threshold", () => {
    renderNudge({
      id: 42,
      confidence: 0.42,
      predicted_disease: { name: "Brown Spot", crop_name: "Rice" },
    });

    expect(screen.getByRole("status")).toHaveTextContent(/not very sure/i);
    const link = screen.getByRole("link", { name: /ask expert/i });
    expect(link).toHaveAttribute("href", "/advisory");
  });

  it("links to /advisory regardless of which disease was predicted", () => {
    renderNudge({
      id: 42,
      confidence: 0.4215,
      predicted_disease: { name: "Brown Spot", crop_name: "Rice" },
    });

    // The pre-filled question text and the scan id (disease name +
    // confidence, and `scanId` -- the latter is what makes the backend
    // notify an admin/expert once submitted, see advisory/utils.py) are
    // carried as router `state` on this link, not rendered into the DOM
    // here, so neither is directly assertable from this component in
    // isolation -- covered end-to-end by AdvisoryPage.test.jsx's
    // "arrives pre-filled from a low-confidence scan nudge" and
    // "attaches the nudge's scan id..." tests, which actually navigate
    // with that state and read the resulting form/submission.
    expect(screen.getByRole("link", { name: /ask expert/i })).toHaveAttribute("href", "/advisory");
  });

  it("falls back to a generic label when there's no predicted_disease object", () => {
    renderNudge({ confidence: 0.3 });
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ask expert/i })).toBeInTheDocument();
  });
});
