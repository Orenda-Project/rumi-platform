# quiz — full index (generated)

<!-- kg:index repo=rumi-platform dir=tests/quiz -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `fixtures/` | → (no door; 3 test files) |
| `helpers/` | Shared stubs and fixtures for quiz suites: Supabase fakes, solver, KaTeX, PDF ink readers → `helpers/CLAUDE.md` |
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `base-ten-thousands.test.js` | Pins the base_ten place-value mat's new thousands place: cube/bundle drawing, column order in Urdu, digest guidance |
| `classic-quiz-recovers-own-sessions.test.js` | Pins that QuizSessionService.getActiveState recovers only roster sessions on a Redis miss, not class-quiz ones |
| `lesson-quiz-bullmq-poll.test.js` | Pins that sqs-worker polls the BullMQ quiz queue when QUEUE_DRIVER=bullmq without SQS_QUIZ_QUEUE_URL |
| `lesson-quiz-fifo-delay.test.js` | Pins that a delayed quiz_nudge_teacher is dropped, not re-queued in a tight loop, on a FIFO queue that ignores delay |
| `lesson-quiz-offer-follow-ups.test.js` | Pins that a skipped lesson-quiz offer job still runs the report's held-back Trigger 3 and suggestNext exactly once |
| `lesson-quiz-report-hook.test.js` | Pins ReportGeneratorService.afterReportOffers holding Trigger 3 and suggestNext while a lesson-quiz offer is scheduled |
| `lesson-quiz-router.test.js` | Executes real webhook payloads through whatsapp-bot.js to pin which handler tq_* quiz buttons and lists reach |
| `lesson-quiz-teacher-small.test.js` | Pins small teacher-side fixes (review F-N8): No-after-Yes wording, feature gating, nudge idempotence, flag-off nudge |
| `lesson-quiz-text-wiring.test.js` | Runs handleTextMessage to pin which quiz door a text reaches: share code, typed answer, STOP, in order |
| `lesson-quiz-worker.test.js` | Pins sqs-worker executeJob wiring for quiz_* jobs: payload ids, queue timeout extension, nudge self-requeue |
| `lp-shelf.test.js` | Pins lp-shelf.service: FIFO cap, sliding TTL, segment/chapter delivery-type discriminator and flush, on mocked Redis |
| `multi-question-card.test.js` | Pins renderQuestionCardHtml answerMode 'multi': cue line and reply-every-letter foot, 'single' unchanged |
| `one-attempt-per-child.test.js` | Pins oneAttemptPerChild: the first completed attempt counts, retakes and later unfinished ones are ignored (F-S9) |
| `openai-detect-intent-quiz.test.js` | Pins openai.service detectIntent and its keyword fallback returning the quiz category as backup to isQuizIntent |
| `pictogram-school-bag.test.js` | Pins the lp-v9 engine's own backpack pictogram (body, pocket, handle, straps) and its 72-unit glyph contract |
| `pictograms-lesson-objects.test.js` | Pins new counting pictograms (sweet, cookie, lily, samosa...) in the lp-v9 diagram set and the figure gates |
| `plan-quiz-author.test.js` | Pins transcript-quiz-author.service with lessonPlan: prompt and teacher summary describe the plan, not a transcript |
| `plan-quiz-digest.test.js` | Pins plan-quiz-digest.service: plan or topic digests share the transcript digest shape; topic claims no lesson happened |
| `plan-quiz-failure-reasons.test.js` | Pins truthful failure reasons for plan quizzes (model_failed, source_unusable...) in the row and teacher message |
| `plan-quiz-g1-urdu-repair-order.test.js` | Drives the real generate/repair loop on a grade-1 Urdu quiz: teacher-field repair runs after the targeted rewrite |
| `plan-quiz-key-check.test.js` | Pins plan-quiz-key-check.service: a key contradicting the lesson plan is rewritten or dropped, never shipped |
| `plan-quiz-pdf.test.js` | Pins transcript-quiz-teacher.template wording for plan and topic quizzes: planned/made from lesson plan, branded footer |
| `plan-quiz-planned-not-taught.test.js` | Pins that plan-quiz summaries say planned, never taught, in the author prompt and rewrite; topic quizzes say neither |
| `plan-quiz-strings.test.js` | Pins the three distinct ux-strings failure messages for lesson-plan quizzes and the /quiz row status wording |
| `quiz-adaptive.test.js` | Pins quiz-adaptive pure functions: computeNextDifficulty over a 3-answer window and shouldEndQuiz |
| `quiz-column-sum-katex.test.js` | Pins column-sum maths as a valid KaTeX array on card and teacher PDF in both languages; needs real KaTeX, else skips |
| `quiz-comment-hygiene.test.js` | Scans the quiz rendering source files' comments for real-looking names or cities instead of neutral placeholders |
| `quiz-daily-cap-school-day.test.js` | Pins quiz-daily-cap counting per SCHOOL_TIMEZONE day via one Redis Lua call, UTC fallback |
| `quiz-daily-cap.test.js` | Pins the per-teacher QUIZ_DAILY_CAP guard in generate: over-cap fails daily_cap before any model call |
| `quiz-equation-runs-katex.test.js` | Pins an Urdu stem's Latin-x equation rendering as one LTR expression on card and PDF with real KaTeX |
| `quiz-flow-endpoint.test.js` | Smoke test that quiz-flow-endpoint loads with infra mocked, exports three flow handlers, and is wired in flow-configs |
| `quiz-generation.test.js` | Pins quiz-generation.service question validation, option shuffling and the generate-then-store path on mocked openai |
| `quiz-intent-detector.test.js` | Pins isQuizIntent regex priors in quiz-intent.detector: head-noun and header-style positive matches and negatives |
| `quiz-intent-router-confirmation.test.js` | Pins promptQuizConfirmation in quiz-intent-router: topic extraction, stashed state and the two-button confirmation |
| `quiz-job-handler.test.js` | Pins workers/quiz-job-handler quiz job handling: cancel flag, cascade idempotency, re-queue and fire |
| `quiz-lesson-providers.test.js` | Pins the lp_generated and topic providers /quiz uses: plans listed, claimed by insert, topic rows, on schema-db |
| `quiz-math-equation-runs.test.js` | Pins spanEquations in quiz-math: prose equations become one LTR maths expression on card, text and PDF |
| `quiz-math-stacked-fractions.test.js` | Pins stackFractions in quiz-math: flat $2/3$ typesets stacked on card and PDF while text stays 2/3 |
| `quiz-menu.test.js` | Pins the /quiz teacher menu as one interactive list on every channel, with its rows and empty state |
| `quiz-prompt-untrusted-fence.test.js` | Pins that digest and author prompts fence lesson text and topics as data and cannot be closed early |
| `quiz-render-untrusted.test.js` | Pins that every lesson-quiz render (figure, card, PDFs, scorecard) runs html-to-pdf in untrusted mode |
| `quiz-report-template.test.js` | Pins quiz-report.template: full HTML, embedded Lexend/Nastaliq fonts, escaping and no leaked placeholders |
| `quiz-report-url-not-logged.test.js` | Pins QuizReportService.generateReport storing the presigned report URL but never logging it or its signature |
| `quiz-rtl-languages.test.js` | Pins quiz documents taking direction from isRTL in supported-languages, so Arabic and Pashto lay out RTL |
| `quiz-scheduler.test.js` | Pins quiz-scheduler.service school-hours window and next-school-hour selection |
| `quiz-session.test.js` | Pins quiz-session.service Redis state read, DB recovery, session-end transitions and post-quiz chat |
| `quiz-sources.test.js` | Pins quiz-sources constants and isLessonQuiz: transcript, lp_generated and topic are the lesson sources |
| `quiz-stacked-fractions-katex.test.js` | Pins flat $2/3$ rendering as a real KaTeX mfrac on card and teacher PDF; skipped without bot deps |
| `quiz-typeset-maths-katex.test.js` | Pins fractions as real KaTeX mfrac with inlined fonts on cards and the teacher PDF, in English and Urdu |
| `religious-marks.test.js` | Pins religious-marks checks: Prophet mentions carry the honorific, no Latin sacred names, title cut keeps it |
| `sqs-queue-quiz.test.js` | Pins sqs-queue.service queueJob routing quiz_* jobs to the quiz queue with DelaySeconds capped at 900 |
| `student-identity-key.test.js` | Pins student-identity.service keying non-phone channels on the full prefixed id, so two Slack users differ (F-S10) |
| `student-teacher-link.test.js` | Pins that a child is filed once under the teacher whose quiz first enrolled them, never reassigned |
| `teacher-artefact-type-floor.test.js` | Pins the shared TYPE_FLOOR in quiz-brand and the 18px body and 13.5px minimum on teacher PDF and report |
| `teacher-pdf-footer.test.js` | Pins that the teacher quiz PDF never ends on a page holding only its footer, sweeping stem length in Chromium |
| `teacher-pdf-summary-quoted-title.test.js` | Pins that the summary's first sentence survives a quoted lesson title containing ! or ? in the teacher template |
| `teacher-self-test-retire.test.js` | Pins resolveSelfTest retiring only a teacher's own stray child rows, never the children filed under them (F-S11) |
| `transcript-quiz-add-pictures-replace.test.js` | Pins that transcript-quiz-rewrite's add-pictures repair may replace a procedural question it cannot draw |
| `transcript-quiz-add-pictures.test.js` | Pins the add-pictures rewrite, the only one allowed to add a figure, and what code lets the model change |
| `transcript-quiz-adjacent-terms.test.js` | Pins transcript-quiz-adjacent-terms fixing two English terms side by side in an Urdu sentence reading backwards |
| `transcript-quiz-allow-multi.test.js` | Pins that the author asks for select-all-that-apply questions by default and QUIZ_ALLOW_MULTI=off stops it |
| `transcript-quiz-author-density.test.js` | Pins the author prompt's picture-density targets, model-role figures and lesson-plan manipulatives, absent elsewhere |
| `transcript-quiz-author-figure.test.js` | Pins the author prompt's figure contract being generated from the diagram engine's manifest, not hand-copied |
| `transcript-quiz-author-language-restated.test.js` | Pins the author prompt restating the quiz language so attempt 1 stops coming back in the wrong language |
| `transcript-quiz-author-pedagogy.test.js` | Pins the SLO-led author contract and that its GOOD/BAD table agrees with transcript-quiz-pedagogy's validator |
| `transcript-quiz-author-pictures-first.test.js` | Pins the grade 1-5 maths author prompt telling the model to draw on attempt 1 and write fractions stacked |
| `transcript-quiz-author-selected-because.test.js` | Pins the author emitting lesson_summary and per-question selected_because, and the validator accepting them |
| `transcript-quiz-author-short-summary.test.js` | Pins the author writing the one-sentence taught and checks lines stored for the teacher's pre-send sheet |
| `transcript-quiz-authoring-budget.test.js` | Pins that authoring attempts are not wasted on non-question faults and the last attempt targets repairable ones |
| `transcript-quiz-card-counter-source.test.js` | Pins that the question counter lives only on the card image, with no separate Question N of M bubble |
| `transcript-quiz-card-letters.test.js` | Pins that the card's A/B/C diamond letters match the picker's optionLetter in video-quiz-render.service |
| `transcript-quiz-card-number.test.js` | Pins that the question number in the chat chrome equals the number printed on the card header |
| `transcript-quiz-card.test.js` | Pins transcript-quiz-card rendering a whole question as one image when notation or length exceeds WhatsApp text |
| `transcript-quiz-child-address-forms.test.js` | Pins which Urdu child-address forms the gender check flags or leaves alone, and the repair it requests |
| `transcript-quiz-child-address.test.js` | Pins that an Urdu quiz never addresses the child in a gendered form, in author prompt and generate repair |
| `transcript-quiz-column-sum.test.js` | Pins column sums authored as one typeset KaTeX array in the stem, outside the figure engine |
| `transcript-quiz-digest-normalise.test.js` | Pins the digest's SLO statements going through the same transliteration fixer as the questions |
| `transcript-quiz-display-order.test.js` | Pins that option order is stored once so the card picture, buttons and teacher sheet show the same lettering |
| `transcript-quiz-distinct-questions-rule.test.js` | Pins the author being told eight questions must test eight different things, not only post-checked |
| `transcript-quiz-duplicate-and-lift.test.js` | Pins the rewrite prompt requiring distinct options and the cognitive-level lift for an all-recall lesson |
| `transcript-quiz-duplicate-questions.test.js` | Pins transcript-quiz-duplicates flagging a repeated question (DUPLICATE_QUESTION) in generate |
| `transcript-quiz-duplicates-blank-and-postposition.test.js` | Pins duplicate detection treating a fill-in-the-blank and a direct question on one fact as the same question |
| `transcript-quiz-early-years-gating.test.js` | Pins grade 1-5 lessons being drawable in every subject for the author prompt and the FIGURE_REQUIRED gate |
| `transcript-quiz-failure-reasons.test.js` | Pins truthful failure reasons for recording-born quizzes in the row and teacher message, not one shared sentence |
| `transcript-quiz-figure-adaptive-scale.test.js` | Pins the phone font scale as a per-figure ceiling swept over every example each diagram type ships |
| `transcript-quiz-figure-bar-labels.test.js` | Pins a fraction bar being labelled once, in the digits the stem uses, not value plus name |
| `transcript-quiz-figure-bar-parts.test.js` | Pins a fraction bar above 24 parts being drawn as 24 and rejected by the validator when that misleads |
| `transcript-quiz-figure-circle.test.js` | Pins fraction_bar model circle drawing n equal sectors with k shaded through the quiz lane's vendored lp-v9 engine |
| `transcript-quiz-figure-colour-injection.test.js` | Pins that an author-written colour cannot inject markup into the figure HTML, including Urdu foreignObject labels |
| `transcript-quiz-figure-count-mismatch.test.js` | Pins validator FIGURE_MISMATCH for count_objects counters that cannot produce the stem's answer |
| `transcript-quiz-figure-counts-zero-one.test.js` | Pins the drawing engine accepting counts of one and zero (empty set) for early-grade counting pictures |
| `transcript-quiz-figure-density-generate.test.js` | Pins the generate step running one add-a-picture repair on a grade 1-5 maths quiz with one picture, shipping either way |
| `transcript-quiz-figure-density-replace.test.js` | Pins the add-pictures repair replacing method-only fractions questions so the quiz still ends with three pictures |
| `transcript-quiz-figure-density.test.js` | Pins grade 1-5 maths picture density targets and FIGURE_REDUNDANT now allowing model-role pictures in the validator |
| `transcript-quiz-figure-dropped-text.test.js` | Pins detection of text the diagram engine silently drops (e.g. flow steps written with label, not title) |
| `transcript-quiz-figure-early-years.test.js` | Pins the early-years figure types (word_blank, count_objects, match, pictograms) through the vendored engine |
| `transcript-quiz-figure-equal-value.test.js` | Pins the validator rejecting a bar question whose options are equal values (2/8 and 1/4), both being right |
| `transcript-quiz-figure-eval6.test.js` | Pins fixes for three defects the first early-years author eval found, via pictograms, author and figure modules |
| `transcript-quiz-figure-frame.test.js` | Pins that a picture question's header figure is framed like other cards, not a bare white canvas |
| `transcript-quiz-figure-gate-wiring.test.js` | Pins that the validator calls the three lint gates and rejects figures with unreadable labels |
| `transcript-quiz-figure-gates.test.js` | Pins the lesson-plan lint gates ported to the quiz canvas, with a box-based label-floor scale |
| `transcript-quiz-figure-generate.test.js` | Pins picture questions through generate: render, upload, row; no row without an upload, no double render |
| `transcript-quiz-figure-improper-bars.test.js` | Pins an improper fraction drawn as whole bars plus a part bar, never one bar with shaded above parts |
| `transcript-quiz-figure-labels.test.js` | Pins the validator rejecting a figure label that is neither a value nor a word from the question |
| `transcript-quiz-figure-language-labels.test.js` | Pins diagram-engine default captions following the quiz language, so an Urdu quiz has no English under a picture |
| `transcript-quiz-figure-manipulatives.test.js` | Pins the grade 1-5 maths manipulatives (counters, tiles, bundles, flats) the quiz can now draw |
| `transcript-quiz-figure-match-and-names.test.js` | Pins match figures taking handle letters from the engine and part names being passed through to the author |
| `transcript-quiz-figure-no-molecule.test.js` | Pins that molecule is not an allowed quiz figure type, since openchemlib is not installed |
| `transcript-quiz-figure-part-labels.test.js` | Pins that figure parts never use the card's option letters, and part names are phone-readable |
| `transcript-quiz-figure-phone-scale.test.js` | Pins withFontScale enlarging every figure so labels clear the floor on a 360px phone screen |
| `transcript-quiz-figure-science-wiring.test.js` | Pins the validator running the science-accuracy checks and rejecting figures that teach something false |
| `transcript-quiz-figure-science.test.js` | Pins the science-accuracy checks: element labels, chemical equation balance and cell asks, on the live renderer |
| `transcript-quiz-figure-smoke.test.js` | Smoke-renders every allowlisted figure type in both quiz languages through the quiz figure module's require path |
| `transcript-quiz-figure-validator.test.js` | Pins the five distinct FIGURE error strings of the validator and its single render returning the SVG |
| `transcript-quiz-figure-visible-subset.test.js` | Pins that a counters picture shows a subset only if that subset looks different, else FIGURE_MISMATCH |
| `transcript-quiz-figure.test.js` | Pins the figure module's four guards: type allowlist, render-and-overlap gate, answer-leak rule and storage |
| `transcript-quiz-gendered-generate.test.js` | Pins the end-to-end pipeline rejecting and repairing a gendered teacher summary (PEDAGOGY_GENDERED_TEACHER) |
| `transcript-quiz-gendered-teacher.test.js` | Pins PEDAGOGY_GENDERED_TEACHER and gender-neutral wording in author and digest prompts |
| `transcript-quiz-generate-claim.test.js` | Pins the generate step claiming its row before the first send so a redelivered job cannot double-run (F-S2/F-S3) |
| `transcript-quiz-generate.test.js` | Pins the generate step: author, validate, store, PDF, link, three paced teacher messages; idempotent per step |
| `transcript-quiz-handoff.test.js` | Pins transcript-quiz-handoff.service: the teacher PDF then a forwardable message with a channel-specific join line |
| `transcript-quiz-key-truth.test.js` | Pins that an answer key must be right by the subject, not by a classroom slip, using the proper-fraction fixture |
| `transcript-quiz-key-verify-empty-answers.test.js` | Pins that a blind solve or plan key check returning no usable answers is a failed check recorded as error |
| `transcript-quiz-key-verify-model.test.js` | Pins the blind solve running on its own registry model (quiz.keyVerify), billed and failed over separately |
| `transcript-quiz-key-verify.test.js` | Pins that a quiz never ships an answer key a blind solver disagrees with: key fix, drop or hold-back |
| `transcript-quiz-language-ask-list.test.js` | Pins the language ask falling back to a list when QUIZ_LANGUAGES exceeds Meta's three-button limit (F-S12) |
| `transcript-quiz-language-ask.test.js` | Pins the teacher's quiz-language ask: shown only with several QUIZ_LANGUAGES, generation waits for the answer |
| `transcript-quiz-language-config.test.js` | Pins QUIZ_LANGUAGES as a deployment setting driving the ask, the subject rule and when the teacher is asked |
| `transcript-quiz-language.test.js` | Pins the quiz language chosen in code by subject (QUIZ_SUBJECT_LANGUAGE), language lessons and lesson language |
| `transcript-quiz-late-soft-repair.test.js` | Pins a question written after the last repair pass (picture replacement) getting its own repair pass |
| `transcript-quiz-latin-name-repair.test.js` | Pins URDU_NAME_LATIN being repaired in place by one targeted rewrite, never a refusal |
| `transcript-quiz-latin-names.test.js` | Pins the validator recording a person's name written in Latin letters inside an Urdu quiz |
| `transcript-quiz-lesson-people.test.js` | Pins recording the people in a lesson and their Urdu-script names once, for digest and author |
| `transcript-quiz-lesson-source.test.js` | Pins resolveLessonSource: lesson plan text from plan_text, content JSON or PDF, or a topic, for plan and topic quizzes |
| `transcript-quiz-llm-registry-model.test.js` | Pins quiz passes taking their model from registry job quiz.transcript, ignoring a typo in TRANSCRIPT_QUIZ_MODEL |
| `transcript-quiz-llm-retry.test.js` | Pins transcript-quiz-llm completeJson retrying one malformed reply instead of failing the teacher's quiz |
| `transcript-quiz-llm-single-lane.test.js` | Pins every quiz LLM call going through llm-client getClientForModel with its own model id, no provider rewrite |
| `transcript-quiz-llm-tex-escapes.test.js` | Pins completeJson preserving TeX backslashes (\frac) in model JSON replies that are valid JSON escapes |
| `transcript-quiz-log-names.test.js` | Pins that complaint strings and label text logged by the authoring loop carry no person's name |
| `transcript-quiz-muhammad-is-a-name.test.js` | Pins religious-marks not demanding the Prophet honorific on a person who merely has the name Muhammad |
| `transcript-quiz-multi.test.js` | Pins select-all-that-apply questions end to end across author, card and generate, picture or no picture |
| `transcript-quiz-no-object-storage.test.js` | Pins cards and figures falling back to local disk with a file:// URL when R2 object storage is not configured |
| `transcript-quiz-nudge.test.js` | Pins transcript-quiz-nudge.service: configurable wait and threshold, school quiet hours, one nudge only |
| `transcript-quiz-offer.test.js` | Pins the post-report offer: one quizzes row per session, flag-gated, once per teacher, yes/no flip once |
| `transcript-quiz-part-names-prompt.test.js` | Pins prompts no longer teaching part names A, B, C and requiring person names in the quiz language |
| `transcript-quiz-pedagogy-wiring.test.js` | Pins pedagogy rules running on the real validate-retry-drop path, with the last attempt dropping bad questions |
| `transcript-quiz-pedagogy.test.js` | Pins transcript-quiz-pedagogy rules rejecting count-of-mentions, teacher-as-subject and only-one-child questions |
| `transcript-quiz-pupils.test.js` | Pins that children in the room are never the subject of a quiz question or option |
| `transcript-quiz-r4-live-fixes-2.test.js` | Pins fixes from a second live run: Urdu selected_because and misconceptions, and related author rules |
| `transcript-quiz-r4-live-fixes.test.js` | Pins fixes from an early live science run: digest SLO language matches one-language-per-document rule |
| `transcript-quiz-religious-recoverable.test.js` | Pins a companion-without-honorific complaint being repaired in place so Islamiyat lessons still make a quiz |
| `transcript-quiz-resolve-grade.test.js` | Pins the digest's grade overriding a stray lesson-plan grade hint when resolving the quiz grade |
| `transcript-quiz-rewrite-overflow.test.js` | Pins faults above the five-question rewrite limit being handled in batches instead of refused |
| `transcript-quiz-rewrite.test.js` | Pins the targeted rewrite before salvage so a quiz never ships short of eight questions |
| `transcript-quiz-rows.test.js` | Pins /quiz row layout helpers truncateWords, composeTitle and composeDescription in transcript-quiz-rows |
| `transcript-quiz-same-fact.test.js` | Pins the blind solver flagging questions that ask the same fact in other words, with repair |
| `transcript-quiz-ship-what-we-can.test.js` | Pins that a fault in one question, such as all-recall, does not fail the whole quiz when the rest is good |
| `transcript-quiz-strings.test.js` | Pins every transcript-quiz string in both languages, within WhatsApp code-point caps, with no gendered Urdu stems |
| `transcript-quiz-stuck-rows.test.js` | Pins rows stuck in generating being recovered when the queue refuses the job (F-S3) |
| `transcript-quiz-student-message.test.js` | Pins the forwardable class message carrying the join line each channel allows: wa link, or link plus code |
| `transcript-quiz-summary-truth.test.js` | Pins that the teacher sheet never presents a mistake made in class as what was taught in the summary lines |
| `transcript-quiz-tall-figure-card.test.js` | Pins square-ish figures (atom, circuit, graph) going on a full question card, not the height-bound header |
| `transcript-quiz-teacher-escaping.test.js` | Pins that every model- or teacher-written field on the teacher sheet and figure labels render as text, never markup |
| `transcript-quiz-teacher-figure-fonts.test.js` | Pins the teacher PDF drawing Urdu text inside figures (word_blank tiles) with an embedded Nastaliq font |
| `transcript-quiz-teacher-language.test.js` | Pins one stored teacher language deciding everything the teacher reads, with no fallback to transcript language |
| `transcript-quiz-teacher-multi-marks.test.js` | Pins the teacher PDF marking every correct option of a select-all question and skipping all of them for misses |
| `transcript-quiz-teacher-nograde.test.js` | Pins the teacher PDF hero line omitting the grade (name and date only) in the teacher template |
| `transcript-quiz-teacher-template.test.js` | Pins the teacher pre-send PDF template: embedded Nastaliq, RTL Urdu, isolated Latin runs, one card per question |
| `transcript-quiz-topic-follows-language.test.js` | Pins the quiz row topic and student message following the language the teacher chose, not the digest's |
| `transcript-quiz-typeset-maths.test.js` | Pins maths being typeset on pictures via quiz-notation and the author, never reaching a phone as TeX source |
| `transcript-quiz-unanswerable-group.test.js` | Pins the pedagogy rule not rejecting which-group-has-more questions that are core early-years maths |
| `transcript-quiz-urdu-fields-technical-terms.test.js` | Pins URDU_TEACHER_FIELDS tolerating technical terms so a fractions quiz is not refused after three attempts |
| `transcript-quiz-urdu-script-share.test.js` | Pins the quiz-level Urdu check counting words, not letters, so borderline ratios no longer fail all attempts |
| `transcript-quiz-validator.test.js` | Pins the pure transcript-quiz-validator enforcing the properties the author prompt asks for before rows are stored |
| `transcript-quiz-word-blank.test.js` | Pins word_blank figures not costing a child the question on grade 1-2 phonics lessons, via pictograms and author |
| `urdu-line-spacing.test.js` | Pins Nastaliq line spacing by measuring rendered ink so two lines never touch, using line-ink and pdf-layout helpers |
| `urdu-spacing-kill-switch.test.js` | Pins the QUIZ_URDU_SPACING_V2 opt-out restoring pre-spacing rendering on every quiz surface at render time |
| `vendor-lp-v9-licences.test.js` | Pins that the vendored lp-v9 engine ships Inter font SIL OFL text and a README crediting each third-party part |
| `vendor-lp-v9-no-subprocess.test.js` | Pins that the vendored diagram engine never spawns a process, since circuit specs are model-written |
| `vendor-lp-v9-residue.test.js` | Pins the vendored engine carrying no build-process notes or regional default currency |
| `video-quiz-ask-matches-reader.test.js` | Pins asking a lesson-quiz question as lettered text exactly where a typed letter is read as the answer |
| `video-quiz-binge-channel.test.js` | Pins the Watch more reply sending the video Flow only to Meta WhatsApp children, with a text fallback elsewhere |
| `video-quiz-class-card-names.test.js` | Pins a child's class card showing other children by first name and score only, never a family name |
| `video-quiz-class-card-window.test.js` | Pins the 24-hour WhatsApp window applying to the class card only for Meta WhatsApp children |
| `video-quiz-discord-long-options.test.js` | Pins the Discord driver passing long video-quiz option text in the 100-char select description |
| `video-quiz-driver-contract.test.js` | Pins that quiz code only calls methods every channel driver in the whatsapp.service facade has |
| `video-quiz-invite-notify-order.test.js` | Pins the invite comparison using the inviter's first completed run, not whichever row the database returns |
| `video-quiz-invite.test.js` | Pins video-quiz-invite.service: a child invites a friend and only first name and score cross between them |
| `video-quiz-join-flow-channel.test.js` | Pins the name-and-class join Flow opening only on Meta with STUDENT_JOIN_FLOW_ID and an English quiz |
| `video-quiz-join-guess-limit.test.js` | Pins per-sender Redis counting of wrong share codes and refusal after JOIN_GUESS_LIMIT misses |
| `video-quiz-join-invite.test.js` | Pins the class link being channel-aware: wa.me link or bot account plus code per the teacher's channel |
| `video-quiz-offer-share.test.js` | Pins the third offer choice minting the class link at once, so homework needs no solo run first |
| `video-quiz-region-gate.test.js` | Pins video quizzes being enabled per region through region_features video_quizzes_enabled |
| `video-quiz-render.test.js` | Pins the three-phase video quiz render contract encoding the operator's phone review rules |
| `video-quiz-report-class-escape.test.js` | Pins class text typed by children being HTML-escaped in the class report templates |
| `video-quiz-report-guidance.test.js` | Pins the report's what-to-do-tomorrow box using the quiz.videoReport LLM job with a deployment-neutral prompt |
| `video-quiz-report-insight.test.js` | Pins the class report naming what to reteach tomorrow with wrong-option evidence from video-quiz-report.service |
| `video-quiz-report-invited.test.js` | Pins friends invited by a child counting in the teacher's class report under the teacher's share code |
| `video-quiz-report-recipient.test.js` | Pins the class report going to the chat of the share code, not the shared quiz row |
| `video-quiz-report.test.js` | Pins the class report not firing seconds after the first join with 0 of 1 finished; timing and dedup causes |
| `video-quiz-share-code-region-gate.test.js` | Runs handleTextMessage to pin a share code in a region with video quizzes off still joining the lesson quiz (F-S13) |
| `video-quiz-share.test.js` | Pins share-code parsing and minting in video-quiz-share.service: precise parser, no false positive on chat |
| `video-quiz-slack-long-options.test.js` | Pins the Slack driver drawing option text from the row description when long video-quiz options are lettered A-D |
| `video-quiz-templates-brand.test.js` | Pins every rendered quiz picture taking BOT_NAME, ORG_NAME and the mark from config/branding, never a fixed brand |
| `video-quiz-typed-answer-gate.test.js` | Pins answerTypedLetter taking a text only when every gate holds, else returning false to normal handling |
| `video-quiz-typed-answer-handler.test.js` | Runs handleTextMessage and the real video-quiz service to pin the typed-letter step's flag-off behaviour |
| `video-quiz-typed-answer.test.js` | Pins parsing typed answers (B, b., 2, A C, a and c) on channels without buttons in video-quiz.service |
| `video-report-timing.test.js` | Pins the class report landing 12 hours after the first join, shifted out of quiet hours, and its wrong-answer wording |

