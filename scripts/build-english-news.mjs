import { mkdir, writeFile } from 'node:fs/promises';

const reports = [
  {
    id: '20072026-001', date: '20 July 2026', title: 'The Police filed the demand. In other words: the drawer closed again',
    description: 'Police communication confirming that a filing was recorded without further action.', score: '9/9',
    standfirst: 'The Police confirmed receipt of the filing and recorded it without further action. No substantive response followed.',
    paragraphs: [
      'On 14 July 2026, Dušan Dvořák sent the Police a pre-action demand as evidence of the urgency of the preventive filing dated 12 July. The Police confirmed receipt and stated that the matter had been filed without further action.',
      'The source is the Regional Police Directorate of the Olomouc Region, communication ref. KRPM-100092-2/ČJ-2026-1412UO dated 20 July 2026.',
      '“The drawer closed again” is an editorial metaphor. The official wording is that the filing was recorded “without taking any further measure”. The report does not treat that procedural step as proof of unlawful conduct.'
    ]
  },
  {
    id: '22072026-002', date: '22 July 2026', title: 'For every cannabis trace, show the sample, method and measurement uncertainty',
    description: 'An alliance filing asks the Prague Municipal Court to document the sample and analytical method in case 45 T 1/2024.', score: '9/9',
    standfirst: 'Cannabis is The Cure submitted a proposal to supplement the evidence before the Prague Municipal Court in case 45 T 1/2024.',
    paragraphs: [
      'The filing follows the Prague High Court order of 29 July 2025, ref. 11 To 88/2024-2990, which set aside the earlier judgment in the relevant part and returned the case for a new hearing.',
      'For each cannabis trace, the alliance asks the court to identify its origin, form and weight; the sampling procedure and representativeness; the analytical method; the distinction between THC and THCA; measurement uncertainty; and the basis of every conversion.',
      'The filing says these points matter because expert findings must be critically checked rather than merely repeated. The alliance is not a party to the criminal case, does not represent the defendants and does not claim that the filing itself proves laboratory error, guilt or innocence. The court decides what evidence to take and how the case will end.'
    ]
  },
  {
    id: '23072026-004', date: '23 July 2026', title: 'Ministry: We cannot assist. The jurisdictional ping-pong is heading to court',
    description: 'An intervention action challenges the Ministry of the Interior’s combined handling of two distinct complaints.', score: '9/9',
    standfirst: 'On 23 July 2026, Dušan Dvořák filed an intervention action against the Ministry of the Interior with the Prague Municipal Court.',
    paragraphs: [
      'The action challenges the Ministry’s communication of 21 July 2026, ref. MV-114818-2/TP-2026, which handled together two complaints of 15 and 17 July that differed in substance.',
      'The Ministry stated that it could not assist the claimant and that the described matters fell outside its remit. The action alleges that the answer did not distinguish the individual parts, state the result of any review, or explain whether and where any part had been forwarded.',
      'The claimant asks the Ministry to assess each filing according to its true content and identify what it reviewed, handled under another procedure, forwarded, or regarded as outside its powers. The action does not ask the administrative court to determine the correct THC method, review criminal judgments, declare innocence or dictate the outcome of an internal review.',
      'Filing the action does not itself prove an unlawful intervention. Admissibility, evidence and the outcome are for the Prague Municipal Court. The related proceedings cited in the filing are 18 A 17/2026, 18 A 23/2026 and 8 Ad 9/2026.'
    ]
  },
  {
    id: '24072026-006', date: '24 July 2026', title: 'The Cannabis Church is not asking for a miracle. It wants a decision',
    description: 'The Ministry of Culture confirmed that it was examining the filing and gave a date for further information.', score: '8/9',
    standfirst: 'After years of waiting, the Church of Cannabis asks for a reviewable procedural result.',
    paragraphs: [
      'By an application dated 26 June 2026, Dušan Dvořák, acting for the preparatory committee of the Church of Cannabis, asked for the procedural status of the registration proceeding initiated on 14 July 2016 and for a fresh assessment. A supplement dated 6 July was delivered on 7 July 2026.',
      'In its communication of 22 July 2026, ref. MK 45728/2026 SOCNS, the Ministry of Culture confirmed receipt of both records. It said that it was examining the matter “very carefully” and would communicate its findings and next step no later than 31 August 2026.',
      'A clarification dated 24 July states that the applicant is not seeking information or a non-binding assessment only. It requests a new proceeding and decision under Section 101(b) of the Czech Code of Administrative Procedure and refers to Supreme Administrative Court judgment 5 As 202/2024-22 of 14 March 2025.',
      'The Ministry had not yet decided the application. Its letter contained no operative ruling, reasoning or instruction on remedies. This report therefore does not claim that registration will be granted or that a right to a particular outcome has arisen.'
    ]
  },
  {
    id: '25072026-007', date: '25 July 2026', title: 'To Lenka Bradáčová, with love',
    description: 'A filing asks the Supreme Public Prosecutor to review supervision conducted on an incomplete file.', score: '9/9',
    standfirst: 'Twenty-five pages, twenty alleged defects and six control questions replace flowers with an evidence map.',
    paragraphs: [
      'On 25 July 2026, Dušan Dvořák submitted a request to the Supreme Public Prosecutor’s Office for review of the Prague High Public Prosecutor’s supervision and the conduct of the Olomouc High Public Prosecutor’s Office. It was addressed for the personal attention of Supreme Public Prosecutor Lenka Bradáčová.',
      'The immediate source was Prague High Public Prosecutor communication 1 VZN 1678/2026-70 dated 23 July 2026. It called the supervision request unfounded, while expressly stating that the reviewed Prague Municipal Public Prosecutor file did not contain the Supreme Public Prosecutor’s communication of 13 May or the filings of 25 April, 8 May and 12 May 2026.',
      'The new filing identifies twenty formal and procedural defects and asks for the missing records to be added and the Prague and Moravian branches to be joined in one reviewable evidence map. It asks which binding source governed THC measurement in 2009–2019, how representative samples were created, how THC and THCA were distinguished, what uncertainty rules applied, which body owns each branch, and who substantively examined the alleged health harms and deaths.',
      'A score of 9/9 marks the record’s importance to the evidence memory and the need for procedural checking. Forwarding, supervision, an incomplete file or a new filing does not by itself prove a criminal offence or the responsibility of any person.'
    ]
  },
  {
    id: '28072026-009', date: '28 July 2026', title: 'To Lenka Bradáčová, with love — online',
    description: 'Five connected filings map a Prague–Brno–Prague jurisdiction dispute and missing records.', score: '9/9',
    standfirst: 'Love may be blind. State supervision of legality should not be blind, deaf or disoriented.',
    paragraphs: [
      'On 27 July 2026, five connected filings were sent to the Moravian-Silesian Police forensic unit in Frýdek-Místek, the Brno Regional Public Prosecutor, the Prague Municipal Public Prosecutor, the Prague High Public Prosecutor and the Supreme Public Prosecutor.',
      'They concerned the standard operating procedures used to measure THC in cannabis seized during ten searches in 2009–2019; review of the Brno jurisdictional branch; acceptance or resolution of the matter returned to Prague; renewed supervision; and a joint assessment under file 6 NZN 1737/2026. The filing to the Supreme Public Prosecutor expressly states that this is not a new isolated submission intended for automatic forwarding.',
      'The Supreme Public Prosecutor transferred part of the matter to Prague on 13 May. Prague divided it on 11 June and sent one part to Brno. Brno handled that branch as 3 ZN 140/2026 and returned it to Prague on 21 July with three annexes and supplements.',
      'The Prague High Public Prosecutor closed its supervision on 23 July under 1 VZN 1678/2026 while recording that material submissions were absent from the reviewed file. The report treats that statement as evidence of what the file contained, not as automatic proof of illegality.',
      'The page is an evidence diary. Each further entry must identify the date, authority, case reference, exact quotation, source PDF, what the record supports and what cannot be inferred from it.'
    ]
  },
  {
    id: '07082026-011', date: '7 August 2026', title: 'Lorraine Nolan with love',
    description: 'A formal call under Article 265 TFEU asks EUDA to address the comparability of THC and THC/THCA analytical methods.', score: '9/9',
    standfirst: 'How can European cannabis data be scientifically comparable when laboratories and Member States use different analytical procedures?',
    paragraphs: [
      'Dr Lorraine Nolan is Executive Director of the European Union Drugs Agency. EUDA supplies drug-related information to Union institutions, Member States and international partners, including data concerning cannabis and cannabis-related crime.',
      'Since 15 May 2026, Cannabis is The Cure has asked EUDA whether Member States use scientifically transparent, harmonised and internationally comparable methods for determining THC in cannabis. The questions cover GC/GC-FID and LC/HPLC, decarboxylation of THCA into THC, representative sampling, homogenisation, drying, storage and measurement uncertainty.',
      'During a stay in Lisbon from 18 to 25 May, materials were offered for personal delivery. EUDA official Danilo Ballotta proposed delivery through reception and said they would be read and answered by email. A follow-up of 3 June asked EUDA to confirm receipt and identify when a substantive answer could be expected.',
      'On 7 August 2026, EUDA received a formal call to act under Article 265 TFEU in relation to its tasks under Regulation (EU) 2023/1322. The call does not ask EUDA to decide Czech criminal cases or harmonise Czech criminal law. It asks the Agency to state its own position on scientific quality, data comparability and analytical-method harmonisation.',
      'EUDA confirmed receipt later that day and said it would carefully assess the points and respond, noting possible holiday delay. The project records this as confirmation of receipt, not as EUDA’s substantive position under Article 265 TFEU.'
    ]
  },
  {
    id: '04082026-010', date: '4 August 2026', title: 'A time for the state to love — Godot online',
    description: 'English editorial edition of the source-linked Czech procedural chronology.', score: '9/9',
    standfirst: 'A living evidence map connects public records, proceedings, responses and source PDFs from 1 May 2026 onward.',
    paragraphs: [
      'Godot online is the project’s canonical Czech chronology of records issued by state bodies and public institutions. At the current build it contains 67 numbered public records and separately linked submissions by Dušan Dvořák and participating organisations.',
      'Every chronology entry distinguishes the date, author or authority, reference number, documented event, public PDF status and procedural relationship. Where a public authority responds to an earlier submission, or a later filing responds to an authority’s statement, the two directions are recorded separately.',
      'The collection includes court proceedings, public-prosecution supervision, police and forensic-method branches, ministries, the Office of the President, information-law proceedings and the European EUDA branch. A referral, transfer, acknowledgement or review is recorded as a procedural act; it is not presented as proof of wrongdoing.',
      'Czech official documents remain the controlling originals. This English page is an editorial guide to the evidence map, not a replacement for the full Czech wording or for human legal review. Readers should check the linked record, exact passage, date, reference and current procedural status before relying on any entry.'
    ], canonical: true
  }
];

