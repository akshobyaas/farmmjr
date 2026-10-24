import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { languageStorage } from "../i18n/languageStorage";

function getPasswordHints(password) {
  return {
    minLength: password.length >= 8,
    notAllNumeric: password.length > 0 && !/^\d+$/.test(password),
  };
}

// Extracted verbatim from RegisterPage.jsx's state/handlers, as part of
// the frontend structure cleanup (Sub-project 1). See
// FRONTEND_REFACTOR_IMPLEMENTATION_PLAN.md Task 7.
export function useRegisterForm() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    password_confirm: "",
    // Phase 18/22 -- default to whatever language they're already viewing
    // the page in (their LanguageSwitcher pick, or a returning visitor's
    // saved choice), not a hardcoded "en", so the dropdown below starts in
    // agreement with what they're reading.
    preferred_language: languageStorage.get() || "en",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const hints = getPasswordHints(form.password);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (form.password !== form.password_confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await register({ ...form, role: "farmer" });
      navigate("/login");
    } catch (err) {
      const data = err.response?.data;
      if (data && typeof data === "object") {
        const firstField = Object.keys(data)[0];
        const message = Array.isArray(data[firstField]) ? data[firstField][0] : data[firstField];
        setError(message || "Something went wrong. Please try again.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return { form, error, submitting, hints, handleChange, handleSubmit };
}
