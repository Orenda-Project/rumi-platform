"""
LP Lesson-Plan Reviewer — v3 system prompt builder.

Builds the reviewer system prompt from prompts/reviewer_rubric_v3 (the data-driven
rubric: Criterion 0–9, 1–4 scale, stable IDs, standard codes). Selected when
config.LP_REVIEWER_RUBRIC=v3; the legacy prose prompt
(prompts/reviewer_prompt.get_reviewer_prompt_v2) stays as the `legacy` arm.

Frame vs body:
  • The editable FRAME (role, context, evaluation philosophy, cross-cutting
    guardrails, improvement contract, context-handling rule) is what lives in
    Langfuse (key lp.reviewer.v3.system). Pass it as `frame_override`.
  • The rubric BODY (every criterion + check + 1/2/3/4 descriptors) and the exact
    OUTPUT CONTRACT are rendered from reviewer_rubric_v3 data, so the prompt the
    model reads, the DL catalog, and the scoring can never drift.

Mirrors EG_Pipeline/prompts/reviewer_prompt_v2.py.
"""
from reviewer_rubric_v3 import (
    SCALE_MAX,
    STANDARD_NAMES,
    get_active_rubric,
    grand_total_max,
)


def _fmt_standards(codes):
    if not codes:
        return "no direct framework standard"
    return ", ".join("{} ({})".format(c, STANDARD_NAMES.get(c, c)) for c in codes)


def _context_note(check, available):
    """One-line dependency note for a context-bound check, or ''.

    `available` is the set of context tokens present this request; if the token is
    present we say so, otherwise we instruct the exclude+flag behaviour.
    """
    req = check.get("requires_context") or []
    if not req:
        return ""
    have = available or set()
    missing = [t for t in req if t not in have]
    if missing:
        return (
            "\n  ⚠ Depends on context not provided ({}). Score from the LP itself if you can; "
            "if you genuinely cannot judge it without that context, set rating=null, "
            'notAssessable=true, contextMissing="{} not provided" and EXCLUDE it from the '
            "denominator — do NOT score it 1 as a penalty.".format(
                ", ".join(missing), missing[0]
            )
        )
    return "\n  ⓘ Uses provided context ({}); score normally.".format(", ".join(req))


def _render_rubric(active, available=None):
    """Render every criterion with its checks and ascending 1/2/3/4 descriptors."""
    blocks = []
    for crit in active:
        head = "**{} — {} (max {})**".format(
            crit["criterion_id"], crit["criterion"], crit["max_score"]
        )
        if crit.get("gate"):
            head += (
                "  ← GATE: evaluate this criterion FIRST. If ANY sub-criterion scores 1, "
                "flag a fundamental structural failure explicitly in the rationale "
                "(do not let other criteria mask it)."
            )
        lines = [head]
        for chk in crit["checks"]:
            d = chk["descriptors"]
            block = (
                "- [{id}] {name} (enforces {std}):\n"
                "  What to check: {req}\n"
                "  - 1: {one}\n"
                "  - 2: {two}\n"
                "  - 3: {three}\n"
                "  - 4: {four}".format(
                    id=chk["id"],
                    name=chk["name"],
                    std=_fmt_standards(chk["standards"]),
                    req=chk["requirement"],
                    one=d[1], two=d[2], three=d[3], four=d[4],
                )
            )
            block += _context_note(chk, available)
            lines.append(block)
        blocks.append("\n".join(lines))
    return "\n\n".join(blocks)


def _render_output_contract(active):
    """Render the exact evaluation[] JSON skeleton, enumerating every criterion and
    every sub-criterion WITH its id + name, so the model cannot omit/rename/merge."""
    crit_blocks = []
    for crit in active:
        sub_entries = ",\n".join(
            '        {{"id": "{id}", "name": "{name}", "rating": "<1-{scale} or null>"}}'.format(
                id=chk["id"], name=chk["name"].replace('"', "'"), scale=SCALE_MAX
            )
            for chk in crit["checks"]
        )
        crit_blocks.append(
            '    {{\n'
            '      "criterion": "{crit}",\n'
            '      "criterionId": "{cid}",\n'
            '      "totalScore": "<sum of assessable ratings> / <{scale} × assessable sub-criteria>",\n'
            '      "subCriteria": [\n{subs}\n      ],\n'
            '      "rationale": "<50-100 word justification citing specific evidence from the LP>",\n'
            '      "strengths": ["<specific strength>"],\n'
            '      "improvements": []\n'
            '    }}'.format(
                crit=crit["criterion"].replace('"', "'"),
                cid=crit["criterion_id"],
                scale=SCALE_MAX,
                subs=sub_entries,
            )
        )
    return "[\n" + ",\n".join(crit_blocks) + "\n  ]"


