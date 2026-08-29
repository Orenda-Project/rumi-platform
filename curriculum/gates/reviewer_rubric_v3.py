"""
Lesson-Plan Reviewer — v3 data-driven rubric.

Source of truth: the team's "LP AI Reviewer" rubric Google Sheet, transcribed VERBATIM —
  • Universal Criteria  (gid=1541111282)  → Criterion 0–7, 44 checks, 176 pts
  • Subject-specific     (gid=651284491)  → Criterion 8, per subject (English 12 / others 16)
  • Multigrade Criteria  (gid=135600248)  → Criterion 9, MG1–MG5, +20 (only for multigrade LPs)

Scale is 1–4 (4 = best). Each check carries a stable ID (0A … 7C, 8A … 8D, MG1 … MG5),
its 1/2/3/4 descriptors, the standard codes it enforces, the context it depends
on (requires_context), and its sheet status.

Both the v3 reviewer prompt (prompts/reviewer_prompt_v3.py) and the DL annotation rubric
catalog (services/rubric_catalog.py, v3 arm) are BUILT from this data, so there is exactly
one source and the prompt + catalog cannot drift. This mirrors the proven EG pattern
(EG_Pipeline/prompts/reviewer_rubric_v2.py).

NAMING CAVEAT: prompts/reviewer_prompt.py is internally titled "RUBRIC V3" (an older prose
rubric, totals 172/184/188). THIS module is the *data-driven* v3 (totals 176/188/192, +20 MG)
selected by config.LP_REVIEWER_RUBRIC=v3. They are different things; the legacy prose stays
as the LP_REVIEWER_RUBRIC=legacy fallback.

tests/test_lp_reviewer_rubric_v3.py pins the counts, exact IDs, totals, and standard refs.
"""

SCALE_MAX = 4  # 1–4 ascending; surfaced to the frontend as review.scale_max

# --------------------------------------------------------------------------- #
# Standard names — authoritative parents from the standard framework
# Master Index (sheet 1W-JhEz…, gid=1857355182). The per-letter sub-codes (P7a,
# P1b, …) are facets of those parents; until the per-standard sub-sheet is pulled
# their tooltip is the parent-family name. Used for standard-chip tooltips.
# Every code referenced by any check below MUST be a key here (pinned by tests).
# --------------------------------------------------------------------------- #
STANDARD_NAMES = {
    "P0": "Teacher Autonomy",
    "P1": "Gradual Release",
    "P1a": "Gradual Release — Modelling / Think-Aloud",
    "P1b": "Gradual Release — Guided / Scaffolded Practice",
    "P1c": "Gradual Release — Independent Practice",
    "P1e": "Phase Coherence",
    "P1f": "CFU Placement",
    "P1g": "Lesson Closure",
    "P1h": "Time Allocation",
    "P2": "Prerequisite Sequencing",
    "P4": "Active Retrieval Practice",
    "P5a": "Standards Alignment — SNC Tagging",
    "P7a": "Assessment Rigour — Single-Focus SLO",
    "P7b": "Assessment Rigour — Objective–Assessment Alignment",
    "P7c": "Assessment Rigour — CFU Rigour by Phase",
    "P7d": "Assessment Rigour — Exit Ticket",
    "DC-P1": "Coaching Feedback Quality",
    # Multigrade family (Criterion 9):
    "P1-MG": "Multigrade — Gradual-Release Rotation",
    "P1b-MG": "Multigrade — Peer Tutoring",
    "P1c-MG": "Multigrade — Non-Facing Independent Task",
    "P1d-MG": "Multigrade — Transition Management",
    "P1h-MG": "Multigrade — Time Equity",
}

# Context tokens a check can depend on. The reviewer is told to score from the LP
# where possible and only mark a check `notAssessable` (excluding it from the
# denominator, never penalising) when the token is absent AND the check genuinely
# cannot be judged from the LP itself. Today the rubric is overwhelmingly self-
# contained — `book_content` is usually supplied and `prior_slo` is normally stated
# in the LP — so exclusions are rare. This is the substrate for the future feedback
# loop (prev-LP / DC-feedback / exam-results → Framework standards P2/P3/P4/X2).
CONTEXT_BOOK = "book_content"   # textbook pages for alignment checks
CONTEXT_PRIOR_SLO = "prior_slo"  # the previous lesson's SLO (for 2L retrieval)

