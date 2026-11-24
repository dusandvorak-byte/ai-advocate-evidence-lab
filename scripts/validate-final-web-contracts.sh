#!/usr/bin/env bash
# Shared final-web validation; extracted from the existing trusted workflow.
# Requires the fully materialized web and canonical registry in the repository root.
set -euo pipefail

# A negated grep is exempt from Bash errexit. Explicitly require the
# no-match exit status (1); match (0) and read errors (>1) both fail.
require_pattern_absent() {
  local status=0
  grep -qi -- "$1" "$2" || status=$?
  if [ "$status" -ne 1 ]; then
    printf 'Forbidden-pattern check failed (grep status %s)\n' "$status" >&2
    return 1
  fi
}

printf '%s\n' 'Ověřit mobilní čitelnost a plnou šířku hlavního článku'
node test/mobile-readability-v5.test.mjs

printf '%s\n' 'Ověřit archiv podání, příjemce, PDF a nepřítomnost časovačů'
node scripts/validate-justice-slalom.mjs

printf '%s\n' 'Ověřit dávku Godot a Justiční slalom z 15. října'
node scripts/validate-2026-10-15-godot-slalom.mjs

printf '%s\n' 'Ověřit nové státní listiny a uzavření přezkumu KSZ'
node scripts/validate-state-release-2026-09-29.mjs

printf '%s\n' 'Ověřit odpověď EUDA z 1. října a její procesní vazbu'
node scripts/validate-euda-access-documents-2026-10-01.mjs

printf '%s\n' 'Ověřit procesní odpověď Evropského ombudsmana z 28. září'
node scripts/validate-eu-ombudsman-2026-09-28.mjs

printf '%s\n' 'Ověřit aktuální rozkladovou fázi Konopné církve a propojení webů'
node scripts/validate-church-current-state.mjs

printf '%s\n' 'Ověřit EKK balík z 2. října včetně obou PDF'
node scripts/validate-ekk-evidence-2026-10-02.mjs

printf '%s\n' 'Diagnostic-only KS Brno and MS Praha provenance snapshot'
node scripts/diagnose-four-records-provenance.mjs

printf '%s\n' 'Ověřit čtyři nově doložené soudní listiny a jejich PDF'
node scripts/validate-four-records-2026-10-03.mjs

printf '%s\n' 'Ověřit podnět ČNB a společné podání MS Praha ze 6. října'
node scripts/validate-october-6-submissions.mjs

printf '%s\n' 'Ověřit rozdělení Godot / Justiční slalom pro listiny 6.–8. října'
node scripts/validate-godot-filings-2026-10-08.mjs

printf '%s\n' 'Ověřit dvě institucionální odpovědi z 1. a 7. října'
node scripts/validate-state-responses-2026-10-07.mjs

printf '%s\n' 'Ověřit rozhodnutí ministra vnitra o rozkladu ze 7. října'
node scripts/validate-mv-rozklad-2026-10-07.mjs

printf '%s\n' 'Ověřit tři lišty, navigaci a rozbalená soudní řízení'
node scripts/validate-live-dockets-contract.mjs

printf '%s\n' 'Křížově ověřit Godot, Slalom, cases a soudní tabulku'
node scripts/validate-active-court-dockets.mjs

printf '%s\n' 'Ověřit úplnou dvojstrannou evidenci všech soudů a orgánů'
node scripts/validate-court-publication-index.mjs

printf '%s\n' 'Verify 19 October EUDA reply (PDF and CZ/EN Godot)'
node scripts/validate-euda-2026-10-19.mjs

printf '%s\n' 'Verify all five byte-identical original PDFs and updated court service'
node scripts/validate-five-originals-2026-10-20.mjs

printf '%s\n' 'Verify two original Prague orders, their CZ/EN Godot and court links'
node scripts/validate-prague-a17-a23-2026-10-20.mjs

printf '%s\n' 'Verify remaining official original PDFs, 20 October rulings and 9 November police deadline'
node scripts/validate-six-pending-originals-2026-10-20.mjs

printf '%s\n' 'Verify 24 October seven document entries and original-PDF provenance'
node scripts/validate-october-24-seven-pending-records.mjs

printf '%s\n' 'Verify 26 October state originals and legal outcomes'
node scripts/validate-2026-10-26-uoou-pcr.mjs

printf '%s\n' 'Verify 7 byte-identical source PDFs for late October and 1 November 2026'
node scripts/validate-originals-2026-11-02.mjs

printf '%s\n' 'Verify 27 Oct VSZ Prague and 28 Oct Church addendum originals, chronology, CZ/EN and case links'
node scripts/validate-vsz-praha-mk-church-2026-10-30.mjs

printf '%s\n' 'Ověřit interní procesní registr a aktivní soudní větve'
node scripts/validate-process-chain-contract.mjs

printf '%s\n' 'Verify reviewed 4 November batch, deduplication, privacy, cases and CZ/EN'
node scripts/validate-evidence-release-2026-11-04.mjs

printf '%s\n' 'Verify 10 OKTE annexes and their public identities'
node scripts/validate-okte-originals-2026-11-05.mjs

