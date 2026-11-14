"use client";

import { forwardRef, useEffect, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

/** Reveals only the value currently entered; never fetches stored credentials. */
export const SecretInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function SecretInput(props, ref) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const conceal = () => { if (document.hidden) setVisible(false); };
    document.addEventListener("visibilitychange", conceal);
    return () => document.removeEventListener("visibilitychange", conceal);
  }, []);
  return <span className="secret-control" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setVisible(false); }}>
    <input {...props} ref={ref} type={visible ? "text" : "password"} spellCheck={false} autoCapitalize="none" />
    <button type="button" className="secret-toggle" disabled={props.disabled} aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} onClick={() => setVisible(value => !value)}>
      {visible ? <EyeOff size={20} aria-hidden="true"/> : <Eye size={20} aria-hidden="true"/>}
    </button>
  </span>;
});
