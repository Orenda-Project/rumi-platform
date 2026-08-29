# Stage C — Enrichment

> Read IN FULL before enriching a single lesson. Gates G4/G5/G5b/G5c.

## Contents

- Stage C — Enrichment (the executable lesson body)
- The zero-tolerance content rules
- 📚 The EVIDENCE-BASED ELEMENTS — what enrichment must ADD that the textbook omits
- ⛔ BENCHMARK BEFORE ENRICHMENT (gate G4)
- Model trial before the big batch — and its findings
- Stage C at scale — the PRODUCTION PLAYBOOK

---

## Stage C — Enrichment (the executable lesson body)

Per segment, transform its page-truth into the `generated` lesson body — **grounded ONLY in the
page-truth, no invented content**, every exercise SOLVED, in the target language with its register
rules. **Enrichment writes words, not images.**

**Envelope:** `segment_id, topic, skill_type, lp_type, grade, subject, pages(printed), chapter_title,
chapter_number, day_num, total_days, cpa_phase, slo_refs[], bloom, duration_min, materials[],
cross_refs, author, enriched_at`.
**`generated`:** `warmUp` (spirals to the PREV lesson) · `hookStory` · `hookCharacters[]{name, role,
position, speechBubble}` · `keyWords[]` · `boardWork{instruction, content[]}` · `steps[]` (with
`cfu` objects) · `teacherSays` · `keyFact` · `cfuExplain` · `workedExample` · `partnerActivity
{instruction, dialogueFrameA, dialogueFrameB}` · `circulateInstruction` · `modelAnswer` ·
`cfuPractice` · `problems[]{prompt, status, solution}` · `weakLearnerSupport` · `challengeExtension`
· `exitTicket{}` · `homework` · `coachingReflection` · `nextTopicPreview` · `subject_elements{}`.
Maths-only: `wordProblem`, `manipulatives[]`. English/Urdu: `contextualApplication`,
`bilingualPattern`, `diacriticsRequired`, `scriptOnly`.

### The zero-tolerance content rules
- **No placeholders ever** (`/___/`, "Option A", "fill in with students"). Every field is executable.
- **Solve every referenced exercise** — the agent works out the answer key itself. Never leave
  answers for the teacher to compute live (that's the failure mode Rumi exists to prevent).
- **One LP = one skill type** — deeply model the segment's skill; reference other exercises as
  answer keys / bonus.
- **Pictures ARE source material.**
- **boardWork / partnerActivity / hookCharacters specify exact content** (names, positions, verbatim
  dialogue in both languages where bilingual).
- **`problems[]` items carry `status: solved | open-personal`.** Solved items give `solution`;
  genuinely answer-less personal-response frames ("circle what YOU understand") give a
  `model_solution` exemplar — so "null because personal" is never misread as a failed-to-solve
  fabrication gap.
- **A silent recurring character is legal.** `hookCharacters` may carry
  `{name, role:"illustrative", position, speechBubble:null}` for a cast member illustrated on the
  lesson's pages who has no line — **never fabricate a bubble** to satisfy the field. Quote from
  `_book.json.characters[]`.
- **An exemplar for an OPEN frame uses ONLY facts stated in the page-truth.** If none exists, model
  with a clearly-generic answer, never a plausible-looking invented fact.
- **Echo `slo_refs[]` + `bloom`** into the enriched envelope so the body can be checked against the
  outcome it serves without opening the segments file.

> **The #1 partner-rejected failure is FABRICATION from no grounding.** A partner's evaluation of
> ungrounded LPs caught invented target-language words, wrong subject terms, the wrong grade-level
> phoneme set, and an imported foreign mnemonic. **Never let an enrichment field contain a fact not
> traceable to the page-truth or syllabus.**

---

### 📚 The EVIDENCE-BASED ELEMENTS — what enrichment must ADD that the textbook omits

**The core finding across all three pedagogy reports: do NOT add lesson TYPES — the taxonomies are
correct. Enrichment must ADD the science-backed ELEMENTS the textbook omits.** The textbook is the
content spine; the method comes from the research. **An enriched lesson is INCOMPLETE if it lacks its
subject's mandatory elements** — and the scoring gate scores for them.

Full reports + citations: [reference/research/INDEX.md](../research/INDEX.md).

> **Read [reference/research/enrichment-elements.md](../research/enrichment-elements.md)
> IN FULL before writing the enrichment brief for a subject.** It carries the mandatory elements
> per subject — English (Science of Reading), Urdu (script-specific twists), Maths (the three
> missing elements), Science (5E + ESL), and the low-resource reality rule — plus the fluency
> targets. The scoring gate scores for them, so a brief written without it produces lessons that
> fail G5 on elements rather than on content.

### ⛔ BENCHMARK BEFORE ENRICHMENT (gate G4)

**Do not enrich a single lesson until the objective scoring gate exists.** At 2,000-lesson scale,
unmeasured quality is drift you discover after the money is spent. The gate is a composite of three
layers:

1. **The team's AI-reviewer rubric, score-only and LOCAL** — the UG_LessonPlan reviewer **rubric v3**
   (9 criteria, 1–4 per sub-criterion, subject-specific criterion 8; 184–188 pts/subject) migrated
   into this skill at [the gate code](../gates/) so scoring never calls an
   external service. **We use it to REVIEW, never to generate.**
2. **The team's Master QA Checklist** — codified as deterministic checks wherever mechanical (fields
   present, page numbers exact, times sum, CFU signal present, every closed exercise solved).
3. **The pedagogical research as scored indicators** — the ELEMENTS above become subject-specific
   rubric extensions.

