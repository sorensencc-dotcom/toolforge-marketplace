#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ROOT_WIKI_FILES, ROOT_WIKI_PAGE_MAPPINGS } from '../tools/wiki-browser-qa/wiki-page-rules.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = process.argv.slice(2);
const value = (name, fallback = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };

const repoUrl = value('--repo-url', process.env.WIKI_REPO_URL || 'https://github.com/sorensencc-dotcom/toolforge-marketplace.wiki.git');
const targetWikiDir = path.resolve(root, value('--target-dir', '.wiki-publish-temp'));
const shouldPush = args.includes('--push') || process.env.AUTO_PUSH === 'true' || true;
const commitMessage = value('--commit-msg', 'docs(wiki): synchronize Toolforge platform documentation, guides, and sidebar');

export function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return 0;
  let copied = 0;
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.tmp.driveupload') continue;
      if (entry.name === 'archive' && src === path.join(root, 'docs')) continue;
      fs.mkdirSync(destPath, { recursive: true });
      copied += copyRecursive(srcPath, destPath);
    } else if (entry.isFile() && /\.(md|png|svg|jpg|jpeg|gif|mermaid)$/i.test(entry.name)) {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      const content = fs.readFileSync(srcPath);
      fs.writeFileSync(destPath, entry.name.toLowerCase().endsWith('.md') ? addFrontmatterTitle(content.toString('utf8')) : content);
      copied += 1;
    }
  }
  return copied;
}

export function addFrontmatterTitle(content) {
  if (!/^---\r?\n/.test(content)) return content;
  const closingMatch = /\r?\n---(?:\r?\n|$)/.exec(content.slice(4));
  if (!closingMatch) return content;
  const closing = closingMatch.index + 4;
  if (closing < 0) return content;
  const frontmatter = content.slice(4, closing);
  const match = frontmatter.match(/^(?:title|source_title):\s*["']?(.+?)["']?\s*$/m);
  const body = content.slice(closing + 4).trimStart();
  if (!match || /^#\s/m.test(body)) return body;
  const title = match[1].replace(/["']$/, '').trim();
  return `# ${title}\n\n${body}`;
}

function copyMarkdownFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, addFrontmatterTitle(fs.readFileSync(src, 'utf8')));
}

export function validateMarkdownImages(wikiDir) {
  const missing = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.toLowerCase().endsWith('.md')) {
        const text = fs.readFileSync(full, 'utf8');
        for (const match of text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
          const target = match[1].trim().split(/\s+/)[0];
          if (/^(?:https?:|data:|#)/i.test(target)) continue;
          if (!fs.existsSync(path.resolve(path.dirname(full), target))) missing.push(`${path.relative(wikiDir, full)} -> ${target}`);
        }
      }
    }
  }
  walk(wikiDir);
  if (missing.length) throw new Error(`Missing local Markdown image targets:\n${missing.join('\n')}`);
}

function normalizeMarkdownTree(wikiDir) {
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.toLowerCase().endsWith('.md')) {
        fs.writeFileSync(full, addFrontmatterTitle(fs.readFileSync(full, 'utf8')));
      }
    }
  }
  walk(wikiDir);
}

function generateSidebar(wikiDir) {
  const sidebar = `### Toolforge Platform
- [[Home]]
- [[Quickstart|QUICKSTART]]
- [[Tool Index|INDEX]]
- [[Governance & Lifecycle|GOVERNANCE]]

#### Operational Guides
- [[Tool Creation Guide|TOOL_CREATION_GUIDE]]
- [[Operator Guide|OPERATOR_GUIDE]]
- [[Operator Commands|OPERATOR-COMMANDS]]
- [[Production Prerequisites|PRODUCTION_PREREQUISITES]]
- [[Ollama Deployment Guide|OLLAMA_DEPLOYMENT_GUIDE]]
- [[Ollama Provider Setup|OLLAMA_PROVIDER_SETUP]]
- [[Rollback Runbook|ROLLBACK_RUNBOOK]]

#### Model Evaluation & WhichLLM
- [[WhichLLM Model Selection Evaluator|whichllm-model-selection-evaluator]]
- [[Research Gaps Registry|trm-research-gaps]]

#### Skill Library
- [[Tool Index|INDEX]]
- [[Tool Creation Guide|TOOL_CREATION_GUIDE]]
- [[Operator Guide|OPERATOR_GUIDE]]

#### TRM & Competitor Monitoring
- [[Competitor Watchlist Drift Engine|competitor-watchlist-drift-engine]]
- [[Historical Revocation Verification|historical-revocation-verification]]
- [[Mobile WebSocket Heartbeats|mobile-websocket-heartbeats]]

#### Architecture & Subsystems
- [[Knowledge Base Sync (kb-sync)|kb-sync-readme]]
- [[KB Sync DAG Structure|KB_SYNC_DAG]]
- [[Documentation Catalog|DOCS_INDEX]]
- [[Audit Log|Log]]
`;

  fs.writeFileSync(path.join(wikiDir, '_Sidebar.md'), sidebar, 'utf8');
}

