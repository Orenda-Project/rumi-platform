# STAGE-C ENRICHMENT BRIEF — the executable lesson body (ICT K-5)

You are enriching ONE divided lesson into its full executable teaching body. You receive:
(1) this brief, (2) the SEGMENT (the lesson stub: skill_type, SLOs, pages, chapter context),
(3) the PAGE-TRUTH for its pages (verbatim text, solved exercises, described illustrations).

## The iron rule — GROUNDING
Every fact, word, exercise, answer, character and picture you use must be traceable to the
PAGE-TRUTH or the segment's SLOs. **Nothing invented.** Do not import mnemonics, songs,
examples, or vocabulary from outside the provided pages. If the page-truth lacks something the
lesson needs, mark it in `notes` as `"gap: <what>"` — never fabricate it.

## Output — ONE JSON object, nothing else
Return ONLY a JSON object with EXACTLY these keys (write "" or [] only where truly n/a — see
zero-tolerance rules; a required section left thin is a failure):

{
 "segment_id": "...", "slo_refs": [...], "bloom": "...", "duration_min": 30,
 "materials": ["chalk","textbook p.17", ...],
 "warmUp": {"minutes": 2-6, "script": "CUMULATIVE spaced retrieval of PRIOR lessons (not today's) — exact teacher script + expected answers", "items": [ ... ]},
 "hookStory": "...", "hookCharacters": [{"name":"...","role":"speaking|illustrative","position":"...","speechBubble":"... or null"}],
 "keyWords": [{"term":"...","urdu_gloss":"...","syllables":"...","student_definition":"..."}],
 "boardWork": {"instruction":"...","content":"EXACTLY what goes on the board"},
 "steps": [{"phase":"I-Do|We-Do|You-Do","minutes":N,"action":"...","say":"verbatim teacher line with THINK-ALOUD reasoning","cfu":{"question":"open-ended","pass_signal":"...","if_struggle":"..."}} , ...],
 "workedExample": "every calculation/step visible",
 "partnerActivity": {"structure":"...","dialogueFrameA":"...","dialogueFrameB":"...","teacher_role":"circulate prompts"},
 "problems": [{"prompt":"...","status":"solved|open-personal","solution":"full worked solution (or model_solution for open items)"}],
 "weakLearnerSupport": "named strategy + concrete instruction", "challengeExtension": "...",
 "exitTicket": {"task":"tests the SLO in a NEW context not used in I-Do/We-Do","success_criteria":"...","self_prediction":"ask students to predict their result"},
 "homework": "...", "keyFact": "...", "cfuExplain": "...",
 "coachingReflection": "...", "nextTopicPreview": "...",
 "subject_elements": { ...the mandatory research elements for this subject, see below... },
 "notes": ["gap: ...", ...]
}

## Zero-tolerance content rules
1. **No placeholders ever** (`____`, "Option A", "TBD", "fill in with students", "[insert]"). Every field executable as written.
2. **Solve every referenced exercise yourself** (full answer key). Open/personal items → `status:"open-personal"` + a `model_solution` exemplar.
3. **One LP = one skill** — model THIS segment's skill_type deeply; other page exercises appear only as answer keys/bonus.
4. **Pictures ARE source material** — use what the page-truth's illustration descriptions saw.
5. **Language**: Urdu lessons → the body in Urdu (Nastaliq, aeraab where taught); English lessons → English with Urdu glosses in keyWords; Maths/Science → English spine + bilingual glossary (term-of-record EN + Urdu gloss). Gender-neutral address (no gendered 2nd-person verb stems in Urdu).
6. **Times**: phases sum to the segment's duration_min (25-40). I-Do ≤25%, We-Do ≥30%, You-Do ≥30%.
7. **CFU after every phase**, open-ended, each with a pass/fail signal + an if-struggle move.
8. Grade-appropriate register; Pakistani context (names, places, rupees); both genders represented in examples.
9. Resources = government-school reality: chalk, board, textbook, slates; no projector/printouts.
10. **Echo `slo_refs` + `bloom`** from the segment verbatim.
11. Characters: only those in the page-truth; a pictured-but-silent character stays `role:"illustrative", speechBubble:null`.
12. Exit ticket tests the SLO in a NEW context + success criteria + student self-prediction.

