"use client";
/**
 * Keyboard reach for the 160 clickable divs (6 Sep 2026). Each carries
 * role="button" and tabIndex=0 now; this one listener turns Enter and
 * Space on any of them into the click the mouse would have made, so no
 * handler had to be rewritten.
 */
import { useEffect } from "react";

export default function A11y() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const el = e.target as HTMLElement | null;
      if (!el || el.tagName === "BUTTON" || el.tagName === "A" || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return;
      // Never inside something being typed into: on a contentEditable, Enter
      // is a new line and Space is a space (6 Sep 2026).
      if (el.isContentEditable || el.closest("[contenteditable='true'], [contenteditable='']")) return;
      if (el.getAttribute("role") !== "button") return;
      e.preventDefault();
      el.click();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
