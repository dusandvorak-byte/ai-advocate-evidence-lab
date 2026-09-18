import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const output = 'web/documents/report-04082026-010/96-os-praha4-10-c-69-2026-predvolani-2026-09-16.pdf';
const sourceText = await readFile('project-memory/source-texts/os-praha4-2026-09-16-10-c-69-2026-predvolani.txt', 'utf8');
const pages = sourceText.split(/<PARSED TEXT FOR PAGE: \d+ \/ 4>\n/).slice(1);
if (pages.length !== 4) throw new Error(`OS Praha 4 public copy source must contain 4 pages, got ${pages.length}`);

const glyphEntries = [
['č','ccaron'],['Č','Ccaron'],['ě','ecaron'],['Ě','Ecaron'],['ř','rcaron'],['Ř','Rcaron'],['ů','uring'],['Ů','Uring'],
['ň','ncaron'],['Ň','Ncaron'],['ď','dcaron'],['Ď','Dcaron'],['ť','tcaron'],['Ť','Tcaron'],['á','aacute'],['Á','Aacute'],
['é','eacute'],['É','Eacute'],['í','iacute'],['Í','Iacute'],['ó','oacute'],['Ó','Oacute'],['ú','uacute'],['Ú','Uacute'],
['ý','yacute'],['Ý','Yacute'],['š','scaron'],['Š','Scaron'],['ž','zcaron'],['Ž','Zcaron']
];
const enc = new Map();
for (let i=32;i<127;i++) enc.set(String.fromCharCode(i), i);
glyphEntries.forEach(([ch],i)=>enc.set(ch,128+i));
const replacements = new Map([['–','-'],['—','-'],['„','"'],['“','"'],['”','"'],['…','...'],[' ',' '],['−','-']]);
const norm = s => [...String(s)].map(ch => replacements.get(ch) ?? ch).join('');
const hex = s => '<'+[...norm(s)].map(ch => (enc.get(ch) ?? 63).toString(16).padStart(2,'0').toUpperCase()).join('')+'>';
const wrap = (line, limit=104) => {
  const s = norm(line).trimEnd();
  if (!s) return [''];
  if (s.length <= limit) return [s];
  const words=s.split(/\s+/); const out=[]; let cur='';
  for (const word of words) {
    const cand=cur ? `${cur} ${word}` : word;
    if (cur && cand.length>limit) { out.push(cur); cur=word; } else cur=cand;
  }
  if (cur) out.push(cur); return out;
};
const centerHeadings = new Set(['OBVODNÍ SOUD PRO PRAHU 4','Předvolání','Poučení','Určení výše svědečného']);
const boldHeads = new Set(['Potvrzení zaměstnavatele','Informace o zpracování osobních údajů pro účel náhrady svědečného']);
const approxWidth = (s,size) => norm(s).length * size * 0.49;
const contents=[];
for (let pi=0;pi<pages.length;pi++) {
  const cmds=[]; let y=800; const left=48;
  if (pi===0) {
    const notice='OVĚŘENÁ VEŘEJNÁ KOPIE Z ÚPLNÉHO EXTRAHOVANÉHO TEXTU ZDROJOVÉHO PDF; NENÍ BINÁRNÍM ORIGINÁLEM.';
    for (const ln of wrap(notice,112)) { cmds.push(`BT /F2 7 Tf ${left} ${y} Td ${hex(ln)} Tj ET`); y-=9; }
    y-=4;
  }
  for (const raw of pages[pi].trimEnd().split('\n')) {
    const t=norm(raw.trim());
    if (!t) { y-=5; continue; }
    const center=centerHeadings.has(t);
    const bold=center || boldHeads.has(t) || t.startsWith('Jste-li ');
    const size=center ? 11 : (bold ? 8.8 : 8.1);
    const leading=center ? 13 : 9.8;
    const limit=center ? 120 : 108;
    for (const ln of wrap(t,limit)) {
      const x=center ? Math.max(left,(595.276-approxWidth(ln,size))/2) : left;
      cmds.push(`BT /F${bold?2:1} ${size} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td ${hex(ln)} Tj ET`);
      y-=leading;
    }
    if (center) y-=2;
  }
  contents.push(cmds.join('\n')+'\n');
}
const differences=glyphEntries.map(([ch,name],i)=>`${128+i} /${name}`).join(' ');
const objs=[];
objs.push('<< /Type /Catalog /Pages 2 0 R >>');
objs.push('<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R 6 0 R] /Count 4 >>');
for (let p=0;p<4;p++) objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.276 841.89] /Resources << /Font << /F1 12 0 R /F2 13 0 R >> >> /Contents ${7+p} 0 R >>`);
for (const c of contents) objs.push(`<< /Length ${Buffer.byteLength(c,'ascii')} >>\nstream\n${c}endstream`);
objs.push(`<< /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [ ${differences} ] >>`);
objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding 11 0 R >>');
objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding 11 0 R >>');
objs.push('<< /Title (OS Praha 4 - predvolani 10 C 69/2026 - overena verejna kopie) /Producer (Evidence Lab verified public copy) >>');
const pieces=[Buffer.from('%PDF-1.4\n%ASCII\n','ascii')];
const offsets=[0]; let length=pieces[0].length;
for (let i=0;i<objs.length;i++) { offsets.push(length); const b=Buffer.from(`${i+1} 0 obj\n${objs[i]}\nendobj\n`,'ascii'); pieces.push(b); length+=b.length; }
const xref=length; let tail=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`;
for (const off of offsets.slice(1)) tail += `${String(off).padStart(10,'0')} 00000 n \n`;
tail += `trailer\n<< /Size ${objs.length+1} /Root 1 0 R /Info 14 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
pieces.push(Buffer.from(tail,'ascii'));
const pdf=Buffer.concat(pieces);
if (pdf.some(byte=>byte>=128)) throw new Error('Generated public copy is not ASCII-safe');
if (!pdf.subarray(0,5).equals(Buffer.from('%PDF-'))) throw new Error('Generated public copy lacks PDF header');
if (!pdf.subarray(-2048).includes(Buffer.from('%%EOF'))) throw new Error('Generated public copy lacks EOF');
await mkdir('web/documents/report-04082026-010',{recursive:true});
await writeFile(output,pdf);
const sha256=createHash('sha256').update(pdf).digest('hex');
if (sha256 !== '0cd831f494e7b1001ccb358449f6ca757a870ae72931e603464c83f4d53caea7') throw new Error(`Unexpected OS Praha 4 public copy sha256: ${sha256}`);
console.log(`Materialized verified OS Praha 4 public PDF copy: ${pdf.length} B; sha256=${sha256}`);
