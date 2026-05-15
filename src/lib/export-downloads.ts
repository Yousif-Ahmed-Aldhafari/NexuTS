type TabularExportPayload = {
  headers: string[];
  rows: string[][];
};

type PdfExportPayload = TabularExportPayload & {
  title: string;
};

type XlsxExportPayload = TabularExportPayload & {
  sheetName: string;
};

const textEncoder = new TextEncoder();

const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

const stripUnsupportedXmlChars = (value: string) =>
  Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0);
      if (codePoint === undefined) return false;
      return codePoint === 0x9 || codePoint === 0xa || codePoint === 0xd || codePoint >= 0x20;
    })
    .join("");

const sanitizeXml = (value: string) =>
  stripUnsupportedXmlChars(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const sanitizePdfText = (value: string) =>
  value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[^\x20-\x7E\n]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

const wrapLine = (value: string, maxLength: number) => {
  if (!value) return [""];

  const words = value.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (!currentLine) {
      if (word.length <= maxLength) {
        currentLine = word;
        continue;
      }

      for (let index = 0; index < word.length; index += maxLength) {
        lines.push(word.slice(index, index + maxLength));
      }
      continue;
    }

    const nextLine = `${currentLine} ${word}`;
    if (nextLine.length <= maxLength) {
      currentLine = nextLine;
      continue;
    }

    lines.push(currentLine);
    if (word.length <= maxLength) {
      currentLine = word;
      continue;
    }

    for (let index = 0; index < word.length; index += maxLength) {
      lines.push(word.slice(index, index + maxLength));
    }
    currentLine = "";
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

const toUint16LE = (value: number) => new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);

const toUint32LE = (value: number) =>
  new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);

const concatBytes = (chunks: Uint8Array[]) => {
  const totalSize = chunks.reduce((size, chunk) => size + chunk.length, 0);
  const result = new Uint8Array(totalSize);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
};

const crc32Table = (() => {
  const table = new Uint32Array(256);

  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let j = 0; j < 8; j += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }

  return table;
})();

const getCrc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
};

const getColumnLabel = (columnIndex: number) => {
  let index = columnIndex + 1;
  let result = "";

  while (index > 0) {
    const modulo = (index - 1) % 26;
    result = String.fromCharCode(65 + modulo) + result;
    index = Math.floor((index - 1) / 26);
  }

  return result;
};

const buildStoredZip = (entries: Array<{ path: string; content: string }>) => {
  const localRecords: Uint8Array[] = [];
  const centralDirectoryRecords: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const fileNameBytes = textEncoder.encode(entry.path);
    const dataBytes = textEncoder.encode(entry.content);
    const crc = getCrc32(dataBytes);
    const dataSize = dataBytes.length;

    const localHeader = concatBytes([
      toUint32LE(0x04034b50),
      toUint16LE(20),
      toUint16LE(0),
      toUint16LE(0),
      toUint16LE(0),
      toUint16LE(0),
      toUint32LE(crc),
      toUint32LE(dataSize),
      toUint32LE(dataSize),
      toUint16LE(fileNameBytes.length),
      toUint16LE(0),
      fileNameBytes,
      dataBytes,
    ]);

    const centralDirectoryHeader = concatBytes([
      toUint32LE(0x02014b50),
      toUint16LE(20),
      toUint16LE(20),
      toUint16LE(0),
      toUint16LE(0),
      toUint16LE(0),
      toUint16LE(0),
      toUint32LE(crc),
      toUint32LE(dataSize),
      toUint32LE(dataSize),
      toUint16LE(fileNameBytes.length),
      toUint16LE(0),
      toUint16LE(0),
      toUint16LE(0),
      toUint16LE(0),
      toUint32LE(0),
      toUint32LE(localOffset),
      fileNameBytes,
    ]);

    localOffset += localHeader.length;
    localRecords.push(localHeader);
    centralDirectoryRecords.push(centralDirectoryHeader);
  }

  const centralDirectoryStart = localOffset;
  const centralDirectorySize = centralDirectoryRecords.reduce((size, record) => size + record.length, 0);
  const totalEntries = entries.length;

  const endOfCentralDirectory = concatBytes([
    toUint32LE(0x06054b50),
    toUint16LE(0),
    toUint16LE(0),
    toUint16LE(totalEntries),
    toUint16LE(totalEntries),
    toUint32LE(centralDirectorySize),
    toUint32LE(centralDirectoryStart),
    toUint16LE(0),
  ]);

  return concatBytes([...localRecords, ...centralDirectoryRecords, endOfCentralDirectory]);
};