# --------------------------------------------------------------------------- #
# Default editable FRAME (role / philosophy / cross-cutting guardrails / contracts).
# This is what is seeded to Langfuse as lp.reviewer.v3.system and passed back via
# frame_override. The rubric body + output contract are always appended from data.
# --------------------------------------------------------------------------- #
_FRAME = """\
### ROLE AND CONTEXT
You are an expert AI Lesson Plan Evaluator for primary-grade classrooms in Pakistan. You have
deep expertise in curriculum design, instructional pedagogy, and the realities of Pakistani
government schools (limited resources, mixed teacher skill, Urdu/English medium). Filter every
rating through practical classroom implementation in Pakistan, balancing high standards with
realistic expectations.

### EVALUATION PHILOSOPHY
Be rigorous but fair. Do NOT invent improvements to fill space. If the lesson plan genuinely
meets a criterion (scores 3–4 on all its sub-criteria), acknowledge its strengths and leave that
criterion's improvements array EMPTY. Only flag genuine gaps where sub-criteria score 1–2.

### HOW TO SCORE
- Score EVERY sub-criterion on the 1–4 scale using the descriptors below (4 = best).
- The Structural Completeness criterion is a GATE — evaluate it first; a sub scoring 1 is a
  fundamental structural failure and must be called out, regardless of other scores.
- Read the whole lesson plan before scoring. Cite specific evidence from the LP in each rationale.
- Use the IMAGES section (if provided in the user prompt) to judge visual-aid checks.

### CROSS-CUTTING GUARDRAILS (apply throughout)
- Generic filler is NOT instruction: "Explain the concept", "Discuss with students", "Give
  feedback" tell the teacher WHAT, not HOW — score the relevant checks 1–2.
- CFUs must come AFTER the concept is taught, not before. A question in the Hook that activates
  prior knowledge is NOT a CFU.
- "Smooth transitions" means LOGICAL FLOW between sections — do NOT suggest adding bridging
  sentences like "Now that we learned X, let's do Y".
- Gradual Release is about the TRANSFER OF RESPONSIBILITY (I Do → We Do → You Do), not section
  labels. A lesson that skips We Do (explanation straight to independent work) caps at 2.
- A single lesson must fit ONE 40-minute class: time allocations should total 35–45 minutes. A
  total over 50 minutes, or times borrowed from multiple lessons ("8 lessons × 25–30 min"), fails
  BOTH Single-Lesson-Scope (0F = 1) and Appropriately-Timed-Sections (3A = 1). Treat any of these
  unit/chapter-plan red flags as a 0F failure and do NOT reward the quality of the sub-lessons
  inside such a document: a pacing table or weekly schedule; numbered "Lesson 1, 2, …" headers;
  multiple SLOs (one per lesson); a chapter overview or full-chapter assessment; or a multi-lesson
  progress tracker.
- Directive language ("Write X on the board", "Ask: ...") is GOOD. Only flag over-scripting when
  EVERY teacher move is prescribed verbatim with no room to respond to students.

### CONTEXT-DEPENDENT CHECKS
Some checks depend on context that may be absent (e.g. textbook pages, or a stated PRIOR SLO for
Active Retrieval). Rule: score the check from the LP itself wherever you can. ONLY when a check
genuinely cannot be judged without the missing context, set its "rating" to null, add
"notAssessable": true and "contextMissing": "<token> not provided", and EXCLUDE it from that
criterion's denominator. NEVER score a check 1 just because context was not supplied — that
penalises a lesson for something outside its control (e.g. the first lesson in a sequence has no
prior SLO). Checks you can judge from the LP must be scored normally.

### IMPROVEMENTS — STRICT RULES
- A criterion's "improvements" array MUST be empty [] if all its sub-criteria score 3–4.
- Only add improvements for sub-criteria that scored 1–2; each MUST reference that sub-criterion
  by name and move it toward the higher descriptor.
- Each improvement object MUST have exactly these keys:
  {"subCriterion": "<name of the 1–2 sub-criterion>", "currentScore": "<1 or 2>",
   "targetScore": "<3 or 4>", "action": "<ADD | REPLACE | MODIFY | CLARIFY>",
   "location": "<Hook | Explanation | Practice | Conclusion | SLO | ...>",
   "instruction": "<precise, actionable change tied to the rubric descriptor>"}
- For "Suggestions for Struggling & Advanced Students" scoring 1–2, the improvement MUST address
  BOTH struggling AND advanced students.

### OUTPUT
Return ONLY a valid JSON object (no markdown fences, no prose outside the JSON), following the
OUTPUT FORMAT below exactly. Every sub-criterion MUST show its id, name, and rating so a teacher
can see exactly where marks were earned or lost. Return EVERY sub-criterion for EVERY criterion —
the per-criterion list is fixed; NEVER omit one. A check you cannot judge (even from the LP) stays
in the list with rating null, notAssessable true, and contextMissing — it is flagged, never dropped."""


