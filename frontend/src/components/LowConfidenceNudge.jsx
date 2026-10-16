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
 * farmer to re-describe what the app already knows is a needless hurdle.
 *
 * Also passes the scan's id through router state as `scanId`. AdvisoryPage
 * forwards it in the POST body, which is what makes the backend actually
 * email the admin/expert (AdvisoryQuery.scan -- see advisory/utils.py's
 * should_notify_admins): a question submitted via this nudge gets a scan
 * attached and pages an admin; a normal typed-in question doesn't.
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
      <Link
        to="/advisory"
        state={{ prefill, scanId: scan.id }}
        className="btn-secondary low-confidence-ask-link"
      >
        {t("advisory.askButton")}
      </Link>
    </div>
  );
}
