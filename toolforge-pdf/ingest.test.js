import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ingest } from "./server.js";

const execFileAsync = promisify(execFile);

const FIXTURE = resolve(
  import.meta.dirname,
  "../cic-ingestion/pdf/incoming/64-167-65_SorensenCharlesE.pdf"
);
const LOCAL_FIXTURE = resolve(import.meta.dirname, "./fixtures/sample.pdf");
const MULTIPAGE_FIXTURE = resolve(import.meta.dirname, "./fixtures/multipage.pdf");
const SCANNED_FIXTURE = resolve(import.meta.dirname, "./fixtures/scanned.pdf");
const MALFORMED_FIXTURE = resolve(import.meta.dirname, "./fixtures/malformed.pdf");
const UPPERCASE_FIXTURE = resolve(import.meta.dirname, "./fixtures/uppercase.PDF");
const FIXTURES_DIR = resolve(import.meta.dirname, "./fixtures");

test("ingest() extracts text from in-repo synthetic PDF fixture", async () => {
  const result = await ingest({ file: LOCAL_FIXTURE });

  assert.equal(result.data.status, "success");
  assert.equal(result.data.page_count, 1);
  assert.ok(result.data.pages.length > 0);

  const firstPageText = result.data.pages[0].text;
  assert.match(firstPageText, /Toolforge Synthetic PDF Test Fixture/i);
});

test("ingest() processes multi-page PDFs with sequential page numbers and mapped text", async () => {
  const result = await ingest({ file: MULTIPAGE_FIXTURE });

  assert.equal(result.data.status, "success");
  assert.equal(result.data.page_count, 3);
  assert.equal(result.data.pages.length, 3);

  // Assert 1-based sequential page numbers
  assert.deepEqual(
    result.data.pages.map((p) => p.page_number),
    [1, 2, 3]
  );

  // Assert text stays associated with correct page
  assert.match(result.data.pages[0].text, /Page 1 Content/);
  assert.match(result.data.pages[1].text, /Page 2 Content/);
  assert.match(result.data.pages[2].text, /Page 3 Content/);
});

test("ingest() sets needs_ocr based on character count threshold", async () => {
  const normalResult = await ingest({ file: LOCAL_FIXTURE });
  assert.equal(normalResult.data.pages[0].needs_ocr, false, "text >= 10 chars sets needs_ocr: false");

  const scannedResult = await ingest({ file: SCANNED_FIXTURE });
  assert.equal(scannedResult.data.pages[0].needs_ocr, true, "text < 10 chars sets needs_ocr: true");
});

test("ingest() rejects malformed PDF bytes with a stable error", async () => {
  await assert.rejects(
    () => ingest({ file: MALFORMED_FIXTURE }),
    (err) => {
      assert.ok(err instanceof Error);
      assert.ok(err.message.length > 0);
      return true;
    }
  );
});

test("ingest() handles filesystem edge cases cleanly", async () => {
  // Directory path
  await assert.rejects(
    () => ingest({ file: FIXTURES_DIR }),
    /Refusing to process non-PDF path|File not found/
  );

  // Uppercase .PDF extension
  const uppercaseResult = await ingest({ file: UPPERCASE_FIXTURE });
  assert.equal(uppercaseResult.data.status, "success");

  // Relative path resolution
  const relativePath = "./toolforge-pdf/fixtures/sample.pdf";
  const relativeResult = await ingest({ file: relativePath });
  assert.equal(relativeResult.data.status, "success");
  assert.ok(isAbsolute(relativeResult.data.file), "data.file is absolute path");
});

test("ingest() produces a stable, strictly-typed output envelope", async () => {
  const result = await ingest({ file: LOCAL_FIXTURE });

  assert.equal(result.plugin, "toolforge-pdf-ingestion");
  assert.equal(result.version, "1.1.0");
  assert.ok(isAbsolute(result.data.file));
  assert.ok(!isNaN(Date.parse(result.data.extracted_at)), "extracted_at is a valid ISO timestamp");

  for (const page of result.data.pages) {
    const keys = Object.keys(page).sort();
    assert.deepEqual(keys, ["needs_ocr", "page_number", "text"]);
    assert.equal(typeof page.page_number, "number");
    assert.equal(typeof page.text, "string");
    assert.equal(typeof page.needs_ocr, "boolean");
  }
});

test("CLI toolforge exec invokes pdf ingestion and outputs valid JSON", async () => {
  const cliPath = resolve(import.meta.dirname, "../src/cli/index.js");

  const { stdout } = await execFileAsync(process.execPath, [
    cliPath,
    "exec",
    "toolforge-pdf-ingestion",
    "ingest",
    LOCAL_FIXTURE,
  ]);

  const parsed = JSON.parse(stdout);
  assert.equal(parsed.plugin, "toolforge-pdf-ingestion");
  assert.equal(parsed.data.status, "success");

  await assert.rejects(
    () => execFileAsync(process.execPath, [cliPath, "exec", "toolforge-pdf-ingestion", "ingest", "nonexistent.pdf"]),
    (err) => {
      assert.ok(err.code !== 0);
      return true;
    }
  );
});

test("ingest() extracts real text from external vault fixture if present", { skip: !existsSync(FIXTURE) && "fixture lives outside repo in cic-research-vault; not present in this checkout" }, async () => {
  const result = await ingest({ file: FIXTURE });

  assert.equal(result.data.status, "success");
  assert.ok(result.data.page_count > 1000, "expected a multi-hundred-page real PDF");
  assert.ok(result.data.pages.length > 0);

  const firstPageText = result.data.pages[0].text;
  assert.ok(
    !firstPageText.includes("mock extracted text"),
    "regression: ingest() is returning xberg-mock placeholder text again"
  );
  assert.match(firstPageText, /Sorensen/i);
});

test("ingest() rejects missing file argument", async () => {
  await assert.rejects(() => ingest({}), /Missing required argument: file/);
});

test("ingest() rejects non-PDF paths", async () => {
  await assert.rejects(
    () => ingest({ file: resolve(import.meta.dirname, "./manifest.json") }),
    /Refusing to process non-PDF path/
  );
});

test("ingest() rejects a PDF path that does not exist", async () => {
  await assert.rejects(
    () => ingest({ file: resolve(import.meta.dirname, "./nonexistent.pdf") }),
    /File not found/
  );
});
