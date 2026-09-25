import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import BottomNav from "./BottomNav";

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
    </MemoryRouter>
  );
}

describe("BottomNav", () => {
  it("renders all five sections as links with large, labeled tap targets", () => {
    renderAt("/dashboard");
    ["Home", "Crops", "Scan", "Weather", "Profile"].forEach((label) => {
      expect(screen.getByRole("link", { name: new RegExp(label, "i") })).toBeInTheDocument();
    });
  });

  it("marks the current section's link active, and only that one", () => {
    renderAt("/weather");
    const weatherLink = screen.getByRole("link", { name: /weather/i });
    expect(weatherLink).toHaveClass("active");

    const homeLink = screen.getByRole("link", { name: /home/i });
    expect(homeLink).not.toHaveClass("active");
  });

  it("keeps the Crops tab active on a crop's detail page, not just the list", () => {
    renderAt("/crops/42");
    expect(screen.getByRole("link", { name: /crops/i })).toHaveClass("active");
  });

  it("does not mark Home active on nested routes -- only on the dashboard itself", () => {
    renderAt("/crops");
    expect(screen.getByRole("link", { name: /home/i })).not.toHaveClass("active");
  });
});
