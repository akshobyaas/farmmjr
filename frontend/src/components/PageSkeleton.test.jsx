import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PageSkeleton from "./PageSkeleton";

// Modern-UI polish pass: every full-page loading state used to be bare
// "Loading…" text (.loading-screen), which reads as unfinished/dated next
// to apps that show a shimmering placeholder shape instead. PageSkeleton
// is the one reusable replacement for all 4 of those call sites
// (ProfilePage, ScanHistoryDetailPage, CropDetailPage, ProtectedRoute) --
// same accessible semantics (role="status" so assistive tech announces
// it, same as the plain text it replaces), different visual treatment.
describe("PageSkeleton", () => {
  it("renders an accessible loading status", () => {
    render(<PageSkeleton />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("falls back to a generic loading label when none is given", () => {
    render(<PageSkeleton />);
    expect(screen.getByRole("status")).toHaveAccessibleName(/loading/i);
  });

  it("accepts a custom accessible label, for a page-specific loading message", () => {
    render(<PageSkeleton label="Checking your session…" />);
    expect(screen.getByRole("status")).toHaveAccessibleName("Checking your session…");
  });

  it("uses the full-viewport .loading-screen wrapper by default (for a page with no header/nav shell yet)", () => {
    render(<PageSkeleton />);
    expect(screen.getByRole("status")).toHaveClass("loading-screen");
  });

  it("renders without the full-viewport wrapper when inline, for a page whose header/nav already render (ProfilePage)", () => {
    render(<PageSkeleton inline />);
    const status = screen.getByRole("status");
    expect(status).not.toHaveClass("loading-screen");
    expect(status).toHaveClass("skeleton-inline");
  });
});
