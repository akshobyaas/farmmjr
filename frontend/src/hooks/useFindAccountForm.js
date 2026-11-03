import { useState } from "react";
import { useAuth } from "../context/AuthContext";

// Mirrors useForgotPasswordForm.js's shape -- "find my account" and "forgot
// password" are the same flow (take an email, always say "if it exists...",
// never surface whether the account is real).
export function useFindAccountForm() {
  const { findAccount } = useAuth();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await findAccount(email);
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

  return { email, setEmail, submitted, error, submitting, handleSubmit };
}
