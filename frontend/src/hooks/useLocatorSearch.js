import { useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchNearbyServices } from "../api/locator";

// Extracted verbatim from LocatorPage.jsx's search state/handlers, as
// part of the frontend structure cleanup (Sub-project 1). See
// FRONTEND_REFACTOR_IMPLEMENTATION_PLAN.md Task 7. `view` ("list"/"map")
// is NOT moved here -- it's pure display state that never affects what
// gets fetched, so it stays in the page.
export function useLocatorSearch() {
  const { t } = useTranslation();
  const [placeInput, setPlaceInput] = useState("");
  const [origin, setOrigin] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  const runSearch = (params) => {
    setLoading(true);
    setError("");
    setResults(null);
    setSearched(true);
    return fetchNearbyServices(params)
      .then((data) => {
        setOrigin(data.origin);
        setResults(data.results);
      })
      .catch((err) => {
        setError(err.response?.data?.detail || t("locator.fetchError"));
      })
      .finally(() => setLoading(false));
  };

  const handlePlaceSubmit = (e) => {
    e.preventDefault();
    if (!placeInput.trim()) return;
    return runSearch({ place: placeInput.trim() });
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setError(t("common.geoUnsupported"));
      return;
    }
    setLoading(true);
    setError("");
    // The browser itself shows the permission prompt here -- we never
    // access location silently.
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve(runSearch({ lat: position.coords.latitude, lon: position.coords.longitude }));
        },
        () => {
          setLoading(false);
          setError(t("common.geoDenied"));
          resolve();
        }
      );
    });
  };

  return {
    placeInput,
    setPlaceInput,
    origin,
    results,
    loading,
    error,
    searched,
    handlePlaceSubmit,
    handleUseMyLocation,
  };
}
