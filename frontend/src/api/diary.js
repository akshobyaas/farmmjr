import api from "./axios";

// Farming Diary (Task 5) -- thin wrappers over the ownership-scoped
// GET/POST /crops/diary/ endpoints (Tasks 1-4). Kept separate from
// api/cropTracker.js the same way cropTracker is kept separate from
// api/crops.js: diary entries are farmer-owned state hanging off a tracker,
// not public crop catalog data. The POST always goes out as multipart
// FormData (not JSON) so an optional photo can ride along in the same call.

export async function fetchDiaryEntries(trackerId) {
  const { data } = await api.get(`crops/diary/?tracker=${trackerId}`);
  return data;
}

export async function saveDiaryEntry(
  trackerId,
  {
    didIrrigation, didFertilizer, didSpraying, didPruning, otherActivityNote, note, photoFile, scanId,
    // Task 11 -- the six optional activity-detail fields Task 10 added to
    // FarmingDiaryEntry (duration_minutes/quantity/quantity_unit/
    // product_name/cost_amount/harvest_quality_note).
    durationMinutes, quantity, quantityUnit, productName, costAmount, harvestQualityNote,
  } = {}
) {
  const formData = new FormData();
  formData.append("tracker", String(trackerId));
  // Each of these is only appended when the caller actually passed it --
  // NOT just "when truthy". The full diary form (useDiaryEntries) always
  // passes every one of these explicitly (even a deliberate `false`), so
  // its behavior is unchanged. But the Task 9 "Save to Diary" scan button
  // below calls this with only `scanId`, and must send *only* `tracker`
  // and `scan_id` -- sending e.g. did_irrigation="false" here would, on
  // the backend's same-day update-merge path (serializers_diary.py
  // FarmingDiaryEntrySerializer.create), count as the farmer explicitly
  // un-ticking irrigation they logged earlier the same day, silently
  // wiping it. Omitting the field entirely keeps that merge from ever
  // touching it.
  if (didIrrigation !== undefined) formData.append("did_irrigation", String(!!didIrrigation));
  if (didFertilizer !== undefined) formData.append("did_fertilizer", String(!!didFertilizer));
  if (didSpraying !== undefined) formData.append("did_spraying", String(!!didSpraying));
  if (didPruning !== undefined) formData.append("did_pruning", String(!!didPruning));
  // Backend calls .strip() on these, so always send a string when sent at
  // all, never the literal "undefined"/"null".
  if (otherActivityNote !== undefined) formData.append("other_activity_note", otherActivityNote ?? "");
  if (note !== undefined) formData.append("note", note ?? "");
  // Task 11 -- same "only when the caller actually passed it" rule as
  // every field above. The full diary form (useDiaryEntries) always
  // passes all six explicitly, including "" for a hidden/not-applicable
  // field group -- an empty string here is exactly what makes DRF store
  // None for the three nullable numeric fields (duration_minutes/
  // quantity/cost_amount: see rest_framework.fields.Field.get_value's
  // HTML-form empty-string-to-None handling for allow_null fields) and ""
  // for the three CharFields, correctly clearing a stale value on the
  // backend's same-day merge path. The scanId-only "Save to Diary" call
  // never passes these, so they're correctly omitted and left untouched.
  if (durationMinutes !== undefined) formData.append("duration_minutes", String(durationMinutes ?? ""));
  if (quantity !== undefined) formData.append("quantity", String(quantity ?? ""));
  if (quantityUnit !== undefined) formData.append("quantity_unit", quantityUnit ?? "");
  if (productName !== undefined) formData.append("product_name", productName ?? "");
  if (costAmount !== undefined) formData.append("cost_amount", String(costAmount ?? ""));
  if (harvestQualityNote !== undefined) formData.append("harvest_quality_note", harvestQualityNote ?? "");
  // Only attach the file when there is one -- appending null would send
  // the literal string "null" as the photo field.
  if (photoFile) formData.append("photo", photoFile);
  // Task 8/9 -- copies a scan's photo+diagnosis onto today's entry
  // server-side. Never send entry_date alongside it: the backend always
  // server-sets entry_date to today (diary_today()) and ignores any
  // client value, so there is nothing for the frontend to send here.
  if (scanId != null) formData.append("scan_id", String(scanId));
  const { data } = await api.post("crops/diary/", formData);
  return data;
}
