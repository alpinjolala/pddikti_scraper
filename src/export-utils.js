function escapeCsvValue(value) {
  const str = String(value ?? '');
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatDelimitedCell(value, delimiter) {
  if (delimiter === '\t') {
    return String(value ?? '').replace(/[\t\r\n]+/g, ' ');
  }
  return escapeCsvValue(value);
}

function rowsToDelimited(rows, columns, delimiter = ',') {
  const headerLine = columns.map((c) => formatDelimitedCell(c, delimiter)).join(delimiter);
  const dataLines = rows.map((row) =>
    columns.map((col) => formatDelimitedCell(row[col] ?? '', delimiter)).join(delimiter)
  );
  return [headerLine, ...dataLines].join('\r\n');
}

function rowsToCsv(rows, columns) {
  // Tambahkan UTF-8 BOM agar Excel langsung membaca karakter Indonesia dengan benar
  return '\uFEFF' + rowsToDelimited(rows, columns, ',');
}

function rowsToTsv(rows, columns) {
  return rowsToDelimited(rows, columns, '\t');
}

function sanitizeFilenamePart(text) {
  return String(text || 'pddikti_dosen')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function triggerDownload(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

window.PddiktiExport = {
  rowsToCsv,
  rowsToTsv,
  sanitizeFilenamePart,
  triggerDownload,
  escapeHtml
};