# =========================================================================== #
# CRITERION 0–7 — UNIVERSAL (always applied)
# =========================================================================== #
UNIVERSAL_CRITERIA = [
    {
        "criterion": "Structural Completeness",
        "gate": True,  # evaluated first; any sub scoring 1 = fundamental structural failure
        "checks": [
            {
                "id": "0A",
                "name": "SLO Present & Non-Empty",
                "requirement": "An SLO must exist with a clear action verb and measurable outcome. A placeholder or empty field fails.",
                "descriptors": {
                    1: "No SLO, or placeholder text (e.g. 'SLO will be added').",
                    2: "Present but only partially formed — missing action verb or outcome.",
                    3: "Contains a clear action verb and learning outcome.",
                    4: "Complete, specific, and immediately usable by a teacher without any editing.",
                },
                "standards": ["P7a"],
                "requires_context": [],
                "status": "Original",
            },
            {
                "id": "0B",
                "name": "Hook Present & Non-Empty",
                "requirement": "A Hook section must exist with at least 2 actionable teacher instructions — not a single vague line.",
                "descriptors": {
                    1: "No Hook, or placeholder/empty.",
                    2: "Exists but only a single vague line — no usable instructions.",
                    3: "At least 2 actionable teacher instructions present.",
                    4: "Fully formed, sequenced instructions an unfamiliar teacher could execute directly.",
                },
                "standards": [],
                "requires_context": [],
                "status": "Original",
            },
            {
                "id": "0C",
                "name": "Explanation Present & Non-Empty",
                "requirement": "Explanation must have step-by-step instructions covering the core concept — not sparse filler.",
                "descriptors": {
                    1: "No Explanation, or placeholder/empty.",
                    2: "So sparse (1–2 lines) a teacher could not use it.",
                    3: "Step-by-step instructions covering the core concept.",
                    4: "Comprehensive — definition, demonstration, examples, and CFUs all present.",
                },
                "standards": [],
                "requires_context": [],
                "status": "Original",
            },
            {
                "id": "0D",
                "name": "Practice Present & Non-Empty",
                "requirement": "Practice section must contain at least one concrete student task aligned with the SLO.",
                "descriptors": {
                    1: "No Practice, or placeholder/empty.",
                    2: "Exists but contains no actual tasks or questions.",
                    3: "At least one concrete student task aligned with the SLO.",
                    4: "Fully formed — guided and/or independent tasks with answer keys.",
                },
                "standards": [],
                "requires_context": [],
                "status": "Original",
            },
            {
                "id": "0E",
                "name": "Conclusion Present & Non-Empty",
                "requirement": "Conclusion must include a specific closing activity (e.g. exit ticket, quiz) — not a vague directive.",
                "descriptors": {
                    1: "No Conclusion, or placeholder/empty.",
                    2: "Only a vague directive (e.g. 'Summarize the lesson').",
                    3: "Specific closing activity (e.g. verbal quiz, exit ticket).",
                    4: "Fully formed — activity tied to SLO with actual content (e.g. real quiz questions).",
                },
                "standards": [],
                "requires_context": [],
                "status": "Original",
            },
            {
                "id": "0F",
                "name": "Single-Lesson Scope (One Class Period)",
                "requirement": "LP must be ONE lesson for ONE 40-minute class, targeting ONE SLO. BEFORE scoring, check for unit/chapter-plan red flags — if ANY is present this is a FUNDAMENTAL STRUCTURAL FAILURE (score 1) and you must NOT reward the quality of the sub-lessons inside it: a pacing table or weekly schedule; numbered 'Lesson 1, Lesson 2, …' headers; multiple SLOs (one per lesson) instead of one SLO; a chapter overview or full-chapter materials/assessment; a multi-lesson progress tracker; or a stated duration of multiple hours or 'X lessons × Y minutes'.",
                "descriptors": {
                    1: "Unit/chapter plan packaged as one LP — ANY red flag present: pacing table or weekly schedule, numbered 'Lesson 1, 2, …' headers, multiple SLOs, chapter overview, multi-lesson progress tracker, or duration of multiple hours / 'X lessons × Y min'. FUNDAMENTAL STRUCTURAL FAILURE — do not reward the sub-lessons.",
                    2: "Single lesson but activity load is unrealistic for 40 minutes (5+ distinct activities or multiple unrelated skills).",
                    3: "Single lesson targeting one SLO with realistic activity load for 40 minutes.",
                    4: "Clearly scoped — one SLO, four sections, time allocations that add up to 35–45 minutes.",
                },
                "standards": [],
                "requires_context": [],
                "status": "Original",
            },
        ],
    },
    {
        "criterion": "Curriculum Alignment",
        "checks": [
            {
                "id": "1A",
                "name": "Clear, Specific, Single-Focus SLO + SNC Code",
                "requirement": "SLO must: (1) target ONE primary skill, (2) use an action verb, (3) include or reference the SNC standard code (e.g. SNC 5.2.3). An SLO bundling multiple unrelated skills caps at Score 2.",
                "descriptors": {
                    1: "Vague, broad, or unrelated to topic; no action verb; no SNC code.",
                    2: "Relevant SLO but lacks focus, bundles multiple skills, OR SNC code absent.",
                    3: "Clear, specific, single-focus SLO with action verb. SNC code present.",
                    4: "Precise, student-centred, single-focus SLO matching textbook concept, with correct SNC code linked.",
                },
                "standards": ["P7a", "P5a"],
                "requires_context": [],
                "status": "Enhanced",
            },
            {
                "id": "1B",
                "name": "Measurable SLO",
                "requirement": "The SLO outcome must be observable and measurable — teacher can check if students achieved it.",
                "descriptors": {
                    1: "Cannot be measured; outcome not observable.",
                    2: "Somewhat measurable but lacks clear evidence of performance.",
                    3: "Clearly measurable with observable behaviour or task.",
                    4: "Fully measurable with criteria or performance evidence explicitly linked.",
                },
                "standards": ["P7a"],
                "requires_context": [],
                "status": "Original",
            },
            {
                "id": "1C",
                "name": "Scaffolded Activities",
                "requirement": "Activities must build on one another progressively toward SLO mastery — not be isolated or random.",
                "descriptors": {
                    1: "Activities do not connect or build on one another.",
                    2: "Limited progression; partial link between steps.",
                    3: "Steps progress logically toward SLO mastery.",
                    4: "Each part builds conceptually and skillfully toward SLO mastery.",
                },
                "standards": ["P1b"],
                "requires_context": [],
                "status": "Enhanced",
            },
            {
                "id": "1D",
                "name": "Aligned with Textbook Content",
                "requirement": "Lesson must use the actual textbook content (not just reference it by page number) and align activities to the textbook lesson.",
                "descriptors": {
                    1: "Lesson deviates from or ignores textbook material.",
                    2: "Uses textbook loosely without alignment to SLO.",
                    3: "Mostly aligned with textbook lesson and activity flow.",
                    4: "Fully aligned — textbook content drives every section (Hook, Explanation, Practice, Conclusion).",
                },
                "standards": [],
                "requires_context": [CONTEXT_BOOK],
                "status": "Original",
            },
            {
                "id": "1E",
                "name": "SLO–Assessment Alignment & Phase Coherence",
                "requirement": "Check TWO things: (1) Every assessment task (CFU, exit ticket) directly measures what the SLO requires. (2) ALL phases (Hook, I Do, We Do, You Do, Exit Ticket) target the same SLO — no phase introduces content outside the stated objective. Flag any orphan activity that does not connect back to the SLO.",
                "descriptors": {
                    1: "Assessments have no visible link to SLO. OR one or more phases introduce content clearly outside the stated SLO.",
                    2: "Assessments loosely relate to SLO. OR most phases align but one activity feels disconnected from the objective.",
                    3: "Key assessments clearly measure the SLO. All phases target the same objective — no orphan activities.",
                    4: "Every assessment directly and explicitly measures the SLO. Full phase coherence: Hook builds toward it, I Do models it, We Do practises it, You Do tests it, Exit Ticket confirms it — all pointing to the same objective.",
                },
                "standards": ["P7b", "P1e"],
                "requires_context": [],
                "status": "Enhanced",
            },
            {
                "id": "1F",
                "name": "Bloom's Level Accuracy",
                "requirement": "Three things must agree: (1) Bloom's level stated in SLO, (2) action verb used, (3) cognitive demand of practice tasks and CFUs. Check all three.",
                "descriptors": {
                    1: "Bloom's level stated in SLO is clearly wrong, or missing entirely.",
                    2: "Approximately right but imprecise, OR correctly stated but tasks target a significantly lower level.",
                    3: "Accurately stated and lesson activities broadly align with that cognitive level.",
                    4: "Accurately stated, matching action verb used, and ALL practice tasks + CFUs target that same cognitive level.",
                },
                "standards": ["P7b"],
                "requires_context": [],
                "status": "Original",
            },
        ],
    },
    {
        "criterion": "Instructional Flow",
        "checks": [
            {
                "id": "2A",
                "name": "Opening Hook Relevant to SLO",
                "requirement": "Hook must be engaging AND directly connected to the SLO — not a generic icebreaker or unrelated activity.",
                "descriptors": {
                    1: "Hook absent or irrelevant to SLO.",
                    2: "Weakly connected to topic.",
                    3: "Engaging and related — connects to topic.",
                    4: "Strong, age-appropriate, directly linked to SLO; builds curiosity and context.",
                },
                "standards": [],
                "requires_context": [],
                "status": "Original",
            },
            {
                "id": "2B",
                "name": "Explicit Instructions & Evidence-Based Feedback Language",
                "requirement": "Two things to check: (1) Instructions must say HOW to teach — specific steps, not 'explain X' or 'help students understand Y'. (2) Feedback instructions must be evidence-based and specific — not 'give feedback to students' but actual scripted response to common student errors (e.g. 'If student writes wrong denominator, say: Let's look at this together — what does the denominator represent?').",
                "descriptors": {
                    1: "Instructions entirely generic ('Explain the concept', 'Give feedback'). No specific steps, no scripted feedback language.",
                    2: "Some specific instructions but feedback language is generic. Teacher would need to improvise how to respond to student errors.",
                    3: "Step-by-step teaching instructions present. At least one feedback example is specific and evidence-based — teacher knows exactly what to say when a student makes a common error.",
                    4: "All instructions are specific with action verbs. Feedback language throughout is evidence-based and scripted — teacher can respond to common errors without improvising. Low-skill teacher could execute confidently.",
                },
                "standards": ["DC-P1"],
                "requires_context": [],
                "status": "Enhanced",
            },
            {
                "id": "2C",
                "name": "Modelling / Demonstration with Think-Aloud",
                "requirement": "I-Do must include step-by-step actions WITH reasoning aloud — not just 'explain X'. Look for: (1) each step has an action AND a 'Say:' prompt showing teacher's reasoning, (2) teacher verbalises WHY, not just WHAT. Generic instruction ('demonstrate the concept') scores 1–2.",
                "descriptors": {
                    1: "No modelling. I-Do only says 'explain the concept' or 'teach X' — no steps, no reasoning shown.",
                    2: "Some steps present but no reasoning aloud. Teacher told WHAT to do but not HOW to verbalise cognitive process.",
                    3: "I-Do includes step-by-step actions with reasoning prompts (e.g. 'Step 1: write fraction → Say: this top number tells us...'). Teacher cognitive process is visible.",
                    4: "Full think-aloud narration: every I-Do step has an action AND reasoning script. Teacher models not just the answer but the thinking — students hear the cognitive process, not just the product.",
                },
                "standards": ["P1a"],
                "requires_context": [],
                "status": "Enhanced",
            },
            {
                "id": "2D",
                "name": "Smooth Transitions Across Steps",
                "requirement": "Check logical flow and coherence between sections — NOT explicit bridging sentences. Do NOT suggest adding transition sentences.",
                "descriptors": {
                    1: "Lesson feels disjointed or abrupt.",
                    2: "Some transitions but lack flow.",
                    3: "Logical progression across lesson steps.",
                    4: "Seamless transitions between sections ensuring lesson coherence.",
                },
                "standards": [],
                "requires_context": [],
                "status": "Original",
            },
            {
                "id": "2E",
                "name": "Practice Opportunities for Students",
                "requirement": "Students must have opportunities to practice the skill — not just watch or listen. Look for tasks, questions, activities.",
                "descriptors": {
                    1: "No practice opportunities.",
                    2: "Limited or unstructured practice.",
                    3: "Adequate practice supporting understanding.",
                    4: "Varied, well-sequenced practice (guided & independent) reinforcing SLO mastery.",
                },
                "standards": ["P1c"],
                "requires_context": [],
                "status": "Original",
            },
            {
                "id": "2F",
                "name": "CFU Questions — Placed, Spaced & Open-Ended",
                "requirement": "CFUs must: (1) appear AFTER concept is taught — not before, (2) be present after each phase (I Do, We Do, You Do) — 1-2 questions per phase, (3) be open-ended — not yes/no or single-word answers. Prior-knowledge questions in the Hook are NOT CFUs.",
                "descriptors": {
                    1: "No CFUs anywhere in LP. OR all CFUs appear before the concept has been taught.",
                    2: "CFUs exist but only in one phase, OR questions are all closed (yes/no, fill-in-the-blank) — not diagnostic.",
                    3: "Open-ended CFU questions present after each phase (I Do, We Do, You Do). Questions match the cognitive level of that phase — I Do: recall, We Do: apply, You Do: analyse/create.",
                    4: "Well-distributed open-ended CFUs after every phase — specific enough to reveal exactly who understood and who didn't. Each CFU is diagnostic: it surfaces the specific misconception or gap if a student answers incorrectly.",
                },
                "standards": ["P1f", "P7c"],
                "requires_context": [],
                "status": "Enhanced",
            },
            {
                "id": "2G",
                "name": "Grade-Appropriate Strategies Aligned with SLO",
                "requirement": "Teaching strategies must be suitable for the grade level and directly support the SLO — not generic or mismatched.",
                "descriptors": {
                    1: "Strategies not suitable for grade/SLO.",
                    2: "Some strategies suitable but inconsistent.",
                    3: "Strategies mostly appropriate for grade/SLO.",
                    4: "Fully appropriate, effective, and tailored to SLO and learner level.",
                },
                "standards": [],
                "requires_context": [],
                "status": "Original",
            },
            {
                "id": "2H",
                "name": "Higher-Order Thinking (HOT) Opportunities",
                "requirement": "At least one activity must require students to analyse, reason, apply, or evaluate — not just recall or copy.",
                "descriptors": {
                    1: "All activities focus only on recall (copying, repeating, yes/no).",
                    2: "One activity asks students to apply or reason, but most remain recall-based.",
                    3: "At least one activity requires students to analyse, reason, give opinions, or apply knowledge to a new situation.",
                    4: "Multiple well-placed HOT activities engaging students in application, analysis, evaluation, or creation.",
                },
                "standards": [],
                "requires_context": [],
                "status": "Original",
            },
            {
                "id": "2I",
                "name": "Visual Aid Effectiveness",
                "requirement": "Images/visuals must support instruction at the right moment — not decorative. If topic does not require visuals, score 3.",
                "descriptors": {
                    1: "No images where visuals would clearly help, OR images present but irrelevant/decorative.",
                    2: "Images present but only partially useful — loosely related to topic.",
                    3: "Images present where helpful and prompts describe visuals that concretely support instruction.",
                    4: "Well-chosen images at the right instructional moment; prompts precise enough to serve as a direct teaching aid.",
                },
                "standards": [],
                "requires_context": [],
                "status": "Original",
            },
            {
                "id": "2J",
                "name": "Gradual Release — I Do → We Do → You Do",
                "requirement": "All three phases must be identifiable: I Do (modelling with think-aloud), We Do (guided/shared practice with scaffolds — NOT just CFU questions), You Do (independent practice). We Do must include: (1) a collaborative or guided task, AND (2) scaffold support such as sentence stems, templates, or turn-and-talk protocol. A lesson going I Do → You Do with no We Do caps at Score 2.",
                "descriptors": {
                    1: "No GRR structure — jumps from explanation to independent work, OR entirely teacher-led with no student practice.",
                    2: "GRR partially present — one phase missing or collapsed (e.g. We Do skipped or merged with You Do). OR We Do has a task but no scaffold support (no sentence stems, templates, or peer protocol).",
                    3: "All three phases present and distinct. We Do includes a guided task with at least one scaffold (sentence stem, template, or turn-and-talk instruction). You Do has clear independent instructions students can follow without teacher help.",
                    4: "GRR fully structured — I Do models with think-aloud, We Do has joint practice with scaffold templates and peer protocol, You Do is fully independent with clear instructions AND a self-checking mechanism (answer key, peer-check step, or checklist) so students know if they succeeded.",
                },
                "standards": ["P1", "P1b", "P1c"],
                "requires_context": [],
                "status": "Enhanced",
            },
            {
                "id": "2K",
                "name": "Prior Knowledge Activation",
                "requirement": "LP must include a deliberate activity or question that surfaces what students already know AND connects it to new content — not just 'Do you remember this topic?'",
                "descriptors": {
                    1: "No attempt to activate prior knowledge. New content introduced without any connection to what students already know.",
                    2: "Prior knowledge referenced superficially — vague question with no follow-through connecting to new content.",
                    3: "Hook or Explanation opening includes a deliberate activity/question surfacing prior knowledge and connecting it to new content.",
                    4: "Prior knowledge activation is purposeful and diagnostic — teacher uses responses to calibrate lesson entry and maintains the connection through the Explanation.",
                },
                "standards": ["P2"],
                "requires_context": [],
                "status": "Original",
            },
            {
                "id": "2L",
                "name": "Active Retrieval (Warm-Up Recall)",
                "requirement": "LP must open with a retrieval activity that: (1) links to a PRIOR SLO, (2) uses peer-mediated delivery (choral, pair-checking, or peer CFU) — NOT solo silent recall (solo silent = assessment only, not warm-up). Generic warm-ups without SLO link do not count.",
                "descriptors": {
                    1: "No retrieval or warm-up activity at the start of the LP.",
                    2: "Warm-up present but not linked to a prior SLO. OR retrieval is solo silent work — not peer-mediated.",
                    3: "LP opens with a peer-mediated recall activity (choral, pair-check, or peer CFU) clearly linked to a prior SLO.",
                    4: "Peer-mediated retrieval linked to prior SLO with expected responses, success check, and clear teacher facilitation instructions.",
                },
                "standards": ["P4"],
                "requires_context": [CONTEXT_PRIOR_SLO],
                "status": "New Addition",
            },
        ],
    },
    {
        "criterion": "Practicality & Teacher Support",
        "checks": [
            {
                "id": "3A",
                "name": "Appropriately Timed Sections",
                "requirement": "Time must be written per phase and total 35–45 minutes for one 40-minute class. A total under 30 or over 50 minutes, or times clearly borrowed from multiple lessons (e.g. '8 lessons × 25–30 min', ~4 hours), is a single-class failure — score 1 and also flag Criterion 0F. Check phase balance: I Do ≤25% of total time, We Do ≥30%, You Do ≥30%. Example for 40-min class: I Do ≤10 min, We Do ≥12 min, You Do ≥12 min.",
                "descriptors": {
                    1: "No time annotations anywhere; OR total under 30 or over 50 minutes; OR times clearly borrowed from multiple lessons (e.g. '8 lessons × 25–30 min', ~4 hours) — also flag Criterion 0F.",
                    2: "Times given for some but not all phases, with the total in a plausible single-class range (30–50 minutes).",
                    3: "Time written for all phases and total adds up to 35–45 minutes.",
                    4: "Time written for all phases, total is realistic, AND phase balance is correct: I Do ≤25%, We Do ≥30%, You Do ≥30%.",
                },
                "standards": ["P1h"],
                "requires_context": [],
                "status": "Enhanced",
            },
            {
                "id": "3B",
                "name": "Adequate Time for Practice & Explanation",
                "requirement": "Practice (We Do + You Do combined) must receive at least 60% of lesson time. I Do must not dominate. Check that explanation time does not come at the expense of student practice time.",
                "descriptors": {
                    1: "I Do takes more than 50% of lesson time — students have minimal practice.",
                    2: "Some balance but practice time is insufficient for mastery (We Do + You Do under 50%).",
                    3: "Adequate time for both concept teaching and practice. We Do + You Do combined ≥60% of lesson time.",
                    4: "Excellent pacing — I Do is brief and focused, ample time for both guided and independent practice. No section feels rushed.",
                },
                "standards": ["P1h"],
                "requires_context": [],
                "status": "Enhanced",
            },
            {
                "id": "3C",
                "name": "Teacher Support Materials",
                "requirement": "LP must provide answer keys, teacher notes, or background information — especially for less-experienced teachers.",
                "descriptors": {
                    1: "No teacher notes, answer keys, or background provided.",
                    2: "Minimal guidance; not sufficient for a less-experienced teacher.",
                    3: "Answer keys or teacher notes present for key activities.",
                    4: "Comprehensive — answer keys, subject background, and notes on common errors/misconceptions all present.",
                },
                "standards": [],
                "requires_context": [],
                "status": "Original",
            },
            {
                "id": "3D",
                "name": "Resource Requirements",
                "requirement": "All required resources must be low-cost and available in Pakistani government schools (chalk, textbook, flashcards). No projector/internet required.",
                "descriptors": {
                    1: "Depends on unavailable or expensive resources (projector, internet) with no alternatives.",
                    2: "Some resources impractical but substitutes partially implied.",
                    3: "Mostly low-cost or widely available resources (chalk, textbook, flashcards).",
                    4: "All resources explicitly low-cost, locally available, and feasible; alternatives offered where relevant.",
                },
                "standards": [],
                "requires_context": [],
                "status": "Original",
            },
            {
                "id": "3E",
                "name": "Teacher Flexibility / No Over-Scripting",
                "requirement": "Instructions must be directive and clear without being rigidly word-for-word. Teacher must have natural space to respond to students. Directive verbs are good; complete scripting of every move is not.",
                "descriptors": {
                    1: "So rigidly scripted word-for-word that the teacher has no room to respond to students or adapt.",
                    2: "Most instructions scripted; teacher feels constrained but could manage.",
                    3: "Directive and clear without being rigid — teacher knows what to do but has natural space to adapt.",
                    4: "Confident and guiding — structure provided without removing professional judgment.",
                },
                "standards": ["P0"],
                "requires_context": [],
                "status": "Original",
            },
        ],
    },
    {
        "criterion": "Accessibility & Differentiation",
        "checks": [
            {
                "id": "4A",
                "name": "Suggestions for Struggling & Advanced Students",
                "requirement": "LP must address BOTH struggling AND advanced students. Addressing only one group caps the score at 2.",
                "descriptors": {
                    1: "No differentiation at all.",
                    2: "Only one group addressed (struggling OR advanced, not both).",
                    3: "Both groups addressed but strategies could be more specific.",
                    4: "Clear, actionable strategies for BOTH struggling AND advanced students.",
                },
                "standards": [],
                "requires_context": [],
                "status": "Original",
            },
            {
                "id": "4B",
                "name": "Named Differentiation Strategies with Instructions",
                "requirement": "Strategies must be named AND described with concrete instructions — e.g. 'sentence starters: give students the frame ____ so that ____', not just 'help struggling students'.",
                "descriptors": {
                    1: "No differentiation strategies named or described.",
                    2: "Strategy mentioned by concept only — no concrete tool or instruction.",
                    3: "At least one named, concrete strategy (sentence starters, graphic organiser, tiered task) with basic instructions.",
                    4: "Multiple named strategies for both struggling and advanced learners, each with clear usage instructions.",
                },
                "standards": [],
                "requires_context": [],
                "status": "Original",
            },
            {
                "id": "4C",
                "name": "Instructional Language for Students",
                "requirement": "Language used when addressing students must be clear, simple, and age-appropriate — not too complex or confusing.",
                "descriptors": {
                    1: "Too complex or confusing for the target grade level.",
                    2: "Simplified but not consistent.",
                    3: "Clear and age-appropriate throughout.",
                    4: "Extremely simple, engaging, and culturally relevant for all learners.",
                },
                "standards": [],
                "requires_context": [],
                "status": "Original",
            },
            {
                "id": "4D",
                "name": "Instructional Language for Teachers",
                "requirement": "Teacher-facing instructions must be clear, directive, and professional — actionable without being confusing or overly technical.",
                "descriptors": {
                    1: "Unclear or overly technical.",
                    2: "Somewhat clear but inconsistent tone.",
                    3: "Clear, directive, and teacher-friendly.",
                    4: "Exceptionally clear, concise, and empowering for low-skill teachers.",
                },
                "standards": [],
                "requires_context": [],
                "status": "Original",
            },
        ],
    },
    {
        "criterion": "Deeper Learning & Student Engagement",
        "checks": [
            {
                "id": "5A",
                "name": "Active Student Participation",
                "requirement": "Students must produce observable output throughout the lesson — answers, written responses, demonstrations. Not just listening or copying.",
                "descriptors": {
                    1: "Entirely teacher-centred; students only listen or copy.",
                    2: "Students respond occasionally (chorus answers) but rarely produce independent output.",
                    3: "Students consistently required to produce output (answers, written responses, demonstrations).",
                    4: "Students actively engaged throughout — producing outputs, discussing, and demonstrating thinking.",
                },
                "standards": [],
                "requires_context": [],
                "status": "Original",
            },
            {
                "id": "5B",
                "name": "Peer Interaction Opportunities",
                "requirement": "At least one structured peer interaction with clear instructions must be present — think-pair-share, pair work, group discussion, peer review.",
                "descriptors": {
                    1: "No peer interaction; all activity between teacher and whole class.",
                    2: "One brief peer interaction but underdeveloped.",
                    3: "At least one structured peer interaction with clear instructions.",
                    4: "Multiple varied peer interactions (at least two different techniques) well integrated into lesson flow.",
                },
                "standards": ["P1b"],
                "requires_context": [],
                "status": "Original",
            },
            {
                "id": "5C",
                "name": "Real-World Application",
                "requirement": "At least one meaningful connection between lesson content and students' real lives must be present — not 'we use this in daily life' without an example.",
                "descriptors": {
                    1: "No connection between lesson content and real-world use.",
                    2: "Real-world reference is superficial ('we use this in daily life') without example.",
                    3: "At least one meaningful, relevant real-world application that enhances understanding.",
                    4: "Real-world application is central and authentic — students apply knowledge to a genuine context from their lives.",
                },
                "standards": [],
                "requires_context": [],
                "status": "Original",
            },
            {
                "id": "5D",
                "name": "Exit Ticket — New Context, Success Criteria & Self-Prediction",
                "requirement": "Every LP must end with an exit ticket that: (1) tests the SLO in a NEW context not seen in I-Do or We-Do, (2) includes instruction for teacher to read success criteria aloud before collecting, (3) includes a student self-prediction step (thumbs up/down or traffic light) before submitting.",
                "descriptors": {
                    1: "No exit ticket or closing assessment.",
                    2: "Exit ticket present but repeats a classroom example. OR no success criteria. OR no self-prediction step.",
                    3: "Exit ticket uses a new context, tests the SLO. Teacher instructed to share success criteria before collecting.",
                    4: "Exit ticket in new context tests SLO at correct Bloom level. Success criteria read aloud. Students self-predict (thumbs/traffic light) before submitting. All three elements present and clearly instructed.",
                },
                "standards": ["P1g", "P7d"],
                "requires_context": [],
                "status": "Enhanced",
            },
        ],
    },
    {
        "criterion": "Cultural Relevance & Representation",
        "checks": [
            {
                "id": "6A",
                "name": "Contextually Relevant Content",
                "requirement": "Names, places, and scenarios must be relevant to Pakistani students' lives. No foreign currency, unrecognisable settings, or disconnected cultural references.",
                "descriptors": {
                    1: "Uses foreign/irrelevant references (foreign currency, unrecognisable settings, disconnected names).",
                    2: "Mostly generic; some local references but incidental.",
                    3: "Names, places, scenarios clearly relevant to Pakistani students' lives.",
                    4: "Strongly rooted in local reality — familiar settings, culturally resonant stories, community-connected examples.",
                },
                "standards": [],
                "requires_context": [],
                "status": "Original",
            },
            {
                "id": "6B",
                "name": "Inclusive & Diverse Representation",
                "requirement": "Examples must include both male and female names and diverse contexts. Deliberate — not accidental — inclusion of both genders.",
                "descriptors": {
                    1: "No diversity in gender, background, or ability representation.",
                    2: "Limited diversity, largely incidental (e.g. only one gender in examples).",
                    3: "Deliberate effort to include diverse representation (both male and female names, different contexts).",
                    4: "Strong inclusive representation across gender, background, and ability — deliberately normalises diversity.",
                },
                "standards": [],
                "requires_context": [],
                "status": "Original",
            },
            {
                "id": "6C",
                "name": "Student Voice & Cultural Connection",
                "requirement": "LP must explicitly invite students to connect content to their own experience, culture, or community — not just teacher-led examples.",
                "descriptors": {
                    1: "Students never invited to connect content to their own lives or culture.",
                    2: "Surface-level prompt exists but does not invite genuine cultural or personal connection.",
                    3: "Students explicitly invited to connect content to their own experience, culture, or community.",
                    4: "Multiple opportunities for students to bring their own cultural knowledge and lived experience into the lesson.",
                },
                "standards": [],
                "requires_context": [],
                "status": "Original",
            },
            {
                "id": "6D",
                "name": "Language & Cultural Sensitivity",
                "requirement": "Check for culturally inappropriate, insensitive, or exclusionary material. Language and examples must be respectful and appropriate for Pakistani classroom norms.",
                "descriptors": {
                    1: "Contains culturally inappropriate, insensitive, or exclusionary material.",
                    2: "No overtly inappropriate content but may inadvertently exclude or stereotype.",
                    3: "Language and examples are culturally respectful and appropriate.",
                    4: "Thoughtfully inclusive — actively represents Pakistan's diversity; no student group marginalised or stereotyped.",
                },
                "standards": [],
                "requires_context": [],
                "status": "Original",
            },
        ],
    },
    {
        "criterion": "Factual Accuracy & Bias",
        "checks": [
            {
                "id": "7A",
                "name": "Internal Consistency & Plausible Textbook References",
                "requirement": "Check for: (1) internal contradictions, (2) textbook references that seem fabricated (random page numbers, vague exercise names), (3) inconsistencies between sections.",
                "descriptors": {
                    1: "Multiple internal contradictions, OR textbook references appear clearly fabricated.",
                    2: "Minor inconsistencies that could cause confusion, OR one suspicious reference.",
                    3: "Internally consistent; any textbook references are plausible and specific.",
                    4: "Fully coherent; all components reinforce one another; textbook references are detailed, specific, and consistent with subject/grade.",
                },
                "standards": [],
                "requires_context": [],
                "status": "Original",
            },
            {
                "id": "7B",
                "name": "Academic Content Accuracy",
                "requirement": "Check for factual errors: incorrect maths steps, wrong scientific facts, grammatically wrong model sentences. Must be accurate and appropriate for grade level.",
                "descriptors": {
                    1: "Factual errors (incorrect maths steps, wrong scientific facts, grammatically wrong sentences) that would mislead students.",
                    2: "Mostly accurate but minor errors or oversimplifications could create misconceptions.",
                    3: "Accurate and appropriate for grade level.",
                    4: "Fully accurate, age-appropriate, demonstrates clear subject knowledge — correct terminology and precise explanations.",
                },
                "standards": [],
                "requires_context": [],
                "status": "Original",
            },
            {
                "id": "7C",
                "name": "Bias and Balance",
                "requirement": "Check for one-sided claims, harmful generalisations, missing important context, or negative stereotypes. Opinions/values must be framed as such.",
                "descriptors": {
                    1: "Materially biased — one-sided claims, harmful generalisations, negative stereotypes, or missing important context.",
                    2: "Leans toward a particular viewpoint without acknowledgment, or minor stereotyping.",
                    3: "Balanced and fair — does not mislead or discriminate.",
                    4: "Explicitly balanced and objective; opinions/values clearly framed as such; multiple perspectives respected.",
                },
                "standards": [],
                "requires_context": [],
                "status": "Original",
            },
        ],
    },
]

