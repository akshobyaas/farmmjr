import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Extracted verbatim from LoginPage.jsx's state/handler, as part of the
// frontend structure cleanup (Sub-project 1). See
// FRONTEND_REFACTOR_IMPLEMENTATION_PLAN.md Task 7.
export function useLoginForm() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setNeedsVerification(false);
    setSubmitting(true);
    try {
      await login(username, password);
      navigate("/dashboard");
    } catch (err) {
      const status = err.response?.status;
      const code = err.response?.data?.code?.[0] || err.response?.data?.code;
      if (status === 429) {
        setError("Too many attempts. Please wait a minute and try again.");
      } else if (code === "email_not_verified") {
        setError("Please verify your email address before logging in.");
        setNeedsVerification(true);
      } else {
        setError("Incorrect username or password. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return {
    username,
    setUsername,
    password,
    setPassword,
    error,
    needsVerification,
    submitting,
    handleSubmit,
  };
}
