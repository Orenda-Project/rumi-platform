# Teaching Urdu decoding + encoding through آدھی اشکال (aadhi ashkaal / half-forms) — a focused deep-dive

## Contents

- TL;DR (the decided calls)
- Part I — What aadhi ashkaal ARE, precisely
- 1.1 The four positional forms (اشکال)
- 1.2 Which letters have distinct half forms — and which DON'T (the non-joiners)
- 1.3 How half-form + full-form combine into a ligature (لگیچر)
- Part II — How the قاعدہ (Qaida) tradition teaches this, and whether it's evidence-aligned
- 2.1 The classic Qaida sequence
- 2.2 Is this evidence-aligned with modern decoding science? — Yes, precisely
- Part III — The cognitive science: why positional-form + ligature automaticity IS the decoding engine
- 3.1 Letter-form knowledge is the top predictor — and it must automatize
- 3.2 The bottleneck the child must break: letter-by-letter → chunk-by-chunk
- 3.3 Decoding vs. encoding — one mapping, two directions
- Part IV — How to TEACH decoding + encoding via aadhi ashkaal in a 25–30 min lesson
- Part V — Grade progression for joining / decoding / encoding
- Part VI — DELIVERABLE A: recommended aadhi-ashkaal decoding + encoding scope & sequence (G1–3 focus)
- Part VII — DELIVERABLE B: what `arkaan_saazi` and `takhleeqi_likhai` MUST contain (exact drill sequence)
- `arkaan_saazi` (letter-formation / حروف سازی) — the DECODE + JOIN engine
- `takhleeqi_likhai` (creative writing / تخلیقی لکھائی) — the ENCODE engine
- Part VIII — DELIVERABLE C: is our current Urdu division/enrichment configured for this? What to add
- Part IX — DELIVERABLE D: grade-level targets for joining / decoding fluency
- Sources

---

**Status:** deep-dive extension of [`urdu_literacy_science.md`](urdu_literacy_science.md). Zooms into the ONE mechanism the operator named as the engine of Urdu blending: **aadhi ashkaal — the joined/reduced ("cut") letter shapes that let Urdu letters fuse into ligatures and words.** Decides what `arkaan_saazi` (letter-formation) and `takhleeqi_likhai` (encoding) must contain to teach it, and whether our current division/enrichment is configured for it.
**Operator framing (the thesis this builds on):** *"In English the alphabet letters don't change; in Urdu they have aadhi ashkaal (cut versions) that help one blend them."* So aadhi ashkaal **are** Urdu's blending mechanism — the analogue of English CVC blending, but structurally harder, because in English blending changes only the *sound stream* while the letter glyphs stay constant, whereas in Urdu the child must **also transform the glyph** (full form → half form) as they blend.
**Last verified:** 2026-08-01.

---

## TL;DR (the decided calls)

