import { renderHook, act } from "@testing-library/react";
import { vi, describe, test, expect, beforeEach } from "vitest";
import { useAdvisoryQueries } from "./useAdvisoryQueries";
import * as advisoryApi from "../api/advisory";

vi.mock("../api/advisory");

describe("useAdvisoryQueries", () => {
  beforeEach(() => vi.clearAllMocks());

  test("loads queries on mount, unfiltered for a farmer", async () => {
    advisoryApi.listAdvisoryQueries.mockResolvedValue([{ id: 1, question: "Q1", status: "pending" }]);
    const { result } = renderHook(() => useAdvisoryQueries({ isAdmin: false }));
    await act(async () => {});
    expect(advisoryApi.listAdvisoryQueries).toHaveBeenCalledWith(undefined);
    expect(result.current.queries).toEqual([{ id: 1, question: "Q1", status: "pending" }]);
    expect(result.current.loading).toBe(false);
  });

  test("an admin's default filter ('pending') is passed to the list call", async () => {
    advisoryApi.listAdvisoryQueries.mockResolvedValue([]);
    const { result } = renderHook(() => useAdvisoryQueries({ isAdmin: true }));
    await act(async () => {});
    expect(advisoryApi.listAdvisoryQueries).toHaveBeenCalledWith("pending");
    expect(result.current.filter).toBe("pending");
  });

  test("switching an admin's filter to 'all' omits the status param and reloads", async () => {
    advisoryApi.listAdvisoryQueries.mockResolvedValue([]);
    const { result } = renderHook(() => useAdvisoryQueries({ isAdmin: true }));
    await act(async () => {});
    act(() => result.current.setFilter("all"));
    await act(async () => {});
    expect(advisoryApi.listAdvisoryQueries).toHaveBeenLastCalledWith(undefined);
  });

  test("sets error on a failed load", async () => {
    advisoryApi.listAdvisoryQueries.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useAdvisoryQueries({ isAdmin: false }));
    await act(async () => {});
    expect(result.current.error).toBe(true);
  });

  test("initialPrefill/initialScanId seed the question and pending scan id", async () => {
    advisoryApi.listAdvisoryQueries.mockResolvedValue([]);
    const { result } = renderHook(() =>
      useAdvisoryQueries({ isAdmin: false, initialPrefill: "Why are my leaves yellow?", initialScanId: 7 })
    );
    await act(async () => {});
    expect(result.current.question).toBe("Why are my leaves yellow?");
  });

  test("handleAsk submits the question with the pending scan id, then clears both", async () => {
    advisoryApi.listAdvisoryQueries.mockResolvedValue([]);
    advisoryApi.createAdvisoryQuery.mockResolvedValue({ id: 2 });
    const { result } = renderHook(() =>
      useAdvisoryQueries({ isAdmin: false, initialPrefill: "A question", initialScanId: 5 })
    );
    await act(async () => {});
    await act(async () => {
      await result.current.handleAsk({ preventDefault: () => {} });
    });
    expect(advisoryApi.createAdvisoryQuery).toHaveBeenCalledWith("A question", 5);
    expect(result.current.question).toBe("");
    expect(result.current.formSuccess).toBe(true);
  });

  test("handleAsk sets formError on failure and does not clear the question", async () => {
    advisoryApi.listAdvisoryQueries.mockResolvedValue([]);
    advisoryApi.createAdvisoryQuery.mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useAdvisoryQueries({ isAdmin: false, initialPrefill: "Keep me" }));
    await act(async () => {});
    await act(async () => {
      await result.current.handleAsk({ preventDefault: () => {} });
    });
    expect(result.current.formError).toBe(true);
    expect(result.current.question).toBe("Keep me");
  });

  test("handleAnswer submits the draft and clears it on success", async () => {
    advisoryApi.listAdvisoryQueries.mockResolvedValue([]);
    advisoryApi.answerAdvisoryQuery.mockResolvedValue({ id: 3 });
    const { result } = renderHook(() => useAdvisoryQueries({ isAdmin: true }));
    await act(async () => {});
    act(() => result.current.setDrafts({ 3: "Here's the answer" }));
    await act(async () => {
      await result.current.handleAnswer(3);
    });
    expect(advisoryApi.answerAdvisoryQuery).toHaveBeenCalledWith(3, "Here's the answer");
    expect(result.current.drafts[3]).toBe("");
  });

  test("handleAnswer sets answerError on failure", async () => {
    advisoryApi.listAdvisoryQueries.mockResolvedValue([]);
    advisoryApi.answerAdvisoryQuery.mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useAdvisoryQueries({ isAdmin: true }));
    await act(async () => {});
    act(() => result.current.setDrafts({ 3: "An answer" }));
    await act(async () => {
      await result.current.handleAnswer(3);
    });
    expect(result.current.answerError).toBe(true);
  });
});
