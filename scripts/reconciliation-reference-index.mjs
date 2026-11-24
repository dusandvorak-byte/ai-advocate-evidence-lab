// Process-local pure string normalization and reference indexing.
// No PDF bytes, privacy policy, decisions or cross-run cache are stored.
export function createReconciliationNormalization() {
  const normalized = new Map();
  const compacted = new Map();
  const norm = value => {
    const key = String(value || '');
    if (normalized.has(key)) return normalized.get(key);
    const result = key.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/čj|c\.\s*j\.|sp\.\s*zn\.|spzn/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    normalized.set(key, result);
    return result;
  };
  const compact = value => {
    const key = norm(value);
    if (compacted.has(key)) return compacted.get(key);
    const result = key.replace(/\s+/g, '');
    compacted.set(key, result);
    return result;
  };
  return { norm, compact };
}

export function indexByReference(items, compact) {
  const index = new Map();
  for (const item of items) {
    const key = compact(item.reference);
    if (!key) continue;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(item);
  }
  return index;
}
