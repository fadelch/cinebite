"use client";

export function PrintButton() {
  return <button type="button" className="cb-button-primary print:hidden" onClick={() => window.print()}>Print labels</button>;
}
