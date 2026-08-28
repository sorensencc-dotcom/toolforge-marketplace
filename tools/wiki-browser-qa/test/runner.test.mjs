import assert from 'node:assert/strict';
import test from 'node:test';

import { runWikiQa } from '../runner.mjs';

const BASE_URL = 'https://example.test/wiki';

function passingObservation(url) {
  return {
    url,
    title: 'Architecture Overview',
    text: 'Architecture Overview\nA readable page.',
    domAssertions: [{ role: 'heading', level: 1, text: 'Architecture Overview' }],
    consoleErrors: [],
    failedRequests: [],
    links: [],
    images: [],
    diagrams: [],
    viewport: {
      desktop: { width: 1280, height: 720, overflow: false },
      mobile: { width: 375, height: 812, overflow: false },
    },
  };
}

function createFs() {
  const writes = [];
  return {
    writes,
    async writeFile(path, contents) { writes.push({ path, report: JSON.parse(contents) }); },
  };
}

function createAdapter(openPage) {
  return {
    async checkExecutable() { return { available: true, version: '1.2.3', diagnostics: 'ready' }; },
    openPage,
    async close() {},
  };
}

function dependencies(adapter, fs = createFs(), extra = {}) {
  return {
    adapter,
    fs,
    clock: { now: () => '2026-08-26T12:00:00.000Z', sleep: async () => {} },
    policy: { pages: [] },
    ...extra,
  };
}

test('runs explicitly selected pages once after URL deduplication', async () => {
  const calls = [];
  const fs = createFs();
  const result = await runWikiQa({
    WIKI_QA_BASE_URL: BASE_URL,
    WIKI_QA_PAGES: 'Architecture, Architecture, /Architecture/',
  }, dependencies(createAdapter(async (url) => {
    calls.push(url);
    return passingObservation(url);
  }), fs));

  assert.equal(calls.length, 1);
  assert.deepEqual(result.report.pages.map((page) => page.slug), ['Architecture']);
  assert.equal(result.exitCode, 0);
  assert.equal(fs.writes[0].path, '.artifacts/wiki-qa/report.json');
});

test('rejects explicit pages outside the configured Wiki origin or prefix', async () => {
  for (const page of ['https://outside.example/wiki/One', 'https://example.test/not-wiki/One']) {
    const calls = [];
    const adapter = createAdapter(async (url) => {
      calls.push(url);
      return passingObservation(url);
    });

    const result = await runWikiQa({
      WIKI_QA_BASE_URL: BASE_URL,
      WIKI_QA_PAGES: page,
    }, dependencies(adapter));

    assert.deepEqual(calls, []);
    assert.equal(result.report.partial, true);
    assert.equal(result.report.discoveryError.kind, 'invalid-page-selection');
    assert.match(result.report.reason, /outside the configured Wiki origin or prefix/i);
    assert.equal(result.exitCode, 1);
  }
});

test('passes .markdown-body content selector to the adapter for GitHub-rendered wiki pages', async () => {
  const seen = [];
  const result = await runWikiQa({
    WIKI_QA_BASE_URL: 'https://github.com/sorensencc-dotcom/toolforge-marketplace/wiki',
    WIKI_QA_PAGES: 'GOVERNANCE',
  }, dependencies(createAdapter(async (url, options) => {
    seen.push(options?.contentSelector ?? null);
    return passingObservation(url);
  })));

  assert.deepEqual(seen, ['.markdown-body']);
  assert.equal(result.report.contentSelector, '.markdown-body');
});

test('passes the GitHub Wiki path as the default link scope', async () => {
  const seen = [];
  await runWikiQa({
    WIKI_QA_BASE_URL: 'https://github.com/sorensencc-dotcom/toolforge-marketplace/wiki',
    WIKI_QA_PAGES: 'GOVERNANCE',
  }, dependencies(createAdapter(async (url, options) => {
    seen.push(options?.linkScope ?? null);
    return passingObservation(url);
  })));
  assert.deepEqual(seen, ['/sorensencc-dotcom/toolforge']);
});

