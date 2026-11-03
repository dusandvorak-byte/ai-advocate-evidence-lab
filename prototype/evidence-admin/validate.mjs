// Validation for synthetic Phase 1 records only. Not a security boundary.
export function validateIntake(record) {
  const errors = [];
  if (!record || typeof record !== 'object' || Array.isArray(record)) return ['Record must be an object'];
  const allowed = new Set(['schema_version','submission_id','user_title','institution_id','document_type','issue_date','received_date','reference','case_ids','requested_state','privacy_status','source','notes']);
  for (const key of Object.keys(record)) if (!allowed.has(key)) errors.push('Unexpected property: '+key);
  const string = (name, max, min=1) => {
    if (typeof record[name] !== 'string' || record[name].trim().length < min || record[name].length > max) errors.push('Invalid '+name);
  };
  if (record.schema_version !== 'intake-v1') errors.push('Invalid schema_version');
  string('user_title',240,3); string('institution_id',100); string('reference',160);
  if (!['usneseni','rozsudek','vyrozumeni','jiny'].includes(record.document_type)) errors.push('Invalid document_type');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.issue_date ?? '') || Number.isNaN(Date.parse(record.issue_date+'T00:00:00Z')) || new Date(record.issue_date+'T00:00:00Z').toISOString().slice(0,10) !== record.issue_date) errors.push('Invalid issue_date');
  if (record.received_date != null && !/^\d{4}-\d{2}-\d{2}$/.test(record.received_date)) errors.push('Invalid received_date');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(record.submission_id ?? '')) errors.push('Invalid submission_id');
  if (record.requested_state !== 'review') errors.push('Only requested_state review is allowed');
  if (!['pending','redaction_required','reviewed'].includes(record.privacy_status)) errors.push('Invalid privacy_status');
  if (!record.source || record.source.origin !== 'internal_upload' || record.source.malware_scan !== 'pending' || (record.source.original_sha256 !== null)) errors.push('This prototype accepts no uploaded source data');
  if (record.case_ids !== undefined && (!Array.isArray(record.case_ids) || record.case_ids.length > 100 || record.case_ids.some(x=>typeof x!=='string'||x.length>160)||new Set(record.case_ids).size!==record.case_ids.length)) errors.push('Invalid case_ids');
  if (record.notes !== undefined && (typeof record.notes !== 'string'||record.notes.length>2000)) errors.push('Invalid notes');
  return errors;
}
