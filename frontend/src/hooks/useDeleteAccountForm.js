import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Self-service account deletion -- a two-step UI (reveal the password
// field via startConfirming, then actually submit) instead of a native
// confirm() dialog, matching the rest of the app's custom-form style.
// Requires the caller's own password, mirroring the backend's
// AccountDeleteSerializer, which is the thing actually proving ownership.
export function useDeleteAccountForm() {
  const { deleteAccount } = useAuth();
  const navigate = useNavigate();

  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const startConfirming = () => {
    setError("");
    setPassword("");
    setConfirming(true);
  };

  const cancelConfirming = () => {
    setError("");
    setPassword("");
    setConfirming(false);
  };

  const handleDelete = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await deleteAccount(password);
      navigate("/login");
    } catch (err) {
      const serverMessage = err.response?.data?.password?.[0];
      setError(serverMessage || "Could not delete your account. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return {
    confirming, startConfirming, cancelConfirming,
    password, setPassword, error, submitting, handleDelete,
  };
}
