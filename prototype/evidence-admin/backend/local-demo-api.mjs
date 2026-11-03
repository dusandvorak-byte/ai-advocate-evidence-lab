import { createServer } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { inspectPdfForQuarantine } from './pdf-gate.mjs';
import { advanceReview } from './review-workflow.mjs';

// A LOCAL-ONLY, SYNTHETIC-DATA demonstration API. Not an upload service.
// The caller must explicitly listen on 127.0.0.1. No default tokens or persistence.
const MAX_DEMO_BYTES = 128 * 1024;
const MAX_JSON_BYTES = 4096;
const SYNTHETIC_MARKER = Buffer.from('\n%EVIDENCE-LAB-TEST-ONLY\n');
const reply = (res, status, data) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  });
  res.end(JSON.stringify(data));
};
const failure = (status, message) => Object.assign(new Error(message), {status});
const readLimited = async (req, maxBytes) => {
  if (Number(req.headers['content-length'] ?? 0) > maxBytes) throw failure(413, 'Payload too large');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw failure(413, 'Payload too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
};
const equalToken = (a, b) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
export function createLocalDemoApi({ credentials } = {}) {
  if (!Array.isArray(credentials) || credentials.length === 0 ||
      credentials.some(x => !x || typeof x.token !== 'string' || x.token.length < 32 ||
        !['editor', 'viewer'].includes(x.role) || typeof x.actor !== 'string' || !x.actor.trim()) ||
      new Set(credentials.map(x => x.token)).size !== credentials.length)
    throw new Error('Explicit unique local demo credentials required');
  const records = new Map(); // Ephemeral synthetic metadata ONLY; no file bytes kept.
  const server = createServer(async (req, res) => {
    try {
      if (req.socket.remoteAddress !== '127.0.0.1' && req.socket.remoteAddress !== '::1')
        throw failure(403, 'Loopback only');
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname === '/healthz' && req.method === 'GET') return reply(res, 200, {status:'demo-only'});
      const auth = req.headers.authorization;
      if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) throw failure(401, 'Authentication required');
      const bearer = auth.slice(7);
      const identity = credentials.find(x => equalToken(bearer, x.token));
      if (!identity) throw failure(401, 'Authentication required');
      if (pathname === '/v1/demo/intakes' && req.method === 'POST') {
        if (identity.role !== 'editor') throw failure(403, 'Editor required');
        if (req.headers['content-type'] !== 'application/json') throw failure(415, 'JSON required');
        const body = await readLimited(req, MAX_JSON_BYTES);
        let input;
        try { input = JSON.parse(body.toString('utf8')); } catch { throw failure(400, 'Invalid JSON'); }
        if (!input || typeof input !== 'object' || Array.isArray(input) ||
            Object.keys(input).sort().join(',') !== 'reference,title' ||
            typeof input.title !== 'string' || !/^DEMO: [^\r\n]{1,100}$/.test(input.title) ||
            typeof input.reference !== 'string' || !/^DEMO-[A-Z0-9-]{1,40}$/.test(input.reference))
          throw failure(422, 'Only marked synthetic metadata is allowed');
        const record = { id:randomUUID(), created_by:identity.actor, state:'draft', version:0,
          user_title:input.title, reference:input.reference, metadata_complete:false,
          public_copy_reviewed:false, content_approved:false };
        records.set(record.id, record);
        return reply(res, 201, {id:record.id, state:record.state, version:record.version});
      }
      const match = pathname.match(/^\/v1\/demo\/intakes\/([0-9a-f-]{36})(?:\/(quarantine))?$/);
      if (!match) throw failure(404, 'Not found');
      const record = records.get(match[1]);
      if (!record) throw failure(404, 'Not found');
      if (record.created_by !== identity.actor) throw failure(403, 'Not authorized for this record');
      if (req.method === 'GET' && !match[2])
        return reply(res, 200, {id:record.id, state:record.state, version:record.version,
          user_title:record.user_title, reference:record.reference});
      if (req.method === 'POST' && match[2] === 'quarantine') {
        if (identity.role !== 'editor') throw failure(403, 'Editor required');
        if (record.state !== 'draft') throw failure(409, 'Record is not a draft');
        if (req.headers['content-type'] !== 'application/pdf') throw failure(415, 'PDF required');
        const bytes = await readLimited(req, MAX_DEMO_BYTES);
        // Exact marker is an intentionally strict DEMO constraint, not content security verification.
        if (!bytes.includes(SYNTHETIC_MARKER)) throw failure(422, 'Synthetic test marker required');
        const inspected = inspectPdfForQuarantine(bytes, 'application/pdf');
        if (!inspected.accepted) throw failure(422, 'PDF pre-quarantine check failed');
        const next = advanceReview(record, {action:'submit',actor:identity.actor,
          role:'editor',expectedVersion:record.version});
        records.set(record.id, next);
        return reply(res, 202, {id:record.id, state:next.state, version:next.version,
          sha256:inspected.sha256, status:'not_scanned_not_stored'});
      }
      throw failure(405, 'Method not allowed');
    } catch (error) {
      if (!res.headersSent && !res.destroyed)
        reply(res, error.status && [400,401,403,404,405,409,413,415,422].includes(error.status)
          ? error.status : 400, {error:error.status ? error.message : 'Bad request'});
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 5_000;
  server.maxHeadersCount = 30;
  return server;
}
