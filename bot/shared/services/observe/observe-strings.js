/**
 * /observe user-facing strings.
 *
 * One function returns the full string set for a language (the
 * coaching-messages.js pattern), so every observe surface — acks, the edit
 * form, the debrief guide chrome, the teacher report — reads its copy from
 * here and a deployment can ship a translation without hunting through the
 * pipeline. English is the base pack; a language pack registered with
 * registerLanguagePack() overrides it key by key, so a missing translation
 * degrades to English and never crashes a flow.
 *
 * Copy is channel-neutral on purpose: it says "record the lesson on your
 * phone", never the name of one messenger, because the same words go out on
 * WhatsApp, Matrix, Slack and Discord. Placeholders: {name}, {fw} (the
 * observation framework's display name), {phone}, {date}, {fo} (the coach).
 */

const EN = {
  no_account: "Sorry, I couldn't find your account. Please send me any message first, then try /observe again.",
  capture_failed: "Sorry — something went wrong on my side while saving that observation. Your recording isn't lost. Please type /observe and send it again; if it keeps happening, tell your programme team.",
  // The coach re-sent a recording that was already analysed. A new recording is
  // asked for instead of re-sending the earlier report.
  capture_duplicate_recording: 'This classroom recording has already been analysed. Please send a new recording.',
  role_denied:
    '/observe is for the people who visit classrooms to coach teachers. 💛\n\n'
    + "If you're a teacher, I'm here for you — type \"menu\" to see what I can do.",
  onboard:
    'Welcome to coaching, my friend. 🌱\n\n'
    + "One thing before we begin: your job is not inspection — it's nurture. "
    + 'The teacher you visit is not someone to be supervised, but someone to help grow. '
    + 'You are someone they can trust: you listen, you show them what they did well — and then you help them see ONE small next step.\n\n'
    + 'Here is how /observe works:\n'
    + '1️⃣ Record the lesson on your phone and send me the audio\n'
    + '2️⃣ I send you the {fw} ratings, pre-filled — you check them and change anything you disagree with\n'
    + '3️⃣ I prepare a short guide for your conversation with the teacher; record that conversation and I will coach YOU on it\n'
    + '4️⃣ The teacher receives a warm report — never a score, never your private notes',
  capture_prompt:
    '🎙 Ready! In the classroom, record the lesson on your phone (all of it, or 10 to 40 minutes of it).\n\n'
    + "When you're done, send me the recording here. I'll listen and send you the {fw} ratings pre-filled for every indicator — you review them and change anything you disagree with.",
  audio_received:
    "🎧 Got the recording — thank you! I'm listening now and filling in the {fw} ratings. They will arrive here in 2–5 minutes.",
  capture_next_hint: "Record your next class whenever you like — when it arrives I'll ask which teacher it's for.",
  // Meta-only: the editable WhatsApp Flow's chrome (OBSERVE_FORM_FLOW_ID).
  flow_header: '{fw} — draft',
  flow_body: "I've pre-filled the {fw} form from your recording — every indicator has a rating, evidence and an improvement note. Open it, review, change anything you disagree with, then submit.",
  flow_button: 'Open the form',
  submitted_ack: '✅ Thank you! Your {fw} observation is saved, with your edits.',
  flow_terminal_refused: 'This observation was cancelled, so the form can no longer be submitted.',
  flow_already_finished: 'The ratings for this observation are already saved, so this form can no longer be changed.',
  // The published form's static copy (scripts/generate-observe-flow-json.js).
  // A published Flow is one document, so these are baked in at generation time.
  flow_screen_title: '{fw} review {n}/{total}',
  flow_screen_body: 'Part {n} of {total} — check each rating and note, and change anything you disagree with.',
  flow_evidence_label: 'Evidence',
  flow_evidence_help: '{id} — what was seen',
  flow_improve_label: 'To improve',
  flow_improve_help: '{id} — one next step',
  flow_next: 'Next',
  flow_submit: 'Submit observation',
  flow_success_title: 'Saved',
  flow_success_heading: 'Thank you! ✅',
  flow_success_body: 'Your {fw} observation is saved. The next step follows in the chat.',
  flow_done: 'Done',
  // The stepwise chat form (every channel; the Flow's stand-in).
  form_domain_header: '📝 *{fw} — {domain}* ({n} of {total})',
  form_teacher_line: 'Teacher: {name}',
  form_changed_mark: '(changed)',
  form_reply_hint:
    'Reply *ok* to keep these, or the number and a new rating ({min} to {max}) — e.g. *{example}*. You can change several at once: *1 3, 2 4*.',
  form_bad_indicator: 'That number is not on this list — pick an indicator from 1 to {count}.',
  form_bad_rating: 'Ratings go from {min} to {max}. Try again, e.g. *1 {max}*.',
  form_changes_count: 'You changed {count} rating(s) — the report uses yours.',
  form_ready_later: '📝 The ratings for your other observation are ready. Finish this debrief first, then type /observe and pick it from the list.',
  form_already_saved: '✅ Your ratings for this observation are already saved.',

  // ── Section B: did the lesson follow its plan? (observe-section-b.js) ────
  secb_header: '📋 *Section B — did the lesson follow its plan?* ({n} of {total})',
  secb_intro: 'I checked the recording against the lesson plan, move by move. A swap that keeps the move\'s purpose gets full credit. Check each verdict — the report uses yours.',
  secb_measured: 'Plan followed: {pct}% ({band})',
  secb_band_high: 'high',
  secb_band_partial: 'partly',
  secb_band_low: 'low',
  secb_mismatch: '⚠️ The recording does not look like this plan\'s lesson. If the wrong plan was picked, mark the moves *6* (can\'t tell).',
  secb_truncation: '⚠️ The recording may have stopped before the lesson did — check the last moves, you were in the room.',
  secb_reply_hint: 'Reply *ok* to keep these, or a move number (1 to {count}) and a verdict number — e.g. *5 1*. Several at once: *4 2, 5 3*.',
  secb_v_executed: 'As planned',
  secb_v_equivalent: 'Equal swap',
  secb_v_better: 'Better swap',
  secb_v_partial: 'Partly',
  secb_v_not_done: 'Not done',
  secb_v_cant_tell: "Can't tell",
  secb_bad_move: 'That move is not in this plan — pick a move from 1 to {count}.',
  secb_bad_verdict: 'Verdicts go from 1 to 6 (see the list under the moves). Try again, e.g. *5 1*.',
  secb_changes_count: 'You changed {count} plan verdict(s) — Section B uses yours.',
  secb_na_header: '📋 *Section B — lesson plan: not assessed*',
  secb_na_no_plan: 'No lesson plan was linked to this observation, so there was nothing to check the lesson against.',
  secb_na_no_plan_teacher_has_no_plans: '{name} has no lesson plan made with Rumi yet, so there was nothing to check the lesson against.',
  secb_na_no_plan_coach_said_no_plan: 'You said this lesson had no plan, so there was nothing to check it against.',
  secb_na_no_plan_no_answer: 'No plan was picked for this lesson, so there was nothing to check it against.',
  secb_na_no_plan_teacher_unknown: 'I did not know whose lesson this was when it arrived, so I could not offer their plans.',
  secb_na_no_timings: 'The plan was linked, but the transcript of this recording has no timings, so the moves could not be checked one by one.',
  secb_na_recording_unusable: 'The plan was linked, but the recording did not let me tell which planned moves happened.',
  secb_na_plan_unreadable: 'The plan was linked, but I could not read the plan itself (it has no text I can use).',
  secb_na_grader_failed: 'The plan was linked, but the move-by-move check could not run this time.',
  secb_na_consequence: 'Section B is left out of this observation and the teacher\'s report — it is not a zero.',
  secb_the_teacher: 'This teacher',
  // The plan question after a capture (observe-plan.service.js).
  secb_plan_body: '📋 Which lesson plan was this lesson taught from? I\'ll check the lesson against it, move by move (Section B).',
  secb_plan_button: 'Pick the plan',
  secb_plan_section: 'Their plans',
  secb_plan_none: 'No plan',
  secb_plan_none_desc: 'Skip Section B for this lesson',
  secb_plan_linked: '📋 Got it — Section B will check the lesson against "{topic}".',
  secb_plan_skipped: 'Okay — no plan for this lesson. Section B will be left out.',
  secb_plan_stale: 'That plan list is out of date. The observation goes on without it.',
  secb_plan_too_late: 'The ratings for this observation are already saved, so the plan can no longer be added.',
  secb_plan_regraded: '📋 I checked the lesson against "{topic}" — Section B is ready in the form.',
  // The kind version in the teacher's report. No number, ever (observe-teacher-report firewall).
  secb_teacher_title: 'Your lesson and its plan',
  secb_teacher_planned: 'What went as planned',
  secb_teacher_own_way: 'Done your own way — and it kept the purpose',
  secb_teacher_better: 'a stronger way to do it',
  secb_teacher_equivalent: 'it did the same job',
  secb_teacher_try: 'One thing to try next time',

  // ── Debrief entry points ──────────────────────────────────────────────────
  debrief_choice_body:
    'Next step: the debrief — a growth conversation with the teacher. 🌱\n\n'
    + "I'll prepare a short conversation guide for you — genuine praise, one reflective question, and ONE thing to improve. Are you ready to talk with the teacher now, or later?",
  btn_debrief_now: 'Debrief now',
  btn_debrief_later: 'Later',
  debrief_later_ack:
    "No rush at all. 💛 When you're ready to talk with the teacher, type /observe and pick that observation from the list.",
  list_body: 'You have observations waiting. Pick one to carry on where you left off, or start a new observation.',
  list_button: 'Choose',
  list_section_title: 'Pending debriefs',
  list_new_observation: '🎙 New observation',
  list_new_observation_desc: 'Start a new classroom observation',
  list_row_default_desc: 'Tap to start the debrief',
  list_send_desc_prefix: 'Send report to',
  list_send_default_desc: 'Send the report to the teacher',
  section_stage_a: '1️⃣ Complete the form',
  section_stage_b: '2️⃣ Do the debrief',
  section_stage_c: '3️⃣ Send the report',
  list_section_new: 'New',
  resume_desc_form: 'Ratings still to check — tap to open',
  resume_desc_retry: '⚠ It stopped — tap to run it again',
  resume_desc_wait: 'Analysis in progress — the ratings are coming soon',
  resume_retry_ack: "🔄 Restarted — I'll send the ratings as soon as they're ready.",
  resume_retry_exhausted: "I've run this one as many times as I can and it won't go through. Your recording is saved. If you still have the audio, send it again and I'll start a fresh observation.",
  resume_wait_ack: 'Still working on this one — the ratings will arrive soon.',

  // ── Who was observed (asked only when the capture was unbound) ────────────
  who_body: 'Which teacher did you observe? This keeps the report with the right teacher.',
  who_button: 'Pick teacher',
  who_section: 'Your teachers',
  who_other: 'Someone else',
  who_other_desc: 'Not in this list',
  who_ack: 'Thanks — noted {name}.',
  who_other_ack: 'No problem. You can type the name when you send the report.',
  who_stale: 'That list has expired. You can type the name when you send the report.',
  who_already_bound: 'This observation is already recorded for a teacher, so it was left as it is.',

  // ── Guided debrief ───────────────────────────────────────────────────────
  debrief_record_instruction:
    "When you're with the teacher: record your whole conversation on your phone 🎙 and send it to me — the guide stays right above while you record.\n\n"
    + "The recording is for YOU alone: I'll listen and give you feedback to grow as a coach. The teacher never sees it.",
  debrief_not_yours: "Sorry — that observation isn't yours, so I can't open its debrief.",
  debrief_already_done: '✅ That debrief is already done. Type /observe to start a new observation.',
  debrief_load_error: "Sorry, I couldn't load that observation right now. Please try again in a few minutes.",
  debrief_audio_received:
    "🎧 Got your debrief recording — thank you for trusting me with it! I'm listening now; feedback to help you grow as a coach arrives in a few minutes. This stays between us. 💛",
  debrief_too_short:
    "Sorry — I couldn't hear enough of the conversation in that recording. If the debrief is still going, record a longer stretch and send it over — the guide is still right above.",
  debrief_duplicate_recording: 'This debrief recording has already been analysed.',
  debrief_feedback_failed:
    "I received your recording but couldn't analyse it just now. Type /observe, pick that observation from the list, and record again — I'll listen fresh.",
  // Transcription failed (a provider outage, say). Told ONCE: the worker sweep
  // retries by itself, so the coach must NOT re-record.
  debrief_processing_failed:
    "I couldn't process this debrief recording yet. I'll keep retrying automatically — you don't need to re-record. If nothing arrives within an hour, open /observe and pick that debrief again.",
  debrief_media_gone:
    'This debrief recording is no longer available — the messaging service only keeps a recording for a limited time. Please record the debrief again and send it to me.',

  // ── Binding: whose recording is this? (multi-flight) ─────────────────────
  redirect_pick_teacher:
    "Let's start from the school so this reaches the right teacher. Pick the school, then the teacher — then send me the recording again.",
  bind_prompt_body: 'Got your recording. Whose observation is this? Pick below — your scheduled teachers are at the top.',
  bind_button: '📋 Pick the teacher',
  bind_section_title: 'Whose recording is this?',
  bind_row_visit_fallback: 'Scheduled observation',
  bind_row_other: 'Another teacher',
  bind_row_other_desc: 'Pick the school and teacher yourself',
  bind_row_debrief: '🎙 This is a debrief',
  bind_row_debrief_desc: 'Attach it to a waiting observation',
  bind_row_self_dc: 'My own lesson',
  bind_row_self_dc_desc: 'Get feedback on my own teaching',
  bind_row_not_obs: 'Not an observation',
  bind_row_not_obs_desc: 'Continue as a normal message',
  bind_ack: "✅ Attached to {name}'s observation — analysis has started.",
  bind_expired: 'That recording is no longer held. Please send it again.',
  bind_not_obs_ack: 'Okay — carry on as normal.',
  bind_dupe_ack: "I already have this recording ({name}) — it's in progress, no need to send it again.",
  bind_dupe_fallback_name: 'the same observation',
  bind_park_full: 'Answer the question above first — then send the next recording, so nothing gets lost.',
  bind_queued: "Got this recording too. Answer the question above first, then I'll ask about this one.",
  bind_debrief_pick_body: 'Which observation is this debrief for?',
  bind_debrief_pick_button: 'Pick one',
  bind_debrief_pick_section: 'Waiting for a debrief',

  // ── The /observe menu (pending work first, oldest at the top) ────────────
  menu_body: 'What would you like to do?',
  menu_body_pending: 'You have observations waiting — the oldest is at the top. Pick one to carry on where you left off, or start something new.',
  menu_section_pending: 'Waiting for you',
  menu_section_actions: 'Start',
  menu_schedule: '📅 My schedule',
  menu_schedule_desc: 'Your planned visits',
  menu_schedule_desc_count: '{n} planned · {overdue} overdue',
  menu_plan: '🗓 Plan a visit',
  menu_plan_desc: 'Pick a school, a teacher and a day',
  menu_more: 'More…',
  menu_more_desc: 'Show the next page',
  pend_row_fallback: 'Observation',
  pend_debrief_desc: 'Debrief to do',
  pend_send_desc: 'Report not sent yet',
  pend_unavailable: "Sorry — I can't open that step right now. Please try again in a few minutes.",
  resume_cancelled: 'That observation was cancelled, so there is nothing left to do for it.',

  // ── Visit picker: school → teacher → brief ───────────────────────────────
  pick_school_body_o: 'Which school are you visiting? Pick one.',
  pick_school_body_p: 'Plan a visit — which school?',
  pick_school_body_b: 'Whose recording is this? Pick the school first.',
  pick_school_button: 'Pick a school',
  pick_school_section: 'Your schools',
  pick_teacher_body_v: 'Which teacher at {school}?',
  pick_teacher_section_v: 'Teachers',
  pick_teacher_skip: 'Not listed — record',
  pick_teacher_skip_desc: "Record anyway — I'll ask who it was afterwards",
  pick_no_schools: "You don't have any schools on your list yet — your programme team can add them. You can still record a lesson: type /observe and send me the recording.",
  pick_no_teachers: 'No teachers are listed at {school} yet — your programme team can add them.',
  pick_stale: 'That list is out of date. Type /observe to start again.',
  brief_title: '📋 Visit brief — {name}',
  brief_school: '🏫 {school}',
  brief_last_focus: "🌱 Last time's focus: {focus}",
  brief_last_try: '👀 Look for: {try}',
  brief_last_strength: '✅ What was working: {strength}',
  brief_first_visit: "This is your first recorded observation of {name}. Get to know the class — watch for one thing that is working and one small next step.",
  brief_look_for_default: '👀 Look for: how the students take part, and one moment you can praise specifically.',
  brief_footer: 'This is guidance for your visit — not a grade.',
  brief_record: "🎙 When you're ready, record the lesson on your phone and send it to me — it goes straight to {name}'s observation.",

  // ── Scheduling ───────────────────────────────────────────────────────────
  date_body: 'When will you visit {name}? Pick a day, or type a date.',
  date_button: 'Pick a day',
  date_section: 'School days',
  date_type_row: 'Type a date',
  date_type_desc: 'Send it as YYYY-MM-DD',
  date_type_prompt: 'Type the date of the visit as YYYY-MM-DD (for example {example}).',
  date_invalid: "That doesn't look like a date I can use. Please type it as YYYY-MM-DD, today or later (for example {example}).",
  date_saved: '📅 Saved — you will visit {name} on {date}. You will find it under "My schedule" in /observe.',
  date_moved: '📅 Moved — your visit with {name} is now on {date}.',
  date_failed: "Sorry — I couldn't save that visit just now. Please try again.",
  sched_empty: 'You have no visits planned. Type /observe and pick "Plan a visit" to add one.',
  sched_body: 'Your planned visits — overdue ones are at the top. Pick one to start, move or cancel it.',
  sched_button: 'My visits',
  sched_section: 'Planned visits',
  sched_overdue_tag: 'overdue',
  sched_action_body: 'Your visit with {name} on {date}. What would you like to do?',
  btn_sched_start: 'Start observation',
  btn_sched_move: 'Change the date',
  btn_sched_cancel: 'Cancel visit',
  sched_cancelled: '🗑 The visit with {name} is cancelled.',
  sched_gone: 'That visit is no longer on your schedule.',

  // ── Capture ack buttons + cancel ─────────────────────────────────────────
  btn_cancel_obs: 'Cancel observation',
  btn_cancel_yes: 'Yes, cancel it',
  btn_back: 'Back',
  btn_open_form: 'Open the ratings',
  btn_retry_now: 'Run it again',
  btn_ok_wait: 'Okay',
  cancel_confirm_body: 'Cancel this observation? It will leave your list — the recording stays safe.',
  cancel_ack: '✅ Observation cancelled.',
  cancel_too_late: 'The report has already reached the teacher, so this observation can no longer be cancelled.',
  long_audio_no_state:
    "🎧 I received a long recording — but there's no observation waiting for you right now. If this was a lesson or debrief recording, type /observe first (and pick the right observation), then send it again.",
  watchdog_stalled_coach: "⚠️ The observation you recorded stopped partway and I couldn't restart it. Nothing is lost — your recording is saved. Send the audio again when you can and I'll start a fresh one.",

  // ── Coach-the-coach card ─────────────────────────────────────────────────
  coach_card_title: 'Strengths · growth · action plan',
  coach_card_eyebrow: 'Coaching Feedback',
  coach_card_value_eyebrow: 'The value you lived today',
  coach_card_subtitle: 'From your conversation with the teacher — between you and me only.',
  coach_card_wins_label: 'Strengths',
  coach_card_action_label: 'Action plan',
  coach_card_reflect_label: 'Ask yourself before next time',
  coach_card_try_label: 'Areas for growth',
  coach_card_closing: 'The choice is yours — you are the coach. 🌱',
  // The coaching value a card is anchored on (the model picks one, or none).
  coach_value_trust: 'Trust',
  coach_value_respect: 'Respect',
  coach_value_listening: 'Listening',
  coach_value_growth: 'Growth',
  coach_value_partnership: 'Partnership',
  guide_reflect_label: 'Ask this last',
  debrief_cancelled: 'This observation was cancelled, so its debrief can no longer be started.',
  // The no-LLM debrief guide (used whenever the generated one fails a gate).
  // {strength}, {focus} and {try} come from the coach's own edited analysis.
  guide_fb_intro: 'Your conversation guide — about 15 minutes. Strengths first, then ONE move.',
  guide_fb_step1_title: 'Open with intent',
  guide_fb_step1_body: 'Thank the teacher for having you in the classroom.',
  guide_fb_step1_say: 'Thank you for having me — I am here so we can help each other, for the children.',
  guide_fb_step2_title: 'Praise with evidence',
  guide_fb_step2_body: 'Name one real thing you saw.',
  guide_fb_step2_say: 'I loved this moment: {strength}',
  guide_fb_step3_title: 'One question, then wait',
  guide_fb_step3_body: 'Ask, then stay silent for 30 to 60 seconds — do not fill the silence.',
  guide_fb_step3_say: 'In your own view, how did the lesson go?',
  guide_fb_step4_title: 'One thing to improve',
  guide_fb_step4_body: 'Just one area: {focus}. Offer it as an invitation — the move, never the person.',
  guide_fb_step4_say: 'How about trying this tomorrow: {try}',
  guide_fb_step5_title: 'Their own if-then',
  guide_fb_step5_body: 'Let the teacher say the plan in their own words.',
  guide_fb_step5_say: 'Tomorrow, when exactly will you try it? Say it in your own words.',
  guide_fb_step6_title: 'Agree the return',
  guide_fb_step6_body: 'Agree a day to look at it together again.',
  guide_fb_step6_say: "Let's look at it together again this week — which day suits you?",
  guide_fb_outro: 'No number to hand over — one true strength and one move to try together. 💛',
  guide_fb_default_strength: 'one good thing you saw in the classroom',
  guide_fb_default_focus: 'one area to improve',
  guide_fb_default_try: 'one concrete move for tomorrow',
  // The harm gate: the coach belittled the teacher. Honest, not congratulatory.
  coach_concern_opener:
    "I listened to your conversation. There's one thing I have to be honest with you about — because I'm on your side, and because this teacher depends on you. 💛",
  coach_concern_title: 'Something worth naming',
  coach_concern_closing:
    "I'm not writing this to judge you. Every coach gets this wrong sometimes, and the best ones are the ones who can hear it and change. We start again tomorrow. 🌱",

  // ── Teacher picker + report delivery ─────────────────────────────────────
  pick_teacher_body: 'Who should receive the report? Pick a teacher from your list, or add a new one.',
  pick_teacher_button: 'Pick a teacher',
  pick_teacher_section: 'Your teachers',
  pick_teacher_new: '➕ New teacher',
  pick_teacher_more: 'More teachers…',
  pick_teacher_new_desc: 'Type the name and phone number',
  send_choice_body:
    "Last step: sending the teacher their report — the {fw} report plus notes from your conversation. You'll see it first before anything is sent. Shall we?",
  btn_send_report: 'Send report',
  btn_send_later: 'Later',
  send_later_ack: "No problem. 💛 When you're ready, type /observe and pick that observation — you'll see the send-report option (📨).",
  send_ask_details: "Tell me the teacher's name and phone number — one message.\n\nExample: *Sam Taylor, +1 555 010 0123*",
  send_details_reask:
    "Sorry, I didn't catch that. Please send the name AND the phone number together, with the country code.\n\nExample: *Sam Taylor, +1 555 010 0123*",
  send_preview_coming: "Got it — {name} ({phone}). I'm preparing the report now; you'll see it FIRST before anything is sent. 1–2 minutes. ⏳",
  send_confirm_body: 'Above is the exact report the teacher will receive — the {fw} report plus your debrief notes. Send it now?',
  btn_send_now: 'Send now',
  btn_send_cancel: 'Cancel',
  btn_send_other: 'Someone else',
  send_delivering: "📨 Sending the report to the teacher now. I'll confirm once it lands.",
  send_cancel_ack: 'Okay — nothing was sent. If you change your mind, type /observe and pick that observation.',
  send_already_sent: "✅ That observation's report has already been sent to the teacher.",
  send_waiting_tap_info: '📨 The report is ready — the invitation went to {name} ({date}). No tap yet; the report is delivered automatically the moment the invitation is tapped.',
  send_done_fo: '✅ The report reached the teacher. Beautiful coaching work! 🌱',
  // Delivery failed on the worker — surfaced to the coach, never silent.
  send_failed_fo: "⚠️ Sorry — the report couldn't be sent to the teacher just now. Type /observe, pick that observation, and try sending again (📨).",
  send_template_queued_fo:
    "📨 The teacher hasn't messaged me recently, so I sent them an invitation — one tap and the report arrives. I'll let you know.",
  send_operator_review_fo: '🔎 The report went to your programme team for a final check. Once approved, it reaches the teacher.',
  send_tapped_fo: '✅ {name} has opened the report.',
  send_nudged_fo: '🔔 {name} has not opened the report yet — I have sent one reminder.',
  send_gave_up_fo: '{name} has not opened the report. I will not send more reminders — have a word, then send it again from /observe.',
  // The report was never SENT — distinct from the line above, where it was sent
  // and not opened. Different state, different next step.
  send_undelivered_reminder_fo:
    "📨 {name}'s report is ready but has not been sent yet. Open /observe, pick that observation, and tap Send — it is one tap.",
  send_undelivered_gave_up_fo:
    "{name}'s report still has not been sent, so I will stop reminding you about it. You can still send it any time from /observe.",
  send_not_yours: "Sorry — that observation isn't yours, so I can't send its report.",
  send_confirm_stale: 'That preview is out of date, so nothing was sent. Use the buttons on the newest preview, or type /observe and pick that observation.',
  send_session_closed: 'That observation was cancelled, so its report can no longer be sent.',
  send_pick_stale: 'That list has expired. Type /observe and pick the observation again to send its report.',
  // Meta only: the teacher is outside the 24-hour window and no invite template is set up.
  send_window_closed_fo:
    "⚠️ The teacher hasn't messaged me recently, so I can't send the report to them directly yet. Ask them to send any message to this number, then send it again from /observe (📨).",
  send_preview_failed_fo:
    "⚠️ Sorry — I couldn't prepare the report preview just now. Nothing was sent to the teacher. Type /observe, pick that observation, and try again (📨).",
  send_undelivered_unnamed_teacher: 'The teacher',
  report_review_header: '🔎 For review — to: {name} ({phone}) · from: {fo}',
  report_text_strengths_label: 'What went well',
  report_text_fallback: 'Thank you for opening your classroom. Your coach will follow up with you about the lesson.',
  report_caption_teacher: "Your lesson report 🌱 Prepared from {fo}'s visit — with notes from your conversation together.",
  companion_from_label: 'From',
  companion_commitment_label: 'Your commitment',
  companion_closing: 'We are proud of your work. We are with you. 💛',
  leader_registered_welcome:
    "You are registered as a coach. 🌱 When you are ready to visit a teacher's classroom, type /observe — I will help you observe the lesson, prepare the coaching conversation, and send the teacher their report.",
};