test('leaves the content selector unset for non-GitHub wiki targets', async () => {
  const seen = [];
  const result = await runWikiQa({
    WIKI_QA_BASE_URL: BASE_URL,
    WIKI_QA_PAGES: 'Architecture',
  }, dependencies(createAdapter(async (url, options) => {
    seen.push(options?.contentSelector ?? null);
    return passingObservation(url);
  })));

  assert.deepEqual(seen, [null]);
  assert.equal(result.report.contentSelector, undefined);
});

test('honours an explicit WIKI_QA_CONTENT_SELECTOR override', async () => {
  const seen = [];
  await runWikiQa({
    WIKI_QA_BASE_URL: BASE_URL,
    WIKI_QA_PAGES: 'Architecture',
    WIKI_QA_CONTENT_SELECTOR: 'main#content',
  }, dependencies(createAdapter(async (url, options) => {
    seen.push(options?.contentSelector ?? null);
    return passingObservation(url);
  })));

  assert.deepEqual(seen, ['main#content']);
});

test('discovers deduplicated Wiki links from the index when pages are not explicit', async () => {
  const calls = [];
  const adapter = createAdapter(async (url) => {
    calls.push(url);
    if (url === BASE_URL) {
      return {
        ...passingObservation(url),
        links: [
          { text: 'One', href: `${BASE_URL}/One`, ok: true },
          { text: 'One again', href: `${BASE_URL}/One/`, ok: true },
          { text: 'Outside', href: 'https://example.test/issues', ok: true },
        ],
      };
    }
    return passingObservation(url);
  });

  const result = await runWikiQa({ WIKI_QA_BASE_URL: BASE_URL }, dependencies(adapter));

  assert.deepEqual(calls, [BASE_URL, `${BASE_URL}/One`]);
  assert.deepEqual(result.report.pages.map((page) => page.slug), ['One']);
});

test('retries a transient initial index discovery failure before crawling pages', async () => {
  const calls = [];
  let indexAttempts = 0;
  const adapter = createAdapter(async (url) => {
    calls.push(url);
    if (url === BASE_URL) {
      indexAttempts += 1;
      if (indexAttempts === 1) {
        const error = new Error('index navigation timed out');
        error.kind = 'timeout';
        throw error;
      }
      return { ...passingObservation(url), links: [{ text: 'One', href: `${BASE_URL}/One`, ok: true }] };
    }
    return passingObservation(url);
  });

  const result = await runWikiQa({ WIKI_QA_BASE_URL: BASE_URL }, dependencies(adapter));

  assert.deepEqual(calls, [BASE_URL, BASE_URL, `${BASE_URL}/One`]);
  assert.equal(result.report.partial, false);
  assert.equal(result.report.pages[0].status, 'passed');
});

test('falls back to the publication inventory when index discovery yields no auditable pages', async () => {
  const result = await runWikiQa({ WIKI_QA_BASE_URL: BASE_URL }, dependencies(createAdapter(async (url) => passingObservation(url))));

  assert.equal(result.report.partial, false);
  assert.equal(result.report.pages.length, 3);
  assert.equal(result.exitCode, 0);
});

test('keeps page navigation within the configured conservative concurrency bound', async () => {
  let active = 0;
  let maximum = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const adapter = createAdapter(async (url) => {
    active += 1;
    maximum = Math.max(maximum, active);
    await gate;
    active -= 1;
    return passingObservation(url);
  });
  const run = runWikiQa({
    WIKI_QA_BASE_URL: BASE_URL,
    WIKI_QA_PAGES: 'One,Two,Three',
    WIKI_QA_CONCURRENCY: '2',
  }, dependencies(adapter));

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(maximum, 2);
  release();
  await run;
  assert.equal(maximum, 2);
});

test('retries transient navigation failures but records the successful final observation', async () => {
  let calls = 0;
  const adapter = createAdapter(async (url) => {
    calls += 1;
    if (calls === 1) {
      const error = new Error('navigation timed out');
      error.kind = 'timeout';
      throw error;
    }
    return passingObservation(url);
  });

  const result = await runWikiQa({ WIKI_QA_BASE_URL: BASE_URL, WIKI_QA_PAGES: 'One' }, dependencies(adapter));

  assert.equal(calls, 2);
  assert.equal(result.report.pages[0].status, 'passed');
  assert.equal(result.report.pages[0].attempts, 2);
});