## Who reads this (all, generated)
- env `CHANNEL_DRIVER` read at `tests/quiz/transcript-quiz-figure-frame.test.js:62:937e956c` · `tests/quiz/transcript-quiz-multi.test.js:90:937e956c` · `tests/quiz/transcript-quiz-r4-live-fixes.test.js:26:937e956c` · `tests/quiz/transcript-quiz-typeset-maths.test.js:147:937e956c` · `tests/quiz/video-quiz-binge-channel.test.js:32:82213df7` · `tests/quiz/video-quiz-typed-answer.test.js:101:6753e8e8`
- env `CLASS_CARD_ENABLED` read at `tests/quiz/quiz-render-untrusted.test.js:112:b8314f31` · `tests/quiz/video-quiz-class-card-names.test.js:44:b9f4f4ee` · `tests/quiz/video-quiz-class-card-window.test.js:52:b9f4f4ee`
- env `DEFAULT_PHONE_COUNTRY_CODE` read at `tests/quiz/student-identity-key.test.js:36:4e145ba9`
- env `QUIET_HOURS` read at `tests/quiz/video-quiz-join-invite.test.js:145:94e731c6`
- env `QUIZ_URDU_SPACING_V2` read at `tests/quiz/multi-question-card.test.js:56:c605dd16` · `tests/quiz/urdu-line-spacing.test.js:50:01417535`
- env `TRANSCRIPT_QUIZ_ENABLED` read at `tests/quiz/lesson-quiz-text-wiring.test.js:134:f2de6521` · `tests/quiz/video-quiz-typed-answer.test.js:102:91fdaf7d`

