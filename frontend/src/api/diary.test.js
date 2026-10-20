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
});
