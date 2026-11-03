// Pure approval policy for synthetic / quarantined records.
// No publication, network, file I/O or privileged operation is implemented.
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
  if (!record || typeof record !== 'object') throw new Error('Missing review record');
  if (!actor || typeof actor !== 'string') throw new Error('Missing actor');
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion !== record.version) throw new Error('Stale record version');
  const permitted = transitions[record.state]?.[action];
  if (!permitted) throw new Error('Invalid state transition');
  const [nextState, requiredRole] = permitted;
  if (role !== requiredRole) throw new Error('Insufficient role');
  if (actor === record.created_by && ['reviewer','privacy_reviewer','publisher'].includes(role))
    throw new Error('Creator cannot approve own submission');
  if (action === 'scan_clean' && scanResult !== 'clean') throw new Error('Clean scan evidence required');
  if (action === 'scan_reject' && scanResult !== 'malicious') throw new Error('Malware scan rejection evidence required');
  if (action === 'metadata_accept' && record.metadata_complete !== true) throw new Error('Metadata not verified');
  if (action === 'privacy_accept' && record.public_copy_reviewed !== true)
    throw new Error('Reviewed public copy required');
  if (action === 'approve' && (!record.content_approved || !record.public_copy_reviewed))
    throw new Error('Content and privacy approval required');
  return {
    ...record,
    state: nextState,
    version: record.version + 1,
    last_action: { action, actor, role },
    // Caller must persist audit event atomically with versioned update in later phase.
  };
}
