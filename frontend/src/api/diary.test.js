import { describe, it, expect, vi, beforeEach } from "vitest";
import api from "./axios";
import { fetchDiaryEntries, saveDiaryEntry } from "./diary";

vi.mock("./axios", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

describe("diary API helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetchDiaryEntries fetches entries for a tracker", async () => {
    api.get.mockResolvedValue({ data: [{ id: 1, note: "x" }] });
    const result = await fetchDiaryEntries(5);
    expect(api.get).toHaveBeenCalledWith("crops/diary/?tracker=5");
    expect(result).toEqual([{ id: 1, note: "x" }]);
  });

  it("saveDiaryEntry posts a FormData payload with snake_case fields", async () => {
    api.post.mockResolvedValue({ data: { id: 2 } });
    await saveDiaryEntry(5, { didIrrigation: true, note: "watered", photoFile: null });
    const [url, formData] = api.post.mock.calls[0];
    expect(url).toBe("crops/diary/");
    expect(formData.get("tracker")).toBe("5");
    expect(formData.get("did_irrigation")).toBe("true");
    expect(formData.get("note")).toBe("watered");
  });

  it("saveDiaryEntry appends Task 11's six optional activity-detail fields when passed", async () => {
    api.post.mockResolvedValue({ data: { id: 4 } });
    await saveDiaryEntry(5, {
      durationMinutes: "45", quantity: "10", quantityUnit: "liters",
      productName: "Neem oil", costAmount: "250", harvestQualityNote: "Good size",
    });
    const [, formData] = api.post.mock.calls[0];
    expect(formData.get("duration_minutes")).toBe("45");
    expect(formData.get("quantity")).toBe("10");
    expect(formData.get("quantity_unit")).toBe("liters");
    expect(formData.get("product_name")).toBe("Neem oil");
    expect(formData.get("cost_amount")).toBe("250");
    expect(formData.get("harvest_quality_note")).toBe("Good size");
  });

  it("saveDiaryEntry with only a scanId sends just tracker + scan_id -- no entry_date, no activity flags", async () => {
    api.post.mockResolvedValue({ data: { id: 3 } });
    await saveDiaryEntry(5, { scanId: 42 });
    const [url, formData] = api.post.mock.calls[0];
    expect(url).toBe("crops/diary/");
    expect(formData.get("tracker")).toBe("5");
    expect(formData.get("scan_id")).toBe("42");
    // Nothing else -- in particular no did_irrigation/etc, which would
    // wipe an existing same-day entry's activities on the backend's
    // merge path, and no entry_date, which the backend ignores anyway.
    expect([...formData.keys()].sort()).toEqual(["scan_id", "tracker"]);
  });
});
