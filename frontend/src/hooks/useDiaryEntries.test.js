import { renderHook, act } from "@testing-library/react";
import { vi, describe, test, expect, beforeEach } from "vitest";
import { useDiaryEntries } from "./useDiaryEntries";
import * as diaryApi from "../api/diary";

vi.mock("../api/diary");

const TODAY = new Date().toLocaleDateString("en-CA");

describe("useDiaryEntries", () => {
  beforeEach(() => vi.clearAllMocks());

  test("does not fetch when there is no tracker yet", async () => {
    const { result } = renderHook(() => useDiaryEntries(null));
    await act(async () => {});
    expect(diaryApi.fetchDiaryEntries).not.toHaveBeenCalled();
    expect(result.current.diaryEntries).toEqual([]);
  });

  test("fetches entries once a tracker exists and pre-fills today's entry", async () => {
    diaryApi.fetchDiaryEntries.mockResolvedValue([
      { id: 1, entry_date: TODAY, did_irrigation: true, note: "watered well" },
    ]);
    // A stable tracker reference, matching how CropDetailPage actually
    // passes it (held in useCropTracker's own state, not recreated on
    // every render) -- a fresh literal here would be a new reference on
    // every re-render and re-trigger the effect in a loop.
    const trackerRef = { id: 42 };
    const { result } = renderHook(() => useDiaryEntries(trackerRef));
    await act(async () => {});
    expect(diaryApi.fetchDiaryEntries).toHaveBeenCalledWith(42);
    expect(result.current.diaryEntries).toHaveLength(1);
    expect(result.current.diaryForm.didIrrigation).toBe(true);
    expect(result.current.diaryForm.note).toBe("watered well");
  });

  test("resets to a blank form when there is no entry for today", async () => {
    diaryApi.fetchDiaryEntries.mockResolvedValue([
      { id: 1, entry_date: "2020-01-01", did_irrigation: true, note: "old" },
    ]);
    const trackerRef = { id: 42 };
    const { result } = renderHook(() => useDiaryEntries(trackerRef));
    await act(async () => {});
    expect(result.current.diaryForm.didIrrigation).toBe(false);
    expect(result.current.diaryForm.note).toBe("");
  });

  test("handleDiarySubmit saves and replaces today's entry, not appends", async () => {
    diaryApi.fetchDiaryEntries.mockResolvedValue([]);
    diaryApi.saveDiaryEntry.mockResolvedValue({ id: 2, entry_date: TODAY, note: "new note" });
    const trackerRef = { id: 42 };
    const { result } = renderHook(() => useDiaryEntries(trackerRef));
    await act(async () => {});
    act(() => result.current.setDiaryForm((f) => ({ ...f, note: "new note" })));
    await act(async () => {
      await result.current.handleDiarySubmit({ preventDefault: () => {} });
    });
    expect(diaryApi.saveDiaryEntry).toHaveBeenCalledWith(42, expect.objectContaining({ note: "new note" }));
    expect(result.current.diaryEntries).toEqual([{ id: 2, entry_date: TODAY, note: "new note" }]);
  });

  test("handleDiarySubmit surfaces the backend's field error message on failure", async () => {
    diaryApi.fetchDiaryEntries.mockResolvedValue([]);
    diaryApi.saveDiaryEntry.mockRejectedValue({ response: { data: { note: ["Too long."] } } });
    const trackerRef = { id: 42 };
    const { result } = renderHook(() => useDiaryEntries(trackerRef));
    await act(async () => {});
    await act(async () => {
      await result.current.handleDiarySubmit({ preventDefault: () => {} });
    });
    expect(result.current.diaryError).toBe("Too long.");
  });
});
