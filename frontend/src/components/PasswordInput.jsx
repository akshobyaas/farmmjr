import { useState } from "react";
import Icon from "./Icon";

/**
 * Drop-in replacement for `<input type="password" className="form-input" ... />`
 * that adds a show/hide toggle button inside the field. Every prop other than
 * `className` is passed straight through to the underlying <input> (id, name,
 * value, onChange, autoComplete, required, etc.), so it works with the
 * existing <label htmlFor="..."> wiring (and the tests' getByLabelText calls)
 * without any other change at the call site.
 *
 * Starts hidden (type="password") on every render, matching normal browser
 * password-field behavior -- visibility is a per-field UI toggle, not part of
 * form state.
 */
export default function PasswordInput({ className = "form-input", ...rest }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-field">
      <input
        {...rest}
        type={visible ? "text" : "password"}
        className={`${className} password-field-input`}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
      >
        <Icon name={visible ? "eyeOff" : "eye"} size={20} />
      </button>
    </div>
  );
}
