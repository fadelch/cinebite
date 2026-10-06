import type { KeyboardEvent } from "react";

// Native dialog makes background inert. Explicit wrap also prevents Tab from
// leaving the confirmation controls for browser chrome on mobile Chromium.
export function trapDialogFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab") return;
  const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex='0']")];
  const first = controls[0], last = controls.at(-1);
  if (!first || !last) { event.preventDefault(); return; }
  if (event.shiftKey && (document.activeElement === first || !event.currentTarget.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && (document.activeElement === last || !event.currentTarget.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
}
