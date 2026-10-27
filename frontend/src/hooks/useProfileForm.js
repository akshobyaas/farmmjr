import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

// The fields this form actually edits and saves. Username, email, role, and
// is_verified are all server-controlled/read-only (see ProfileSerializer's
// own read_only_fields) and preferred_language is no longer edited here --
// the always-visible AppHeader LanguageSwitcher is now the only place that
// changes it, and already PATCHes it itself (see LanguageSwitcher.jsx) --
// so this is also exactly the set of fields "isDirty" compares.
const EDITABLE_FIELDS = ["first_name", "last_name", "phone_number", "home_location"];

// Extracted verbatim from ProfilePage.jsx's state/effect/handlers, as
// part of the frontend structure cleanup (Sub-project 1). See
// FRONTEND_REFACTOR_IMPLEMENTATION_PLAN.md Task 7.
export function useProfileForm() {
  const { getProfile, updateProfile } = useAuth();

  const [form, setForm] = useState(null);
  // The last known-saved values, kept separately so the Save Changes button
  // can be hidden until something actually differs from them -- set once on
  // load, and again after every successful save.
  const [savedForm, setSavedForm] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getProfile()
      .then((data) => {
        setForm(data);
        setSavedForm(data);
      })
      .catch(() => setError("Could not load your profile. Please try again."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (e) => {
    setSuccess(false);
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const isDirty =
    !!form &&
    !!savedForm &&
    EDITABLE_FIELDS.some((field) => form[field] !== savedForm[field]);

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
      });
      setSuccess(true);
      setSavedForm(form);
    } catch {
      setError("Could not save your changes. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return { form, error, success, submitting, isDirty, handleChange, handleSubmit };
}
