import { useState } from "react";
import { useAuth } from "../context/AuthContext";

// Pulls a readable message out of a DRF error response -- the backend
// returns different shapes depending on which check failed
// (non_field_errors for the "wrong credentials" / "already verified" cases,
// a per-field array for a bad new_email), so this checks the common shapes
// in order rather than assuming one.
function extractServerError(err) {
  const data = err.response?.data;
  if (!data) return null;
  if (Array.isArray(data.non_field_errors) && data.non_field_errors[0]) {
    return data.non_field_errors[0];
  }
  for (const field of ["new_email", "username", "password"]) {
    if (Array.isArray(data[field]) && data[field][0]) {
      return data[field][0];
    }
  }
  return null;
}

// Extracted verbatim from ResendVerificationPage.jsx's state/handlers, as
// part of the frontend structure cleanup (Sub-project 1). See
// FRONTEND_REFACTOR_IMPLEMENTATION_PLAN.md Task 7.
export function useResendVerification() {
  const { resendVerification, changeUnverifiedEmail } = useAuth();

  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // "Wrong email?" flow -- separate from the form above since it needs
  // username + password to prove account ownership instead of the
  // (possibly wrong, possibly unreachable) old email address.
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [changeUsername, setChangeUsername] = useState("");
  const [changePassword, setChangePassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [changeSubmitted, setChangeSubmitted] = useState(false);
  const [changeError, setChangeError] = useState("");
  const [changeSubmitting, setChangeSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await resendVerification(email);
      setSubmitted(true);
    } catch (err) {
      if (err.response?.status === 429) {
        setError("Too many requests. Please wait a minute and try again.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangeEmailSubmit = async (e) => {
    e.preventDefault();
    setChangeError("");
    setChangeSubmitting(true);
    try {
      await changeUnverifiedEmail(changeUsername, changePassword, newEmail);
      setChangeSubmitted(true);
    } catch (err) {
      if (err.response?.status === 429) {
        setChangeError("Too many requests. Please wait a minute and try again.");
      } else {
        setChangeError(extractServerError(err) || "Something went wrong. Please check your details and try again.");
      }
    } finally {
      setChangeSubmitting(false);
    }
  };

  return {
    email,
    setEmail,
    submitted,
    error,
    submitting,
    showChangeEmail,
    setShowChangeEmail,
    changeUsername,
    setChangeUsername,
    changePassword,
    setChangePassword,
    newEmail,
    setNewEmail,
    changeSubmitted,
    changeError,
    changeSubmitting,
    handleSubmit,
    handleChangeEmailSubmit,
  };
}
