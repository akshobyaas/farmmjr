"""
Stage-derivation logic for the Crop Lifecycle Tracker (USP feature).

Kept separate from models.py since this is behavior, not schema: given a
FarmerCropTracker, figure out which CropStage the farmer's crop is
currently in. Two kinds of crops exist (see CropStage):

- Day-based (annual crops like Rice): stages are keyed off days since
  planting, so we need `tracker.planting_date` to compute anything.
- Month-based (perennial crops like Arecanut): stages are keyed off the
  calendar month, so they apply regardless of when (or whether) the farmer
  recorded a planting date, and must handle ranges that wrap around the
  new year (e.g. Nov-Feb).

A crop's stage set is treated as day-based if ANY of its CropStage rows has
day_range_start set; otherwise it's treated as month-based. Within a
day-based crop, the day-based lookup/fallback only ever considers the
stages that actually carry day-range data -- a crop whose CropStage rows
are inconsistent (some day-based, some month-based) won't have a
month-based row handed back just because it happened to sort last by
`order`.
"""
from datetime import date


def derive_stage_for_tracker(tracker):
    stages = list(tracker.crop.trackable_stages.order_by("order"))
    if not stages:
        return None

    day_based_stages = [
        stage for stage in stages
        if stage.day_range_start is not None and stage.day_range_end is not None
    ]
    is_day_based = bool(day_based_stages)

    if is_day_based:
        if not tracker.planting_date:
            return None

        days_since_planting = (date.today() - tracker.planting_date).days

        if days_since_planting < 0:
            # Planting date is in the future: the crop hasn't started its
            # lifecycle yet, so it's at/before its earliest stage -- not
            # its last one, and not None (that's reserved for "no planting
            # date set at all").
            return day_based_stages[0]

        for stage in day_based_stages:
            if stage.day_range_start <= days_since_planting <= stage.day_range_end:
                return stage
        # Past every known range (crop has outgrown its last tracked
        # stage): the last day-based stage (by order) is the best
        # available answer.
        return day_based_stages[-1]

    # Month-based: find the stage whose typical_month_start..end window
    # contains the current month, handling wraparound (e.g. start=11,
    # end=2 must match months 11, 12, 1, 2).
    current_month = date.today().month
    for stage in stages:
        if stage.typical_month_start is None or stage.typical_month_end is None:
            continue
        start, end = stage.typical_month_start, stage.typical_month_end
        if (current_month - start) % 12 <= (end - start) % 12:
            return stage

    return None
