import { useState } from "react";
import { useAuth } from "../context/AuthContext";

// Mirrors useForgotPasswordForm.js's shape, with one deliberate difference:
// the backend tells us plainly whether the email has an account (a
// username on its own isn't sensitive enough to warrant hiding that, unlike
// a password-reset link), so we show whatever message it sends back rather
// than a hardcoded one.
export function useFindAccountForm() {
  const { findAccount } = useAuth();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [resultMessage, setResultMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const data = await findAccount(email);
      setResultMessage(data.detail);
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

  return { email, setEmail, submitted, resultMessage, error, submitting, handleSubmit };
}
