import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import CropDetailPage from "./CropDetailPage";
import * as cropsApi from "../api/crops";
import { fetchTrackers, createTracker, updateTracker } from "../api/cropTracker";
import { fetchDiaryEntries, saveDiaryEntry } from "../api/diary";

vi.mock("../api/crops");
vi.mock("../api/cropTracker");
vi.mock("../api/diary");

const mockCropDetail = {
  id: 1,
  name: "Tomato",
  soil_type: "Well-drained loamy soil",
  climate: "Warm, 20-27°C",
  planting_method: "Direct seeding or transplanting",
  lifecycle_stages: [
    { stage: "Germination", duration_description: "5-10 days", details: "", order: 1 },
  ],
  fertilizer_schedules: [
    { growth_stage: "Seedling", fertilizer_guidance: "Low nitrogen", irrigation_guidance: "Light watering", order: 1 },
  ],
  organic_methods: [
    { id: 1, name: "Vermicompost", materials: "Kitchen waste", steps: "Layer and wait" },
  ],
  intercropped_with: [
    { id: 2, name: "Black Pepper" },
    { id: 3, name: "Cocoa" },
  ],
  trackable_stages: [
    { id: 1, name: "Germination", day_range_start: 0, day_range_end: 10, typical_month_start: null, typical_month_end: null, order: 1 },
    { id: 2, name: "Flowering", day_range_start: 11, day_range_end: 40, typical_month_start: null, typical_month_end: null, order: 2 },
  ],
};

// A perennial crop whose trackable stages are month-based rather than
// day-based (e.g. Arecanut) -- the form should offer a stage <select>
// instead of a planting-date input (Task 6, Step 4).
const mockRiceCrop = mockCropDetail;

const mockMonthBasedCrop = {
  ...mockCropDetail,
  id: 4,
  name: "Arecanut",
  trackable_stages: [
    { id: 10, name: "Dormancy", day_range_start: null, day_range_end: null, typical_month_start: 12, typical_month_end: 2, order: 1 },
    { id: 11, name: "Flowering", day_range_start: null, day_range_end: null, typical_month_start: 3, typical_month_end: 5, order: 2 },
  ],
};

