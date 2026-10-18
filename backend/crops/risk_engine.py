"""
Phase B / Task 12 -- pure disease-risk evaluation logic, kept separate from
the view (RiskAlertsView, in views.py) so the comparison rules themselves
are easy to unit test without going through the HTTP layer.

`fetch_forecast_summary` (weather/forecast.py) returns a single 3-day
AGGREGATE dict -- {"max_humidity_percent", "min_temp_celsius",
"max_temp_celsius", "total_rainfall_mm"} -- with no per-day breakdown at
all. There is deliberately no "how many of the 3 days individually
qualified" check here: that data doesn't exist in the forecast dict, so
`consecutive_days_required` is treated as a simple feasibility gate against
the forecast window length (3 days) rather than something counted from the
aggregate. A rule that asks for more consecutive days than a 3-day-ahead
forecast could ever confirm can never match -- that's correct, fail-safe
behaviour, not a bug.
"""
from .models import DiseaseRiskRule

# Matches FORECAST_ENTRIES_FOR_3_DAYS in weather/forecast.py -- the forecast
# dict this module evaluates against is always a 3-day aggregate.
FORECAST_WINDOW_DAYS = 3

# Highest risk first, per the Interfaces contract ("sorted highest-risk
# first"). Any risk_level not in this map (shouldn't happen -- the model's
# choices are closed) sorts last rather than raising.
_RISK_LEVEL_ORDER = {
    DiseaseRiskRule.RiskLevel.HIGH.value: 0,
    DiseaseRiskRule.RiskLevel.MODERATE.value: 1,
    DiseaseRiskRule.RiskLevel.LOW.value: 2,
}


def _forecast_satisfies_rule(rule, forecast):
    """
    True if every non-null threshold `rule` sets is met by the 3-day
    forecast aggregate. Each field is independently optional -- a rule
    only checks the thresholds it actually sets, per the model's own
    docstring.
    """
    if rule.consecutive_days_required > FORECAST_WINDOW_DAYS:
        return False

    if rule.humidity_min_percent is not None:
        if forecast.get("max_humidity_percent") is None:
            return False
        if forecast["max_humidity_percent"] < rule.humidity_min_percent:
            return False

    if rule.rainfall_min_mm is not None:
        if forecast.get("total_rainfall_mm") is None:
            return False
        if forecast["total_rainfall_mm"] < rule.rainfall_min_mm:
            return False

    # The disease-favourable temperature band is [temp_min_celsius,
    # temp_max_celsius]. With only a 3-day min/max aggregate to go on (no
    # per-day breakdown), a match requires the whole forecasted range to
    # sit inside that band -- i.e. the forecast's low end is still >= the
    # rule's floor, and its high end is still <= the rule's ceiling.
    if rule.temp_min_celsius is not None:
        if forecast.get("min_temp_celsius") is None:
            return False
        if forecast["min_temp_celsius"] < rule.temp_min_celsius:
            return False

    if rule.temp_max_celsius is not None:
        if forecast.get("max_temp_celsius") is None:
            return False
        if forecast["max_temp_celsius"] > rule.temp_max_celsius:
            return False

    return True


def evaluate_risk(tracker, forecast):
    """
    Returns every DiseaseRiskRule for `tracker.crop` (narrowed to rules
    whose applicable_stages is empty, i.e. "any stage", or includes
    `tracker.current_stage`) whose thresholds the given 3-day forecast
    aggregate satisfies, as a list of
    {"disease_name", "risk_level", "advisory_text", "source_citation"}
    dicts, sorted highest-risk first.
    """
    rules = (
        DiseaseRiskRule.objects.filter(disease__crop=tracker.crop)
        .select_related("disease")
        .prefetch_related("applicable_stages")
    )

    matches = []
    for rule in rules:
        stage_ids = {stage.id for stage in rule.applicable_stages.all()}
        if stage_ids and (tracker.current_stage_id not in stage_ids):
            continue
        if not _forecast_satisfies_rule(rule, forecast):
            continue
        matches.append(
            {
                "disease_name": rule.disease.name,
                "risk_level": rule.risk_level,
                "advisory_text": rule.advisory_text,
                "source_citation": rule.source_citation,
            }
        )

    matches.sort(key=lambda m: _RISK_LEVEL_ORDER.get(m["risk_level"], len(_RISK_LEVEL_ORDER)))
    return matches