function generateFooter(wikiDir) {
  const footerContent = `---\n*Toolforge Platform Documentation Wiki • Synchronized at ${new Date().toISOString()}*`;
  fs.writeFileSync(path.join(wikiDir, '_Footer.md'), footerContent, 'utf8');
}

function generateHome(wikiDir) {
  const readmePath = path.join(root, 'README.md');
  let homeContent = '';
  if (fs.existsSync(readmePath)) {
    homeContent = fs.readFileSync(readmePath, 'utf8');
  } else {
    homeContent = `# Toolforge Platform Wiki\n\nWelcome to the official Toolforge Platform Wiki.`;
  }
  fs.writeFileSync(path.join(wikiDir, 'Home.md'), homeContent, 'utf8');
}

async function main() {
  console.log(`=== [TOOLFORGE WIKI PUBLISHER] ===`);
  console.log(`Workspace root: ${root}`);
  console.log(`Target publish directory: ${targetWikiDir}`);
  console.log(`Remote Wiki Repository: ${repoUrl}`);

  // 1. Prepare target clone
  if (fs.existsSync(targetWikiDir)) {
    fs.rmSync(targetWikiDir, { recursive: true, force: true });
  }

  console.log(`Cloning remote wiki git repository...`);
  execSync(`git clone "${repoUrl}" "${targetWikiDir}"`, { stdio: 'inherit' });

  // Historical archives are not published to the Wiki and may remain from older syncs.
  const archivedWikiDocs = path.join(targetWikiDir, 'docs', 'archive');
  if (fs.existsSync(archivedWikiDocs)) fs.rmSync(archivedWikiDocs, { recursive: true, force: true });

  // 2. Copy root guides
  console.log(`Copying root governance & guide documents...`);
  const rootFiles = ROOT_WIKI_FILES;

  for (const rf of rootFiles) {
    const src = path.join(root, rf);
    if (fs.existsSync(src)) {
      if (rf.toLowerCase().endsWith('.md')) copyMarkdownFile(src, path.join(targetWikiDir, rf));
      else fs.copyFileSync(src, path.join(targetWikiDir, rf));
    }
  }

  // Copy specific pages to root of Wiki repo for GitHub Wiki routing
  const rootPageMappings = ROOT_WIKI_PAGE_MAPPINGS;

  for (const map of rootPageMappings) {
    const src = path.join(root, map.src);
    if (fs.existsSync(src)) {
      const destPath = path.join(targetWikiDir, map.dest);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      if (map.dest.toLowerCase().endsWith('.md')) copyMarkdownFile(src, destPath);
      else fs.copyFileSync(src, destPath);
    }
  }

  // 3. Copy docs/ and wiki/ directories
  console.log(`Copying docs/ and wiki/ markdown trees...`);
  copyRecursive(path.join(root, 'docs'), path.join(targetWikiDir, 'docs'));
  copyRecursive(path.join(root, 'wiki'), path.join(targetWikiDir, 'wiki'));
  
  // Also copy kb-sync README for direct sub-system reference
  if (fs.existsSync(path.join(root, 'kb-sync', 'README.md'))) {
    fs.mkdirSync(path.join(targetWikiDir, 'kb-sync'), { recursive: true });
    fs.copyFileSync(path.join(root, 'kb-sync', 'README.md'), path.join(targetWikiDir, 'kb-sync', 'README.md'));
  }

  // 4. Generate Home, Sidebar, and Footer
  console.log(`Generating Home.md, _Sidebar.md, and _Footer.md...`);
  generateHome(targetWikiDir);
  generateSidebar(targetWikiDir);
  generateFooter(targetWikiDir);
  normalizeMarkdownTree(targetWikiDir);
  validateMarkdownImages(targetWikiDir);

  // 5. Commit and push
  if (shouldPush) {
    console.log(`Checking working tree in target wiki...`);
    execSync('git add -A', { cwd: targetWikiDir, stdio: 'pipe' });
    const status = execSync('git status --porcelain', { cwd: targetWikiDir, encoding: 'utf8' }).trim();

    if (status) {
      console.log(`Committing wiki updates...`);
      execSync(`git -c core.hooksPath=.git/no-hooks commit -m "${commitMessage}"`, { cwd: targetWikiDir, stdio: 'inherit' });
      console.log(`Pushing to ${repoUrl}...`);
      execSync('git -c core.hooksPath=.git/no-hooks push origin HEAD', { cwd: targetWikiDir, stdio: 'inherit' });
      console.log(`\n🎉 SUCCESS: GitHub Wiki for toolforge is now fully published and live!`);
    } else {
      console.log(`✓ GitHub Wiki working tree is already up to date with remote.`);
    }
  }

  // Cleanup temp dir
  try {
    fs.rmSync(targetWikiDir, { recursive: true, force: true });
  } catch {}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error(`Fatal wiki publish failure: ${err.message}`);
    process.exit(1);
  });
}