# =========================================================================== #
# CRITERION 8 — SUBJECT-SPECIFIC (one set per subject; English = 3 checks, others = 4)
# Keyed by canonical subject name. Subject checks carry no Standard codes in the sheet.
# =========================================================================== #
SUBJECT_CRITERIA = {
    "English": [
        {
            "id": "8A",
            "name": "Prioritised Skill Focus",
            "requirement": "Lesson must target ONE primary English skill (Reading / Listening / Speaking / Writing). Not spread across all four.",
            "descriptors": {
                1: "Lesson tries to cover all four skills with no primary focus.",
                2: "One skill is dominant but others are still unnecessarily mixed in.",
                3: "Lesson clearly targets one primary English skill.",
                4: "Primary skill explicitly named, all activities serve that skill, no time wasted on unrelated skills.",
            },
            "standards": [],
            "requires_context": [],
            "status": "Original",
        },
        {
            "id": "8B",
            "name": "Named Teaching Strategies",
            "requirement": "Must use specific, recognised English teaching strategies by name — e.g. phonics, shared reading, guided reading, think-aloud. Generic 'teaching' does not count.",
            "descriptors": {
                1: "No specific English strategy named; generic instructions only.",
                2: "Strategy mentioned by name but not explained or incorrectly used.",
                3: "At least one recognised English strategy used correctly.",
                4: "Multiple named, recognised strategies used appropriately and in correct sequence for the skill focus.",
            },
            "standards": [],
            "requires_context": [],
            "status": "Original",
        },
        {
            "id": "8C",
            "name": "Evidence of Textbook Material Usage",
            "requirement": "Textbook passages, vocabulary, or activities must be actively used — not just referenced by page number.",
            "descriptors": {
                1: "Textbook not used at all; entirely teacher-created content.",
                2: "Textbook referenced by page number only without actually using content.",
                3: "Textbook passages, vocabulary, or activities are actively used in the lesson.",
                4: "Textbook content is central; teacher builds directly on textbook material with enrichment activities.",
            },
            "standards": [],
            "requires_context": [CONTEXT_BOOK],
            "status": "Original",
        },
    ],
    "Maths": [
        {
            "id": "8A",
            "name": "Conceptual Knowledge",
            "requirement": "Students must understand WHY behind procedures — not just mechanical steps. Look for explanation of the concept, not just the method.",
            "descriptors": {
                1: "Lesson only teaches procedures/steps; no explanation of why.",
                2: "Some conceptual explanation but mostly procedural focus.",
                3: "Students understand the 'why' behind procedures through explanation and examples.",
                4: "Conceptual understanding built through concrete examples, connections to prior knowledge, and multiple representations.",
            },
            "standards": [],
            "requires_context": [],
            "status": "Original",
        },
        {
            "id": "8B",
            "name": "Computational Skills — Step-by-Step Guidance",
            "requirement": "Teacher must show full worked examples step by step. Every calculation step must be visible — not just the answer.",
            "descriptors": {
                1: "No step-by-step modelling; teacher tells answer without showing working.",
                2: "Some steps shown but incomplete or unclear.",
                3: "Clear step-by-step teacher modelling of calculations with worked examples.",
                4: "Full worked examples with each step explained, common errors addressed, and multiple practice examples provided.",
            },
            "standards": [],
            "requires_context": [],
            "status": "Original",
        },
        {
            "id": "8C",
            "name": "Real-World Application",
            "requirement": "Problems must be set in meaningful, locally relevant contexts (e.g. shopping, measurement, sharing) — not abstract numbers.",
            "descriptors": {
                1: "Problems use abstract numbers with no context.",
                2: "Context mentioned but forced or unrealistic.",
                3: "Problems set in locally relevant contexts (shopping, measurement, sharing).",
                4: "Real-world application is central; students solve problems from their own lives with meaningful context throughout the lesson.",
            },
            "standards": [],
            "requires_context": [],
            "status": "Original",
        },
        {
            "id": "8D",
            "name": "Mathematical Language & Dialogue",
            "requirement": "Correct mathematical vocabulary must be used AND students must be asked to use it — e.g. 'sum', 'product', 'denominator', 'numerator'.",
            "descriptors": {
                1: "No mathematical vocabulary used or taught.",
                2: "Some terms used but not explicitly taught or practiced.",
                3: "Correct mathematical vocabulary used and students asked to use it.",
                4: "Mathematical language systematically introduced, defined, practiced, and reinforced throughout the lesson.",
            },
            "standards": [],
            "requires_context": [],
            "status": "Original",
        },
    ],
    "Science": [
        {
            "id": "8A",
            "name": "Scientific Concept Clarity",
            "requirement": "Core scientific concept must be accurately explained in simple, age-appropriate language — not overly technical or vague.",
            "descriptors": {
                1: "Core concept is missing, incorrect, or confusing for the grade level.",
                2: "Concept is present but too vague, overly complex, or partially inaccurate.",
                3: "Core concept accurately explained in simple, age-appropriate language.",
                4: "Concept is clear, accurate, age-appropriate, and supported with examples, visuals, or simple demonstrations.",
            },
            "standards": [],
            "requires_context": [],
            "status": "Original",
        },
        {
            "id": "8B",
            "name": "Hands-On / Observation-Based Learning",
            "requirement": "Must include a practical activity, experiment, demonstration, or observation — not only text or lecture. For concepts where hands-on is not feasible, a structured model or guided visual qualifies if students produce observable output.",
            "descriptors": {
                1: "Lesson relies only on teacher explanation, textbook reading, or copying; no activity.",
                2: "Activity mentioned but unclear, impractical, or not directly linked to the concept.",
                3: "Includes a practical activity, experiment, demonstration, or observation linked to the SLO.",
                4: "Well-sequenced hands-on/observation task using simple/local materials, with clear teacher instructions and expected student responses.",
            },
            "standards": [],
            "requires_context": [],
            "status": "Original",
        },
        {
            "id": "8C",
            "name": "Real-Life Connections",
            "requirement": "Concept must be connected to students' environment or daily experience — household materials, school, weather, local plants/animals.",
            "descriptors": {
                1: "No connection to students' daily life, environment, or local context.",
                2: "Real-life connection is generic or superficial without specific examples.",
                3: "Concept connected to students' environment, household materials, school, or local surroundings.",
                4: "Real-life connection runs through the whole lesson as the main vehicle for explanation — not just introduced at start but used repeatedly.",
            },
            "standards": [],
            "requires_context": [],
            "status": "Original",
        },
        {
            "id": "8D",
            "name": "Scientific Inquiry & CFUs",
            "requirement": "Students must be prompted to observe, predict, ask questions, or draw conclusions. CFUs must be concept-specific — not generic. At minimum 2–3 inquiry moments.",
            "descriptors": {
                1: "No inquiry, prediction, observation question, conclusion, or concept-specific CFU.",
                2: "Some questions included but mostly recall-based or not linked to the science concept.",
                3: "Students asked to observe, predict, answer concept-specific CFUs, or draw simple conclusions.",
                4: "Inquiry integrated throughout: students ask/answer questions, make predictions, observe evidence, explain reasoning. Minimum 2–3 inquiry moments.",
            },
            "standards": [],
            "requires_context": [],
            "status": "Original",
        },
    ],
    "Urdu": [
        {
            "id": "8A",
            "name": "Prioritised Urdu Skill Focus",
            "requirement": "Lesson must target ONE primary Urdu skill: reading (قراءت), writing (کتابت), speaking (تقریر), or listening (سماعت). Not all four.",
            "descriptors": {
                1: "Lesson covers multiple Urdu skills with no clear primary focus.",
                2: "One skill attempted but others mixed in unnecessarily.",
                3: "Lesson clearly targets one primary Urdu skill.",
                4: "Primary skill explicitly named, all activities serve that skill, clear progression.",
            },
            "standards": [],
            "requires_context": [],
            "status": "Original",
        },
        {
            "id": "8B",
            "name": "Named Urdu-Specific Teaching Strategies",
            "requirement": "Must use recognised Urdu pedagogical strategies by name — e.g. ہجے, خوش خطی, کہانی سنانا, قواعد. Generic instructions do not count.",
            "descriptors": {
                1: "No Urdu-specific strategy named; generic instructions only.",
                2: "Strategy mentioned but not explained or incorrectly used.",
                3: "At least one recognised Urdu strategy used correctly.",
                4: "Multiple named Urdu strategies used appropriately and in correct pedagogical sequence.",
            },
            "standards": [],
            "requires_context": [],
            "status": "Original",
        },
        {
            "id": "8C",
            "name": "Evidence of Textbook Material Usage",
            "requirement": "Urdu textbook poems, passages, or exercises must be actively used in the lesson — not just referenced by title or page.",
            "descriptors": {
                1: "Urdu textbook not used; entirely teacher-created content.",
                2: "Textbook referenced by title/page only without using actual content.",
                3: "Urdu textbook poems, passages, or exercises actively used in the lesson.",
                4: "Textbook content is central; teacher builds directly from text with enrichment activities.",
            },
            "standards": [],
            "requires_context": [CONTEXT_BOOK],
            "status": "Original",
        },
        {
            "id": "8D",
            "name": "Multiple Strategy Variations & Alternatives",
            "requirement": "More than one teaching approach or strategy variant must be offered — giving teachers flexibility.",
            "descriptors": {
                1: "Only one approach used throughout with no alternatives.",
                2: "Slight variation mentioned but not developed.",
                3: "More than one teaching approach or strategy variant offered.",
                4: "Multiple varied approaches with clear instructions for each; teacher has genuine flexibility.",
            },
            "standards": [],
            "requires_context": [],
            "status": "Original",
        },
    ],
    "GK": [
        {
            "id": "8A",
            "name": "Concept & Vocabulary Clarity",
            "requirement": "GK concept must be explained clearly in simple Urdu. New vocabulary must be introduced, written, pronounced, and used in context.",
            "descriptors": {
                1: "GK concept missing, unclear, or too difficult; key vocabulary not introduced.",
                2: "Concept explained briefly but vocabulary support is weak or inconsistent.",
                3: "Core concept explained clearly in simple Urdu; key words introduced and used in context.",
                4: "Concept very clear and age-appropriate; new words written, pronounced, repeated, explained, and used in examples for low-vocabulary learners.",
            },
            "standards": [],
            "requires_context": [],
            "status": "New Subject",
        },
        {
            "id": "8B",
            "name": "Observation, Exploration & Inquiry",
            "requirement": "Lesson must include an age-appropriate activity where students observe, explore, compare, or ask questions — not just reading or lecture.",
            "descriptors": {
                1: "Lesson relies only on reading, lecture, or memorization; no exploration.",
                2: "Activity exists but mostly passive, unclear, or weakly linked to concept.",
                3: "Includes an age-appropriate activity where students observe, explore, compare, predict, or ask questions.",
                4: "Exploration strongly embedded; students actively observe, compare, discuss, make predictions. Multiple inquiry moments throughout.",
            },
            "standards": [],
            "requires_context": [],
            "status": "New Subject",
        },
        {
            "id": "8C",
            "name": "Real-Life & Local Context Connection",
            "requirement": "Concept must be connected to students' daily life, classroom, home, community, Pakistani culture, or local examples.",
            "descriptors": {
                1: "Content generic, foreign, or disconnected from students' lives.",
                2: "Some local examples present but incidental or not clearly connected to concept.",
                3: "Concept connected to students' daily life, classroom, home, community, or local examples.",
                4: "Local context woven throughout as main anchor for understanding — not just mentioned but repeatedly used. Examples culturally appropriate and familiar.",
            },
            "standards": [],
            "requires_context": [],
            "status": "New Subject",
        },
        {
            "id": "8D",
            "name": "Integrated GK Theme Handling",
            "requirement": "Lesson must handle GK topic according to its nature: science topics need observation; social/citizenship topics need behaviour/values; environment topics need local examples.",
            "descriptors": {
                1: "Lesson treats all GK topics the same way with no attention to topic nature.",
                2: "Topic type somewhat addressed but inconsistently.",
                3: "Lesson handles the GK topic appropriately according to its theme (science, environment, social, values, citizenship).",
                4: "Topic handling is strong and purposeful: science builds through observation; citizenship builds behaviour/responsibility; environment uses local surroundings.",
            },
            "standards": [],
            "requires_context": [],
            "status": "New Subject",
        },
    ],
    "Islamiat": [
        {
            "id": "8A",
            "name": "Accuracy of Islamic Concepts & Teachings",
            "requirement": "Islamic concepts, beliefs, Quran/Hadith references, or religious practices must be accurate, respectful, and age-appropriate. Any inaccuracy must be flagged.",
            "descriptors": {
                1: "Islamic concept, value, or religious explanation is incorrect, careless, or misleading.",
                2: "Mostly correct but vague, incomplete, or not clearly age-appropriate.",
                3: "Islamic concept or teaching is accurate, respectful, and age-appropriate.",
                4: "Accurate, respectful, clear, age-appropriate, and strengthens understanding through suitable examples or teacher guidance.",
            },
            "standards": [],
            "requires_context": [],
            "status": "New Subject",
        },
        {
            "id": "8B",
            "name": "Values-to-Life Connection",
            "requirement": "Lesson must connect Islamic teaching to students' daily actions, manners, responsibilities, or moral choices — not just memorization.",
            "descriptors": {
                1: "Lesson focuses only on memorization; no connection to behaviour or daily life.",
                2: "Life connection present but generic ('we should be good Muslims') without concrete examples.",
                3: "Lesson connects Islamic teaching to students' daily actions, manners, responsibilities, or social behaviour.",
                4: "Values-to-life connection meaningful and practical; students identify how to apply teaching in home, school, community, or social situations.",
            },
            "standards": [],
            "requires_context": [],
            "status": "New Subject",
        },
        {
            "id": "8C",
            "name": "Key Vocabulary & Recitation Support",
            "requirement": "Important Islamic terms, Arabic/Urdu words, duas, or ayat must be written, pronounced, repeated, and practiced clearly.",
            "descriptors": {
                1: "Important Islamic terms, duas, or ayat not supported or practiced.",
                2: "Vocabulary or recitation mentioned but pronunciation, repetition, or practice is limited.",
                3: "Key terms or recitation items are written, pronounced, repeated, and practiced clearly.",
                4: "Vocabulary and recitation support is strong: teacher models pronunciation, students repeat, meanings explained simply, practice structured for accuracy.",
            },
            "standards": [],
            "requires_context": [],
            "status": "New Subject",
        },
        {
            "id": "8D",
            "name": "Respectful & Culturally Appropriate Framing",
            "requirement": "All examples, activities, and teacher language must be respectful, aligned with Islamic values, and appropriate for Pakistani classroom norms.",
            "descriptors": {
                1: "Lesson includes inappropriate comparisons, careless wording, or content conflicting with Islamic values/Pakistani norms.",
                2: "No major issue, but some wording or examples feel weak, insensitive, or not carefully framed.",
                3: "Examples, teacher language, and activities are respectful, culturally appropriate, and aligned with Islamic values.",
                4: "Framing thoughtful and sensitive throughout; promotes respect, good manners, and inclusion without stereotyping.",
            },
            "standards": [],
            "requires_context": [],
            "status": "New Subject",
        },
    ],
    "SST": [
        {
            "id": "8A",
            "name": "Concept & Vocabulary Clarity",
            "requirement": "SSt concept must be explained clearly in simple Urdu. New terms (history, geography, citizenship) must be introduced and used in context.",
            "descriptors": {
                1: "SSt concept missing, unclear, or too difficult; key terms not explained.",
                2: "Concept present but vague; vocabulary translated or explained only partially.",
                3: "Concept explained clearly in simple Urdu; key SSt terms introduced and used in context.",
                4: "Concept very clear and age-appropriate; new terms broken down, translated, repeated, written, and used in understandable examples.",
            },
            "standards": [],
            "requires_context": [],
            "status": "New Subject",
        },
        {
            "id": "8B",
            "name": "Use of SSt Tools & Organizers",
            "requirement": "For topics requiring tools (maps for geography, timelines for history, concept maps for civic topics), a relevant tool must be used. Not all SSt lessons require tools — assess only when topic naturally calls for one.",
            "descriptors": {
                1: "No relevant SSt tool used where one would clearly support understanding.",
                2: "Tool mentioned or used superficially (e.g. map shown without clear teaching purpose).",
                3: "Lesson uses a relevant tool (map, timeline, chart, mind map, or board drawing) to explain the topic.",
                4: "Tool use purposeful and well integrated; students actively use or interpret maps, timelines, charts, or organizers.",
            },
            "standards": [],
            "requires_context": [],
            "status": "New Subject",
        },
        {
            "id": "8C",
            "name": "Local Context, Storytelling & Real-Life Relevance",
            "requirement": "Lesson must use storytelling, local examples, Pakistani/Islamic cultural context, or real-life scenarios. Ideally students make personal connections.",
            "descriptors": {
                1: "Lesson dry, memorization-based, or disconnected from students' community and daily life.",
                2: "Some example or story included but weakly connected to main concept.",
                3: "Teacher-led relevance: lesson uses storytelling, local examples, Pakistani context, or real-life scenarios to explain topic.",
                4: "Student-led relevance: students actively make personal connections to their own lives, community, responsibilities, or experiences.",
            },
            "standards": [],
            "requires_context": [],
            "status": "New Subject",
        },
        {
            "id": "8D",
            "name": "Historical, Geographical or Civic Thinking",
            "requirement": "Students must be prompted to think — sequence events, compare places, identify cause/effect, discuss responsibilities. Not just memorize facts.",
            "descriptors": {
                1: "Lesson focuses only on memorizing facts, names, dates, or definitions.",
                2: "One thinking task included but mostly recall-based.",
                3: "Students prompted to sequence events, compare places, identify cause/effect, or explain why topic matters.",
                4: "Thinking woven throughout; students reason, compare, explain causes/effects, discuss civic responsibilities, and connect topic to broader social understanding.",
            },
            "standards": [],
            "requires_context": [],
            "status": "New Subject",
        },
    ],
}

