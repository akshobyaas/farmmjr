import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Extracted verbatim from ResetPasswordPage.jsx's state/handler, as part
// of the frontend structure cleanup (Sub-project 1). See
// FRONTEND_REFACTOR_IMPLEMENTATION_PLAN.md Task 7. Takes `uid`/`token`
// instead of reading useParams() itself -- the page still owns routing.
export function useResetPasswordForm(uid, token) {
  const { confirmPasswordReset } = useAuth();
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPw) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset(uid, token, newPassword, confirmPw);
      setSuccess(true);
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      const data = err.response?.data;
      if (data?.new_password) {
        setError(Array.isArray(data.new_password) ? data.new_password[0] : data.new_password);
      } else if (data?.non_field_errors) {
        setError(Array.isArray(data.non_field_errors) ? data.non_field_errors[0] : data.non_field_errors);
      } else {
        setError("This reset link is invalid or has expired. Please request a new one.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return {
    newPassword,
    setNewPassword,
    confirmPw,
    setConfirmPw,
    error,
    success,
    submitting,
    handleSubmit,
  };
}