# Public alias for the editable frame. This is what is seeded to Langfuse
# (lp.reviewer.v3.system) and used as the local fallback; build_reviewer_prompt
# appends the data-rendered rubric + output contract to it.
DEFAULT_FRAME = _FRAME


def build_reviewer_prompt(subject, multigrade=False, available_context=None, frame_override=None,
                          active_override=None, scope_note=None):
    """Assemble the full v3 reviewer system prompt for a subject (+ multigrade).

    Args:
        subject: subject name / DB code / alias (English, Eng, math, social studies, ...).
        multigrade: if True, append Criterion 9 (Multigrade Adaptation, +20).
        available_context: iterable of context tokens present this request
            (e.g. {"book_content", "prior_slo"}); drives the per-check context note.
        frame_override: optional editable frame text (from Langfuse). Falls back to
            the built-in _FRAME. The data-rendered rubric + output contract are always
            appended, so the body cannot drift from reviewer_rubric_v3.
    """
    available = set(available_context or [])
    active = active_override if active_override is not None else get_active_rubric(subject, multigrade)
    frame = (frame_override or _FRAME).rstrip()

    total_max = sum(c["max_score"] for c in active)
    if scope_note is not None:
        mg_note = "\n" + scope_note
    elif multigrade:
        mg_note = (
            "\nThis is a MULTIGRADE lesson plan: apply Criterion 9 (Multigrade Adaptation) IN ADDITION "
            "to all universal and subject criteria."
        )
    else:
        mg_note = ""
    ctx_line = (
        "Context available for this review: {}.".format(
            ", ".join(sorted(available)) if available else "none beyond the lesson plan itself"
        )
    )

    rubric = _render_rubric(active, available)
    contract = _render_output_contract(active)

    return """{frame}
{mg_note}

### SCORING RUBRIC (scale 1–{scale}, {scale} = best)
{ctx_line}

{rubric}

### OUTPUT FORMAT
Return ONLY this JSON object:

{{
  "grandTotal": "<sum of all assessable criterion scores> / <{total_max} minus {scale} per not-assessable check>",
  "percentage": "<grandTotal earned / grandTotal max × 100, one decimal>%",
  "scale_max": {scale},
  "evaluation": {contract}
}}

### CALCULATION RULES
- Each sub-criterion scores 1–{scale}; a not-assessable sub-criterion is excluded (counts toward
  neither the numerator nor the denominator).
- criterion totalScore = (sum of that criterion's assessable ratings) / ({scale} × number of
  assessable sub-criteria in that criterion).
- grandTotal = (sum of all assessable ratings) / (sum of all assessable maxima). The fully-
  assessable maximum for this review is {total_max}; subtract {scale} for every check you mark
  not-assessable.
- percentage = round(grandTotal_earned / grandTotal_max × 100, 1).
- improvements = [] for any criterion whose sub-criteria all score 3–{scale}.
""".format(
        frame=frame,
        mg_note=mg_note,
        scale=SCALE_MAX,
        ctx_line=ctx_line,
        rubric=rubric,
        contract=contract,
        total_max=total_max,
    )


def build_multigrade_c9_prompt(subject, frame_override=None):
    """C9-only reviewer prompt for the multigrade orchestration (the scoring gate, Option A1).

    The multigrade review runs C0–C8 once PER GRADE (each pass sees only that grade's
    book, so a grade is never judged against another grade's textbook), then this single
    pass scores ONLY Criterion 9 (Multigrade Adaptation) over the whole combined LP — the
    cross-grade orchestration that no single grade's book is relevant to.
    """
    c9 = get_active_rubric(subject, multigrade=True)[-1]  # the C9 Multigrade Adaptation criterion
    note = (
        "This is a MULTIGRADE lesson plan covering several grade groups in ONE classroom. Evaluate "
        "ONLY Criterion 9 (Multigrade Adaptation) — the cross-grade orchestration (rotation order, "
        "non-facing-group tasks, peer tutoring, transitions, time equity) across ALL grades. Do NOT "
        "score subject content or any other criterion here; those are evaluated per grade in "
        "separate passes."
    )
    return build_reviewer_prompt(
        subject, active_override=[c9], scope_note=note, frame_override=frame_override
    )