# =========================================================================== #
# CRITERION 9 — MULTIGRADE (applied ONLY when multigrade=True; +20)
# =========================================================================== #
MULTIGRADE_CRITERION = {
    "criterion": "Multigrade Adaptation",
    "checks": [
        {
            "id": "MG1",
            "name": "Grade-Group Rotation Structure",
            "requirement": "LP must show: (1) rotation order — which grade group is first, second, etc., (2) each grade group has its own I Do → We Do → You Do arc within its slot, (3) I Do is brief per group (≤25% of that group's slot), (4) what the non-facing group does while teacher is with another group.",
            "descriptors": {
                1: "No rotation structure. LP treats all students as one group OR rotation order not specified at all.",
                2: "Rotation mentioned but each grade group does not have its own GR arc. I Do dominates the slot. Non-facing group task absent.",
                3: "LP specifies rotation order. Each grade group has I Do → We Do → You Do within its slot. Non-facing group task is described.",
                4: "Fully structured: rotation order, timing per slot, each group's GR arc, I Do ≤25% per slot, non-facing group has a named self-sustaining task. Teacher can follow without improvising.",
            },
            "standards": ["P1-MG"],
            "requires_context": [],
            "status": "New Addition",
        },
        {
            "id": "MG2",
            "name": "Non-Facing Group Independent Task",
            "requirement": "While teacher is with Grade A, Grade B must have a structured task that: (1) students can start independently within 1–2 minutes — no teacher needed to launch, (2) self-sustaining for the full slot duration — not too short, not too long, (3) includes a self-check mechanism.",
            "descriptors": {
                1: "No task specified for non-facing group. Students expected to wait quietly OR task requires teacher to start.",
                2: "Task mentioned but students need teacher help to begin, OR task is too short (students finish early and go off-task), OR too long (requires teacher check mid-slot).",
                3: "Structured task specified that students can start independently within 1–2 minutes. Task is appropriately sized to fill the slot. Instructions are self-contained.",
                4: "Task is fully specified: clear self-starting instructions, correctly sized to slot duration, self-sustaining, with self-check mechanism. Students know exactly what to do without teacher presence.",
            },
            "standards": ["P1c-MG"],
            "requires_context": [],
            "status": "New Addition",
        },
        {
            "id": "MG3",
            "name": "Deliberate Peer Tutoring",
            "requirement": "If peer tutoring is used, LP must explicitly name: (1) who tutors whom — specific roles, NOT 'work with a partner', (2) on which SLO, (3) protocol — tutors ask questions, they do NOT give answers, (4) a checking mechanism to verify tutoring quality.",
            "descriptors": {
                1: "Peer tutoring mentioned only as 'work with a partner' — no assigned roles, no SLO, no protocol.",
                2: "Some structure given but roles or protocol incomplete. Tutors may give answers rather than ask questions. No checking mechanism.",
                3: "LP assigns tutoring roles explicitly, links to specific SLO, gives protocol instruction (ask questions, do not give answers).",
                4: "Fully structured: roles assigned, SLO specified, Socratic protocol described, checking mechanism included, teacher monitoring instruction given.",
            },
            "standards": ["P1b-MG"],
            "requires_context": [],
            "status": "New Addition",
        },
        {
            "id": "MG4",
            "name": "Grade-Group Transition Management",
            "requirement": "LP must explicitly mark each transition point with: (1) exact time to switch grades, (2) a named visual or clear signal (not just verbal), (3) what the receiving group starts doing, (4) a continuation task for the releasing group — so no dead time.",
            "descriptors": {
                1: "No transition instructions. LP assumes teacher will manage transitions informally.",
                2: "Some transitions mentioned but no timing, no signal, OR releasing group has no continuation task — creating dead time.",
                3: "Each transition point marked with timing, signal type, and continuation task for the releasing group.",
                4: "All transition points fully specified: exact timing, named visual signal, receiving group's start task, releasing group's continuation task. Dead time eliminated by design.",
            },
            "standards": ["P1d-MG"],
            "requires_context": [],
            "status": "New Addition",
        },
        {
            "id": "MG5",
            "name": "Time Equity Across Grade Groups",
            "requirement": "LP must document: (1) rotation order, (2) approximate time per grade group slot, (3) equitable distribution — no grade group consistently shortchanged, (4) within each slot: I Do ≤25%, We Do + You Do ≥75%.",
            "descriptors": {
                1: "No time allocation per grade group. One group may dominate or time distribution is unspecified.",
                2: "Some time mentioned but distribution is unequal across groups, OR I Do takes more than 25% of a slot.",
                3: "Time per grade group slot documented. Distribution is broadly equitable. I Do ≤25% within each slot.",
                4: "Time fully documented and equitable: rotation order, each slot duration, I Do ≤25% per slot, We Do + You Do ≥75%. Teacher can manage time without stopping to calculate.",
            },
            "standards": ["P1h-MG"],
            "requires_context": [],
            "status": "New Addition",
        },
    ],
}

