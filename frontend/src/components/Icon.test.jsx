import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import Icon from "./Icon";

// Icon.jsx renders nothing for an unrecognized `name` (a typo'd string just
// silently disappears, no console warning) -- these tests exist so a typo in
// a call site, or an icon accidentally dropped while re-syncing from
// Material Symbols, fails loudly here instead of only being noticed visually.
describe("Icon", () => {
  it("renders every icon name currently used across the app", () => {
    // Keep this list in sync with assets/icons/material-symbols/README.md's
    // mapping table -- one entry per real call site (grep `<Icon name=` if
    // ever unsure which names are still in use).
    const names = [
      "home",
      "leaf",
      "search",
      "cloudSun",
      "user",
      "history",
      "inbox",
      "chat",
      "pin",
      "play",
      "eye",
      "eyeOff",
    ];
    for (const name of names) {
      const { container } = render(<Icon name={name} />);
      const svg = container.querySelector("svg");
      expect(svg, `Icon name="${name}" should render an <svg>`).not.toBeNull();
      expect(svg.querySelector("path")).not.toBeNull();
    }
  });

  it("renders nothing for an unknown icon name, rather than throwing", () => {
    const { container } = render(<Icon name="not-a-real-icon" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("uses fill, not stroke -- Material Symbols icons are solid shapes, not open strokes", () => {
    const { container } = render(<Icon name="home" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("fill", "currentColor");
    expect(svg).not.toHaveAttribute("stroke");
  });

  it("defaults to size 22 and respects an explicit size prop", () => {
    const { container: defaultSize } = render(<Icon name="home" />);
    expect(defaultSize.querySelector("svg")).toHaveAttribute("width", "22");
    expect(defaultSize.querySelector("svg")).toHaveAttribute("height", "22");

    const { container: customSize } = render(<Icon name="home" size={32} />);
    expect(customSize.querySelector("svg")).toHaveAttribute("width", "32");
    expect(customSize.querySelector("svg")).toHaveAttribute("height", "32");
  });

  it("passes through an extra className onto the svg", () => {
    const { container } = render(<Icon name="home" className="weather-header-icon" />);
    expect(container.querySelector("svg")).toHaveClass("weather-header-icon");
  });
});
