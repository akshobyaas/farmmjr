import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import VideosPage from "./VideosPage";
import * as videosApi from "../api/videos";

vi.mock("../api/videos");

const mockResults = [
  {
    video_id: "abc123",
    title: "Rice Blast Disease - Identification & Treatment",
    channel_title: "ICAR Agri Extension",
    thumbnail: "https://i.ytimg.com/vi/abc123/mqdefault.jpg",
    published_at: "2024-05-01T10:00:00Z",
    url: "https://www.youtube.com/watch?v=abc123",
  },
];

function renderWithRoute(initialPath = "/videos") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/videos" element={<VideosPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("VideosPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("searches for a manually typed crop/topic and shows results linking out to YouTube", async () => {
    videosApi.searchVideos.mockResolvedValue({ query: "rice blast", results: mockResults });

    renderWithRoute();

    await userEvent.type(screen.getByPlaceholderText(/search a crop or topic/i), "rice blast");
    await userEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() => {
      expect(screen.getByText(/rice blast disease/i)).toBeInTheDocument();
    });
    expect(videosApi.searchVideos).toHaveBeenCalledWith("rice blast");
    const link = screen.getByRole("link", { name: /rice blast disease/i });
    expect(link).toHaveAttribute("href", "https://www.youtube.com/watch?v=abc123");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("auto-searches when arriving with a pre-filled ?q= (from a crop's 'watch related videos' link)", async () => {
    videosApi.searchVideos.mockResolvedValue({ query: "Arecanut", results: mockResults });

    renderWithRoute("/videos?q=Arecanut");

    await waitFor(() => {
      expect(videosApi.searchVideos).toHaveBeenCalledWith("Arecanut");
    });
    await waitFor(() => {
      expect(screen.getByText(/rice blast disease/i)).toBeInTheDocument();
    });
  });

  it("shows a plain-language message for a nonsense/empty-result query without crashing", async () => {
    videosApi.searchVideos.mockResolvedValue({ query: "asdkjhaskjdh", results: [] });

    renderWithRoute();

    await userEvent.type(screen.getByPlaceholderText(/search a crop or topic/i), "asdkjhaskjdh");
    await userEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() => {
      expect(screen.getByText(/no videos found/i)).toBeInTheDocument();
    });
  });

  it("shows the server's graceful fallback message when videos are unavailable", async () => {
    videosApi.searchVideos.mockRejectedValue({
      response: { status: 503, data: { detail: "Learning videos are unavailable right now. Please try again later." } },
    });

    renderWithRoute();

    await userEvent.type(screen.getByPlaceholderText(/search a crop or topic/i), "cocoa");
    await userEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/learning videos are unavailable/i);
    });
  });

  it("shows a fallback message and does not crash on a network failure", async () => {
    videosApi.searchVideos.mockRejectedValue(new Error("Network Error"));

    renderWithRoute();

    await userEvent.type(screen.getByPlaceholderText(/search a crop or topic/i), "cocoa");
    await userEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/learning videos are unavailable/i);
    });
  });
});
