import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function verifyLivePdf({url, expectedFile, expectedSourceCommit, markerUrl, outputFile,
  attempts=36, delayMs=10000, timeoutMs=30000, fetchImpl=fetch, sleepImpl=sleep, log=console.error}) {
  const allowed = value => /^https:\/\//.test(value) || /^http:\/\/127\.0\.0\.1(?::\d+)?\//.test(value);
  if (!allowed(url) || (markerUrl && !allowed(markerUrl))) throw new Error('HTTPS URL required');
  if (!/^[a-f0-9]{40}$/.test(expectedSourceCommit)) throw new Error('Expected source commit must be a full SHA-1');
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 60) throw new Error('Invalid attempts');
  const expected = digest(await readFile(expectedFile));
  let last = {reason:'not attempted'};
  for(let i=1; i<=attempts; i++) {
    try {
      let markerMatches = true;
      if (markerUrl) {
        const markerReq = new URL(markerUrl);
        markerReq.searchParams.set('verify_commit', expectedSourceCommit);
        markerReq.searchParams.set('attempt', String(i));
        const markerResponse = await fetchImpl(markerReq.toString(), {cache:'no-store', signal:AbortSignal.timeout(timeoutMs)});
        if (!markerResponse.ok) throw new Error('marker HTTP '+markerResponse.status);
        const marker = (await markerResponse.text()).trim();
        if (marker !== expectedSourceCommit) {
          markerMatches = false;
          last={reason:'source commit marker not yet propagated', observedCommit:marker.slice(0,40)};
        }
      }
      if (markerMatches) {
        const pdfReq = new URL(url);
        pdfReq.searchParams.set('verify_commit', expectedSourceCommit);
        pdfReq.searchParams.set('attempt', String(i));
        const response = await fetchImpl(pdfReq.toString(), {cache:'no-store', signal:AbortSignal.timeout(timeoutMs)});
        if (!response.ok) throw new Error('PDF HTTP '+response.status);
        const downloaded = Buffer.from(await response.arrayBuffer());
        const observed = digest(downloaded);
        if (observed === expected) {
          if (outputFile) await writeFile(outputFile, downloaded, {flag:'w',mode:0o600});
          log('LIVE_PDF_SHA256_OK attempt='+i+' hash='+expected);
          return {ok:true,attempt:i,sha256:expected};
        }
        last={reason:'PDF SHA256 mismatch',expected,observed,attempt:i};
      }
    } catch (e) {
      last={reason:'live fetch failure',error:String(e.message || e)};
    }
    log('LIVE_PDF_PENDING attempt='+i+' reason='+last.reason);
    if (i < attempts) await sleepImpl(delayMs);
  }
  throw new Error('LIVE_PDF_VERIFICATION_FAILED '+JSON.stringify(last));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [url, expectedFile, commit, markerUrl, outputFile] = process.argv.slice(2);
  if (!url || !expectedFile || !commit) {
    console.error('Usage: node verify-live-pdf.mjs <public-pdf-url> <local-file> <commit-sha> [public-marker-url] [verified-output-file]');
    process.exitCode=2;
  } else {
    verifyLivePdf({url,expectedFile,expectedSourceCommit:commit,markerUrl,outputFile}).catch(e=>{
      console.error(e.message); process.exitCode=1;
    });
  }
}
