import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";

// Extracted verbatim from ProfilePage.jsx's state/effect/handlers, as
// part of the frontend structure cleanup (Sub-project 1). See
// FRONTEND_REFACTOR_IMPLEMENTATION_PLAN.md Task 7.
export function useProfileForm() {
  const { getProfile, updateProfile } = useAuth();
  const { i18n } = useTranslation();

  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getProfile()
      .then((data) => setForm(data))
      .catch(() => setError("Could not load your profile. Please try again."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (e) => {
    setSuccess(false);
    setForm({ ...form, [e.target.name]: e.target.value });
    // Phase 18 -- preview the language switch live as soon as it's picked,
    // before "Save Changes" persists it to the backend. Saving (below)
    // updates AuthContext's `user`, which re-applies this same language on
    // every future login/session-restore.
    if (e.target.name === "preferred_language") {
      i18n.changeLanguage(e.target.value);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess(false);
    setSubmitting(true);
    try {
      await updateProfile({
        first_name: form.first_name,
        last_name: form.last_name,
        phone_number: form.phone_number,
        home_location: form.home_location,
        preferred_language: form.preferred_language,
      });
      setSuccess(true);
    } catch {
      setError("Could not save your changes. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return { form, error, success, submitting, handleChange, handleSubmit };
}