const buildPdfDocument = ({ title, headers, rows }: PdfExportPayload) => {
  const lines: string[] = [];
  lines.push(title);
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push("");

  if (rows.length === 0) {
    lines.push("No rows available for export.");
  } else {
    rows.forEach((row, rowIndex) => {
      lines.push(`Row ${rowIndex + 1}`);
      headers.forEach((header, columnIndex) => {
        const rawValue = row[columnIndex] || "-";
        const wrappedLines = wrapLine(`${header}: ${rawValue}`, 100);
        lines.push(...wrappedLines);
      });
      lines.push("");
    });
  }

  const maxLinesPerPage = 48;
  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += maxLinesPerPage) {
    pages.push(lines.slice(index, index + maxLinesPerPage));
  }

  if (pages.length === 0) {
    pages.push(["No data"]);
  }

  const objects: string[] = [""];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";

  const pageObjectNumbers: number[] = [];
  const contentObjectNumbers: number[] = [];
  let objectNumber = 3;

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    pageObjectNumbers.push(objectNumber);
    contentObjectNumbers.push(objectNumber + 1);
    objectNumber += 2;
  }

  const fontObjectNumber = objectNumber;
  objectNumber += 1;

  objects[2] = `<< /Type /Pages /Count ${pages.length} /Kids [${pageObjectNumbers.map((value) => `${value} 0 R`).join(" ")}] >>`;

  pages.forEach((pageLines, pageIndex) => {
    const pageObjectNumber = pageObjectNumbers[pageIndex];
    const contentObjectNumber = contentObjectNumbers[pageIndex];

    const streamLines = pageLines.map((line, lineIndex) => {
      const escaped = sanitizePdfText(line);
      if (lineIndex === 0) {
        return `36 756 Td (${escaped}) Tj`;
      }
      return `T* (${escaped}) Tj`;
    });

    const streamContent = `BT\n/F1 10 Tf\n14 TL\n${streamLines.join("\n")}\nET`;
    const streamLength = textEncoder.encode(streamContent).length;

    objects[pageObjectNumber] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`;
    objects[contentObjectNumber] = `<< /Length ${streamLength} >>\nstream\n${streamContent}\nendstream`;
  });

  objects[fontObjectNumber] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  const sections: string[] = [];
  const pushSection = (value: string) => {
    sections.push(value);
  };
  const getCurrentOffset = () => textEncoder.encode(sections.join("")).length;

  pushSection("%PDF-1.4\n");
  const offsets: number[] = [0];

  for (let index = 1; index < objectNumber; index += 1) {
    offsets[index] = getCurrentOffset();
    pushSection(`${index} 0 obj\n${objects[index]}\nendobj\n`);
  }

  const xrefOffset = getCurrentOffset();
  pushSection(`xref\n0 ${objectNumber}\n`);
  pushSection("0000000000 65535 f \n");
  for (let index = 1; index < objectNumber; index += 1) {
    pushSection(`${offsets[index].toString().padStart(10, "0")} 00000 n \n`);
  }
  pushSection(`trailer\n<< /Size ${objectNumber} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  return textEncoder.encode(sections.join(""));
};

const normalizeSheetName = (value: string) => {
  const withoutInvalidChars = value.replace(/[\\/*?:[\]]/g, " ").trim();
  return (withoutInvalidChars || "Sheet1").slice(0, 31);
};

const buildWorksheetXml = (headers: string[], rows: string[][]) => {
  const allRows = [headers, ...rows];

  const rowXml = allRows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const cellXml = row
        .map((cellValue, columnIndex) => {
          const columnLabel = getColumnLabel(columnIndex);
          const cellRef = `${columnLabel}${rowNumber}`;
          const value = sanitizeXml(cellValue);
          return `<c r="${cellRef}" t="inlineStr"><is><t xml:space="preserve">${value}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowNumber}">${cellXml}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${rowXml}</sheetData>
</worksheet>`;
};

const buildXlsxDocument = ({ headers, rows, sheetName }: XlsxExportPayload) => {
  const safeSheetName = sanitizeXml(normalizeSheetName(sheetName));
  const worksheetXml = buildWorksheetXml(headers, rows);

  const files = [
    {
      path: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
    },
    {
      path: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      path: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${safeSheetName}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`,
    },
    {
      path: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
    },
    {
      path: "xl/worksheets/sheet1.xml",
      content: worksheetXml,
    },
  ];

  return buildStoredZip(files);
};

export const downloadCsv = ({ headers, rows, fileName }: TabularExportPayload & { fileName: string }) => {
  const csvRows = [headers, ...rows].map((row) => row.map(csvCell).join(","));
  const csvContent = csvRows.join("\n");
  const csvBlob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  downloadBlob(csvBlob, fileName);
};

export const downloadPdf = ({ headers, rows, title, fileName }: PdfExportPayload & { fileName: string }) => {
  const pdfBytes = buildPdfDocument({ headers, rows, title });
  downloadBlob(new Blob([pdfBytes], { type: "application/pdf" }), fileName);
};

export const downloadXlsx = ({ headers, rows, sheetName, fileName }: XlsxExportPayload & { fileName: string }) => {
  const xlsxBytes = buildXlsxDocument({ headers, rows, sheetName });
  downloadBlob(
    new Blob([xlsxBytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    fileName,
  );
};
