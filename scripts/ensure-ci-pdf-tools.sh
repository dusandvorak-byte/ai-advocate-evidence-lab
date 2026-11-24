#!/usr/bin/env bash
# Ensure only missing distribution tools are installed; fail closed with bounded retries.
set -euo pipefail
if (( $# == 0 )); then echo 'Usage: ensure-ci-pdf-tools.sh qpdf [poppler-utils mupdf-tools]' >&2; exit 2; fi
declare -a missing=()
for package in "$@"; do
  case "$package" in
    qpdf) commands=(qpdf);;
    poppler-utils) commands=(pdftotext pdfinfo);;
    mupdf-tools) commands=(mutool);;
    *) echo "Unexpected PDF dependency: $package" >&2; exit 2;;
  esac
  for tool in "${commands[@]}"; do
    if ! command -v "$tool" >/dev/null; then missing+=("$package"); break; fi
  done
done
if (( ${#missing[@]} )); then
  printf 'Missing PDF tool packages: %s\n' "${missing[*]}"
  apt=(sudo env DEBIAN_FRONTEND=noninteractive apt-get -o Acquire::Retries=1 -o Acquire::http::Timeout=15 -o Acquire::https::Timeout=15)
  # Try existing package indexes first. Do not update every runner unconditionally.
  if ! timeout -k 5s 75s "${apt[@]}" install -y --no-install-recommends "${missing[@]}"; then
    timeout -k 5s 75s "${apt[@]}" update
    timeout -k 5s 75s "${apt[@]}" install -y --no-install-recommends "${missing[@]}"
  fi
else
  echo 'Required PDF executables already present: no APT traffic.'
fi
for package in "$@"; do
  case "$package" in
    qpdf) command -v qpdf; qpdf --version;;
    poppler-utils) command -v pdftotext; command -v pdfinfo; pdftotext -v;;
    mupdf-tools) command -v mutool; mutool -v;;
  esac
done
