export function csvCell(value: string | number | null) {
  let text = value === null ? "" : String(value);
  // Protect formulas even behind whitespace/control characters. Numeric cells
  // originate from server calculations, not entity text supplied by users.
  if (typeof value === "string" && /^[\s\u0000-\u001f]*[=+\-@]/u.test(text))
    text = "'" + text;
  text = text.replace(/\u0000/g, "");
  return '"' + text.replace(/"/g, '""') + '"';
}
export function csvDocument(
  headers: string[],
  rows: Array<Array<string | number | null>>,
) {
  return (
    "\uFEFF" +
    [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") +
    "\r\n"
  );
}
