import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

// A softmax max-probability below this is treated as "not very sure" --
// chosen well above random chance for this 9-class model (~11%) but below
// where the model is reliably correct (test-set precision/recall mostly
// sit in the 0.85-1.0 range per ml-training/training_report.md, test
// accuracy 0.9368 overall). Not a formally calibrated cutoff, just a
// sensible, easily-explained default; exported so it's defined in exactly
// one place if it ever needs tuning.
export const LOW_CONFIDENCE_THRESHOLD = 0.6;

/**
 * Shown under a scan result (fresh upload or scan-history detail) when the
 * model's confidence is low. Nudges the farmer toward "Ask an Expert"
 * instead of silently showing an uncertain prediction as if it were
 * reliable -- with the question pre-filled from the scan, since asking the
 * farmer to re-describe what the app already knows is a needless hurdle on
 * a feature deliberately kept to just a free-text box (no linked-scan
 * field in AdvisoryQuery, no notification system yet -- see NEXT_STEPS.md
 * for why those are out of scope for this pass).
 */
export default function LowConfidenceNudge({ scan }) {
  const { t } = useTranslation();

  if (typeof scan?.confidence !== "number" || scan.confidence >= LOW_CONFIDENCE_THRESHOLD) {
    return null;
  }

  const diseaseLabel = scan.predicted_disease?.name || t("scan.predictionUnavailable");
  const prefill = t("scan.lowConfidenceQuestionPrefill", {
    disease: diseaseLabel,
    pct: (scan.confidence * 100).toFixed(1),
  });

  return (
    <div className="low-confidence-nudge" role="status">
      <p className="low-confidence-text">{t("scan.lowConfidenceWarning")}</p>
      <Link to="/advisory" state={{ prefill }} className="btn-secondary low-confidence-ask-link">
        {t("advisory.askButton")}
      </Link>
    </div>
  );
}
