-- Version source: where a published version's files come from.
-- A version is pinned to a git repository and an exact commit SHA, matching how
-- .claude-plugin/marketplace.json pins external plugins. The SHA is content
-- addressed, so a checkout at that SHA is the integrity check; versions.checksum
-- is left as-is.
-- Nullable so existing rows stay valid; `toolforge install` refuses versions
-- with no source recorded.

ALTER TABLE versions ADD COLUMN IF NOT EXISTS source_repo VARCHAR(255);
ALTER TABLE versions ADD COLUMN IF NOT EXISTS source_ref VARCHAR(255);
ALTER TABLE versions ADD COLUMN IF NOT EXISTS source_sha CHAR(40);

-- owner/name on GitHub; no '..' so a name can never read as a path traversal
ALTER TABLE versions ADD CONSTRAINT versions_source_repo_format
  CHECK (source_repo IS NULL
         OR (source_repo ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' AND source_repo !~ '\.\.'));

-- full 40-character lowercase commit SHA, never a branch or abbreviated hash
ALTER TABLE versions ADD CONSTRAINT versions_source_sha_format
  CHECK (source_sha IS NULL OR source_sha ~ '^[0-9a-f]{40}$');

-- a repo without a SHA (or the reverse) cannot be installed or verified
ALTER TABLE versions ADD CONSTRAINT versions_source_complete
  CHECK ((source_repo IS NULL) = (source_sha IS NULL));
