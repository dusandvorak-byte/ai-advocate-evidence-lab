// UX-only validation of synthetic Phase 1 metadata. This is NOT a server security boundary.
// Keep constraints in step with intake.schema.json; future backend must validate independently.
const allowedTop = new Set([
  'schema_version','submission_id','user_title','institution_id','document_type',
  'issue_date','received_date','reference','case_ids','requested_state',
  'privacy_status','source','notes'
]);
const allowedSource = new Set(['origin','original_sha256','malware_scan']);
const validDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const validString = (value,min,max) =>
  typeof value === 'string' && value.trim().length >= min && value.length <= max;
export function validateIntake(record) {
  const errors = [];
  if (!record || typeof record !== 'object' || Array.isArray(record)) return ['Record must be an object'];
  for (const key of Object.keys(record)) if (!allowedTop.has(key)) errors.push('Unexpected property: ' + key);
  if (record.schema_version !== 'intake-v1') errors.push('Invalid schema_version');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(record.submission_id ?? ''))
    errors.push('Invalid submission_id');
  if (!validString(record.user_title, 3, 240)) errors.push('Invalid user_title');
  if (!validString(record.institution_id, 1, 100)) errors.push('Invalid institution_id');
  if (!validString(record.reference, 1, 160)) errors.push('Invalid reference');
  if (!['usneseni','rozsudek','vyrozumeni','jiny'].includes(record.document_type)) errors.push('Invalid document_type');
  if (!validDate(record.issue_date)) errors.push('Invalid issue_date');
  if (record.received_date !== undefined && record.received_date !== null && !validDate(record.received_date))
    errors.push('Invalid received_date');
  if (record.requested_state !== 'review') errors.push('Only requested_state review is allowed');
  if (!['pending','redaction_required','reviewed'].includes(record.privacy_status))
    errors.push('Invalid privacy_status');
  if (!Array.isArray(record.case_ids) && record.case_ids !== undefined) {
    errors.push('Invalid case_ids');
  } else if (Array.isArray(record.case_ids) &&
      (record.case_ids.length > 100 ||
       record.case_ids.some(x => typeof x !== 'string' || x.length > 160) ||
       new Set(record.case_ids).size !== record.case_ids.length)) {
    errors.push('Invalid case_ids');
  }
  if (record.notes !== undefined && (typeof record.notes !== 'string' || record.notes.length > 2000))
    errors.push('Invalid notes');
  const source = record.source;
  if (!source || typeof source !== 'object' || Array.isArray(source) ||
      Object.keys(source).some(key => !allowedSource.has(key)) ||
      source.origin !== 'internal_upload' ||
      source.original_sha256 !== null ||
      source.malware_scan !== 'pending') {
    errors.push('Prototype must not accept uploaded source data');
  }
  return errors;
}