printf '%s\n' 'Ověřit manifest Evidence Lab 2.0 bez ručních počtů'
set -euo pipefail
test -f web/data/build-manifest.json
grep -q '"schema_version": "2.2"' web/data/build-manifest.json
grep -q '"build_entrypoint": "scripts/build-site.mjs"' web/data/build-manifest.json
grep -q '"single_clock_system": true' web/data/build-manifest.json
grep -q '"two_derived_submission_counters": true' web/data/build-manifest.json
grep -q '"single_public_build_entrypoint": true' web/data/build-manifest.json
grep -q '"five_alliance_privacy_exemptions": true' web/data/build-manifest.json
grep -q '"lawful_third_person_anonymization": true' web/data/build-manifest.json
grep -q '"privacy_alliance_organizations_count": 5' web/data/build-manifest.json
grep -q '"internal_knowledge_not_auto_published": true' web/data/build-manifest.json
test -f web/data/operations-state.json
test -f web/data/active-court-dockets.json
test -f web/data/nsz-prelitigation-timeline.json
test -f web/data/court-publication-index.json
test "$(jq -r '.rows | length' web/data/court-publication-index.json)" -ge 13
test "$(jq -r '.counts.incoming' web/data/nsz-prelitigation-timeline.json)" -gt 0
test "$(jq -r '.counts.outgoing' web/data/nsz-prelitigation-timeline.json)" -gt 0
test "$(jq -r '.rows | length' web/data/active-court-dockets.json)" -ge 13
test "$(jq -c '.table_contract.width_percent' web/data/active-court-dockets.json)" = '[42,18,18,12,10]'
test -f web/data/registry-audit.json
test -f web/data/godot-pdf-audit.json
test -f web/data/generated-state-pdf-manifest.json
test -f web/data/generated-state-pdf-manifest-2026-09-03.json
test -f web/zpravy/04082026-010.html
test "$(jq -r '.count' web/data/generated-state-pdf-manifest.json)" = '7'
test "$(jq -r '.count' web/data/generated-state-pdf-manifest-2026-09-03.json)" = '2'
state_count="$(jq -r '.counts.state_public_submissions' web/data/build-manifest.json)"
test "$state_count" -ge 84
grep -q "Stát: ${state_count} evidovaných listin" web/zpravy/04082026-010.html
english_count="$(grep -o 'data-english-chronology-count="[0-9]*"' web/news/04082026-010.html | head -1 | grep -o '[0-9]*')"
test "$english_count" -ge "$state_count"
grep -q 'state-love-table' web/zpravy/04082026-010.html
grep -q 'state-love-table' web/news/04082026-010.html
grep -q 'doc-cz-citc-2026-10-06-eu-ombudsman-euda-form-59936' web/zpravy/04082026-010.html
grep -q 'KPR 5080/2026' web/zpravy/04082026-010.html
grep -q '1 ZN 7061/2026-79' web/zpravy/04082026-010.html
grep -q '1 ZN 7061/2026-79' web/news/04082026-010.html
grep -q '2026-09-03' web/zpravy/04082026-010.html
grep -q '8 Ad 9/2026-85' web/zpravy/04082026-010.html
grep -q '8 Ad 9/2026-85' web/news/04082026-010.html
grep -q '82-ms-praha-8-ad-9-2026-85-2026-08-28.pdf' web/zpravy/04082026-010.html
grep -q '"required_without_active_pdf_count": 0' web/data/godot-pdf-audit.json
grep -q '"reaction_without_active_pdf_count": 0' web/data/godot-pdf-audit.json
grep -q 'Ministry of Transport' web/news/04082026-010.html
grep -q '2 KZN 55/2025-136' web/zpravy/04082026-010.html
grep -q 'KU-4139-12/ČJ-2026-2305KM' web/zpravy/04082026-010.html
grep -q 'KRPT-203594-8/ČJ-2026-0700KR' web/zpravy/04082026-010.html
grep -q 'PPR-44020-2/ČJ-2026-990210-PD' web/zpravy/04082026-010.html
for f in web/documents/report-04082026-010/{64-msz-praha-2-kzn-55-2025-136-2026-08-20,65-ku-4139-12-cj-2026-2305km-2026-08-20,66-krpt-203594-7-cj-2026-0700kr-2026-08-20,67-krpt-priloha-rr-ku-54-2021,68-krpt-priloha-rr-ku-54-2021-priloha-1,70-krpt-203594-8-cj-2026-0700kr-2026-08-20,71-ppr-44020-2-cj-2026-990210-pd-2026-08-24}.pdf; do
  test -f "$f"
  test "$(head -c 5 "$f")" = '%PDF-'
done
test ! -e web/documents/report-04082026-010/69-krpt-priloha-metodicko-odborne-vyjezdy-okte-2009-2019.pdf
for f in web/documents/report-04082026-010/{kpr-5080-2026-vyrizeni-stiznosti-2026-09-02-verejna-kopie,osz-fm-1-zn-7061-2026-79-2026-09-03-verejna-kopie}.pdf; do
  test -f "$f"
  test "$(head -c 5 "$f")" = '%PDF-'
done
test -f web/documents/report-04082026-010/82-ms-praha-8-ad-9-2026-85-2026-08-28.pdf
test "$(head -c 5 web/documents/report-04082026-010/82-ms-praha-8-ad-9-2026-85-2026-08-28.pdf)" = '%PDF-'
require_pattern_absent 'AI Advocate for the Poor — final English project submission' web/zpravy/04082026-010.html
require_pattern_absent 'Výroční zpráva 2025 aliance Cannabis is The Cure' web/zpravy/04082026-010.html