# =========================================================================== #
# Subject resolution — accept DB short codes, full names, and aliases.
# Mirrors get_reviewer_prompt_v2's alias handling so v3 and legacy resolve alike.
# =========================================================================== #
SUBJECT_ALIASES = {
    "eng": "English", "english": "English",
    "maths": "Maths", "math": "Maths", "mathematics": "Maths",
    "science": "Science",
    "urdu": "Urdu",
    "gk": "GK", "general knowledge": "GK", "generalknowledge": "GK",
    "islamiat": "Islamiat", "islamiyat": "Islamiat",
    "sst": "SST", "social studies": "SST", "social_studies": "SST",
    "socialstudies": "SST", "social study": "SST",
}


def resolve_subject(subject):
    """Canonical subject name (English/Maths/Science/Urdu/GK/Islamiat/SST).

    Accepts DB short codes (Eng), full names (English), and aliases (math,
    social studies). Unknown subjects fall back to English, matching the legacy
    get_reviewer_prompt_v2 default.
    """
    key = (subject or "").strip().lower()
    return SUBJECT_ALIASES.get(key, "English")


def expand_standards(codes):
    """[code, ...] -> [{"id", "name"}, ...] using STANDARD_NAMES (id name fallback).

    The authoritative way to attach standard chips: callers map a check's
    `standards` list through this, so there is no ambiguity from the (subject-
    duplicated) bare check IDs. Mirrors EG's standard_refs shape exactly.
    """
    return [{"id": c, "name": STANDARD_NAMES.get(c, c)} for c in codes]