1. **Aadhi ashkaal are not a spelling curiosity — they are the decoding engine of Nastaliq.** A letter is one *phoneme* but up to *four glyphs* (initial/ابتدائی, medial/درمیانی, final/آخری, isolated/مفرد). The "half forms" are the **initial + medial** shapes — the reduced, connecting versions a letter takes when it is NOT standing alone. Reading Urdu = recognising a letter across all four disguises; writing Urdu = *producing* the right disguise. This visual-transformation load is exactly why **Rapid Automatized Naming and letter-form knowledge predict Urdu/Arabic reading more heavily than they predict reading in Latin scripts** ([PMC — Predictors of Reading in Urdu](https://pmc.ncbi.nlm.nih.gov/articles/PMC4303915/); [Frontiers — visual attention & Arabic reading](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2025.1628051/full)).
2. **The Qaida already teaches this the right way — its جوڑ / توڑ (join / break) drills ARE evidence-aligned decoding+encoding practice.** توڑ = breaking a word into its letters (segmentation, the decoding sub-skill); جوڑ = joining letters into a word (blending, the encoding sub-skill). This is the same segment↔blend loop the Science of Reading calls the core of the alphabetic principle — the Qaida just runs it on *glyphs that change shape*, which is harder and therefore needs MORE reps, not fewer.
3. **The two non-negotiable Urdu-specific facts:** (a) the ~10 **non-joiners** (ا د ڈ ذ ر ڑ ز ژ و — and standalone ں/ے at word-end) have **no left-joining half form** — they connect only to the right, then force a break, which is what visually splits a word into ligature-groups; a child who doesn't internalise this cannot parse where one "chunk" ends and the next begins. (b) The half-form ↔ full-form correspondence must be taught as a **same-letter identity** ("this ﺑـ and this ب are the *same letter* بے") — the single most common early failure is treating the four shapes as four different letters ([IdeazSuper — Adhi Ashkal worksheets](https://ideazsuper.com/worksheet/adhi-ashkal-cut-and-paste-worksheets/); [r12a — Urdu orthography notes](https://r12a.github.io/scripts/arab/ur)).
4. **Encoding is where aadhi ashkaal is hardest and most neglected.** Decoding = "I see ﺑـ, I know it's بے." Encoding = "I hear /b/ at the start of a word, so I must WRITE the *initial* half-form ﺑـ, not the isolated ب." A child can often read a joined word yet write it as a string of disconnected isolated letters — the write-side twin of the read-side failure. **املا (dictation) that demands the correct *connected* form is the only drill that trains this**, and it is the likeliest hole in a textbook lesson.
5. **Our division is ~70% configured for this and needs two precise additions** (§7): `arkaan_saazi` currently names "all 4 positional forms + dot-discrimination + aeraab" but does **not** name an explicit **جوڑ/توڑ (join/break) production drill** or the **non-joiner break rule**; `takhleeqi_likhai`'s املا tier does **not** yet require the **connected-form-correctness** check. Add both as named enrichment elements.

---

## Part I — What aadhi ashkaal ARE, precisely

### 1.1 The four positional forms (اشکال)

Urdu (Nastaliq) is a **cursive, right-to-left, connected** script of ~38–40 letters. Unlike the Latin alphabet — where `b` is `b` whether it stands alone or sits inside `cab` — **most Urdu letters take up to four shapes depending on where they sit in the connected run** ([UNC — The Urdu Alphabet: Writing](https://urdualphabet.unc.edu/introduction/writing/); [Arab Academy — forms of Arabic letters](https://www.arabacademy.com/the-different-forms-of-arabic-letters-and-how-they-come-together/)):

| Form | Urdu name | Joins… | This is a "half form"? |
|---|---|---|---|
| **Isolated / مفرد (detached)** | standing alone, no neighbours | neither side | No — the full/citation shape |
| **Initial / ابتدائی** | first letter of a joined run | to the LEFT only | **Yes** — reduced, opens the ligature |
| **Medial / درمیانی** | inside a joined run | BOTH sides | **Yes** — the most reduced, often just a "tooth"/شوشہ |
| **Final / آخری** | last letter of a joined run | to the RIGHT only | Partly — often keeps a full tail/flourish |

**"Aadhi ashkaal / half forms" = the initial and medial shapes** — the *reduced, connecting* versions. They are called "half" (آدھی) because the letter's full body is clipped down to the minimal connecting stub (its شوشہ / shosha — the little tooth that carries the dots and the join) so it can fuse smoothly into the next letter. The UNC grammar puts it exactly: *"Most letters have a recognizable 'core' that is common to all of the letter's possible shapes"* — but *"some letters have no 'core' and occur in forms that seem to have no relation to each other"* ([UNC](https://urdualphabet.unc.edu/introduction/writing/)). Those latter, low-transparency letters (e.g. the ع / ہ / ی families, whose medial forms look nothing like the isolated form) are the hardest half-forms to acquire and deserve extra reps.

Worked example — the word **بتا** ("tell"):
- **ب** initial half-form ﺑـ (just a tooth + one dot below) + **ت** medial half-form ـتـ (tooth + two dots above) + **ا** final (alif, a non-joiner, so it stays a full vertical stroke and closes the run).
- One phoneme string /b-a-t-aa/; three *different* glyph shapes from the three letters' isolated citation forms. The child who only ever met **ب ت ا** on flashcards has met none of the shapes that actually appear in بتا.

The [Frontiers Arabic-reading study](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2025.1628051/full) quantifies the cost: these positional variants mean the script carries **"over one hundred variations"** (allographs) for 28 base letters, and *"a large share of attentional resources is required for the parallel, fine-grained processing of the multiple visual features of Arabic letters."* Urdu, with its extra retroflex/aspirated letters and Nastaliq's steeper, stacked baseline, sits at the hard end of this.

### 1.2 Which letters have distinct half forms — and which DON'T (the non-joiners)

The pivotal structural fact for blending. Most letters connect on **both** sides and therefore have all four shapes. But a fixed set of letters — the **non-joiners / حروفِ منفصل** — connect **only to the letter on their right and never to the letter on their left**. They therefore have **no left-joining half form**: after a non-joiner, the pen lifts and the next letter *restarts* in its initial form ([r12a — Urdu orthography](https://r12a.github.io/scripts/arab/ur); [Arab Academy](https://www.arabacademy.com/the-different-forms-of-arabic-letters-and-how-they-come-together/), which notes six such letters in core Arabic: ا د ذ ر ز و).

The Urdu non-joiner set (the operator's list) is:

> **ا · د · ڈ · ذ · ر · ڑ · ز · ژ · و** (plus word-final ں and ے, which don't lead into a further join)

Why this matters more than any other single rule: **the non-joiners are where a word visually breaks into its ligature-groups.** A fluent reader parses Urdu not letter-by-letter but chunk-by-chunk, and the chunk boundaries are set by these letters. Example — **دروازہ** ("door") breaks into **د‑ر‑وا‑زہ**: every one of د، ر، و is a non-joiner, so the word is a sequence of short broken runs, not one long ligature. A child who expects everything to connect will try to join across a non-joiner, mis-parse the chunk, and stall. So teaching aadhi ashkaal is inseparable from teaching *"these nine letters break the chain"* — the connecting rule and the breaking rule are one lesson.

| Letter class | Count (approx.) | Shapes | Role in blending |
|---|---|---|---|
| **Dual-joiners** (ب پ ت ٹ ث ج چ ح خ س ش ص ض ط ظ ع غ ف ق ک گ ل م ن ہ ی …) | ~28–30 | up to 4 (incl. initial + medial half-forms) | carry the ligature; most of the "half form" learning load |
| **Non-joiners** (ا د ڈ ذ ر ڑ ز ژ و) | 9 | 2 only (isolated + final-attached-on-right) | **break** the run into ligature-groups; no left half-form |
| **Special mandatory ligature** لا (lam+alif) | — | fused single glyph | the canonical "two letters become one shape" case (e.g. اسلام) ([r12a](https://r12a.github.io/scripts/arab/ur)) |

### 1.3 How half-form + full-form combine into a ligature (لگیچر)

A **ligature (لگیچر)** in Nastaliq is a connected run of letters written as one continuous, sloping stroke from the first letter's initial half-form, through medial half-forms, to a final form, broken only by non-joiners. The letters' cursive connecting shapes are called **شوشے (shoshas)** — as the USPTO Nastaliq-composition patent describes, these *"may either comprise a representative part of a whole character shape or their shape may be altogether different from a character they represent"* ([USPTO — Nastaliq computer composition](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/4680710)). Nastaliq compounds the difficulty: *"glyphs are more drawn out, the baseline tends to be sloping from word to word, and there are significant extensions of ascenders and descenders"* ([r12a](https://r12a.github.io/scripts/arab/ur)) — i.e. the same ligature can sit at different heights and slopes, so the child must recognise the half-form *shape* independent of its position on the sloping baseline. This is the visual-attention tax the cognitive science measures (§3).

---

## Part II — How the قاعدہ (Qaida) tradition teaches this, and whether it's evidence-aligned

### 2.1 The classic Qaida sequence

The Urdu/Noorani Qaida — the near-universal foundational primer — teaches in a fixed, cumulative order that maps *directly* onto aadhi ashkaal ([Qaida method overview](https://learningquranonline.com/noorani-qaida-vs-other-qaida-methods-complete-comparison/); [Rasool Academy — Qaida Lesson 2, connected letters](https://rasoolacademy.com/qaida-noorania-lesson-2/); [eQuranSchool — Lesson 2, joining letters / huroof murakkabat](https://www.equranschool.com/online-noorani-qaida-for-kids/03.htm)):

1. **حروفِ تہجی — letter recognition** (isolated citation forms, with sound).
2. **آدھی اشکال / حروفِ مرکّبات — the half/compound forms + joining** (Qaida "Lesson 2", explicitly the longest and hardest lesson). *"When two or more letters are joined together they form a murakkab (compound)… when letters unite, their form is changed."* Students *"take 1 to 2 weeks of daily practice to recognise all letter variations (beginning, middle, and end) comfortably"* ([eQuranSchool](https://www.equranschool.com/online-noorani-qaida-for-kids/03.htm); [OnlineQuranTutor](https://onlinequrantutor.co.uk/how-noorani-qaida-helps-you-avoid-major-recitation-mistakes/)).
3. **حرکات / اعراب — vowel marks** (زبر/زیر/پیش…) layered onto the joined forms.
4. **جوڑ (join) → words → short pointed sentences.**

The **توڑ / جوڑ drill** is the beating heart of it: *"Choose [words] and break them into individual letters. Read each letter slowly, then join them"* ([OnlineQuranTutor](https://onlinequrantutor.co.uk/how-noorani-qaida-helps-you-avoid-major-recitation-mistakes/)). **توڑ (torna, "to break")** = take a written word and name its constituent letters in order (identify each half-form back to its citation letter). **جوڑ (jorna, "to join")** = take a sequence of named letters/sounds and produce/read the connected word.

### 2.2 Is this evidence-aligned with modern decoding science? — Yes, precisely

The جوڑ / توڑ loop is a **glyph-level implementation of the segment↔blend loop** that the Science of Reading identifies as the core of the alphabetic principle:

- **توڑ (break) = segmentation / decoding analysis.** The reader decomposes the visual ligature into its ordered letters — the read-side skill. It is the direct analogue of segmenting a spoken word into phonemes, run on *print*.
- **جوڑ (join) = blending / encoding synthesis.** The learner synthesises letters back into a connected word — the same "blend the sounds" move English phonics uses, except the learner must also produce the *connecting glyph transformation*.

Modern reciprocity research says segmenting and blending must be taught **together and reversibly** — decoding and encoding are two directions of one mapping, and practising both strengthens **orthographic mapping** (the process that turns effortful decoding into instant sight recognition) ([95 Percent Group — orthographic mapping](https://www.95percentgroup.com/insights/orthographic-mapping-the-key-to-building-strong-readers/); [Lexia — orthographic mapping](https://www.lexialearning.com/blog/orthographic-mapping-connections-lead-to-literacy-success)). The Qaida's توڑ/جوڑ is *already* this reciprocal drill. **Verdict: keep the Qaida spine wholesale.** Its gaps are the same three the parent report named (print-free phonemic awareness; connected *decodable* text vs. word-lists; comprehension in parallel) — plus one aadhi-ashkaal-specific under-emphasis the modern lens adds: the Qaida drills توڑ/جوڑ mostly for *reading*; it rarely closes the loop with **encoding dictation where the child WRITES the correct half-form** (§6).

---

## Part III — The cognitive science: why positional-form + ligature automaticity IS the decoding engine

### 3.1 Letter-form knowledge is the top predictor — and it must automatize

The strongest single finding for our purposes: in beginning Arabic-script readers, **letter knowledge is the dominant predictor of reading fluency** — in the Frontiers study of 101 first-graders it *"accounted for 50% of variance in syllable reading and 32% in word reading"* ([Frontiers 2025](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2025.1628051/full)). And "letter knowledge" here means knowing the letter **across its positional forms**, not just its citation shape. Visual-attention span contributes to reading **only indirectly, through letter knowledge** (VAS explained 33% of variance in letter knowledge, which then predicted reading) — i.e. the visual work of the eye pays off *only* once it has resolved into secure letter-form identity.

For Urdu specifically, [Predictors of Reading in Urdu (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4303915/) finds **Rapid Automatized Naming is the strongest predictor of Urdu reading fluency and accuracy — stronger than in shallow Latin orthographies** — because *"many graphemes look similar or even identical and can only be discriminated by the presence of, the number of, or positioning of, dots"* and letters *"take different shapes by position."* This is the orthographic-depth hypothesis in action: **the deeper/visually-denser the script, the more decoding leans on fast, automatic visual letter-form processing.**

### 3.2 The bottleneck the child must break: letter-by-letter → chunk-by-chunk

Beginning Arabic-script readers adopt *"a letter-by-letter strategy"* because *"attentional resource-allocation bottlenecks"* stop them processing several letters at once; the researchers propose that **as letter recognition automatizes, a more direct visual contribution emerges, freeing attentional capacity for processing multi-letter units** ([Frontiers 2025](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2025.1628051/full)). Translated to our design: **the goal of aadhi-ashkaal drilling is to make each half-form so instantly recognisable that the child stops decoding letter-by-letter and starts reading whole ligature-chunks** — which is precisely fluency. Automaticity, not one-time correctness, is the target (this is why the parent report prescribes a *daily timed automaticity flash*, not a one-off worksheet).

### 3.3 Decoding vs. encoding — one mapping, two directions

| | **Decoding (print → sound)** | **Encoding (sound → print)** |
|---|---|---|
| The task | See ﺑـ inside a ligature → retrieve "بے /b/" | Hear /b/ at word-start → **produce the *initial* half-form ﺑـ**, connected, not the isolated ب |
| Aadhi-ashkaal demand | Recognise a letter across ≤4 disguises + know where non-joiners break the chunk | **Generate** the correct disguise for the letter's position + connect it correctly + lift the pen after a non-joiner |
| Failure mode | Reads the four shapes as four different letters; stalls at ligature chunk boundaries | Writes a word as a row of **disconnected isolated letters**; wrong dots; joins across a non-joiner |
| The drill that builds it | توڑ (break) + reading connected pointed decodable text | جوڑ (join) + **املا/dictation demanding the connected form** + تختی handwriting |

Encoding is the harder, more neglected half. Orthographic-mapping theory says spelling/encoding practice **feeds back into and strengthens reading** — writing the connected form forces the child to attend to every letter's identity, position, and dots, which is exactly the fine-grained processing that automatizes recognition ([95 Percent Group](https://www.95percentgroup.com/insights/orthographic-mapping-the-key-to-building-strong-readers/); [Lexia](https://www.lexialearning.com/blog/orthographic-mapping-connections-lead-to-literacy-success)). Arabic dictation research confirms encoding is a *distinct, harder* skill with its own cognitive load, especially the demand to produce the correct connected/positional form ([ScienceDirect — cognitive processes in Arabic dictation](https://www.sciencedirect.com/science/article/pii/S0001691825014325)). **This is the strongest argument for making connected-form املا a required, not optional, beat of every Urdu foundational lesson.**

---

## Part IV — How to TEACH decoding + encoding via aadhi ashkaal in a 25–30 min lesson

A fixed daily spine for an `arkaan_saazi`-type (foundational) lesson, drills sequenced from recognition → joining → connected reading → encoding. Each beat names the aadhi-ashkaal skill it builds.

1. **0–4 min — Automaticity flash (RAN engine, spaced).** Rapid-fire naming of half-forms in isolation and in mini-runs: show ﺑـ ـتـ ـسـ ﻣـ etc.; child names the letter + sound *fast*. **Spacing:** mix today's target letter with the last two lessons' letters + a "danger pair" of dot-confusables (ب/پ/ت/ٹ/ث; ج/چ/ح/خ). This is the single most predictive drill (§3.1); it must be *timed for speed*, not merely correct.
2. **4–8 min — New grapheme across ALL FOUR forms.** Ear first (hear/blend/segment the sound), then introduce the letter as **one identity with four costumes**: isolated ب → initial ﺑـ → medial ـبـ → final ـب, said aloud as *"the same letter بے, dressed differently."* Explicitly flag if it's a **non-joiner** ("this letter has no left costume — it always breaks the chain here").
3. **8–13 min — جوڑ (JOIN) drill: half-to-full building.** Give the isolated letters; child builds the connected form. Two modalities:
   - *Manipulative:* the classic **cut-and-paste "match the half-shape to the full shape"** activity ([IdeazSuper Adhi Ashkal worksheets](https://ideazsuper.com/worksheet/adhi-ashkal-cut-and-paste-worksheets/)) — child physically joins ﺑـ + ـتـ + ـا → بتا.
   - *Production:* child **writes** the join on ruled lines (this is where encoding starts). Start with 2-letter joins (juray huroof), add a non-joiner case so the "break" is trained from day one (e.g. بر → ب + ر, pen lifts after non-joiner ر).
4. **13–17 min — توڑ (BREAK) drill: word → letters.** Show a pointed decodable word; child **names each letter in order**, back from half-form to citation letter, and marks where the non-joiners break it into chunks. This is the read-side segmentation twin of beat 3.
5. **17–23 min — Connected decodable POINTED reading (`buland_khwani` beat).** Read a short passage restricted to *already-taught* letters + aeraab, fully pointed (با اعراب). Teacher models a sloping ligature → echo → choral → partner. This rehearses half-form recognition *in the sloping-baseline context* the flash cards can't give (§1.3). Re-read 3–4× (repeated reading) for fluency + orthographic mapping.
6. **23–30 min — املا / ENCODE the connected form (`takhleeqi_likhai` beat).** Teacher dictates the day's letters/words; child **writes them joined**, in the correct positional forms, with correct dots and non-joiner breaks. **The mark scheme is connected-form-correctness, not just "right letters":** a word written as disconnected isolated letters is *incorrect*, because the child has not encoded the ligature. This is the beat most textbook lessons omit and the one that most directly builds encoding.

**Spaced / retrieval mechanics threaded through:** the flash (beat 1) resurfaces prior letters on an expanding schedule (yesterday's + last-week's, not just today's); every 4–5 lessons a `duhrai` lesson does pure spaced retrieval of half-forms + high-frequency joined sight-words. Small-and-daily beats long-and-occasional — automaticity is the target (§3.2).

---

## Part V — Grade progression for joining / decoding / encoding

Anchored to the parent report's ASER-rung + cwpm ladder, specialised to the aadhi-ashkaal skill.

| Grade | Decode (read the half-forms) | Join / ligature skill | Encode (write the connected form) |
|---|---|---|---|
| **G1** | Recognise all letters across **all 4 positional forms**; dot-discrimination secure; know the 9 non-joiners break the chain. Read fully-pointed 2–4-letter joined words + 2–4-word strings. | جوڑ 2–3-letter runs incl. a non-joiner break; توڑ a short pointed word back to its letters. | تختی letter-formation in **all four positions**; **write joined 2–3-letter words** from dictation with correct dots + non-joiner breaks (connected-form-correct). |
| **G2** | Fluent chunk-by-chunk reading of fully-pointed short sentences/paragraph; **~30–50 cwpm**; multi-syllable joined words. | جوڑ/توڑ automatic on multi-syllable words + لا/کا-type mandatory ligatures. | Pointed **sentence** dictation, connected; copy a sentence legibly keeping ligatures intact. |
| **G3** | Read a short *story*; aeraab begins to fade (retained on new words); decode unfamiliar joined words by chunking. | Joining fully automatic incl. rarer medial forms (ع/ہ/ی families). | Sentence-level free writing; **paragraph املا**; spell common words connected without a model. |
| **G4** | Decode **near-unpointed** grade text at ligature-chunk speed; **~70–85 cwpm**. | Joining is invisible/automatic (no longer taught, only maintained). | Guided paragraph with correct joins + punctuation; encoding errors are now spelling-level, not ligature-level. |
| **G5** | Fluent unpointed reading; **≈90 cwpm** (proficient). | — (mastered) | Multi-paragraph composition, self-edits ligature/dot errors. |

**Headline targets:** joining/half-form recognition must be **secure by end-G1** and **automatic (fluent, un-thought) by end-G2** — because everything from G3 onward (fluency, comprehension, composition) assumes the child no longer spends attention resolving glyph shapes (§3.2). A G3+ child still decoding letter-by-letter has an unclosed G1–2 aadhi-ashkaal gap and needs the beats above re-taught, regardless of grade.

---

## Part VI — DELIVERABLE A: recommended aadhi-ashkaal decoding + encoding scope & sequence (G1–3 focus)

Slots into the existing **G1 Ch0 = قاعدہ Qaida primer (~25–32 LP)** and the `arkaan_saazi` chapters that follow.

| Phase | Where | Content (the aadhi-ashkaal spine) | Decode drill | Encode drill |
|---|---|---|---|---|
| **P0 · Sounds + isolated letters** | G1 Qaida primer, first ~8–10 LP | Print-free PA (Urdu آوازیں: hear/blend/segment) → letter citation forms + sound. | Ear blending; name isolated letter fast. | تختی: form the isolated letter; write own name. |
| **P1 · The four forms (aadhi ashkaal introduced)** | G1 Qaida primer, core ~10–14 LP (**the long lesson — budget most time here**) | Each letter's **initial/medial/final** half-forms as one identity; **dot-discrimination** on confusable families; **the 9 non-joiners flagged as chain-breakers**. | **Flash across all 4 forms** (timed); **توڑ** a pointed word to its letters. | **جوڑ by writing** 2–3-letter joins incl. a non-joiner break; cut-and-paste half→full match. |
| **P2 · Aeraab on joined forms + first words** | end G1 Qaida + early `arkaan_saazi` | زبر/زیر/پیش/جزم/شد/تنوین layered onto joined forms; blend CV/CVC pointed joined words. | Read fully-pointed joined words + 2–4-word strings; repeated reading. | **Connected-form املا** of pointed words (mark = ligature-correct). |
| **P3 · Fluent joining + sentences** | G2 `arkaan_saazi`/`buland_khwani` | Multi-syllable joins, mandatory ligatures (لا/کا); high-frequency joined sight-words. | ~30–50 cwpm on pointed paragraph; chunk-by-chunk. | Pointed **sentence** dictation, connected. |
| **P4 · Automatic joining, aeraab fading** | G3 | Joining automatic; rarer medial forms; begin unpointed decoding. | Story-level ~55–70 cwpm. | Paragraph املا; spell connected without model. |

---

## Part VII — DELIVERABLE B: what `arkaan_saazi` and `takhleeqi_likhai` MUST contain (exact drill sequence)

### `arkaan_saazi` (letter-formation / حروف سازی) — the DECODE + JOIN engine

Its enriched `generated` body must carry, in order, these **named elements** (the ones in **bold** are NOT yet named in our current enrichment spec — see §8):

1. **`ranFlash`** — timed automaticity flash of half-forms, **spaced** (today's + prior 2 lessons + a dot-confusable pair).
2. **`fourFormsIntro`** — the new letter shown in **all four positional forms** as one identity, said aloud; **`isNonJoiner` flag** set true for ا د ڈ ذ ر ڑ ز ژ و with the "breaks the chain" script.
3. **`dotDiscrimination`** — same-skeleton, count/place-the-dots drill on the letter's confusable family.
4. **`jorDrill` (JOIN / جوڑ)** — **build the connected form** from isolated letters, incl. ≥1 non-joiner-break case; both cut-and-paste (recognition) and write-it (production).
5. **`torDrill` (BREAK / توڑ)** — **decompose a pointed decodable word** into its ordered letters, marking non-joiner chunk boundaries.
6. **`aeraabBlend`** — sound the pointed joined syllable (بَ + تَ = بَتَ).
7. **`decodableReadout`** — read a 1–2-line fully-pointed passage restricted to taught letters (repeated ×3–4).

### `takhleeqi_likhai` (creative writing / تخلیقی لکھائی) — the ENCODE engine

Its foundational (non-creative) tier must carry:

1. **`takhtiFormation`** — تختی handwriting of the target letters **in all four positional forms** on ruled lines (stroke order, dot placement, non-joiner breaks) ([PSSR — Improving Urdu Handwriting](https://pssr.org.pk/issues/v5/2/improving-urdu-hand-writing-an-experimental-study.pdf)).
2. **`imlaConnected` (املا / dictation) — the load-bearing element.** Teacher dictates the day's letters/words; child **writes them JOINED**, correct positional half-forms + dots + non-joiner breaks. **`markScheme: "connected-form-correct"`** — a word written as disconnected isolated letters scores as incorrect (this is the encoding of the ligature, and is the whole point). 2–3 min, every foundational lesson.
3. **`oralToWrite`** (G3+) — say-then-write composition, stepped word → pointed sentence → paragraph.

---

## Part VIII — DELIVERABLE C: is our current Urdu division/enrichment configured for this? What to add

**Verified against the live config** (`SCOPE_AND_SEQUENCE_METHOD.md`, `CARRY_FORWARD.md` §"Evidence-based enrichment ELEMENTS" + `generated` schema, and `02_segmentation/grade_1_urdu_ch1_segments.json`).

**Already configured (good — keep):**
- The **7-type taxonomy is correct** and `arkaan_saazi` (حروف سازی) is the right home; **G1 Ch0 = قاعدہ Qaida primer (~25–32 LP)** is already the sequence's opening — the natural container for the P0–P2 aadhi-ashkaal spine above.
- `arkaan_saazi` already names *"print-free PA → grapheme with **all 4 positional forms** → **dot-discrimination drill** → aeraab → daily spaced automaticity flash."* That is beats 1–3 + 6–7 above. **The four-forms and RAN engine are already in the contract.**
- The Urdu envelope already carries **`diacriticsRequired` (true G1-3)** and **`scriptOnly`**, and the enrichment gate already requires **"+encode/decodable for English/Urdu."** Diacritics + decodable text + an encoding requirement are already mandated.
- `takhleeqi_likhai` is already assigned the **encoding tier (تختی + 2–3 min pointed املا every lesson)** in the research synthesis.

**The two precise gaps to add (this is the "what to add"):**
1. **Name the جوڑ / توڑ (join / break) production drills and the non-joiner rule explicitly in `arkaan_saazi`.** The current spec says "all 4 positional forms + dot-discrimination" — recognition — but does **not** name the **`jorDrill`/`torDrill`** (build/break) production loop or the **`isNonJoiner` chain-break rule**. Positional-form *recognition* without the *joining production* loop teaches the child to read the shapes but not to blend/segment across them — exactly the operator's point that aadhi ashkaal are the *blending mechanism*. **Add `jorDrill`, `torDrill`, `isNonJoiner` to the `arkaan_saazi` element list + the enrichment gate.**
2. **Make املا's mark scheme "connected-form-correct" in `takhleeqi_likhai`.** The current spec mandates "املا/dictation" but does **not** specify that the child must produce the correct **connected** form (vs. a string of isolated letters). Without this, dictation can pass while the ligature-encoding skill goes untrained. **Add `markScheme: "connected-form-correct"` to the `imlaConnected` element**, and require `takhtiFormation` to drill **all four positional forms**, not just isolated letters.

**Net:** the division is ~70% ready. Two named-element additions (join/break drills + non-joiner rule in `arkaan_saazi`; connected-form املا mark scheme in `takhleeqi_likhai`) close it. No new lesson TYPE, no schema restructure — these are enrichment-element + gate additions, consistent with the standing decision *"do NOT add types; enrichment ADDS the science-backed elements the textbook omits."*

---

## Part IX — DELIVERABLE D: grade-level targets for joining / decoding fluency

- **End G1:** recognises every letter across **all four positional forms**; dot-discrimination secure; knows the **9 non-joiners break the chain**; can **جوڑ** 2–3-letter joined words and **توڑ** them back; reads fully-pointed 2–4-word strings; **writes joined 2–3-letter words from dictation (connected-form-correct).** ASER rung 1→2.
- **End G2:** joining is **automatic** (no visible letter-by-letter decoding); **~30–50 cwpm** on a fully-pointed paragraph; connected **sentence** dictation. ASER rung 2→3. *(This is the gate: half-form automaticity must be done here, or G3+ fluency/comprehension is starved.)*
- **End G3:** reads a short story chunk-by-chunk, aeraab fading; **~55–70 cwpm**; paragraph املا connected without a model. ASER rung 3→4.
- **End G4:** near-unpointed decoding at chunk speed, **~70–85 cwpm**; encoding errors are spelling-level, not ligature-level.
- **End G5:** fluent unpointed reading, **≈90 cwpm** (proficient); self-edits ligature/dot errors in own composition.

---

## Sources

- [IdeazSuper — Adhi Ashkal (half forms) cut-and-paste worksheets](https://ideazsuper.com/worksheet/adhi-ashkal-cut-and-paste-worksheets/) · [IdeazSuper — Urdu Qaida worksheets (juray huroof / two-letter joining)](https://ideazsuper.com/urdu/)
- [r12a.io — Urdu orthography notes (positional forms, non-joiners, lam-alif ligature, sloping Nastaliq baseline)](https://r12a.github.io/scripts/arab/ur)
- [UNC — The Urdu Alphabet: Writing (four positional forms; letter "core" across shapes)](https://urdualphabet.unc.edu/introduction/writing/)
- [Arab Academy — The different forms of Arabic letters and how they come together (4 forms; 6 non-connectors)](https://www.arabacademy.com/the-different-forms-of-arabic-letters-and-how-they-come-together/)
- [USPTO — Computer composition of Nastaliq script (shoshas; character shapes altered on joining)](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/4680710)
- [eQuranSchool — Noorani Qaida Lesson 2: joining letters / huroof murakkabat (form changes on joining; 1–2 wks to master beginning/middle/end)](https://www.equranschool.com/online-noorani-qaida-for-kids/03.htm) · [Rasool Academy — Qaida Lesson 2, connected letters](https://rasoolacademy.com/qaida-noorania-lesson-2/) · [OnlineQuranTutor — break words into letters then join (توڑ/جوڑ)](https://onlinequrantutor.co.uk/how-noorani-qaida-helps-you-avoid-major-recitation-mistakes/) · [Qaida methods comparison](https://learningquranonline.com/noorani-qaida-vs-other-qaida-methods-complete-comparison/)
- [Frontiers (2025) — The influence of visual attention on letter recognition and reading acquisition in Arabic (LK = 50%/32% variance; VAS indirect via LK; 100+ allographs; letter-by-letter bottleneck → automatization)](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2025.1628051/full)
- [PMC — Predictors of Reading in Urdu: does deep orthography have an impact? (RAN top predictor; dot/position discrimination load)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4303915/)
- [95 Percent Group — Orthographic mapping: the key to building strong readers](https://www.95percentgroup.com/insights/orthographic-mapping-the-key-to-building-strong-readers/) · [Lexia — What is orthographic mapping?](https://www.lexialearning.com/blog/orthographic-mapping-connections-lead-to-literacy-success)
- [ScienceDirect — Cognitive processes in Arabic dictation (encoding is a distinct, harder skill; connected-form demand)](https://www.sciencedirect.com/science/article/pii/S0001691825014325)
- [PSSR — Improving Urdu Handwriting: an experimental study (structured تختی practice)](https://pssr.org.pk/issues/v5/2/improving-urdu-hand-writing-an-experimental-study.pdf)
- Companion in-project report: [`urdu_literacy_science.md`](urdu_literacy_science.md) (the broad Urdu SoR thesis this deep-dive extends).