## Tests (all, generated)
- (none)

## Related (all, generated)
- docs: `bot/CLAUDE.index.md`? · `bot/scripts/setup/CLAUDE.index.md`? · `bot/shared/config/CLAUDE.index.md`? · `bot/shared/routes/CLAUDE.index.md`? · `bot/shared/services/CLAUDE.index.md`? · `bot/shared/services/cache/CLAUDE.md`? · `bot/shared/services/coaching/fidelity/CLAUDE.index.md`? · `bot/shared/services/messaging/CLAUDE.index.md`? · `bot/shared/services/queue/CLAUDE.index.md`? · `bot/shared/services/quiz/CLAUDE.index.md`? · `bot/shared/services/quiz/CLAUDE.md`? · `bot/shared/services/quiz/providers/CLAUDE.index.md`? · `bot/shared/services/quiz/providers/CLAUDE.md`? · `bot/shared/templates/CLAUDE.index.md`? · `bot/shared/templates/CLAUDE.md`? · `bot/shared/utils/CLAUDE.index.md`? · `bot/vendor/lp-v9/diagrams/CLAUDE.index.md`? · `bot/vendor/lp-v9/diagrams/CLAUDE.md`? · `bot/vendor/lp-v9/diagrams/lib/CLAUDE.index.md`? · `bot/vendor/lp-v9/diagrams/lib/CLAUDE.md`? · `bot/vendor/lp-v9/diagrams/types/CLAUDE.index.md`? · `bot/vendor/lp-v9/diagrams/types/CLAUDE.md`? · `bot/workers/CLAUDE.index.md`? · `tests/CLAUDE.index.md`? · `tests/CLAUDE.md`? · `tests/quiz/CLAUDE.index.md`? · `tests/quiz/CLAUDE.md`? · `tests/quiz/helpers/CLAUDE.index.md`? · `tests/quiz/helpers/CLAUDE.md`?
