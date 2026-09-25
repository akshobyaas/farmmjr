import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import AdvisoryPage from "./AdvisoryPage";
import { useAuth } from "../context/AuthContext";
import * as advisoryApi from "../api/advisory";

vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));
vi.mock("../api/advisory");

const farmerUser = { id: 1, username: "farmer_ravi", role: "farmer" };
const adminUser = { id: 9, username: "admin_expert", role: "admin" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AdvisoryPage — farmer view", () => {
  it("lets a farmer submit a question and shows a success message", async () => {
    useAuth.mockReturnValue({ user: farmerUser });
    advisoryApi.listAdvisoryQueries.mockResolvedValue([]);
    advisoryApi.createAdvisoryQuery.mockResolvedValue({
      id: 1,
      question: "How do I treat pollu disease?",
      status: "pending",
      created_at: "2026-09-24T10:00:00Z",
    });

    render(
      <MemoryRouter>
        <AdvisoryPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(advisoryApi.listAdvisoryQueries).toHaveBeenCalled());

    await userEvent.type(screen.getByPlaceholderText(/ask our expert/i), "How do I treat pollu disease?");
    await userEvent.click(screen.getByRole("button", { name: /ask expert/i }));

    await waitFor(() => {
      expect(screen.getByText(/question was sent to our expert/i)).toBeInTheDocument();
    });
    expect(advisoryApi.createAdvisoryQuery).toHaveBeenCalledWith("How do I treat pollu disease?");
  });

  it("shows a farmer's own past queries, with the response only for answered ones", async () => {
    useAuth.mockReturnValue({ user: farmerUser });
    advisoryApi.listAdvisoryQueries.mockResolvedValue([
      {
        id: 1,
        farmer_username: "farmer_ravi",
        question: "Pending question here",
        response: "",
        status: "pending",
      },
      {
        id: 2,
        farmer_username: "farmer_ravi",
        question: "Answered question here",
        response: "Here is the expert's answer.",
        status: "answered",
      },
    ]);

    render(
      <MemoryRouter>
        <AdvisoryPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Pending question here")).toBeInTheDocument();
    });
    expect(screen.getByText("Answered question here")).toBeInTheDocument();
    expect(screen.getByText("Here is the expert's answer.")).toBeInTheDocument();
  });

  it("does not show the admin answer controls to a farmer", async () => {
    useAuth.mockReturnValue({ user: farmerUser });
    advisoryApi.listAdvisoryQueries.mockResolvedValue([
      { id: 1, farmer_username: "farmer_ravi", question: "A question", response: "", status: "pending" },
    ]);

    render(
      <MemoryRouter>
        <AdvisoryPage />
      </MemoryRouter>
    );

    await waitFor(() => screen.getByText("A question"));
    expect(screen.queryByPlaceholderText(/write your answer/i)).not.toBeInTheDocument();
  });

  it("disables Ask Expert for empty/whitespace input and never calls the API", async () => {
    useAuth.mockReturnValue({ user: farmerUser });
    advisoryApi.listAdvisoryQueries.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <AdvisoryPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(advisoryApi.listAdvisoryQueries).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /ask expert/i })).toBeDisabled();

    await userEvent.type(screen.getByPlaceholderText(/ask our expert/i), "   ");
    expect(screen.getByRole("button", { name: /ask expert/i })).toBeDisabled();
    expect(advisoryApi.createAdvisoryQuery).not.toHaveBeenCalled();
  });
});

describe("AdvisoryPage — admin view", () => {
  it("lists queries for the admin and lets them answer a pending one", async () => {
    useAuth.mockReturnValue({ user: adminUser });
    advisoryApi.listAdvisoryQueries.mockResolvedValue([
      { id: 5, farmer_username: "farmer_asha", question: "When to harvest pepper?", response: "", status: "pending" },
    ]);
    advisoryApi.answerAdvisoryQuery.mockResolvedValue({
      id: 5,
      response: "Harvest when berries turn dark green to red.",
      status: "answered",
      answered_at: "2026-09-24T10:05:00Z",
    });

    render(
      <MemoryRouter>
        <AdvisoryPage />
      </MemoryRouter>
    );

    await waitFor(() => screen.getByText("When to harvest pepper?"));
    expect(screen.getByText("farmer_asha")).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText(/write your answer/i), "Harvest when berries turn dark green to red.");
    await userEvent.click(screen.getByRole("button", { name: /send answer/i }));

    await waitFor(() => {
      expect(advisoryApi.answerAdvisoryQuery).toHaveBeenCalledWith(5, "Harvest when berries turn dark green to red.");
    });
  });

  it("does not show the ask-a-question form to an admin", async () => {
    useAuth.mockReturnValue({ user: adminUser });
    advisoryApi.listAdvisoryQueries.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <AdvisoryPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(advisoryApi.listAdvisoryQueries).toHaveBeenCalled());
    expect(screen.queryByPlaceholderText(/ask our expert/i)).not.toBeInTheDocument();
  });

  it("switches between the Pending and All filter tabs", async () => {
    useAuth.mockReturnValue({ user: adminUser });
    advisoryApi.listAdvisoryQueries.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <AdvisoryPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(advisoryApi.listAdvisoryQueries).toHaveBeenCalledWith("pending"));

    await userEvent.click(screen.getByRole("button", { name: /^all$/i }));

    await waitFor(() => {
      expect(advisoryApi.listAdvisoryQueries).toHaveBeenLastCalledWith(undefined);
    });
  });

  it("treats SQL-like or script-tag question text as plain text, not something that breaks the UI", async () => {
    useAuth.mockReturnValue({ user: adminUser });
    advisoryApi.listAdvisoryQueries.mockResolvedValue([
      {
        id: 7,
        farmer_username: "farmer_ravi",
        question: "<script>alert(1)</script>",
        response: "",
        status: "pending",
      },
    ]);

    render(
      <MemoryRouter>
        <AdvisoryPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
    });
    expect(document.querySelector("script[data-injected]")).not.toBeInTheDocument();
  });

  it("shows a plain-language error and does not crash if loading queries fails", async () => {
    useAuth.mockReturnValue({ user: adminUser });
    advisoryApi.listAdvisoryQueries.mockRejectedValue(new Error("Network Error"));

    render(
      <MemoryRouter>
        <AdvisoryPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/could not load advisory queries/i)).toBeInTheDocument();
    });
  });
});
