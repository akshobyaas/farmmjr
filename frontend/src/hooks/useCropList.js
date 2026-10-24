import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { fetchCrops } from "../api/crops";

// Extracted verbatim from CropListPage.jsx's state/effect/handlers, as
// part of the frontend structure cleanup (Sub-project 1). See
// FRONTEND_REFACTOR_IMPLEMENTATION_PLAN.md Task 7.
export function useCropList() {
  const { t } = useTranslation();
  const [crops, setCrops] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadCrops = useCallback((query) => {
    setLoading(true);
    setError("");
    fetchCrops(query)
      .then((data) => setCrops(data))
      .catch(() => setError(t("crops.cropsLoadError")))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    loadCrops("");
  }, [loadCrops]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadCrops(search);
  };

  return { crops, search, setSearch, loading, error, handleSearchSubmit };
}
