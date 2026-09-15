"use client";

import { useState } from "react";
import Icon from "../Icon";

export default function PasswordToggleInput({
  id,
  name,
  placeholder,
  autoComplete,
  minLength,
}: {
  id: string;
  name: string;
  placeholder: string;
  autoComplete: string;
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="auth-input-wrap">
      <input
        className="auth-input has-toggle"
        type={visible ? "text" : "password"}
        id={id}
        name={name}
        placeholder={placeholder}
        autoComplete={autoComplete}
        minLength={minLength}
      />
      <button
        type="button"
        className="auth-toggle"
        aria-label={visible ? "Hide password" : "Show password"}
        onClick={() => setVisible((v) => !v)}
      >
        <Icon name={visible ? "visibility_off" : "visibility"} />
      </button>
    </div>
  );
}
