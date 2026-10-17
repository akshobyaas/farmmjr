import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AppHeader from "./AppHeader";

describe("AppHeader", () => {
  it("renders the app logo and the given title", () => {
    render(<AppHeader title="Crop Guidance" />);
    expect(screen.getByRole("img", { name: "Smart Farming" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Crop Guidance" })).toBeInTheDocument();
  });

  it("shows the same logo regardless of which page it's on", () => {
    render(<AppHeader title="Weather" />);
    expect(screen.getByRole("img", { name: "Smart Farming" })).toHaveAttribute(
      "src",
      expect.stringContaining("logo"),
    );
  });

  it("always applies the base app-header class, with an optional extra class appended", () => {
    const { container, rerender } = render(<AppHeader title="Weather" className="weather-header" />);
    const header = container.querySelector("header");
    expect(header).toHaveClass("app-header", "weather-header");

    rerender(<AppHeader title="Weather" />);
    expect(container.querySelector("header")).toHaveClass("app-header");
  });
});
