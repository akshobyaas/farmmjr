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
  { didIrrigation, didFertilizer, didSpraying, didPruning, otherActivityNote, note, photoFile }
) {
  const formData = new FormData();
  formData.append("tracker", String(trackerId));
  formData.append("did_irrigation", String(!!didIrrigation));
  formData.append("did_fertilizer", String(!!didFertilizer));
  formData.append("did_spraying", String(!!didSpraying));
  formData.append("did_pruning", String(!!didPruning));
  // Backend calls .strip() on these, so always send a string, never omit.
  formData.append("other_activity_note", otherActivityNote ?? "");
  formData.append("note", note ?? "");
  // Only attach the file when there is one -- appending null would send
  // the literal string "null" as the photo field.
  if (photoFile) formData.append("photo", photoFile);
  const { data } = await api.post("crops/diary/", formData);
  return data;
}
