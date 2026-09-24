@echo off
if "%~1"=="" (
  echo Error: Missing path to PDF file.
  echo Usage: pdf-ingest ^<file.pdf^>
  exit /b 1
)
toolforge exec toolforge-pdf-ingestion ingest "%~1"