test('does not retry assertion failures', async () => {
  let calls = 0;
  const adapter = createAdapter(async (url) => {
    calls += 1;
    return { ...passingObservation(url), title: 'one-slug' };
  });

  const result = await runWikiQa({ WIKI_QA_BASE_URL: BASE_URL, WIKI_QA_PAGES: 'One' }, dependencies(adapter));

  assert.equal(calls, 1);
  assert.equal(result.report.pages[0].status, 'failed');
  assert.equal(result.exitCode, 1);
});

test('passes required diagram rules to the adapter evidence collector', async () => {
  const diagramRule = {
    selector: '[data-diagram="architecture"]',
    sourceAsset: 'assets/architecture.svg',
  };
  let receivedOptions;
  const adapter = createAdapter(async (url, options) => {
    receivedOptions = options;
    return {
      ...passingObservation(url),
      diagrams: [{
        selector: '[data-diagram="architecture"]',
        sourceAsset: 'assets/architecture.svg',
        visible: true,
        loaded: true,
        sourceBacked: true,
        alt: 'Architecture diagram',
        caption: 'Architecture overview',
        viewports: {
          desktop: { visible: true, overflow: false },
          mobile: { visible: true, overflow: false },
        },
      }],
    };
  });
  const activePolicy = { pages: [{ slug: 'Architecture', requiredDiagrams: [diagramRule] }] };

  const result = await runWikiQa(
    { WIKI_QA_BASE_URL: BASE_URL, WIKI_QA_PAGES: 'Architecture' },
    dependencies(adapter, createFs(), { policy: activePolicy }),
  );

  assert.deepEqual(receivedOptions.diagramRules, [diagramRule]);
  assert.equal(result.report.pages[0].status, 'passed');
});

test('writes a partial report for pages left unfinished by timeout', async () => {
  const fs = createFs();
  let call = 0;
  const clock = {
    now: () => {
      call += 1;
      return call === 1 ? '2026-08-26T12:00:00.000Z' : '2026-08-26T12:00:01.000Z';
    },
    sleep: async () => {},
  };
  const result = await runWikiQa({
    WIKI_QA_BASE_URL: BASE_URL,
    WIKI_QA_PAGES: 'One,Two',
    WIKI_QA_TIMEOUT_MS: '50',
  }, dependencies(createAdapter(async (url) => passingObservation(url)), fs, { clock }));

  assert.equal(result.report.partial, true);
  assert.equal(result.report.pages.filter((page) => page.status === 'unfinished').length, 2);
  assert.equal(result.exitCode, 1);
  assert.equal(fs.writes.length, 1);
});

test('honors a report-path override and exposes aggregate failure counts', async () => {
  const fs = createFs();
  const result = await runWikiQa({
    WIKI_QA_BASE_URL: BASE_URL,
    WIKI_QA_PAGES: 'One',
    WIKI_QA_REPORT: 'tmp/wiki-report.json',
  }, dependencies(createAdapter(async (url) => ({ ...passingObservation(url), consoleErrors: [{ level: 'error', text: 'boom' }] })), fs));

  assert.equal(fs.writes[0].path, 'tmp/wiki-report.json');
  assert.equal(result.report.aggregate.failed, 1);
  assert.equal(result.report.aggregate.unfinished, 0);
  assert.equal(result.exitCode, 1);
});

test('writes a bare report filename without creating a directory of the same name', async () => {
  const mkdirs = [];
  const writes = [];
  const fs = {
    async mkdir(path) { mkdirs.push(path); },
    async writeFile(path, contents) { writes.push({ path, report: JSON.parse(contents) }); },
  };

  const result = await runWikiQa({
    WIKI_QA_BASE_URL: BASE_URL,
    WIKI_QA_PAGES: 'One',
    WIKI_QA_REPORT: 'wiki-qa-report.json',
  }, dependencies(createAdapter(async (url) => passingObservation(url)), fs));

  assert.deepEqual(mkdirs, []);
  assert.equal(writes[0].path, 'wiki-qa-report.json');
  assert.equal(result.exitCode, 0);
});
