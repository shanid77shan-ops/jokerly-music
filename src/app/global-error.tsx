"use client";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html>
      <body style={{ background: "#000", color: "#fff", fontFamily: "monospace", padding: "2rem" }}>
        <h1 style={{ color: "#f00" }}>Error</h1>
        <p>{error?.message ?? "Unknown error"}</p>
        {error?.digest && <p style={{ color: "#888" }}>Digest: {error.digest}</p>}
        <pre style={{ color: "#aaa", fontSize: "12px", marginTop: "1rem" }}>{error?.stack}</pre>
      </body>
    </html>
  );
}