function renderWithRoute(id = "1") {
  return render(
    <MemoryRouter initialEntries={[`/crops/${id}`]}>
      <Routes>
        <Route path="/crops/:id" element={<CropDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("CropDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Tracker fetching is secondary to the crop detail itself -- default
    // every test to "no tracker yet" so the pre-existing assertions below
    // (written before Task 6) don't need to know about it at all.
    vi.mocked(fetchTrackers).mockResolvedValue([]);
    // Likewise, the Daily Log section (Task 6) only ever fetches once a
    // tracker exists -- default it to an empty diary so tests written
    // before Task 6 (which do end up with a tracker, e.g. the "Track This
    // Crop" tests below) don't need to know about it at all.
    vi.mocked(fetchDiaryEntries).mockResolvedValue([]);
  });

  it("loads and displays full crop detail including nested lifecycle/fertilizer/organic data", async () => {
    cropsApi.fetchCropDetail.mockResolvedValue(mockCropDetail);
    renderWithRoute("1");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Tomato" })).toBeInTheDocument();
    });
    expect(screen.getByText(/germination/i)).toBeInTheDocument();
    expect(screen.getByText(/vermicompost/i)).toBeInTheDocument();
    expect(cropsApi.fetchCropDetail).toHaveBeenCalledWith("1");

    // Phase 14 — links out to the Learning Videos page, pre-filled with
    // this crop's name so the search runs automatically over there.
    const videoLink = screen.getByRole("link", { name: /watch related videos about tomato/i });
    expect(videoLink).toHaveAttribute("href", "/videos?q=Tomato");
  });

  it("shows companion crops as links when intercropped_with is present", async () => {
    cropsApi.fetchCropDetail.mockResolvedValue(mockCropDetail);
    renderWithRoute("1");

    await waitFor(() => {
      expect(screen.getByText("Grown With")).toBeInTheDocument();
    });
    const pepperLink = screen.getByRole("link", { name: "Black Pepper" });
    expect(pepperLink).toHaveAttribute("href", "/crops/2");
    expect(screen.getByRole("link", { name: "Cocoa" })).toHaveAttribute("href", "/crops/3");
  });

  it("shows a specific message for a 404 (crop not found)", async () => {
    cropsApi.fetchCropDetail.mockRejectedValue({ response: { status: 404 } });
    renderWithRoute("99999");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/could not be found/i);
    });
  });

  it("shows a generic error for non-404 failures", async () => {
    cropsApi.fetchCropDetail.mockRejectedValue({ response: { status: 500 } });
    renderWithRoute("1");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/could not load this crop/i);
    });
  });

  describe("Track This Crop (Task 6)", () => {
    it("lets a farmer start tracking this crop and shows the derived stage", async () => {
      cropsApi.fetchCropDetail.mockResolvedValue(mockRiceCrop);
      vi.mocked(fetchTrackers).mockResolvedValue([]);
      vi.mocked(createTracker).mockResolvedValue({
        id: 1, crop: 1, planting_date: "2026-09-01", current_stage: { id: 2, name: "Flowering" },
      });
      renderWithRoute("1");

      await userEvent.click(await screen.findByRole("button", { name: /track this crop/i }));

      const dateInput = screen.getByLabelText(/planting date/i);
      fireEvent.change(dateInput, { target: { value: "2026-09-01" } });
      await userEvent.click(screen.getByRole("button", { name: /start tracking/i }));

      expect(await screen.findByText(/Flowering/i)).toBeInTheDocument();
      expect(createTracker).toHaveBeenCalledWith({ cropId: 1, plantingDate: "2026-09-01" });
    });

    it("shows the existing tracker's current stage with an update control instead of the track button", async () => {
      cropsApi.fetchCropDetail.mockResolvedValue(mockRiceCrop);
      vi.mocked(fetchTrackers).mockResolvedValue([
        { id: 5, crop: 1, planting_date: "2026-08-01", current_stage: { id: 2, name: "Flowering" }, stage_confirmed_at: "2026-10-01", is_active: true },
      ]);
      renderWithRoute("1");

      expect(await screen.findByText(/Flowering/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /update/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /track this crop/i })).not.toBeInTheDocument();
    });

    it("offers a stage select instead of a date input when the crop's stages are month-based, and creates the tracker in a single atomic call", async () => {
      // Fix round 1 -- this used to be createTracker(...) followed by a
      // separate updateTracker(...) call. It's now one atomic
      // createTracker({ cropId, currentStage }) call: no updateTracker
      // involved at all for a brand-new month-based tracker.
      cropsApi.fetchCropDetail.mockResolvedValue(mockMonthBasedCrop);
      vi.mocked(fetchTrackers).mockResolvedValue([]);
      vi.mocked(createTracker).mockResolvedValue({ id: 2, crop: 4, planting_date: null, current_stage: { id: 11, name: "Flowering" } });
      renderWithRoute("4");

      await userEvent.click(await screen.findByRole("button", { name: /track this crop/i }));

      expect(screen.queryByLabelText(/planting date/i)).not.toBeInTheDocument();
      const stageSelect = screen.getByLabelText(/current stage/i);
      await userEvent.selectOptions(stageSelect, "11");
      await userEvent.click(screen.getByRole("button", { name: /start tracking/i }));

      expect(await screen.findByText(/Flowering/i)).toBeInTheDocument();
      expect(createTracker).toHaveBeenCalledWith({ cropId: 4, currentStage: 11 });
      expect(updateTracker).not.toHaveBeenCalled();
    });

    it("Fix round 1 — a failed month-based create leaves no orphaned tracker, so a plain retry (not an update) succeeds", async () => {
      // Regression test for the reviewed finding: the old create-then-update
      // split could succeed on createTracker and then fail on updateTracker,
      // leaving a tracker row server-side with no local state pointing at
      // it -- any retry re-entered the "no tracker yet" branch and hit the
      // unique_together 400 forever. Now there's only ever one call, so a
      // failure leaves nothing behind and a retry is just that same call
      // again, which can succeed.
      cropsApi.fetchCropDetail.mockResolvedValue(mockMonthBasedCrop);
      vi.mocked(fetchTrackers).mockResolvedValue([]);
      vi.mocked(createTracker)
        .mockRejectedValueOnce({ response: { status: 500 } })
        .mockResolvedValueOnce({ id: 2, crop: 4, planting_date: null, current_stage: { id: 11, name: "Flowering" } });
      renderWithRoute("4");

      await userEvent.click(await screen.findByRole("button", { name: /track this crop/i }));
      const stageSelect = screen.getByLabelText(/current stage/i);
      await userEvent.selectOptions(stageSelect, "11");
      await userEvent.click(screen.getByRole("button", { name: /start tracking/i }));

      expect(await screen.findByRole("alert")).toHaveTextContent(/could not save your tracker/i);
      // Still on the create form, not stuck looking like a tracker exists.
      expect(screen.getByLabelText(/current stage/i)).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: /start tracking/i }));

      expect(await screen.findByText(/Flowering/i)).toBeInTheDocument();
      expect(createTracker).toHaveBeenCalledTimes(2);
      expect(createTracker).toHaveBeenNthCalledWith(2, { cropId: 4, currentStage: 11 });
      expect(updateTracker).not.toHaveBeenCalled();
    });

    it("surfaces the backend's specific validation message instead of the generic save error", async () => {
      cropsApi.fetchCropDetail.mockResolvedValue(mockRiceCrop);
      vi.mocked(fetchTrackers).mockResolvedValue([]);
      vi.mocked(createTracker).mockRejectedValue({
        response: { data: { crop: ["You already have a tracker for this crop."] } },
      });
      renderWithRoute("1");

      await userEvent.click(await screen.findByRole("button", { name: /track this crop/i }));
      fireEvent.change(screen.getByLabelText(/planting date/i), { target: { value: "2026-09-01" } });
      await userEvent.click(screen.getByRole("button", { name: /start tracking/i }));

      expect(await screen.findByRole("alert")).toHaveTextContent(/you already have a tracker for this crop/i);
    });
  });

  describe("Daily Log", () => {
    const todayISO = new Date().toLocaleDateString("en-CA");
    const mockTracker = {
      id: 7, crop: 1, planting_date: "2026-08-01",
      current_stage: { id: 2, name: "Flowering" }, stage_confirmed_at: "2026-10-01", is_active: true,
    };

    it("shows the Daily Log form once a tracker exists, pre-filled from today's entry if one exists", async () => {
      cropsApi.fetchCropDetail.mockResolvedValue(mockRiceCrop);
      vi.mocked(fetchTrackers).mockResolvedValue([mockTracker]);
      vi.mocked(fetchDiaryEntries).mockResolvedValue([
        {
          id: 1, tracker: 7, entry_date: todayISO,
          did_irrigation: true, did_fertilizer: false, did_spraying: false, did_pruning: false,
          other_activity_note: "", note: "watered",
        },
      ]);
      renderWithRoute("1");

      await screen.findByRole("checkbox", { name: /irrigation/i });
      await waitFor(() => {
        expect(screen.getByRole("checkbox", { name: /irrigation/i })).toBeChecked();
      });
      expect(screen.getByRole("checkbox", { name: /fertilizer/i })).not.toBeChecked();
      expect(screen.getByPlaceholderText(/any notes about today/i)).toHaveValue("watered");
      expect(fetchDiaryEntries).toHaveBeenCalledWith(7);
    });

    it("submits the form and clears/updates it with the saved entry", async () => {
      cropsApi.fetchCropDetail.mockResolvedValue(mockRiceCrop);
      vi.mocked(fetchTrackers).mockResolvedValue([mockTracker]);
      vi.mocked(fetchDiaryEntries).mockResolvedValue([]);
      vi.mocked(saveDiaryEntry).mockResolvedValue({
        id: 2, tracker: 7, entry_date: todayISO,
        did_irrigation: true, did_fertilizer: false, did_spraying: true, did_pruning: false,
        other_activity_note: "", note: "Sprayed neem oil",
      });
      renderWithRoute("1");

      await userEvent.click(await screen.findByRole("checkbox", { name: /irrigation/i }));
      await userEvent.click(screen.getByRole("checkbox", { name: /spraying/i }));
      await userEvent.type(screen.getByPlaceholderText(/any notes about today/i), "Sprayed neem oil");
      await userEvent.click(screen.getByRole("button", { name: /save entry/i }));

      await waitFor(() => {
        expect(saveDiaryEntry).toHaveBeenCalledWith(7, {
          didIrrigation: true,
          didFertilizer: false,
          didSpraying: true,
          didPruning: false,
          otherActivityNote: "",
          note: "Sprayed neem oil",
          photoFile: null,
        });
      });
      // The saved entry replaces the prior (empty) state for today rather
      // than appending a duplicate -- re-running the pre-fill from it
      // should leave the form showing exactly what was just saved.
      expect(screen.getByRole("checkbox", { name: /irrigation/i })).toBeChecked();
    });

    it("shows a validation error from the backend instead of a generic message", async () => {
      cropsApi.fetchCropDetail.mockResolvedValue(mockRiceCrop);
      vi.mocked(fetchTrackers).mockResolvedValue([mockTracker]);
      vi.mocked(fetchDiaryEntries).mockResolvedValue([]);
      vi.mocked(saveDiaryEntry).mockRejectedValue({ response: { data: { note: ["Too long."] } } });
      renderWithRoute("1");

      await userEvent.click(await screen.findByRole("button", { name: /save entry/i }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Too long.");
    });

    it("uses the browser's local date for 'today', not UTC's", async () => {
      // 2026-10-19 20:00 UTC is 2026-10-20 01:30 in India. Yesterday's
      // (IST) entry must NOT be pre-filled as if it were today's -- that's
      // what UTC-based toISOString() would do until 05:30 IST.
      //
      // Reassigning process.env.TZ mid-test is NOT a reliable way to
      // simulate this: useDiaryEntries.js computes "today" via
      // `new Date().toLocaleDateString("en-CA")`, and that call resolves
      // its implicit timezone through ICU's process-level default, which
      // Node/V8 can cache at process (or worker-thread) startup -- a
      // runtime assignment to process.env.TZ isn't guaranteed to
      // invalidate that cache. This test used to pass locally only
      // because this sandbox's own host timezone already happens to be
      // IST, masking the bug; it failed in GitHub Actions CI (UTC by
      // default) with the form wrongly pre-filled from "yesterday's
      // note". Reproduced locally too via `TZ=UTC npx vitest run`.
      // Stubbing the exact toLocaleDateString("en-CA") call the hook
      // makes is host-timezone-independent and portable.
      const originalToLocaleDateString = Date.prototype.toLocaleDateString;
      vi.spyOn(Date.prototype, "toLocaleDateString").mockImplementation(function (...args) {
        if (args[0] === "en-CA" && args.length === 1) {
          return "2026-10-20"; // the IST-local date for the faked instant below
        }
        return originalToLocaleDateString.apply(this, args);
      });
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-19T20:00:00Z"));
      try {
        cropsApi.fetchCropDetail.mockResolvedValue(mockRiceCrop);
        vi.mocked(fetchTrackers).mockResolvedValue([mockTracker]);
        vi.mocked(fetchDiaryEntries).mockResolvedValue([
          {
            id: 1, tracker: 7, entry_date: "2026-10-19",
            did_irrigation: true, did_fertilizer: false, did_spraying: false, did_pruning: false,
            other_activity_note: "", note: "yesterday's note", photo: null,
            photo_diagnosis_label: "", ai_analysis: "", ai_analysis_status: "unavailable",
          },
        ]);
        renderWithRoute("1");

        // Rendered in the timeline, so entries have loaded...
        await screen.findByText("yesterday's note");
        // ...but the form is blank for the new IST day.
        expect(screen.getByRole("checkbox", { name: /irrigation/i })).not.toBeChecked();
        expect(screen.getByPlaceholderText(/any notes about today/i)).toHaveValue("");
      } finally {
        vi.useRealTimers();
        vi.mocked(Date.prototype.toLocaleDateString).mockRestore();
      }
    });
  });

  describe("Daily Log timeline (Task 7)", () => {
    const mockTracker = {
      id: 7, crop: 1, planting_date: "2026-08-01",
      current_stage: { id: 2, name: "Flowering" }, stage_confirmed_at: "2026-10-01", is_active: true,
    };

    it("renders past entries most-recent-first with their AI analysis", async () => {
      cropsApi.fetchCropDetail.mockResolvedValue(mockRiceCrop);
      vi.mocked(fetchTrackers).mockResolvedValue([mockTracker]);
      vi.mocked(fetchDiaryEntries).mockResolvedValue([
        {
          id: 2, tracker: 7, entry_date: "2026-10-19",
          did_irrigation: true, did_fertilizer: false, did_spraying: false, did_pruning: false,
          other_activity_note: "", note: "Looks good today", photo: null,
          photo_diagnosis_label: "", ai_analysis: "Looks healthy.", ai_analysis_status: "ok",
        },
        {
          id: 1, tracker: 7, entry_date: "2026-10-10",
          did_irrigation: false, did_fertilizer: true, did_spraying: false, did_pruning: false,
          other_activity_note: "", note: "Applied fertilizer", photo: null,
          photo_diagnosis_label: "", ai_analysis: "Fertilizer applied as scheduled.", ai_analysis_status: "ok",
        },
      ]);
      renderWithRoute("1");

      const analysisNodes = await screen.findAllByText(/looks healthy\.|fertilizer applied as scheduled\./i);
      expect(analysisNodes).toHaveLength(2);
      // diaryEntries is already most-recent-first from the backend -- the
      // timeline must render in that same order, not re-sort.
      expect(analysisNodes[0]).toHaveTextContent(/looks healthy\./i);
      expect(analysisNodes[1]).toHaveTextContent(/fertilizer applied as scheduled\./i);
    });

    it("shows a graceful fallback message when ai_analysis_status is unavailable", async () => {
      cropsApi.fetchCropDetail.mockResolvedValue(mockRiceCrop);
      vi.mocked(fetchTrackers).mockResolvedValue([mockTracker]);
      vi.mocked(fetchDiaryEntries).mockResolvedValue([
        {
          id: 1, tracker: 7, entry_date: "2026-10-18",
          did_irrigation: false, did_fertilizer: false, did_spraying: false, did_pruning: false,
          other_activity_note: "", note: "Watered the field", photo: null,
          photo_diagnosis_label: "", ai_analysis: "", ai_analysis_status: "unavailable",
        },
      ]);
      renderWithRoute("1");

      await screen.findByText("Watered the field");
      expect(screen.getByText(/ai analysis isn.t available/i)).toBeInTheDocument();
    });

    it("shows the photo diagnosis label when a photo was analyzed", async () => {
      cropsApi.fetchCropDetail.mockResolvedValue(mockRiceCrop);
      vi.mocked(fetchTrackers).mockResolvedValue([mockTracker]);
      vi.mocked(fetchDiaryEntries).mockResolvedValue([
        {
          id: 1, tracker: 7, entry_date: "2026-10-18",
          did_irrigation: false, did_fertilizer: false, did_spraying: false, did_pruning: false,
          other_activity_note: "", note: "", photo: "/media/diary_photos/2026/10/leaf.jpg",
          photo_diagnosis_label: "Rice___Blast", photo_diagnosis_confidence: 0.91,
          ai_analysis: "", ai_analysis_status: "unavailable",
        },
      ]);
      const { container } = renderWithRoute("1");

      expect(await screen.findByText(/Rice___Blast/)).toBeInTheDocument();
      // Same photo-thumbnail convention as ScanHistoryPage (alt="" makes it
      // decorative, so it's queried directly rather than via accessible role).
      const thumbnail = container.querySelector("img.scan-history-thumbnail");
      expect(thumbnail).toHaveAttribute("src", "/media/diary_photos/2026/10/leaf.jpg");
    });

    it("shows a fallback message when there are no diary entries yet", async () => {
      cropsApi.fetchCropDetail.mockResolvedValue(mockRiceCrop);
      vi.mocked(fetchTrackers).mockResolvedValue([mockTracker]);
      vi.mocked(fetchDiaryEntries).mockResolvedValue([]);
      renderWithRoute("1");

      expect(await screen.findByText(/no diary entries yet/i)).toBeInTheDocument();
    });
  });
});
