if ($args.Count -eq 0 -or [string]::IsNullOrWhiteSpace($args[0])) {
  Write-Error "Error: Missing path to PDF file."
  Write-Host "Usage: pdf-ingest <file.pdf>"
  exit 1
}
toolforge exec toolforge-pdf-ingestion ingest $args[0]
