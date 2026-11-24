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
  # The regional EC2 mirror repeatedly stalls on the 49 MB mupdf-tools
  # archive. Use only the signed Ubuntu archive on the supported Noble runner,
  # excluding third-party indexes; never disable package signature verification.
  source /etc/os-release
  if [[ "${ID:-}" == ubuntu && "${VERSION_CODENAME:-}" == noble && "$(dpkg --print-architecture)" == amd64 ]]; then
    sources=$(mktemp --suffix=.list)
    trap 'rm -f "$sources"' EXIT
    chmod 644 "$sources"
    printf '%s\n' \
      'deb [signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg] https://archive.ubuntu.com/ubuntu noble main universe' \
      'deb [signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg] https://archive.ubuntu.com/ubuntu noble-updates main universe' \
      'deb [signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg] https://security.ubuntu.com/ubuntu noble-security main universe' > "$sources"
    official=("${apt[@]}" -o "Dir::Etc::sourcelist=$sources" -o Dir::Etc::sourceparts=- -o Acquire::Languages=none)
    if timeout -k 5s 75s "${official[@]}" update && timeout -k 5s 75s "${official[@]}" install -y --no-install-recommends "${missing[@]}"; then
      echo 'Installed PDF dependencies from signed official Ubuntu archive.'
    else
      echo 'Official archive unavailable; trying existing runner indexes once.' >&2
      timeout -k 5s 75s "${apt[@]}" install -y --no-install-recommends "${missing[@]}"
    fi
  else
    if ! timeout -k 5s 75s "${apt[@]}" install -y --no-install-recommends "${missing[@]}"; then
      timeout -k 5s 75s "${apt[@]}" update
      timeout -k 5s 75s "${apt[@]}" install -y --no-install-recommends "${missing[@]}"
    fi
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
