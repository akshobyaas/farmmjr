import { renderHook, act } from "@testing-library/react";
import { vi, describe, test, expect, beforeEach } from "vitest";
import { useCropHealth, deriveHealthStatus } from "./useCropHealth";
import * as scansApi from "../api/scans";
import * as diaryApi from "../api/diary";
import * as cropTrackerApi from "../api/cropTracker";

vi.mock("../api/scans");
vi.mock("../api/diary");
vi.mock("../api/cropTracker");

// Task 18 -- Crop Health page (UI_REDESIGN_DESIGN.md 7.5). This status is
// NOT a real validated health score -- there is no such system here (no
// "healthy" class anywhere in the ML model/Disease data, see the hook's
// own comment) -- so every test below that reaches a status object also
// asserts isDemo is exactly `true`.

describe("useCropHealth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cropTrackerApi.fetchTrackers.mockResolvedValue([]);
    diaryApi.fetchDiaryEntries.mockResolvedValue([]);
    cropTrackerApi.fetchRiskAlerts.mockResolvedValue({ trackers: [] });
    scansApi.fetchScanHistory.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
  });

  test("fetches scan history filtered by crop via the existing Task 12 ?crop= helper", async () => {
    renderHook(() => useCropHealth("9"));
    await act(async () => {});
    expect(scansApi.fetchScanHistory).toHaveBeenCalledWith(1, "9");
  });

  test("fetches diary entries for the crop's own tracker once the tracker is resolved", async () => {
    cropTrackerApi.fetchTrackers.mockResolvedValue([
      { id: 2, crop: 9, current_stage: null },
    ]);
    const entries = [{ id: 1, entry_date: "2026-11-01", did_irrigation: true }];
    diaryApi.fetchDiaryEntries.mockResolvedValue(entries);

    const { result } = renderHook(() => useCropHealth("9"));
    await act(async () => {});

    expect(diaryApi.fetchDiaryEntries).toHaveBeenCalledWith(2);
    expect(result.current.diaryEntries).toEqual(entries);
  });

  test("does not fetch diary entries when there is no tracker for this crop", async () => {
    cropTrackerApi.fetchTrackers.mockResolvedValue([{ id: 2, crop: 5, current_stage: null }]);
    const { result } = renderHook(() => useCropHealth("9"));
    await act(async () => {});
    expect(diaryApi.fetchDiaryEntries).not.toHaveBeenCalled();
    expect(result.current.diaryEntries).toEqual([]);
  });

  test("picks out the active risk alert for this crop's tracker from the shared risk-alerts endpoint", async () => {
    cropTrackerApi.fetchRiskAlerts.mockResolvedValue({
      trackers: [
        { tracker_id: 1, crop_id: 5, risk_alerts: [{ disease_name: "Other Crop Blight", risk_level: "high" }] },
        {
          tracker_id: 2,
          crop_id: 9,
          risk_alerts: [
            { disease_name: "Leaf Spot", risk_level: "high" },
            { disease_name: "Blight", risk_level: "low" },
          ],
        },
      ],
    });

    const { result } = renderHook(() => useCropHealth("9"));
    await act(async () => {});

    // The backend (risk_engine.evaluate_risk) already sorts each tracker's
    // own alerts highest-risk-first, so the first entry for THIS crop's
    // tracker is the one to surface -- not the globally-highest alert
    // across every tracker (that cross-tracker ranking is
    // useDashboardData's job, a different page's concern).
    expect(result.current.riskAlert).toEqual({ disease_name: "Leaf Spot", risk_level: "high" });
  });

  test("riskAlert is null when this crop's tracker has no matching entry or no alerts", async () => {
    cropTrackerApi.fetchRiskAlerts.mockResolvedValue({ trackers: [{ tracker_id: 1, crop_id: 5, risk_alerts: [] }] });
    const { result } = renderHook(() => useCropHealth("9"));
    await act(async () => {});
    expect(result.current.riskAlert).toBeNull();
  });

  test("riskAlert is null when the fetch fails (fail-soft, same convention as the rest of this hook)", async () => {
    cropTrackerApi.fetchRiskAlerts.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useCropHealth("9"));
    await act(async () => {});
    expect(result.current.riskAlert).toBeNull();
  });

  test("latestScan is the first (most recent) entry of the crop-filtered scan list", async () => {
    const scans = [
      { id: 2, disease_name: "Leaf Spot", confidence: 0.9, created_at: "2026-11-02T00:00:00Z" },
      { id: 1, disease_name: "Leaf Spot", confidence: 0.5, created_at: "2026-11-01T00:00:00Z" },
    ];
    scansApi.fetchScanHistory.mockResolvedValue({ count: 2, next: null, previous: null, results: scans });
    const { result } = renderHook(() => useCropHealth("9"));
    await act(async () => {});
    expect(result.current.latestScan).toEqual(scans[0]);
    expect(result.current.scans).toEqual(scans);
  });

  test("stops loading once the primary scan-history fetch settles, success or failure", async () => {
    scansApi.fetchScanHistory.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useCropHealth("9"));
    expect(result.current.loading).toBe(true);
    await act(async () => {});
    expect(result.current.loading).toBe(false);
    expect(result.current.scans).toEqual([]);
  });

  // ---- status derivation (the integrity-sensitive part) ----

  test("status is 'unknown' with isDemo true when there is no scan yet for this crop", () => {
    expect(deriveHealthStatus({ latestScan: null, hasActiveRiskAlert: false })).toEqual({
      level: "unknown",
      isDemo: true,
    });
  });

  test("status is 'good' with isDemo true when the latest scan found no disease and there is no active alert", () => {
    expect(
      deriveHealthStatus({ latestScan: { disease_name: null, confidence: null }, hasActiveRiskAlert: false })
    ).toEqual({ level: "good", isDemo: true });
  });

  test("an active risk alert bumps an otherwise-good level up to 'watch', isDemo stays true", () => {
    expect(
      deriveHealthStatus({ latestScan: { disease_name: null, confidence: null }, hasActiveRiskAlert: true })
    ).toEqual({ level: "watch", isDemo: true });
  });

  test("status is 'watch' with isDemo true when a disease was flagged but confidence is below the low-confidence threshold (0.6)", () => {
    expect(
      deriveHealthStatus({ latestScan: { disease_name: "Leaf Spot", confidence: 0.59 }, hasActiveRiskAlert: false })
    ).toEqual({ level: "watch", isDemo: true });
  });

  test("status is 'watch' with isDemo true when a disease was flagged but confidence is missing entirely", () => {
    expect(
      deriveHealthStatus({ latestScan: { disease_name: "Leaf Spot", confidence: null }, hasActiveRiskAlert: false })
    ).toEqual({ level: "watch", isDemo: true });
  });

  test("status is 'concern' with isDemo true when a disease was flagged at or above the low-confidence threshold (0.6)", () => {
    expect(
      deriveHealthStatus({ latestScan: { disease_name: "Leaf Spot", confidence: 0.6 }, hasActiveRiskAlert: false })
    ).toEqual({ level: "concern", isDemo: true });
  });

  test("an active risk alert does not downgrade an already-'concern' level", () => {
    expect(
      deriveHealthStatus({ latestScan: { disease_name: "Leaf Spot", confidence: 0.95 }, hasActiveRiskAlert: true })
    ).toEqual({ level: "concern", isDemo: true });
  });

  // isDemo must never be reachable as false -- it is a hardcoded constant,
  // never computed from any input. Sweeping every level this function can
  // reach and asserting isDemo is true on all of them is what makes this
  // test fail if a future edit ever makes isDemo conditional.
  test("isDemo is always true, for every level this function can produce", () => {
    const cases = [
      { latestScan: null, hasActiveRiskAlert: false },
      { latestScan: { disease_name: null, confidence: null }, hasActiveRiskAlert: false },
      { latestScan: { disease_name: null, confidence: null }, hasActiveRiskAlert: true },
      { latestScan: { disease_name: "Leaf Spot", confidence: 0.1 }, hasActiveRiskAlert: false },
      { latestScan: { disease_name: "Leaf Spot", confidence: 0.9 }, hasActiveRiskAlert: false },
      { latestScan: { disease_name: "Leaf Spot", confidence: 0.9 }, hasActiveRiskAlert: true },
    ];
    for (const input of cases) {
      expect(deriveHealthStatus(input).isDemo).toBe(true);
    }
  });

  test("the hook's returned status always carries isDemo: true", async () => {
    const { result } = renderHook(() => useCropHealth("9"));
    await act(async () => {});
    expect(result.current.status.isDemo).toBe(true);
  });
});