def standard_refs(check_id):
    """[{"id","name"}] for a UNIVERSAL or MULTIGRADE check id (for tests/tooltips).

    Subject (Criterion-8) checks carry no standards in the sheet and their bare
    ids (8A…8D) repeat across subjects, so resolve those via the active rubric
    instead. Universal (0A…7C) and multigrade (MG1…MG5) ids are unique.
    """
    for crit in UNIVERSAL_CRITERIA:
        for chk in crit["checks"]:
            if chk["id"] == check_id:
                return expand_standards(chk["standards"])
    for chk in MULTIGRADE_CRITERION["checks"]:
        if chk["id"] == check_id:
            return expand_standards(chk["standards"])
    return []


def _with_max(criterion):
    """Shallow copy of a criterion dict with max_score = 4 * len(checks)."""
    out = {k: v for k, v in criterion.items()}
    out["max_score"] = SCALE_MAX * len(criterion["checks"])
    return out


def get_active_rubric(subject, multigrade=False):
    """Ordered criteria for a review: UNIVERSAL (C0–C7) + the subject's C8
    (+ Multigrade C9 if multigrade). Each criterion gets a computed `max_score`.

    This is the single function consumed by the prompt builder, the reviewer
    service scoring, and the rubric catalog — so prompt and catalog cannot drift.
    """
    canon = resolve_subject(subject)
    active = [_with_max(c) for c in UNIVERSAL_CRITERIA]
    subject_checks = SUBJECT_CRITERIA[canon]
    active.append({
        "criterion": "Subject Specific Review - {}".format(canon),
        "subject": canon,
        "checks": subject_checks,
        "max_score": SCALE_MAX * len(subject_checks),
    })
    if multigrade:
        active.append(_with_max(MULTIGRADE_CRITERION))
    # Stamp criterion_id by position (C0..C7 universal, C8 subject, C9 multigrade)
    # so the prompt, scoring, and catalog all use the same id.
    for i, crit in enumerate(active):
        crit["criterion_id"] = "C{}".format(i)
    return active


