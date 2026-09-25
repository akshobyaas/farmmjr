import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AppHeader from "./AppHeader";

describe("AppHeader", () => {
  it("renders the icon and title", () => {
    render(<AppHeader icon="🌾" title="Crop Guidance" />);
    expect(screen.getByText("🌾")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Crop Guidance" })).toBeInTheDocument();
  });

  it("always applies the base app-header class, with an optional extra class appended", () => {
    const { container, rerender } = render(<AppHeader icon="🌦️" title="Weather" className="weather-header" />);
    const header = container.querySelector("header");
    expect(header).toHaveClass("app-header", "weather-header");

    rerender(<AppHeader icon="🌦️" title="Weather" />);
    expect(container.querySelector("header")).toHaveClass("app-header");
  });
});
