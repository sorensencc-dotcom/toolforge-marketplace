import { resolve, extname } from "node:path";
import { existsSync, statSync, readFileSync } from "node:fs";
import { PDFParse } from "pdf-parse";

// Real text-layer extraction (replaces the xberg-mock stub, see TODOS.md).
// OCR fallback for scanned/image-only PDFs is not implemented yet — pages
// with no extractable text layer are flagged `needs_ocr: true` instead of
// silently returning empty text.
const MIN_CHARS_PER_PAGE = 10;

export async function ingest({ file }) {
  if (!file) {
    throw new Error("Missing required argument: file");
  }
  const pdfPath = resolve(file);
  if (extname(pdfPath).toLowerCase() !== ".pdf") {
    throw new Error(`Refusing to process non-PDF path: ${pdfPath}`);
  }
  if (!existsSync(pdfPath) || !statSync(pdfPath).isFile()) {
    throw new Error(`File not found: ${pdfPath}`);
  }

  const buffer = readFileSync(pdfPath);
  const parser = new PDFParse({ data: buffer });
  let result;
  try {
    result = await parser.getText();
  } finally {
    await parser.destroy();
  }

  const pages = result.pages.map((page) => {
    const trimmed = page.text.trim();
    return {
      page_number: page.num,
      text: trimmed,
      needs_ocr: trimmed.length < MIN_CHARS_PER_PAGE,
    };
  });

  return {
    plugin: "toolforge-pdf-ingestion",
    version: "1.1.0",
    data: {
      file: pdfPath,
      status: "success",
      extracted_at: new Date().toISOString(),
      page_count: result.total,
      pages,
    },
  };
}