**Precedence: where the imported rubric clashes with the research, the RESEARCH WINS** — edit the
rubric copy and log every delta in
the gate code (`../gates/`).

**Set gates the frontier model itself can pass.** A hard 95%-composite gate is unachievable
consistently — the scale's 3 = "meets standard", several checks structurally cap at 3, and even Opus
averages ~94.2 at corpus scale. Prompt tightening lifts a mean 87→95 then **plateaus**; revisions
move ±1–2 (noise). **Gate v1.1 (validated):** hard-QA pass **+ no 1-ratings + ≤2 tolerated 2s**
(excluding measured judge-strict checks) **+ composite ≥ the judge's bar.**

### Model trial before the big batch — and its findings

Enrichment is the token-heaviest stage. Before committing the corpus: run the SAME eval set (~12
lessons spanning subject × grade × lp_type) through the incumbent and challenger frontier models,
score blind on the composite gate, and report quality + measured $/lesson + projected corpus $.
**Re-run the trial per market; never assume last market's winner.**

**Measured findings — apply to every future market's trial:**

1. **Prompt-spec completeness beats model tier below the frontier.** Seven explicit spec lines (full
   SLO statement with inline code, student-voice question, both-gender names, concrete real-world
   link, peer-mediated warm-up delivery, 3-part exit ticket, work-the-actual-passage) lifted the
   cheap arm **+7.4 composite points** to parity with Opus at ~9% of the cost. What stays
   model-bound: **craft depth** (live think-alouds in the target script, example richness, contextual
   definitions). **Always A/B the tightened brief on the SAME lessons and judge before concluding a
   cheap model can't do the job.**
2. **OpenAI models content-filter religious-adjacent Urdu curriculum** (reproduced on two GPT tiers,
   same lesson, three times). Route that slice to Claude regardless of cost. Expect an analogous
   filter risk in any market with religious content.
3. **Deterministic QA checks must measure STRUCTURE, never surface strings** — "measure the thing,
   not the word". Three checks false-failed *correct* lessons in one run: (a) a placeholder regex
   failed legitimate student fill-in-blanks (`______` IS pedagogy); (b) a check counted the literal
   word "CFU" while lessons carried proper `steps[].cfu` objects — cost every arm ~4.5 composite
   points; (c) a stage-times check summed BOTH the stated total *and* the per-stage breakdown,
   double-counting to ~80 min and soft-failing nearly a whole pool. **Each punished GOOD authoring
   practice.** If a check fails one arm systematically, **audit the CHECK first** — a false gate
   silently reshapes the model decision. Re-gating from stored outputs is free.
4. **Budget the judge like a generator** — a 50-check rubric review is long: compact ratings-only
   output contract, **≥16k output budget**, save raw on parse-fail. Judge = one pinned model per
   batch, blind to which arm wrote the LP; note same-family bias.
5. **Assessment LPs (995) need ~2× the generation budget** of content lessons.

### Stage C at scale — the PRODUCTION PLAYBOOK

**Pipeline (per lesson):** generate (the tightened brief) → deterministic `qa_checks` (free) → cheap
**screen**-judge → screen-fail ⇒ **confirm**-judge by a stronger model **whose verdict STANDS** →
gate → ONE targeted revision (fed the named deficits, rubric AND mechanical) → escalation ladder →
final status saved with full attempt history. Everything file-per-lesson, resumable, `.score.json`
presence = done.

**Judge protocol (hard-won):**
1. One **pinned** judge per era; every score records `judge`; the gate maps judge→bar. Measured
   biases from one run: `sonnet = opus+1.9 → bar 94` · `luna ≈ opus−0.7 → bar 91.5` · `opus = 92`.
2. **Swapping judges requires FULL-DISTRIBUTION calibration** — per-check rating patterns *and*
   gate-flip rates on real lessons, never just the mean composite delta. One judge matched on
   composite, then rated a particular check 1 on most lessons → a **72% false screen-fail rate**.
3. Models weight rubric check **NAMES** differently — verify names match the edited requirement (a
   check still *named* "One 40-Min Class" failed correct 35-min lessons).
4. **Calibration lenses that must ride every judge prompt:** the `lp_type` lens (990/995 consolidate
   MULTIPLE SLOs *by design*; assessments are worksheet specs), timing ±10% with an unstated 2–5 min
   exit ticket, and "the ONE skill = the declared `skill_type`".
5. **Two-tier judging is cheaper than single-strong-judge** even at high screen-fail rates, because
   passes cost ~$0.002 and a false screen-fail becomes a cheap confirmation instead of an expensive
   revision ladder.

**Ops rules that each cost real money to learn:**
- **Instrument per-call costs (purpose × model × cost, one jsonl line per call) FROM CALL ONE.** Every
  cost mystery became a 2-minute read once instrumented.
- **Never mutate a module global across a ThreadPool** — a global judge-flip raced 40 threads and
  randomly routed judgings to the expensive model.
- **Don't pay inside the runner for work a free post-run sweep will redo.** In-runner paid confirm
  judges + escalations were 79% of cash burn at $0.33/lesson against a $0.17 projection; routing them
  to the $0 sweep cut the remaining bill ~$190 → ~$45.
- **Restarts cost in-flight work** — prefer resumable design and parameter toggles over restart churn.
- **Right-to-left scripts cost 2–4 tokens/word** — budget 32k for generation, 40k for assessments.
- Shell-heredoc patches mangle backslashes/backticks and can silently no-op — verify with grep;
  prefer the Edit tool. "0 files changed" from a rescore is a smell, not a success.
- Route ALL Claude calls through plan-billed subagents where a subscription exists; cash goes only to
  non-Claude models. Design resumable, with an API fallback — plan limits are real.
