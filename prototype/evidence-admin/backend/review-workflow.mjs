// Pure review policy for synthetic records. Not an authentication or authorization boundary.
// actor, role and scanResult MUST come from trusted server-side identity/scanner contexts.
const transitions = Object.freeze({
  draft: { submit: ['scanning', 'editor'] },
  scanning: { scan_clean: ['metadata_review', 'scanner'], scan_reject: ['quarantined', 'scanner'] },
  metadata_review: { metadata_accept: ['privacy_review', 'reviewer'], reject: ['rejected', 'reviewer'] },
  privacy_review: { privacy_accept: ['ready_for_approval', 'privacy_reviewer'], reject: ['rejected', 'privacy_reviewer'] },
  ready_for_approval: { approve: ['approved', 'publisher'], reject: ['rejected', 'publisher'] }
});
export const reviewStates = Object.freeze([
  'draft','scanning','quarantined','metadata_review','privacy_review',
  'ready_for_approval','approved','rejected'
]);

export function advanceReview(record, { action, actor, role, expectedVersion, scanResult } = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Missing review record');
  if (typeof actor !== 'string' || !actor.trim()) throw new Error('Missing actor');
  if (!Number.isSafeInteger(record.version) || record.version < 0 ||
      !Number.isSafeInteger(expectedVersion) || expectedVersion !== record.version)
    throw new Error('Stale record version');
  const permitted = transitions[record.state]?.[action];
  if (!permitted) throw new Error('Invalid state transition');
  const [nextState, requiredRole] = permitted;
  if (role !== requiredRole) throw new Error('Insufficient role');
  if (actor === record.created_by && ['reviewer','privacy_reviewer','publisher'].includes(role))
    throw new Error('Creator cannot approve own submission');
  if (action === 'scan_clean' && scanResult !== 'clean') throw new Error('Clean scan evidence required');
  if (action === 'scan_reject' && scanResult !== 'malicious') throw new Error('Malware scan rejection evidence required');
  if (action === 'metadata_accept' && record.metadata_complete !== true) throw new Error('Metadata not verified');
  if (action === 'privacy_accept') {
    if (record.public_copy_reviewed !== true) throw new Error('Reviewed public copy required');
    if (actor === record.metadata_reviewer) throw new Error('Independent privacy reviewer required');
  }
  if (action === 'approve') {
    if (record.content_approved !== true || record.public_copy_reviewed !== true)
      throw new Error('Content and privacy approval required');
    if (typeof record.metadata_reviewer !== 'string' || !record.metadata_reviewer ||
        typeof record.privacy_reviewer !== 'string' || !record.privacy_reviewer ||
        record.metadata_reviewer === record.privacy_reviewer)
      throw new Error('Independent reviewers required');
    if (actor === record.metadata_reviewer || actor === record.privacy_reviewer)
      throw new Error('Independent publisher required');
  }
  return {
    ...record,
    state: nextState,
    version: record.version + 1,
    ...(action === 'metadata_accept' ? {metadata_reviewer: actor} : {}),
    ...(action === 'privacy_accept' ? {privacy_reviewer: actor} : {}),
    ...(action === 'approve' ? {approved_by: actor} : {}),
    last_action: { action, actor, role }
    // Later persistence layer MUST atomically commit state + audit event with compare-and-swap.
  };
}