## Mandatory research elements (fill `subject_elements` — an LP missing its subject's elements is INCOMPLETE)
**All subjects**: the warmUp above must be cumulative spaced retrieval (2-6 min, prior lessons).
**English** — by skill_type: `phonics`: explicit sound→blend→**ENCODE (dictation)**→decodable-text practice (≥95% taught patterns) → `subject_elements: {target_sound, blend_sequence, dictation_words, decodable_text}`. `writing`: dictation/encoding not copying. `reading_comprehension`: fluency-first repeated reading + one named strategy + inferential Qs. `oral_communication`: structured oral frames + English-only phoneme practice (th, v/w). `pre_reading`: pre-teach vocab + background.
**Urdu** — `arkaan_saazi`: توڑ/جوڑ join-break PRODUCTION loop + آدھی اشکال positional forms + non-joiner (ا د ڈ ذ ر ڑ ز ژ و) chain-break rule + dot-discrimination. `buland_khwani`: repeated reading of POINTED text + cwpm tracking (owns speaking). `tafheem`: listening + literal→inferential ladder. `takhleeqi_likhai`: تختی + 2-3 min pointed املا with `markScheme:"connected-form-correct"`. → subject_elements carries the drill scripts.
**Maths** — every lesson: (1) number-sense warm-up slot (subitise/bonds/place-value) INSIDE warmUp, (2) 2-8 min anxiety-safe fact-fluency drill (low-stakes, self-referenced, game-framed, NEVER whole-class timed), (3) mastery-check exit gate with a variation ("same/different?") item, (4) misconception pre-empt, (5) bilingual maths glossary. CPA fidelity: enact the segment's cpa_phase; new concepts never start abstract. → subject_elements: {number_sense_warmup, fluency_drill, mastery_criterion, variation_item, misconception_preempt}.
**Science** — investigate-BEFORE-explain (predict→observe→explain ordering); bilingual glossary per new term; hands-on with local materials. → subject_elements: {poe_sequence, glossary, local_materials}.

**Revision (990)**: spaced CUMULATIVE retrieval across the chapter — every non-revision SLO reappears; interleaved. **Assessment (995)**: a student-facing worksheet spec — items covering every chapter SLO, answer key included, B&W-printable description.

## SPEC-COMPLETENESS ADDENDUM (v2 — mandatory, each item is scored)
13. **Write the SLO out in full**: top-level `"slo_statement"` restating the segment's slo_descriptions verbatim as one action-verb sentence (codes alone are not an SLO).
14. **Student voice**: ≥1 scripted question inviting students to connect the content to their OWN life/home/community, with 2 expected-answer examples.
15. **Representation**: examples/problems deliberately use BOTH boy and girl Pakistani names.
16. **Real-world link**: ≥1 concrete daily-life application (shopping, chores, mosque/school/bazaar scenes) tied to the SLO — not "we use this in daily life".
17. **Warm-up delivery is peer-mediated**: choral response, pair-check, or peer-CFU — never teacher→single-student only.
18. **Exit ticket has all 3 parts**: new-context task + explicit success criteria + a self-prediction line ("before solving, predict: will you get it right?").
19. **Work the textbook material**: quote/use the page's actual passage/exercise content in I-Do and We-Do (not just cite the page number).

## PRECISION ADDENDUM (v3 — targets the measured review deficits; each line is scored)
20. **SLO code inline**: the `slo_statement` embeds the code in-line — e.g. "By the end of the lesson, students will read and match sight words to sounds (E-01-RD-05)." State the Bloom level right after it, and make the SLO verb + every task + every CFU match that Bloom level (a 'remember' SLO gets recall tasks, an 'apply' SLO gets application tasks).
21. **Declare single-lesson scope**: include `"scope_declaration": "ONE lesson, ONE class period of <duration_min> minutes, ONE SLO"` and a phase-minutes plan that sums EXACTLY to duration_min (warmUp + steps + exitTicket). Keep at most 4 main activities — depth over sprawl.
22. **Named-example quota**: across the lesson, at least 2 named Pakistani girls AND 2 named boys (e.g. Fatima, Zainab, Ahmed, Bilal) doing the actual work in examples/problems.
23. **Real-world scene**: at least one application set in a NAMED scene from the child's world (bazaar stall, kitchen, school assembly, cricket ground) using its real objects/quantities — e.g. "Zainab buys 3 samosas at the bazaar for 15 rupees each…".
24. **Exit-ticket exemplar shape**: {"task":"NEW-context question testing the SLO","success_criteria":"Correct if the student <observable behaviour>","self_prediction":"Before answering, each student draws ☺ or ☹ predicting whether they will get it right"} — all three, always.
25. **Student-voice exemplar shape**: a scripted question like "آپ کے گھر/محلے میں یہ کہاں نظر آتا ہے؟" / "Where do YOU see this at home or in your street?" + 2 expected answers from a Pakistani child's life.
26. **Page references**: cite ONLY the exact printed page numbers given in the segment; quote the page's own passage/exercise text when referencing it; NEVER invent an exercise name or number.
27. **Teacher flexibility**: each steps[] phase carries a short `"flex_note"` — "if students already know X, skip to Y / if they struggle, do Z" — so the script guides without handcuffing.
28. **Board visual**: boardWork.content describes a simple chalk-drawable visual (boxes/arrows/tally marks/number line) where the topic benefits from one.
29. **SELF-AUDIT before returning**: silently check rules 13-28 one by one against your draft and repair any miss. Only then output the JSON.
