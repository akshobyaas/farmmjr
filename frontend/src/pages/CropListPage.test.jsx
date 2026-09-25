import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import CropListPage from "./CropListPage";
import * as cropsApi from "../api/crops";

vi.mock("../api/crops");

const mockCrops = [
  { id: 1, name: "Tomato", soil_type: "Loamy", climate: "Warm" },
  { id: 2, name: "Potato", soil_type: "Sandy loam", climate: "Cool" },
];

describe("CropListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads and displays crops on mount", async () => {
    cropsApi.fetchCrops.mockResolvedValue(mockCrops);

    render(
      <MemoryRouter>
        <CropListPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Tomato")).toBeInTheDocument();
      expect(screen.getByText("Potato")).toBeInTheDocument();
    });
    expect(cropsApi.fetchCrops).toHaveBeenCalledWith("");
  });

  it("re-fetches with the search term when the search form is submitted", async () => {
    cropsApi.fetchCrops.mockResolvedValue(mockCrops);

    render(
      <MemoryRouter>
        <CropListPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(cropsApi.fetchCrops).toHaveBeenCalledWith(""));

    cropsApi.fetchCrops.mockResolvedValue([mockCrops[0]]);
    await userEvent.type(screen.getByPlaceholderText(/search crops/i), "Tomato");
    await userEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() => {
      expect(cropsApi.fetchCrops).toHaveBeenCalledWith("Tomato");
    });
  });

  it("shows an empty state when no crops match", async () => {
    cropsApi.fetchCrops.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <CropListPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/no crops found/i)).toBeInTheDocument();
    });
  });

  it("shows a plain-language error if loading fails", async () => {
    cropsApi.fetchCrops.mockRejectedValue(new Error("network error"));

    render(
      <MemoryRouter>
        <CropListPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/could not load crops/i);
    });
  });
});
