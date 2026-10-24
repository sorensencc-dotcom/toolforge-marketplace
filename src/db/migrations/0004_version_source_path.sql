-- Version source path: the subdirectory of source_repo that holds the plugin.
-- NULL means the plugin is the whole repository. Several plugins can live in one
-- repository (this repo's plugins/<name>/ directories), so a version records the
-- repo, the commit, and the directory within it.
-- Append-only: nullable column plus CHECK constraints.

ALTER TABLE versions ADD COLUMN IF NOT EXISTS source_path VARCHAR(255);

-- A relative, normalized path: segments of [A-Za-z0-9_.-] joined by single '/',
-- no leading or trailing '/', no '.' or '..' segments, and nothing inside .git.
ALTER TABLE versions ADD CONSTRAINT versions_source_path_format
  CHECK (source_path IS NULL
         OR (source_path ~ '^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$'
             AND source_path !~ '(^|/)\.{1,2}(/|$)'
             AND lower(source_path) !~ '(^|/)\.git(/|$)'));

-- A path is meaningless without a repository to take it from.
ALTER TABLE versions ADD CONSTRAINT versions_source_path_needs_repo
  CHECK (source_path IS NULL OR source_repo IS NOT NULL);
