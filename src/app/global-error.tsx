"use client";
export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          background: "#09090b",
          color: "#f4f4f5",
          fontFamily: "system-ui",
          padding: "2rem",
        }}
      >
        <main>
          <h1>CineBite temporarily unavailable</h1>
          <p role="alert">
            Check existing order/payment status before repeating a financial
            action.
          </p>
          <button
            type="button"
            onClick={retry}
            style={{
              cursor: "pointer",
              background: "#fbbf24",
              border: 0,
              borderRadius: 8,
              padding: "12px 20px",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