def grand_total_max(subject, multigrade=False):
    """Maximum grand-total points for a fully-assessable review (no exclusions).

    English 188 / others 192 (non-MG); +20 if multigrade (208 / 212).
    """
    return sum(c["max_score"] for c in get_active_rubric(subject, multigrade))


# --------------------------------------------------------------------------- #
# Derived constants — pinned by tests; consumed by the prompt + catalog.
# --------------------------------------------------------------------------- #
UNIVERSAL_CRITERION_NAMES = [c["criterion"] for c in UNIVERSAL_CRITERIA]
UNIVERSAL_CHECK_IDS = [chk["id"] for c in UNIVERSAL_CRITERIA for chk in c["checks"]]
MULTIGRADE_CHECK_IDS = [chk["id"] for chk in MULTIGRADE_CRITERION["checks"]]
SUBJECTS = list(SUBJECT_CRITERIA.keys())
UNIVERSAL_MAX = sum(SCALE_MAX * len(c["checks"]) for c in UNIVERSAL_CRITERIA)  # 176
MULTIGRADE_MAX = SCALE_MAX * len(MULTIGRADE_CRITERION["checks"])              # 20


def subject_check_ids(subject):
    """Ordered Criterion-8 check ids for a subject (English -> 3, others -> 4)."""
    return [chk["id"] for chk in SUBJECT_CRITERIA[resolve_subject(subject)]]


