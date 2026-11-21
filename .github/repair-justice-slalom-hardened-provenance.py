#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path


MODULE = r'''const publicCopyKinds = new Set([
  'redacted_public_copy_from_user_original',
  'verified_public_copy_from_user_original',
]);
const redactedOriginalKind = 'redacted_original_from_user_binary';

export const declaredJusticeSlalomPdfKind = doc => {
  const sourceKind = doc.justice_slalom?.source_kind;
  if (sourceKind === redactedOriginalKind) return 'redacted_original';
  if (publicCopyKinds.has(sourceKind)) return 'redacted_public_copy';
  return 'original';
};

const copyManifestFor = doc => {
  const sourceKind = doc.justice_slalom?.source_kind;
  if (sourceKind === 'redacted_public_copy_from_user_original' || sourceKind === redactedOriginalKind) {
    return doc.justice_slalom?.redaction_manifest;
  }
  return doc.justice_slalom?.public_copy_manifest;
};

const hardenedRegistryStatus = doc => String(doc.public?.verification_status || '')
  .split(';')
  .map(part => part.trim())
  .includes('publication_policy_hardened');

export const policyHardenedCopyOk = ({ doc, digest, expectedInputSha, hardeningById }) => {
  const row = hardeningById.get(doc.id);
  return Boolean(
    hardenedRegistryStatus(doc)
    && row
    && row.changed
    && row.public_path === doc.public?.pdf
    && row.input_sha256 === expectedInputSha
    && row.output_sha256 === digest
    && Array.isArray(row.known_private_identifier_hits_after)
    && row.known_private_identifier_hits_after.length === 0
    && Array.isArray(row.decoded_private_identifier_hits_after)
    && row.decoded_private_identifier_hits_after.length === 0
  );
};

export const evaluateJusticeSlalomPdfProvenance = ({ doc, digest, hardeningById }) => {
  const meta = doc.justice_slalom || {};
  const declaredKind = declaredJusticeSlalomPdfKind(doc);
  const expectedInputSha = declaredKind === 'original'
    ? meta.source_sha256
    : meta.public_sha256;
  const policyHardened = policyHardenedCopyOk({
    doc,
    digest,
    expectedInputSha,
    hardeningById,
  });
  const copyManifest = copyManifestFor(doc);
  const provenanceOk = declaredKind === 'original'
    ? digest === meta.source_sha256 || policyHardened
    : Boolean(copyManifest) && (digest === meta.public_sha256 || policyHardened);
  const effectiveKind = policyHardened && declaredKind === 'original'
    ? 'redacted_public_copy'
    : declaredKind;

  return {
    declaredKind,
    effectiveKind,
    expectedInputSha,
    policyHardened,
    provenanceOk,
  };
};
'''


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'unexpected {label} count: {count}')
    return text.replace(old, new)


def regex_once(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'unexpected {label} count: {count}')
    return updated


def patch_build() -> None:
    path = Path('scripts/build-justice-slalom.mjs')
    text = path.read_text('utf-8')
    text = replace_once(
        text,
        "import path from 'node:path';\n",
        "import path from 'node:path';\nimport { evaluateJusticeSlalomPdfProvenance } from './justice-slalom-pdf-provenance.mjs';\n",
        'build import',
    )
    text = regex_once(
        text,
        r"const publicCopyKinds = new Set\(\[.*?\nconst rows = \[\];\n",
        "const root = '/ai-advocate-evidence-lab/';\nconst rows = [];\n",
        'build duplicated provenance helpers',
    )
    old = '''  const kind = pdfKind(doc);
  const copyManifest = meta.source_kind === 'redacted_public_copy_from_user_original' || meta.source_kind === redactedOriginalKind
    ? meta.redaction_manifest : meta.public_copy_manifest;
  const digest = sha(bytes);
  const provenanceOk = kind === 'original'
    ? digest === meta.source_sha256
    : Boolean(copyManifest) && (
        digest === meta.public_sha256
        || hardenedCopyOk(doc, digest, meta.public_sha256)
      );
  if (digest !== doc.public.sha256 || !provenanceOk) {
'''
    new = '''  const digest = sha(bytes);
  const {
    effectiveKind: kind,
    provenanceOk,
  } = evaluateJusticeSlalomPdfProvenance({ doc, digest, hardeningById });
  if (digest !== doc.public.sha256 || !provenanceOk) {
'''
    text = replace_once(text, old, new, 'build provenance evaluation')
    text = replace_once(
        text,
        '      pdf_kind: pdfKind(doc)\n',
        '      pdf_kind: kind\n',
        'build effective PDF kind',
    )
    path.write_text(text, 'utf-8')


def patch_validate() -> None:
    path = Path('scripts/validate-justice-slalom.mjs')
    text = path.read_text('utf-8')
    text = replace_once(
        text,
        "import path from 'node:path';\n",
        "import path from 'node:path';\nimport { evaluateJusticeSlalomPdfProvenance } from './justice-slalom-pdf-provenance.mjs';\n",
        'validator import',
    )
    text = regex_once(
        text,
        r"const hardenedCopyOk = \(item, outputSha, expectedInputSha\) => \{.*?\n\};\nfor \(const upload of archivedUploads\) \{",
        'for (const upload of archivedUploads) {',
        'validator duplicated hardening helper',
    )
    old_upload = '''  if (upload.status === 'redacted_public_copy_reviewed') {
    const chainOk = item.public.sha256 === upload.public_sha256
      || hardenedCopyOk(item, item.public.sha256, upload.public_sha256);
    if (item.justice_slalom.source_kind !== 'redacted_public_copy_from_user_original' || !chainOk) {
      fail(`veřejná kopie nemá správný původ ${upload.number}`);
    }
  }
'''
    new_upload = '''  if (upload.status === 'redacted_public_copy_reviewed') {
    const evaluation = evaluateJusticeSlalomPdfProvenance({
      doc: item,
      digest: item.public.sha256,
      hardeningById,
    });
    if (item.justice_slalom.source_kind !== 'redacted_public_copy_from_user_original' || !evaluation.provenanceOk) {
      fail(`veřejná kopie nemá správný původ ${upload.number}`);
    }
  }
'''
    text = replace_once(text, old_upload, new_upload, 'validator upload provenance')
    pattern = r'''  const sourceKind = item\.justice_slalom\.source_kind;.*?  if \(redactedOriginal && !rowsForItem\.every\(row => row\.pdf_kind === 'redacted_original'\)\) fail\(`redigovaný originál je chybně označen \$\{item\.id\}`\);\n'''
    replacement = '''  const { effectiveKind, provenanceOk: kindOk } = evaluateJusticeSlalomPdfProvenance({
    doc: item,
    digest: hash,
    hardeningById,
  });
  if (hash !== item.public.sha256 || !kindOk || !bytes.subarray(0,5).equals(Buffer.from('%PDF-')) || !bytes.subarray(-2048).toString('latin1').includes('%%EOF')) fail(`poškozené nebo chybně popsané PDF ${item.id}`);
  const rowsForItem = published.rows.filter(row => row.document_id === item.id);
  if (!rowsForItem.every(row => row.pdf_kind === effectiveKind)) fail(`veřejné PDF je klamně označeno typem ${item.id}`);
'''
    text = regex_once(text, pattern, replacement, 'validator item provenance and labels')
    path.write_text(text, 'utf-8')


def main() -> None:
    module = Path('scripts/justice-slalom-pdf-provenance.mjs')
    if module.exists():
        raise SystemExit('shared provenance module already exists')
    module.write_text(MODULE, 'utf-8')
    patch_build()
    patch_validate()


if __name__ == '__main__':
    main()
