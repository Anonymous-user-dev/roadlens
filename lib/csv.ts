function csvCell(value: unknown) {
  const text = String(value ?? "");
  const protectedText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${protectedText.replaceAll('"', '""')}"`;
}

export function buildCsv(headers: readonly unknown[], rows: readonly (readonly unknown[])[]) {
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}