const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const render = report => `<!doctype html>
<html lang="en"><head><base href="../"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${esc(report.description)}"><title>${esc(report.title)} | CannaInsider.EU</title><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="brand.css"></head>
<body><header class="topline"><span>${esc(report.date.toUpperCase())}</span><span>INDEPENDENT EVIDENCE MEMORY · CZECHIA</span><a href="zpravy/${report.id}.html" lang="cs">ČESKY</a></header>
<header class="masthead"><a class="brand" href="en.html"><b>CannaInsider.EU</b><span>INTERNATIONAL EVIDENCE REPORTER</span></a><div class="brand-promise"><p>Will there be a cannabis amnesty?</p><img class="heart-logo" src="assets/votruba/heart-red-grayscale.png" alt="A red winged heart on a hand, Jiří Votruba"></div></header>
<nav class="nav"><a href="en.html">Front page</a><a href="news/index.html">News archive</a><a href="en.html#traffic">Check a record</a></nav>
<main class="article-shell"><article><header class="article-header"><p class="kicker">CANNAINSIDER NEWS · ${esc(report.date.toUpperCase())} · REPORT ${report.id}</p><h1>${esc(report.title)}</h1><p class="standfirst">${esc(report.standfirst)}</p><div class="score score-red"><strong>${report.score}</strong><span>EVIDENCE RELEVANCE · HUMAN REVIEW REQUIRED</span></div><div class="news-meta"><span>English editorial edition</span><span>Czech sources remain controlling</span></div></header>
<div class="article-layout"><div class="article-body">${report.paragraphs.map(text => `<p>${esc(text)}</p>`).join('')}<section class="source"><h2>Canonical source and evidence boundary</h2><p><a href="zpravy/${report.id}.html" hreflang="cs">Open the complete Czech report and its linked source records →</a></p><p>This English edition reports the documented chronology and the author’s editorial interpretation separately. It is not legal advice and does not predict a court or authority’s decision.</p></section>${report.canonical ? '<section class="source"><h2>Full living chronology</h2><p>The complete item-by-item chronology, exact Czech descriptions and public PDF links are maintained in the canonical Czech edition above.</p></section>' : ''}</div><aside class="article-aside"><figure><img src="assets/votruba/write-lawmakers.jpg" alt="Black-and-white drawing by Jiří Votruba"><figcaption>Jiří Votruba</figcaption></figure><p><a href="news/index.html">Full archive</a></p></aside></div></article></main>
<footer><div class="brand"><b>CannaInsider.EU</b><span>INTERNATIONAL EVIDENCE REPORTER</span></div><p><b>Operator: Cannabis is The Cure, z. s.</b></p><p>The score indicates relevance and review priority, not a legal outcome.</p></footer></body></html>`;

await mkdir('web/news', { recursive: true });
for (const report of reports) await writeFile(`web/news/${report.id}.html`, render(report), 'utf8');
console.log(`English news editions generated: ${reports.length}/${reports.length}.`);