# =========================================================================== #
# RESEARCH EXTENSIONS + REGION EDITS (RUBRIC_DELTAS.md, D-017 — applied 2026-08-03)
# Applied at import time so get_active_rubric / grand_total_max / the prompt
# builder all see them with no caller changes. The imported checks above are
# VERBATIM from UG_LessonPlan; every divergence below is logged in RUBRIC_DELTAS.md.
# NOTE: totals rise vs the upstream docstring (English 188->204, others 192->200/204/212-ish)
# because research checks join each subject's C8. Composite scoring can split
# research checks out by id prefix "9".
# =========================================================================== #

def _find_check(cid, subject=None):
    pools = ([SUBJECT_CRITERIA[subject]] if subject else [c["checks"] for c in UNIVERSAL_CRITERIA])
    for pool in pools:
        for chk in pool:
            if chk["id"] == cid:
                return chk
    raise KeyError(cid)

# ---- B1: duration band -> region-parameterized (ICT periods 25-40 min) ----
ICT_PERIOD_NOTE = "the region's period length (ICT: 25-40 min total; under 20 or over 50 = single-class failure)"
_c = _find_check("0F")
_c["requirement"] = _c["requirement"].replace("ONE 40-minute class", "ONE class period ({})".format(ICT_PERIOD_NOTE)).replace("a stated duration of multiple hours or 'X lessons × Y minutes'", "a stated duration of multiple hours or 'X lessons × Y minutes'")
_c["descriptors"][3] = "Single lesson targeting one SLO with a realistic activity load for one class period (ICT: 25-40 min)."
_c["descriptors"][4] = "Clearly scoped single lesson — one SLO, four sections, time allocations summing to 25-40 minutes (ICT period)."
_c["status"] = "Edited (RUBRIC_DELTAS B1 — region period length)"
_c = _find_check("3A")
_c["requirement"] = ("Time must be written per phase and total 25-40 minutes for one ICT class period. A total under 20 or over 50 minutes, "
                     "or times clearly borrowed from multiple lessons, is a single-class failure — score 1 and also flag Criterion 0F. "
                     "Check phase balance: I Do <=25% of total time, We Do >=30%, You Do >=30%. Example for a 35-min class: I Do <=9 min, We Do >=11 min, You Do >=11 min.")
_c["status"] = "Edited (RUBRIC_DELTAS B1 — region period length)"

# ---- B3: SLO code system -> the corpus/book-opener codes, not SNC-only ----
_c = _find_check("1A")
_c["requirement"] = _c["requirement"].replace(
    "include or reference the SNC standard code (e.g. SNC 5.2.3)",
    "include or reference the curriculum SLO code as given by the textbook's SLO roadmap (this corpus: codes like E-03-RD-04 / U-05-QW-03; an SNC code counts too if the source provides it — NEVER a fabricated code)")
_c["status"] = "Edited (RUBRIC_DELTAS B3 — corpus SLO-code system)"

# ---- B4 + B2: subject skill lists -> our locked taxonomies ----
_c = _find_check("8A", "English")
_c["requirement"] = ("Lesson must target ONE primary skill from the English-7 taxonomy "
                     "(pre_reading / phonics / reading_comprehension / vocabulary_grammar / writing / oral_communication / revision). Not spread across many.")
_c["descriptors"][1] = "Lesson tries to cover many skills with no primary focus."
_c["descriptors"][3] = "Lesson clearly targets one primary English-7 skill."
_c["descriptors"][4] = "Primary skill explicitly named (English-7 key), all activities serve that skill."
_c["status"] = "Edited (RUBRIC_DELTAS B4 — English-7 taxonomy)"
_c = _find_check("8A", "Urdu")
_c["requirement"] = ("Lesson must target ONE primary skill from the Urdu-7 taxonomy "
                     "(alfaaz_maani / buland_khwani / arkaan_saazi / qawaid / tafheem / takhleeqi_likhai / duhrai). "
                     "There is deliberately NO standalone oral skill (speaking folds into buland_khwani, listening into tafheem) — that fold is NOT a violation.")
_c["status"] = "Edited (RUBRIC_DELTAS B2 — Urdu-7 taxonomy, D-013)"

# ---- C: research additions (scoped; not-applicable lessons score n/a, excluded) ----
def _rchk(cid, name, req, d1, d3):
    return {"id": cid, "name": name, "requirement": req,
            "descriptors": {1: d1, 2: "Attempted but superficial or wrong.", 3: d3,
                            4: d3 + " Exemplary: explicit, scripted, immediately teachable."},
            "standards": [], "requires_context": [],
            "status": "Research-Extension (RUBRIC_DELTAS C)",
            "scope_note": "If this lesson's skill_type/lp_type makes the check inapplicable, set rating=null, notAssessable=true and exclude from the denominator."}

_LIT = [
    _rchk("9A", "Explicit Decoding Instruction (decoding/phonics lessons)",
          "The target grapheme-phoneme / letter-sound unit is TAUGHT explicitly: sound -> symbol -> blending sequence. Urdu: aadhi-ashkaal (آدھی اشکال) join/break shown for the target letters. Only applies to decoding/phonics-type lessons.",
          "Decoding assumed, not taught (jumps straight to reading words).",
          "Explicit sound->symbol->blend teaching sequence present for the target unit."),
    _rchk("9B", "Encoding Production (dictation/imla)",
          "Students WRITE the taught pattern — dictation/imla (املا) with a mark scheme (Urdu: connected-form-correct), not recognition only. Applies to decoding + writing lessons.",
          "No student writing of the taught pattern (recognition only).",
          "A scripted dictation/imla element with a mark scheme is present."),
    _rchk("9C", "Decodable / Controlled Practice Text (phonics-stage reading)",
          "Reading-practice material is decodable with patterns already taught — not memorize-the-passage. Applies to phonics-stage reading-practice lessons.",
          "Practice text requires untaught patterns (guessing/memorizing).",
          "Practice text is controlled to taught patterns."),
    _rchk("9D", "Fluency Drill (fluency lessons)",
          "A timed or repeated-reading element (buland-khwani drill) with a clear fluency criterion. Applies to fluency-type lessons.",
          "No fluency element in a fluency lesson.",
          "A repeated/timed reading drill with a stated criterion is present."),
]
SUBJECT_CRITERIA["English"].extend(_LIT)
SUBJECT_CRITERIA["Urdu"].extend(_LIT)
SUBJECT_CRITERIA["Maths"].extend([
    _rchk("9A", "Number-Sense Warm-Up",
          "The opening includes number-sense work (subitizing / counting / composing-decomposing), not only fact recall.",
          "No number-sense element in the warm-up.",
          "A short number-sense warm-up activity is scripted."),
    _rchk("9B", "CPA-Phase Fidelity",
          "The lesson enacts its assigned CPA phase (concrete = real objects/actions; pictorial = images/diagrams; abstract = symbols only after earlier phases). A NEW concept never starts abstract.",
          "Phase mismatch (e.g. a 'concrete' lesson with no objects/actions; new concept starts abstract).",
          "Activities visibly match the assigned CPA phase."),
    _rchk("9C", "Fact-Fluency + Mastery Check",
          "A short fluency element AND an explicit mastery criterion ('students can X before moving on').",
          "Neither fluency practice nor a mastery criterion present.",
          "Both a brief fluency element and a stated mastery criterion are present."),
])
SUBJECT_CRITERIA["Science"].extend([
    _rchk("9A", "Investigate-Before-Explain (POE ordering)",
          "Within the lesson's 5E position, observation/prediction precedes the concept statement (predict-observe-explain); a concept_build lesson references the prior investigation.",
          "Concept stated first; investigation absent or decorative.",
          "Prediction/observation genuinely precedes and feeds the explanation."),
    _rchk("9B", "Bilingual Concept Glossary",
          "New science terms carry an English term-of-record + Urdu gloss (translanguaging free at hook; English pinned at concept/assess).",
          "New terms introduced in one language only, no gloss.",
          "Each new term has the EN term + Urdu gloss at first use."),
])