const PACKS = { en: EN };
const merged = new Map();

/**
 * Add (or replace) a language pack. Keys missing from the pack fall back to
 * English, so a partial translation is safe to ship.
 * @param {string} lang  ISO code, e.g. 'sw'
 * @param {object} strings  key → copy, same keys as the English pack
 */
function registerLanguagePack(lang, strings) {
  PACKS[lang] = strings || {};
  merged.delete(lang);
}

/** Every language with a registered pack (English always included). */
function availableLanguages() {
  return Object.keys(PACKS);
}

/**
 * @param {string} lang
 * @returns {object} the string set for lang, English key by key where missing
 */
function observeStrings(lang) {
  if (!lang || lang === 'en' || !PACKS[lang]) return EN;
  if (!merged.has(lang)) merged.set(lang, { ...EN, ...PACKS[lang] });
  return merged.get(lang);
}

/**
 * The language a user's observe surfaces render in: their preferred language
 * when a pack exists for it, else English.
 */
function observeLang(user) {
  const l = user && user.preferred_language;
  return l && PACKS[l] ? l : 'en';
}

/** Fill {placeholders}; unknown ones are left as-is so a gap is visible, never "undefined". */
function fill(template, vars = {}) {
  return String(template || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m));
}

/** Display name of the active observation framework, for the {fw} placeholder. */
function frameworkLabel() {
  // eslint-disable-next-line global-require -- lazy: strings stay cheap to load
  const { getObservePack } = require('./observe-framework');
  const key = getObservePack().key;
  return { teach: 'TEACH', hots: 'HOTS', mewaka: 'MEWAKA' }[key] || key.toUpperCase();
}

/** observeStrings(lang)[key] with {fw} and any vars filled. */
function t(lang, key, vars = {}) {
  return fill(observeStrings(lang)[key], { fw: frameworkLabel(), ...vars });
}

module.exports = {
  observeStrings, observeLang, registerLanguagePack, availableLanguages, fill, t, frameworkLabel,
};
