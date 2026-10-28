import { describe, it, expect, vi, beforeEach } from "vitest";
import api from "./axios";
import { fetchNearbyServices } from "./locator";

vi.mock("./axios", () => ({
  default: { get: vi.fn() },
}));

describe("locator API helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Real-world bug: the shared axios instance (api/axios.js) has a global
  // 8-second timeout, meant for normal fast endpoints. The backend's
  // /locator/nearby/ view legitimately needs much longer than that in its
  // worst case -- it tries up to two Overpass mirrors, each allowed up to
  // 20 seconds (OVERPASS_REQUEST_TIMEOUT_SECONDS, itself sized to cover the
  // 15-second budget the Overpass query asks the server for), plus up to
  // 10 seconds of Nominatim geocoding when searching by place name. That's
  // up to ~50 real seconds the backend may legitimately still be working,
  // while the frontend was giving up and aborting the connection at 8s --
  // confirmed live: "Broken pipe" appeared in the backend log right after
  // its own fallback logic finally produced a response, because axios had
  // already torn down the connection. A per-call timeout override is
  // needed so this one endpoint's client-side patience matches what the
  // backend can legitimately take, instead of the fast-endpoint default.
  it("fetchNearbyServices overrides the default timeout to cover the backend's worst-case Overpass fallback latency", async () => {
    api.get.mockResolvedValue({ data: { origin: { lat: 12.9, lon: 74.85 }, results: [] } });

    await fetchNearbyServices({ lat: 12.9, lon: 74.85 });

    expect(api.get).toHaveBeenCalledWith("locator/nearby/", expect.objectContaining({ params: { lat: 12.9, lon: 74.85 } }));
    const [, config] = api.get.mock.calls[0];
    // Backend worst case is ~50s (10s Nominatim + 2 x 20s Overpass mirrors).
    // Must be comfortably longer than that, and always longer than the
    // shared 8000ms default.
    expect(config.timeout).toBeGreaterThan(50000);
  });

  it("fetchNearbyServices still passes place through as a param", async () => {
    api.get.mockResolvedValue({ data: { origin: { lat: 12.9, lon: 74.85 }, results: [] } });

    await fetchNearbyServices({ place: "Puttur" });

    expect(api.get).toHaveBeenCalledWith("locator/nearby/", expect.objectContaining({ params: { place: "Puttur" } }));
  });
});
