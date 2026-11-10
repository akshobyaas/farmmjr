import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { uploadScan } from "../api/scans";
import { useActiveTrackerForCrop } from "./useActiveTrackerForCrop";
import { useSaveScanToDiary } from "./useSaveScanToDiary";

// Server-side validation (scans/serializers.py) enforces the real limits;
// this is just a fast, friendly client-side check so a farmer doesn't wait
// on a slow mobile upload just to be told the file was too big.
const MAX_PREVIEW_SIZE_BYTES = 5 * 1024 * 1024;

// Extracted verbatim from ScanUploadPage.jsx's state/effect/handlers, as
// part of the frontend structure cleanup (Sub-project 1). See
// FRONTEND_REFACTOR_IMPLEMENTATION_PLAN.md Task 7.
export function useScanUpload() {
  const { t } = useTranslation();
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const objectUrlRef = useRef(null);

  // Revoke the previous object URL whenever we replace it or unmount, so we
  // don't leak memory across repeated selections.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const handleFileChange = (e) => {
    setError("");
    setResult(null);
    const selected = e.target.files?.[0];
    if (!selected) {
      setFile(null);
      setPreviewUrl(null);
      return;
    }

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);

    if (selected.size > MAX_PREVIEW_SIZE_BYTES) {
      setError(t("scan.tooLarge"));
      setFile(null);
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(selected);
    objectUrlRef.current = url;
    setFile(selected);
    setPreviewUrl(url);
  };

  const extractErrorMessage = (err) => {
    if (!err.response) {
      return t("scan.networkError");
    }
    if (err.response.status === 401) {
      return t("scan.sessionExpired");
    }
    if (err.response.status === 429) {
      return t("scan.tooManyUploads");
    }
    const imageError = err.response.data?.image;
    if (Array.isArray(imageError) && imageError.length > 0) {
      return imageError[0];
    }
    if (typeof imageError === "string") {
      return imageError;
    }
    return t("scan.genericUploadError");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError(t("scan.noFileChosen"));
      return;
    }
    setError("");
    setResult(null);
    setSubmitting(true);
    try {
      const data = await uploadScan(file);
      setResult(data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleScanAnother = () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    setFile(null);
    setPreviewUrl(null);
    setResult(null);
    setError("");
  };

  // Task 9 -- "Save to Diary" button. Only shown when the farmer has an
  // active tracker for the crop this scan predicted; the scan and the save
  // both happen the same day, so (unlike ScanHistoryDetailPage) there's no
  // date-naming subtlety to the confirmation copy here.
  const activeTracker = useActiveTrackerForCrop(result?.scan?.predicted_disease?.crop_name);
  const { status: diarySaveStatus, handleSaveToDiary } = useSaveScanToDiary(activeTracker, result?.scan?.id);

  return {
    file,
    previewUrl,
    error,
    result,
    submitting,
    handleFileChange,
    handleSubmit,
    handleScanAnother,
    activeTracker,
    diarySaveStatus,
    handleSaveToDiary,
  };
}
