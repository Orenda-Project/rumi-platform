# Stage D0 — the slide-script transform

> Read IN FULL before writing a single image prompt. The 14 operator laws and the maths-rendering playbook are here. Gate G6.

## Contents

- Stage D0 — the SLIDE-SCRIPT transform (enrichment ≠ slide script)
- The operator laws (all binding on any new region's D0)
- Deterministic repairs — never trust the model where code can check
- DERIVE, don't repair — the ICT v6 lesson (2026-08-13)
- A deterministic repair must live INSIDE the generator
- THE RENDER PROMPT — how to make an image model draw the right quantity
- ⛔ RULES MUST LIVE WHERE THE TEXT IS FINALLY WRITTEN
- The judge gate (G6) and how to keep it trustworthy
- Revision (990) — three parallel mini-lessons
- Assessment (995) — a student WORKSHEET plus a separate ANSWER KEY
- Prompt ONE PAGE per image call, never one section
- Rendering mathematical quantities — the consolidated playbook
- LOOK at every page before a human does — this is not optional (G8)
- The 2026-08-16 laws — column sums, per-number assays, and the two boundary leaks

---

## Stage D0 — the SLIDE-SCRIPT transform (enrichment ≠ slide script)

> **Codified 2026-08-04 after the deployment round-1 rebuild. Its absence caused ~80% of the defects in
> the first sample batch.** Read
> reference/prompt-layer/PROMPT_LAYER_SPEC_v3.md
> IN FULL before writing a single image prompt — it supersedes this section on conflict.

**The enrichment output is a LESSON PLAN. An image model needs a SLIDE SCRIPT. They are different
artifacts that happen to share field names.** an earlier run's v7 had an authoring pass between them —
*"The LLM generates the specific content… NBPro then renders the visual."* Skip it and you prompt the
renderer with 900-character teacher monologues and phase-tagged step objects.

Measured across 1,900 segments — the deltas to close, and what each costs if you don't:

| Enrichment gives you | A slide script needs | If you skip the transform |
|---|---|---|
| `steps[]` tagged I-Do / We-Do / You-Do | three separate pages | all three phases crushed onto one page |
| `exitTicket.task` (prose; **no choices, no answer in 1900/1900**) | a question + options + the correct one | an "exit ticket" that isn't a question |
| `problems[].solution` (present in **1881/1900**) | a teacher answer key | the answer key you already paid for goes unused |
| singular `keyFact` (one long sentence) | 2–3 bullets | a one-sentence REMEMBER card |
| `hookCharacters[].name` = a *stage direction* | a look + a spoken line | "elderly narrator looks out from his speech bubble" printed on the page |
| `slo_statement` with codes `(E-01-RD-28)` | a child-facing goal | internal SLO codes shipped to teachers |
| 900-char `say` fields | ≤150 chars | illegible, or truncated mid-word |

**Build it deterministic-first, authored-only-for-the-gap.** The corpus wins wherever the corpus has
an answer (phase split, answer key, page refs, key words); one cheap cached LLM call covers only what
the corpus genuinely lacks at poster altitude. Condensing a monologue to fit a poster is the job;
inventing pedagogy is not.

### The operator laws (all binding on any new region's D0)

Canonical record:
reference/prompt-layer/OPERATOR_FEEDBACK_52_POINTS_2026-08-04.md.

1. **The reader is the TEACHER.** Students never see this artifact. Every section tells her HOW to
   teach — never merely restates book content. Spoken "say" lines rightly address children;
   everything else addresses her. Student-facing wording ("Finished? Try this") is banned.
2. **Easily executable on a phone, minutes before class.** Every activity runnable exactly as
   written, with materials the school actually has (law L6 above). *"The whole value prop is that
   the lesson becomes much more easily executable."*
3. **Canonical sections**: **Warm up · Opening · Explanation · Guided Practice · Independent
   Practice · Exit Ticket.** ("Hook" and "How It Works" are dead.) Numbered so the order is obvious.
4. **Warm-up = structured recall of the PREVIOUS lesson** — `{recallOf, teacherAsks, expectedAnswer,
   nextLine}`; Day 1 falls back to general prior knowledge. **NEVER quote content not yet taught.**
   Distinguish teacher-says from expected-student-answer visually.
5. **Opening = the teacher's own launch script** priming curiosity about THIS SLO — a mystery, a
   jumbled-order challenge (with the right answer given to her). Never two characters chatting, never
   a book retelling, never a pre-announced answer.
6. **Board box holds ONLY literal board writing** (noun-phrases, facts, glosses — no procedural
   sentences). The teacher instruction sits **ABOVE** the box, outside it. Large airy type. **Never
   the answers to Independent Practice** (that defeats the purpose). **Never layout words in any
   language** — دائیں حصہ is a leaked directive.
7. **Explanation teaches the likely MISCONCEPTION** (`{slip, fix}`) — read the corpus, name the slip
   and *why* it happens. The **worked example must DIFFER** from the example just taught in the
   steps. No unexplained connective leaps.
8. **Guided Practice = a modelling STRATEGY**, not the book exercise plus its answer: the questions
   she asks, where they look, how they check. Partner work carries a **teacher role** — rotate the
   class, what to listen for, a script for coaxing shy students into talking.
9. **Independent Practice**: every item **book-anchored with exact sub-parts** ("p.15 Q1 (a, b, d)")
   or marked `board` **with the diagram she draws**. **Separate GP and IP time pills.** Behind/ahead
   cards labelled **FOR STUDENTS WHO ARE BEHIND / AHEAD** with a coach line each, and the *same*
   labels in the answer footnote. Answers appear ONLY in the footnote, visually marked as answers.
   Hard generative questions get scaffolding guidance.
10. **Exit Ticket = 3 SLO-grounded options**, varied in form AND angle (not one question rephrased),
    each with an L1/Roman-L1 line, **1–2-minute run logistics** (which object? draw it? one student
    or all?), and the exact board diagram if a drawing is needed. **Numeral pills, never letters** —
    and spell that out over several explicit lines in the render prompt: a one-line aside loses to
    the model's letter-badge prior. Letter-order notation (ب←الف←ج) only if the items were actually
    lettered earlier in the lesson.
11. **Homework** = 1–3 checkbox lines of specific **unused** book exercises.
12. **Coaching corner is a compact strip** — reflection + record→send→same-day-reply.
13. **Word problems are MATHS-ONLY.** Target-language lessons get target-language SLOs **and nav
    labels**; use the modern classroom word (whiteboard, not blackboard/تختہ); simple words with the
    hard word's translation in brackets. **NEVER illustrate the Prophet ﷺ or any revered religious
    figure** — a QA hard-fail, regardless of LP type.
14. **No self-defeating overlaps**: the board never states an item's answer; homework never reuses
    GP/IP/exit exercises; the hook never pre-announces target values; every exit option produces at
    most ONE thing per child.

### Deterministic repairs — never trust the model where code can check

- **`reconcileDiagram(sketch, answer)`** — move a tick-ladder's marker to the tick equal to the
  item's answer; drop the diagram if the answer value is absent. Kills the
  diagram-contradicts-the-answer class outright.
- **`tidyLadder`** — dedupe repeated tick values, marker onto the surface row (models reliably
  duplicate a tick and misplace the marker).
- **`fit()`** — truncate at a **sentence boundary**, never mid-clause, never leaving a dangling
  connective. Prefer the corpus string when it fits whole; the authored condensation when it doesn't.
- **`selfAnswering()`** — reject any practice item whose answer already appears in its own wording,
  including the numeric case. *A rule in a prompt is a hope; a rule in code is a guarantee.*
- **Render-failure retry ×3, then REFUSE to assemble an incomplete PDF.** A failed render that hits
  `continue` produces a 3-page PDF that looks finished.
- **`composite_logo.py`** — top-anchored header-bar scan, clamped mark size, tight repaint.
- Keep the model's output as `*.raw.png` and composite onto a copy, so brand placement can be
  re-tuned without paying to re-render.

#### DERIVE, don't repair — the ICT v6 lesson (2026-08-13)

The four rules above all *repair* what a model wrote. Repair has a ceiling, and we found it.

- **A picture that is a pure function of the data must be GENERATED, not requested.** `3,482 + 1,976`
  has exactly one correct place-value picture. Asking a language model to hand-write ~34 bracket
  tokens across 8 rows, twice, per problem is clerical arithmetic in a notation where one dropped row
  is a disqualifier — and it gets *most* right, which is worse than getting all wrong, because the
  failures scatter. `placeValueDiagram(n)` splits the numeral and emits one row per non-zero place.
  Measured: rows whose drawn count disagreed with their own label went **4 → 0** across 39 lessons.
- **A repair pass cannot fix an ABSENCE.** Padding a row that says 2 and draws 1 is easy. A row that
  was never written cannot be padded, and "1,645 drawn with no ones row" was the commonest survivor
  of the repair-only approach. This is the argument for derivation in one sentence.
- **Truncate a token grammar on a ROW boundary, never mid-token.** A blunt `.slice(0, N)` on a
  diagram cut `6 ones: [counter][counter]cou` — the page printed "6 ones" beside **two** counters.
  It reads as a miscount; it is a severed string. *Our own truncation was manufacturing the defect
  the round existed to remove.*
- **But row-dropping is only safe once the picture is DERIVED.** Fixing the mid-token cut by dropping
  whole rows removed the ones-place row from `3,482+1,976` — a new defect caused by the fix. The
  disqualifier count went **UP** (11→14) before it came down.
- **Regroup anything ≥10; a place never holds ten or more.** `62` as 62 counters is unrepresentable
  *and* wrong for a place-value page (it is six bundles and two loose). `"16 tens"` is a quantity
  mislabelled with a place word — drawing 16 ten-bundles prints 160 where the lesson means 16.
- **Strip page/item references before reading quantities out of a prompt.** `"p.37 Q2: 20 = _ + _"`
  produced a full 3-tens-7-ones block **for the page number**.
- **Never derive a picture from the ANSWER field** — it prints the answer on the board.
- **All operands or none.** A partial derivation drew `8,245` when the row was about the addend
  `143`: a correct picture of the wrong thing, which is harder for a reviewer to catch than an
  obviously broken row.

#### A deterministic repair must live INSIDE the generator

`lint_arithmetic.py --fix` repaired 4 wrong answers correctly and they were **gone an hour later**,
because the next render re-ran the transform and rebuilt the slide script from enrichment.

> **A post-hoc fix to a generated artifact cannot survive its generator.** Put the repair in the
> transform, where it runs on every build.

And the companion warning, learned by nearly shipping it: the first version of that repair matched
only the last two operands, so `4 + 1 + 1 = 6` became `= 2` — it turned **4 real errors into 14** by
corrupting correct sums, and corrupted sums look plausible. **After any auto-fixer runs, re-run the
DETECTOR over the whole corpus.** A fixer that reduces its own finding count can still be corrupting
things the detector counts differently. Unit tests must include the shape you did *not* design for.

### THE RENDER PROMPT — how to make an image model draw the right quantity

Measured over 31 controlled renders of one page across 9 arms (ICT MATH-Q1, 2026-08-12).

- **State the number; never name the quantity in prose.** The production prompt dictated the page's
  text exactly and then said, of the picture, only *"read a picture with 2 tens and 4 ones."* It drew
  26. Control **2/3** correct → every arm that states the number explicitly **13/13**, at +148 chars.
- **⭐ A PROHIBITION IS NOT A CONTROL SURFACE FOR THIS MODEL. AN ASSIGNMENT IS.** Told "add no second
  counting picture" it added one anyway (**0/4**, then 2/4 on a stronger wording). Told "do not print
  the column names" it printed them as visible headings in **3 of 8** renders. Both defects vanished
  when every region of the card was **given a content** ("picture left, working centre, sentence
  right") and no label-shaped token existed in the prompt to leak onto the page.
  **Write prompt rules as "here is what occupies this space", never "do not put X here."**
- **Make the model check itself in the same breath:** *"COUNT WHAT YOU HAVE DRAWN BEFORE YOU FINISH:
  if the totals do not match the working printed beside them, the page teaches a false number."*
- **Sub-group above four.** Nobody verifies seven identical dots at a glance; four-and-three
  subitises. `EXACTLY seven sticks drawn as a group of four ▮▮▮▮ and a group of three ▮▮▮`.
- **A prompt-length cap deletes pages SILENTLY.** 8 lessons shipped missing their practice page and
  nothing said so. If a cap exists, build a **shrink ladder** of progressively shorter variants of
  the *rules* — and never compact the block that stops the page printing a wrong number.

### ⛔ RULES MUST LIVE WHERE THE TEXT IS FINALLY WRITTEN

The single most expensive lesson of the ICT run, and it generalises to every region.

The slide-script transform **re-authors** the content. Any rule stated only in the enrichment brief is
destroyed at that boundary. Proven on Urdu aeraab: enrichment pointed **97 of 104** strings correctly;
the slide script came back **90 of 113 UN**pointed — and the strings were *different sentences*, not
truncations. Moving the rule to slide altitude (with a must-point / may-stay-unpointed scope table)
took the disqualifier from **10 lessons to 1** and Urdu pedagogy **74.7 → 84.9**. The
worked-example-must-differ rule had failed the same way.

**Before trusting any upstream rule, grep the artifact the teacher actually gets.**

### The judge gate (G6) and how to keep it trustworthy

Author with one model, **judge with another, before any image spend**. Bar: **score ≥78 AND zero
blocking**, ≤2 feedback loops, then hand-triage. Two things keep it honest:

- **Carry a CALIBRATION list of false positives the judge must NOT report** — spoken lines legitimately
  address children · diagram fields are RENDER SPECS (the marker is not printed) · behind/ahead keys
  render as full teacher-facing headings · third-person descriptions of what children do are teacher
  instructions · maths word problems need no book source · the deterministic marker-fix runs after
  authoring. **Extend this list rather than raising the bar.** A bar of 85 never converges — the judge
  finds fresh "majors" on every re-roll; on a script read line by line, 3 of its 4 majors were
  nitpicks.
- **Convergence must feed ACCUMULATED findings, not the last report only** — feeding only the latest
  report oscillates (proven).

### Revision (990) — three parallel mini-lessons

The whole lesson is **three panels side by side: Beginner / Intermediate / Advanced**, each with its
own board work, explanation, guided and independent practice, and exit ticket. A "today at a glance"
note tells the teacher she will divide the class into three groups and teach one group at a time,
~12–15 minutes each. Content: collect the chapter's SLOs → beginners get **prerequisite lead-up**
concepts (out-of-book simpler examples allowed), intermediate gets the chapter **re-explained more
simply**, advanced gets at/above grade. Rendered as a portrait "glance" page + **three landscape 4:3
pages** (explain / practice / exit). Large type; **more than 4–6 pages is fine**. May require
re-enriching revision segments — three-level content is not in a standard enrichment.

### Assessment (995) — a student WORKSHEET plus a separate ANSWER KEY

Not a 4-page LP. A chapter-wide, **student-facing** worksheet: 8–12 questions with variety
(mcq/fill/match/short/draw/compute/word), **per-question mark badges**, a sensible total, real space
to write, illustrations/manipulatives where apt, childText-vs-directive separation, ASCII counts,
groups ≤4. Render **body-only with the top ~12% blank**, then composite the header deterministically
(logo + grade + marks + name/date row). **Separate artefact:** `<stem>_ANSWER_KEY.pdf` — per-question
answer, marking guidance, and **common errors**, HTML→PDF so the text is crisp. Grammar and binding
rules live in [`pedagogical-worksheet-imagegen`.

**⛔ THE ROUTING LIVES IN THE ENGINE, NEVER IN A WRAPPER (caught TWICE, 2026-08-16).** The
995→worksheet branch first lived only in a batch shell script (`is_worksheet()` in `batch_v3.sh`);
v5 and v6 rendered through a different driver and every 995 silently fell back to the 4-page colour
LP — the wrapper's own comment records the first catch, and it recurred anyway. A defect fixed in
the wrapper is a defect scheduled to recur. Now `generate.js` itself refuses
`skillType==='assessment'` before any paid call (`assertNotAssessment`, `pageSetFor`; loud error
naming D-010 + `worksheet.js`; `FORCE_LP=1` is the deliberate escape hatch), and
`skillType==='revision'` without `wrap.revisionPanels` is equally loud — the silent fallback WAS the
defect. Corollary for counts: the corpus declares revision as THREE skill types (`revision`,
`duhrai`, `review_assess`) — guard the vocabulary, not the English word.

### Prompt ONE PAGE per image call, never one section

A printed page is one image. Rendering half-page sections and stacking them costs ~2× the image spend
and puts two header bars, two logos and two dividers on every sheet. One header per page; thin rules
between sections.

Two rules that only bite at page scale:
- **Reserve the logo, don't generate it.** An image model reconstructs a mark; it does not paste one.
  Ask for a flat, empty corner — **explicitly forbidding a box, frame, outline, tint or divider
  there**, because the model will otherwise draw a placeholder — then composite the transparent asset
  afterwards. Detect the header band by scanning row luminance with a threshold just under white (a
  mid-grey threshold reads the bar's own white title text as the end of the bar).
- **Keep the raw render**, so brand placement can be re-tuned without re-rendering the lesson.

**Type size is a layout constraint, not a finish.** Teachers open these as PDFs on a phone. Set a
floor (~2.2% of page height for body text) and state that if a section won't fit, **the card grows
and the illustration shrinks — never the words.**

**Teacher dialogue is code-switched**, because that is how the classroom sounds: L1 carrying the
instruction, the medium-of-instruction keeping the technical words. Pakistani Roman Urdu spells **r
not d** (parho, not padho), and verbs carry **both genders** (`dekhta/dekhti hoon`) so one plan
serves any teacher. **Separate "contains the target script" from "is taught in the target script"** —
a Grade 2 *Maths* lesson with Urdu glosses needs Nastaliq *rendering* rules but must still be
authored in English. Conflating the two authored an entire English-medium maths lesson in Urdu.

---

### Rendering mathematical quantities — the consolidated playbook

Image models get maths wrong in specific, repeatable ways, and an earlier run has already paid for every
lesson below. The consolidated rules — knowledge hardened over many worksheet rounds — follow.
**Read them before prompting any maths visual.**

**The two counter-intuitive ones, which is why they keep being rediscovered:**

1. **Diffusion cannot count past about four.** Never ask for one group of seven. Ask for a group of
   four and a group of three, each spelled out in ASCII. This is why counts kept coming back wrong
   even after ASCII art was adopted.
2. **An exact grid must be rendered EMPTY.** Place-value tables and number lines get frame, labels
   and blank cells — the child fills them. Asking the model to POPULATE an exact-count grid is the
   failure mode behind every "the level is on the wrong tick" defect. **Where a populated scale is
   genuinely the content, composite an SVG — do not prompt for it.**

**The rest, each traceable to a shipped defect:**

| Rule | The failure it prevents |
|---|---|
| ASCII-spec every count — write the glyphs (`●●●`), never just the number | The single highest-leverage fix; "3+2" drew ten bananas |
| One counting shape, one phrase, reused everywhere | Mixed triangles/squares/circles in one board |
| Assert picture = equation explicitly | "3+2=5" drawn as six |
| Manipulatives identical every time — a ten is always the same bar, a one always the same dot | Place-value bars drifting between slides |
| **Diagrams carrying numbers are a TICK LADDER, not prose** — one line per tick, distinct evenly-spaced values, the answer's line flagged, fill below it | A "400 ml tick" described in words lands wherever the model feels like putting it |
| Every tick labelled, evenly spaced; a marked level sits exactly on its tick | Number line split unequally; 85,000 labelled where 83,000 was drawn |
| Name the object exactly; extend ASCII to the ARRANGEMENT, not just the count | Prompt said "caps", image drew toffees; grid layout wrong |
| Answer spaces stay empty — never pre-fill, pre-circle or pre-cross-out | Doing the child's work for them |
| Answer key must match what was actually drawn | Nine strawberries drawn, key said otherwise |
| "EXACTLY N panels. Do not add an N+1th." | The model invented a fourth panel and duplicated one |
| A negative suffix on every prompt, listing what has actually gone wrong | Cheap, and catches regressions the positive instructions miss |
| Title Case headings ≤4 words; never long ALL-CAPS | Glyph glitches in caps runs |
| Every word verbatim in the prompt — never let the model invent a label or translation | Urdu rendered as Hindi when left to interpretation |
| **Practice items come from the textbook's numbered exercises, never from activity steps** | "pour water to 100 ml, then label the line" → answer "100 ml": the answer printed in the question |

**COUNTING-QUESTION INTEGRITY (Grades 1–3) — applies to every stem, not just the exit ticket.**
The stem must not state the quantity it asks the child to find. *"There are 3 balloons, write the
number"* is transcription; *"How many balloons?"* is the question. Self-check on each stem: **delete
the image — can the answer still be derived from the words?** If yes, rewrite. This covers the CFU,
the worked-example stem, the We-Do check, every practice item, the word problem and the exit ticket.
Grounding: Gelman & Gallistel's cardinality principle; a national curriculum requiring counting *and*
numeral identification, where a leaked stem tests only the second; Bloom L1 instead of L2/L3; Walsh &
Sattes' "pseudo-question"; Hattie's "telegraphing the answer". **Enforce it in code as well as
prompt.**
⚠️ **But the ban is on read-offs whose value the stem already supplies.** *"Which beaker matches 300
mL?"* and *"Mark the water level at 300 mL"* legitimately name their target — the child still has to
find or produce it. Over-applying the rule dropped 2 of 3 correct practice items. And a guard with a
`length < 2` early-out can never catch the canonical single-digit case ("There are 3 balloons. How
many balloons?"). Unit-test the guard.

**Modeling principles, ported from the voice-note rounds** — they are about voice notes but they
govern any artefact a teacher works from:
- **Model, don't name.** If the plan tells the teacher to model something, the plan must itself show
  it — every step, with the actual numbers. Naming it means she will only name it.
- **Assume nothing.** If a visual is mentioned, every element of it is described. Teachers range from
  highly trained to first-year novices.
- **No partial modelling.** Whatever you *mention*, you model. "Here's how to do A (fully worked),
  B and C" is a bug — either work all three or don't mention B and C. Practically: model 3–4
  instances and **signal** the rest ("and so on for the others") rather than naming them unworked.
- **Never contradict your own rule.** A page teaching "always write the unit" must write the unit
  everywhere on itself.
- **Modeling beats brevity.** When a length cap fights the demonstration, cut narration — never the
  demonstration.

### LOOK at every page before a human does — this is not optional (G8)

Image models are non-deterministic: **a clean prompt does not give a clean page.** Every defect that
reached the operator across three rounds was plainly visible in the render; they got through because
nothing was systematically looking. **Render → vision-check each page against a rubric → re-render
what fails, capped at 2 retries** — past that the defect is in the prompt, and another roll of the
dice won't fix it, so **say so out loud instead of shipping.**

The rubric must be biased toward failing. Check at minimum: **foreign content from another lesson**
(the worst class), overlapping text, leaked layout instructions, truncation, exactly one
correctly-placed logo, one header bar, phone legibility, no empty panels, **no illustration of a
revered religious figure** (CRITICAL), **the diagram agrees with the text**, no hand or object
occluding a word, no duplicated visual, header colours locked — plus per-page pedagogical checks
(does every practice item require work? is the marked level on the right tick? are both dialogue
registers present?).

**Reference images are the highest-risk input in the pipeline.** A "character seed" lifted from a
textbook page failed silently: it returned a near-copy of a *fractions* page, and passing it as
`image_input` bled that chapter's title and sentences across a *capacity* lesson. **Gate every
reference image before use** (an isolated figure on a white ground, no text), **default the feature
OFF**, and tell the model that references define APPEARANCE ONLY. A generic-looking child is a far
cheaper failure than wrong curriculum content on a teacher-facing page.

### The 2026-08-16 laws — column sums, per-number assays, and the two boundary leaks

Four operator-caught defects on v6, each a lesson the pipeline had already half-learned. All four
fixes are code + red-first tests in the renderer's test suite (`tests/column_sum`, `worked_assay`,
`board_and_column`, `abstract_contract`, `assessment_routing` — 17 files green).

**1 · A COLUMN SUM IS DERIVED, CELL FOR CELL — never described by rules.** v6's
`grade_5_math_ch2_seg7` card carried five prose rules about strikes and borrows and a degenerate
sketch (`1 ten: [loose counter]`); the model scrambled 765,432 − 345,678. The operator ran the same
sum through NB Pro web WITH the table drawn out and got a clean page — the model can do it when
every column is assigned. `src/column_sum.js` computes the whole table from the operands (borrow
cascades, carries, struck digits, small working values), emits an aligned ASCII sketch + a
per-column English assignment ("TTh: original 6 struck once, its working value 5 written small
directly above…"), and it is wired BOTH at transform time (the stored `worked.diagram`, so the
judge sees it) and at render time in `workBlock` (so every script already on disk benefits). This
is the "assignment, not prohibition" law extended from counting pictures to column arithmetic:
**anything with exactly one correct picture that is a pure function of the numbers must be drawn
by code.**

**2 · THE QUANTITY ASSAY IS PER NUMBER, per sum, per diagram (operator's words).** The old
`workedPictureSpec` keyed quantities BY NOUN, so a comparison ("45 = 4 tens 5 ones" / "54 = 5 tens
4 ones") collapsed into "EXACTLY 4 tens then EXACTLY 4 ones" — a picture of NEITHER number,
contradicting the correct DIAGRAM block on the same card. Two specs that disagree → the model
draws a third thing. Now: one complete assay per numeral, labelled by the numeral, counts computed
from its DIGITS, **a distinct glyph per place value** (▬ ten, ● one, ■ hundred — same mark = same
object), comparisons ordered drawn in identical style, and **an unparseable multi-number bag emits
NOTHING** — a wrong assay is worse than none. A big column sum gets no counting assay at all: the
derived table owns that card.

**3 · THE CHAPTER MANIPULATIVE ELECTION MUST BE PHASE-GATED.** `chapterContract()` elects one
manipulative per CHAPTER and its instruction says "THIS OVERRIDES do-not-change-the-lesson" — so a
chapter whose G1-style pages vote *loose counters* ORDERED counters onto its abstract lessons.
Measured: 22 of 39 rendered v6 maths lessons had counters in the slide script and ZERO in the
enrichment (10 declared `cpa_phase: abstract`); 0 cases in the reverse direction — the injector was
the instruction, not the enrichment. `contractInstruction(contract, cpaPhase)` now gives abstract
lessons the ABSTRACT assignment (written digits on the place-value grid, all manipulative families
banned) and the election still binds concrete/pictorial lessons. The general law: **an election
made at one granularity (chapter) must be gated at the granularity it is applied to (lesson).**

**4 · A GRID IN THE ENRICHMENT PASSES THROUGH VERBATIM.** seg7's enrichment carried the exact
`HTh | TTh | Th | H | T | O` board grid with digit rows and bilingual vocab pairs
("TOP = minuend / مطروح عدد") — and the authoring model's 6-line board re-write destroyed both.
`preserveBoardGrid()` detects a grid (≥2 lines with ≥2 pipes) and passes the enrichment through
untouched. Same law as DERIVE-don't-repair, seen from the other side: **content the enrichment
already states exactly is DERIVED CONTENT — the re-authoring boundary destroys whatever only code
does not carry across.** (Also the answer to "why is minuend/subtrahend on the board": it is
printed on the book's own p.29 with red-arrow labels; the fix was preserving its Urdu glosses, not
removing the vocabulary.)

**Enrichment-gate context for D0 ():** the corpus's failure distributes by BRIEF VERSION,
not subject — pre-v4 arm 69.9 scope-pct / 100% DQ / 93% instance-reuse; v4 arm 83.5 / 33% / 0%.
So instance reuse (D5/D6/D7) is an ENRICHMENT defect the v4 brief already fixes — do not chase it
in D0 — while invented manipulatives were a D0/transform defect no re-enrichment could touch.
**Before blaming either stage, run the chain of custody: page truth → enrichment → slide script →
prompt, quoting each hop.** Both of this round's "enrichment problems" turned out to be one
transform injector and one page-faithful vocabulary choice.

---

## ⛔ THE STAGE BOUNDARY — ENRICHMENT (C) vs PROMPT-WRITING (D0)

> Added 2026-08-16 on the operator's instruction: *"Enrichment vs prompt-writing are
> DISTINCT stages — keep the skill explicit about the boundary."* Two Round-10 items were filed
> against the wrong stage before this was written down, and each cost a re-enrichment that could
> not have fixed anything.

**They are different jobs with different inputs, different failure modes and different fixes.**

| | **Stage C — ENRICHMENT** | **Stage D0 — PROMPT-WRITING** |
|---|---|---|
| Input | page truth + the segment's SLO/skill_type + the research ELEMENTS | the enriched segment + segmentation meta |
| Output | **the lesson body** — the executable plan, every book exercise SOLVED, in the target language | **the slide script + the render prompts** — poster-altitude fields, deterministic derives, per-page drawing assignments |
| Owns | *what is taught*: content, faithfulness, the book's own numbers and page refs, pedagogical sequence, Urdu aeraab, solved exercises | *how it is presented*: budgets, phase-splitting, derived tables and assays, notation election, page layout, what the image model draws |
| Fixed by | a BRIEF change + re-enrichment of the affected segments | a code change in `transform.js` / `prompts.js` + a re-author (no re-enrichment) |
| Cost of getting it wrong | a corpus-wide re-run | one cheap cached call per lesson |

**THE ROUTING TEST, run before you file a defect anywhere:** open the chain of custody — page truth
→ enrichment JSON → slide script → render prompt — and quote the field at each hop. The stage where
the content **first** goes wrong owns the defect. If the enrichment is right and the slide script is
wrong, no re-enrichment can help; if the enrichment is already wrong, no prompt rule can help.

Worked examples from Round 10, both of which were filed as "enrichment problems":

- **R10-18(c), the syllable + Urdu gloss.** The enrichment carries `keyWords[].syllables`
  (`"sub-tract"`) beside `urdu_gloss` on every term, correctly, corpus-wide. `assemble()` mapped
  `{term, urdu, def}` and dropped `syllables` on the floor. **A D0 defect** — a one-line derive, no
  re-enrichment.
- **R10-32, `minuend`.** The word IS printed on the book's p.29, so the enrichment is page-faithful
  and R9.4 closed it on that basis. But the artifact is a TEACHER'S POSTER, not the textbook, and
  the grade cannot carry the term. **A D0 defect** — the grade-banded allowlist assertion, at the
  layer that writes the printed string.

**The corollary that keeps the boundary honest (and the reason instance-reuse is NOT a D0 job):**
the corpus's pedagogy failures distribute by BRIEF VERSION, not by subject. Instance reuse
(D5/D6/D7) is a Stage-C defect the v4 brief already fixes; invented manipulatives were a D0 defect
no re-enrichment could touch. Same corpus, same round, opposite stages.

---

## THE ROUND-10 LAWS — P1–P10, and where each one is enforced

> The operator's final review before mass production (2026-08-16, FEEDBACK_LEDGER §Round 10, 43
> items). These stack on Round 4's L1–L10 and do not replace them. **Each landed as a named
> assertion or a derive, not only as a prompt line** — Round 5b §0 fix 4, and the reason it is
> stated that hard is `minuend`: it survived FOUR rounds (R6-33 → R9.4 → R10-11 → R10-32) as a
> prompt line with no assertion behind it.

**The layering rule this round enforced everywhere: a DERIVE beats a VALIDATOR beats a PROMPT RULE.**
Put each law at the lowest layer that can hold it, and only what genuinely needs judgement stays in
the prompt.

| Law | What it says | Where it lives now |
|---|---|---|
| **P1** openings | Connect the SLO to an Islamabad child's life; a strong *why*; inquisitive; a real teacher-child CONVERSATION **with the expected answers** | prompt rule 8 + schema `hookConversation[]{teacherAsks,listenFor}` + the OPENING card renders it in the warm-up's ask/listen pattern |
| **P2** one notation | ONE quantity notation per lesson across ALL pages incl. boardwork: ■ hundred ▬ ten ● one, tens in ONE column, a ten is a solid bar never dots | `QUANTITY_NOTATION`, one frozen block embedded verbatim in all four page prompts — a lesson physically cannot carry two |
| **P3** sign placement | The operation sign owns its own dedicated cell, outside every place column, all four operations | derive: `column_sum.js` — the sign cell on the ascii, the board sketch, the blank grid and the drawing spec |
| **P4** solved through | The explanation walks to the ANSWER with teacher dialogue, in as many steps as the logic needs | prompt rule 4b + the 3-step cap lifted to 5 + validator `V10-P4` (a column sum whose printed answer is missing or wrong) |
| **P5** the CFU teaches the slip | What she ASKS · what shows they learnt it · the slip, why it happens, the remedy | derive `iDo.cfuPassSignal` from the corpus `cfu.pass_signal` + schema `misconception.why` + validator `V10-P5` (a CFU that is not a question, a missing pass signal, a slip with no remedy) + the 3-part CFU card |
| **P6** vocabulary | The book's own SIMPLE terms; syllables + Urdu gloss whenever a term is introduced | `src/vocabulary.js` — grade-banded ban, **CRITICAL** `V10-P6` (fails ingest in every mode) + `vocabularyRule(grade)` in the prompt + `keyWords[].syllables` carried through assemble |
| **P7** boardwork | Whatever she must draw is drawn IN the prompt — tables, manipulatives, exit-ticket diagrams | derive `deriveBoardGrids()` (a board line that parses as a column sum gets the blank grid) + validator `V10-P7` (an exit option about a picture with no diagram) + the board card's copy-exactly assignment |
| **P8** SLO integrity | TODAY is a complete sentence; the full SLO beneath it | derive `sentenceFit()` (sentence/clause-boundary fit, never an ellipsis) + `script.sloFull` + validator `V10-P8` |
| **P9** valid sums | `a − b` needs `a ≥ b`; a "with regrouping" label must be true; homework = unattempted book exercises with Q + page | derived label in `columnSumAscii` (`needsRegrouping`) + **CRITICAL** `V10-P9` (impossible sum, literal and in prose; a false regrouping label) + `V10-P9h` (homework/practice with no or an out-of-range page ref) |
| **P10** science | Complete resources; runnable in a government school; model anything the SLO puts in practice; strict symbolic logic; real photos where apt; one correct answer per option | `SCIENCE_BLOCK` (six rules incl. the SPREAD-AND-BARRIER GRID recipe, beans banned) + validator `V10-P10` (resources completeness) + `V10-P10x` (multi-correct exit option) + real-photo style line on science pages only |

**Severity is the gate, and the line moved this round.** An audit finding that means the artifact is
WEAK stays `major` (rejects only under `INGEST_STRICT=1`). A finding that means the page teaches
something FALSE — a banned formal term, an impossible sum, a mislabelled regrouping, a wrong printed
answer — is `critical` and rejects in EVERY mode. Four rounds of `minuend` surviving as a warning is
the whole argument.

**Two smaller laws from the same round, worth keeping:**

- **The band labels of a derived table must not be WORDS** (R10-37). `small`/`top`/`bottom` sat in
  cell 0 of each row and the model printed them into the rendered sum — correctly, from its point of
  view: it was told to copy the table cell for cell, and those cells held words. They are glyphs now
  (`⌃ ▲ ▼ ═`), with the meaning moved to a footnote, which is prose the prompt never asks to be
  copied. **General form: any label you do not want printed must not be word-shaped.**
- **A label is a claim about the thing beside it** (R10-18). The opening's scene labels were derived
  from `iDo.worked.problem` regardless of what the hook was about, so a scene about 2,385 − 821 was
  labelled "4,780" and "1,320" — numbers in no part of the lesson. They derive from the hook's OWN
  story now, and **no confident pair means NO labels**: an unlabelled scene is a complete scene, an
  invented label is a lie.
