/**
 * sindh_maths_g1_curated_segments.js
 *
 * HAND-CURATED segment list built by Haroon + Claude (Max session) on 2026-04-28
 * by visually eyeballing every PDF page of sindh_maths_1.pdf and applying teacher
 * judgment about lesson granularity.
 *
 * Why this exists: the v9 heuristic chunker produced 40 segments by 4-page slicing.
 * The v10 LLM semantic chunker produced 81 segments by treating each lesson_title
 * as a boundary. Neither matched real teaching practice.
 *
 * This curated list = 77 LPs anchored to:
 *   1. The visual content of each PDF page (verified by eyeballing)
 *   2. Teaching-day budget: Rawalpindi precedent ~70-100 LPs per book
 *   3. Real teacher pacing: redundant decade drills (10-19, 20-29, … 90-99) merged;
 *      individual single-digit number lessons kept distinct (G1 students need it)
 *
 * Offset: PDF index = printed page + 4 (verified across all 100 PDF pages)
 *
 * Skill types (Sindh maths taxonomy):
 *   concrete           = manipulative-driven intro of a new concept
 *   pictorial_abstract = visual + symbolic practice
 *   word_problem       = applied story/word problems
 *   retrieval          = drill / fluency practice
 *
 * CPA phase rule: each chapter's first segment that introduces a new concept
 * must be `concrete`. We follow this throughout.
 */

const fs = require('fs');
const path = require('path');

const SEGMENTS = [
  // ===================== UNIT 1: CONCEPT OF WHOLE NUMBERS (PDF 5-53, 49 pages) =====================
  // 32 LPs in this unit (numbers 1-9 each get their own day; decades 20-99 merged)

  { ch: 1, t: "CONCEPT OF WHOLE NUMBERS", topic: "Number 1 (One): recognition, tracing, counting one object",
    pdf: [5, 5], skill: "concrete", cpa: "concrete",
    note: "Read/trace/write 1, count 1 pear, colour 1 pear" },
  { ch: 1, t: "CONCEPT OF WHOLE NUMBERS", topic: "Number 2 (Two): recognition, tracing, counting two objects",
    pdf: [6, 6], skill: "concrete", cpa: "concrete",
    note: "Read/trace/write 2, count 2 bananas, colour 2 bananas" },
  { ch: 1, t: "CONCEPT OF WHOLE NUMBERS", topic: "Number 3 (Three): recognition, tracing, counting three objects",
    pdf: [7, 7], skill: "concrete", cpa: "concrete",
    note: "Read/trace/write 3, count 3 mangoes, colour 3 mangoes" },
  { ch: 1, t: "CONCEPT OF WHOLE NUMBERS", topic: "Number 4 (Four): recognition, tracing, counting four objects",
    pdf: [8, 8], skill: "concrete", cpa: "concrete",
    note: "Read/trace/write 4, count 4 tomatoes/pomegranates, colour 4" },
  { ch: 1, t: "CONCEPT OF WHOLE NUMBERS", topic: "Number 5 (Five): recognition, tracing, counting five objects",
    pdf: [9, 9], skill: "concrete", cpa: "concrete",
    note: "Read/trace/write 5, count 5 bowls/lemons, colour 5" },
  { ch: 1, t: "CONCEPT OF WHOLE NUMBERS", topic: "Number 6 (Six): recognition, tracing, counting six objects",
    pdf: [10, 10], skill: "concrete", cpa: "concrete",
    note: "Read/trace/write 6, count 6 pencils/balls, colour 6" },
  { ch: 1, t: "CONCEPT OF WHOLE NUMBERS", topic: "Number 7 (Seven): recognition, tracing, counting seven objects",
    pdf: [11, 11], skill: "concrete", cpa: "concrete",
    note: "Read/trace/write 7, count 7 chickens/carrots, colour 7" },
  { ch: 1, t: "CONCEPT OF WHOLE NUMBERS", topic: "Number 8 (Eight): recognition, tracing, counting eight objects",
    pdf: [12, 12], skill: "concrete", cpa: "concrete",
    note: "Read/trace/write 8, count 8 candles/oranges, colour 8" },
  { ch: 1, t: "CONCEPT OF WHOLE NUMBERS", topic: "Number 9 (Nine): recognition, tracing, counting nine objects",
    pdf: [13, 13], skill: "concrete", cpa: "concrete",
    note: "Read/trace/write 9, count 9 stars/butterflies, colour 9" },
  { ch: 1, t: "CONCEPT OF WHOLE NUMBERS", topic: "Concept of Zero (0): empty set, no objects",
    pdf: [14, 14], skill: "concrete", cpa: "concrete",
    note: "Empty basket = 0 eggs, read/trace/write 0" },
  { ch: 1, t: "CONCEPT OF WHOLE NUMBERS", topic: "Review numbers 0-9: count, read, match number to its name",
    pdf: [15, 16], skill: "pictorial_abstract", cpa: "pictorial",
    note: "Match figure↔word, count balloons/balls/pencils/stars, read aloud table" },
  { ch: 1, t: "CONCEPT OF WHOLE NUMBERS", topic: "Match numbers 0-9 to objects + count things in classroom scene",
    pdf: [17, 18], skill: "pictorial_abstract", cpa: "pictorial",
    note: "Match number↔picture row, count items in a classroom scene with kids" },
  { ch: 1, t: "CONCEPT OF WHOLE NUMBERS", topic: "Counting backward from 9 to 0",
    pdf: [19, 19], skill: "pictorial_abstract", cpa: "pictorial",
    note: "9-stars-then-fewer pattern; complete missing in triangle/circle rows" },
  { ch: 1, t: "CONCEPT OF WHOLE NUMBERS", topic: "Ascending order 0-9 (smaller to bigger)",
    pdf: [20, 20], skill: "pictorial_abstract", cpa: "pictorial",
    note: "Dora climbing up stairs visual + 4 board exercises arranging digits in ascending order" },
  { ch: 1, t: "CONCEPT OF WHOLE NUMBERS", topic: "Descending order 0-9 (bigger to smaller)",
    pdf: [21, 21], skill: "pictorial_abstract", cpa: "pictorial",
    note: "Dora descending stairs visual + 4 board exercises arranging digits in descending order" },
  { ch: 1, t: "CONCEPT OF WHOLE NUMBERS", topic: "Before, After, Between numbers 0-9",
    pdf: [22, 22], skill: "pictorial_abstract", cpa: "pictorial",
    note: "Pumpkin labels: Before/After/Between — fill missing numbers; balloon middle-number exercise" },
  { ch: 1, t: "CONCEPT OF WHOLE NUMBERS", topic: "Concept of 10: 9 ones plus 1 makes 10 (ten)",
    pdf: [23, 23], skill: "concrete", cpa: "concrete",
    note: "Count stars 1→10, then write 10 as 9+1; key fact '10 ones make 1 Ten'" },
  { ch: 1, t: "CONCEPT OF WHOLE NUMBERS", topic: "Comparing 0-10: bigger and smaller numbers",
    pdf: [24, 25], skill: "pictorial_abstract", cpa: "pictorial",
    note: "Combined LP: tick bigger number (p20), tick smaller number (p21). Pages 20 + 21 of textbook." },
  { ch: 1, t: "CONCEPT OF WHOLE NUMBERS", topic: "Numbers 10-19 (place value with tens-rod and ones)",
    pdf: [26, 26], skill: "concrete", cpa: "concrete",
    note: "Tens-rod + ones objects, T/O columns table, write '1 Ten 4 Ones = 14'" },
  { ch: 1, t: "CONCEPT OF WHOLE NUMBERS", topic: "Numbers 20 to 49 (rapid extension of place value pattern)",
    pdf: [27, 29], skill: "pictorial_abstract", cpa: "pictorial",
    note: "Pages 23-25: 20-29, 30-39, 40-49 decade tables. Teach as 1 LP - pattern is identical." },
  { ch: 1, t: "CONCEPT OF WHOLE NUMBERS", topic: "Numbers 50 to 79 (continued extension)",
    pdf: [30, 32], skill: "pictorial_abstract", cpa: "pictorial",
    note: "Pages 26-28: 50-59, 60-69, 70-79 decade tables." },
  { ch: 1, t: "CONCEPT OF WHOLE NUMBERS", topic: "Numbers 80 to 99 (final extension to two-digit)",
    pdf: [33, 34], skill: "pictorial_abstract", cpa: "pictorial",
    note: "Pages 29-30: 80-89, 90-99 decade tables." },
  { ch: 1, t: "CONCEPT OF WHOLE NUMBERS", topic: "Concept of Place Values: tens (T) and ones (O)",
    pdf: [35, 37], skill: "concrete", cpa: "concrete",
    note: "Pages 31-33: count tens-rods and ones to fill T/O columns; identify place value of digit; write number from T/O" },
  { ch: 1, t: "CONCEPT OF WHOLE NUMBERS", topic: "Compare one-digit and two-digit numbers (which is bigger/smaller)",
    pdf: [38, 38], skill: "pictorial_abstract", cpa: "pictorial",
    note: "Page 34: circle smaller, circle bigger, colour the box of bigger/smaller" },
  { ch: 1, t: "CONCEPT OF WHOLE NUMBERS", topic: "Increasing order with 11-99 (decade ranges)",
    pdf: [39, 39], skill: "pictorial_abstract", cpa: "pictorial",
    note: "Page 35: ranges 21-30, 41-50, 51-60, 61-70, 71-80, 85-94 to write in increasing order" },
  { ch: 1, t: "CONCEPT OF WHOLE NUMBERS", topic: "Decreasing order with 11-99",
    pdf: [40, 40], skill: "pictorial_abstract", cpa: "pictorial",
    note: "Page 36: ranges 30-21, 50-41, 65-56, 75-66, 89-80, 99-90 to write in decreasing order" },
  { ch: 1, t: "CONCEPT OF WHOLE NUMBERS", topic: "Mixed ordering practice (smallest/greatest from a set)",
    pdf: [41, 41], skill: "retrieval", cpa: "abstract",
    note: "Page 37: scrambled groups (e.g. 14 38 49 17), find smallest/greatest, arrange in order" },
  { ch: 1, t: "CONCEPT OF WHOLE NUMBERS", topic: "Before, After, Between numbers 20-99",
    pdf: [42, 42], skill: "pictorial_abstract", cpa: "pictorial",
    note: "Page 38: Before/After/Between for 2-digit numbers, with 3-column table" },
  { ch: 1, t: "CONCEPT OF WHOLE NUMBERS", topic: "Read and write 0-99 (full grid practice in increasing and decreasing order)",
    pdf: [43, 44], skill: "retrieval", cpa: "abstract",
    note: "Pages 39-40: huge tracing grids for 0-99 ascending then 99-0 descending. Combine as 1 fluency LP." },
  { ch: 1, t: "CONCEPT OF WHOLE NUMBERS", topic: "Concept of 100 (10 tens make 100)",
    pdf: [45, 45], skill: "concrete", cpa: "concrete",
    note: "Page 41: tens table 10/20/30/…/100, key fact '10 Tens equal 100, read as one hundred'" },
  { ch: 1, t: "CONCEPT OF WHOLE NUMBERS", topic: "Numbers 1-100 patterns: missing numbers grid + count up to 100",
    pdf: [46, 47], skill: "pictorial_abstract", cpa: "pictorial",
    note: "Page 42: 10x10 grid with gaps to fill. Page 43: count and write up to 100 (ducks, beads, stars, apples)" },
  { ch: 1, t: "CONCEPT OF WHOLE NUMBERS", topic: "Cardinal and Ordinal Numbers (1st-10th): position vs quantity",
    pdf: [48, 49], skill: "pictorial_abstract", cpa: "pictorial",
    note: "Page 44: animal race with 1st-10th positions. Page 45: match ordinal↔word, tick which row item is circled (1st, 4th, 5th etc.)" },
  { ch: 1, t: "CONCEPT OF WHOLE NUMBERS", topic: "Comparing and ordering: bigger/smaller with object groups",
    pdf: [50, 51], skill: "pictorial_abstract", cpa: "pictorial",
    note: "Pages 46-47: count and tick bigger/cross smaller across object groups; tick biggest/cross smallest of 3 groups" },
  { ch: 1, t: "CONCEPT OF WHOLE NUMBERS", topic: "More and less: 1-to-1 correspondence with paired objects",
    pdf: [52, 53], skill: "concrete", cpa: "concrete",
    note: "Page 48: bats↔balls 1-to-1 pairing showing 'less'. Page 49: count and tick more/cross less across object pairs" },

  // ===================== UNIT 2: NUMBER OPERATIONS (PDF 54-69, 16 pages) =====================
  // 16 LPs

  { ch: 2, t: "NUMBER OPERATIONS", topic: "Addition concept: 'how much more' through 1-to-1 comparison",
    pdf: [54, 54], skill: "concrete", cpa: "concrete",
    note: "Page 50: tomatoes vs chicks (6 are 2 more than 4), books vs pencils, balls vs balloons" },
  { ch: 2, t: "NUMBER OPERATIONS", topic: "Addition and equality symbols (+ and =)",
    pdf: [55, 55], skill: "concrete", cpa: "concrete",
    note: "Page 51: cats group + cats group = total; 2 + 3 = 5 with parrots" },
  { ch: 2, t: "NUMBER OPERATIONS", topic: "Add two 1-digit numbers (basic addition facts)",
    pdf: [56, 56], skill: "pictorial_abstract", cpa: "pictorial",
    note: "Page 52: 24 vertical and horizontal addition problems with sums up to 9" },
  { ch: 2, t: "NUMBER OPERATIONS", topic: "Add a 2-digit number with a 1-digit number (no carry)",
    pdf: [57, 57], skill: "pictorial_abstract", cpa: "pictorial",
    note: "Page 53: T/O columns; 26 + 3 = 29 worked example; 15 problems" },
  { ch: 2, t: "NUMBER OPERATIONS", topic: "Add a 2-digit number with tens (whole tens)",
    pdf: [58, 58], skill: "pictorial_abstract", cpa: "pictorial",
    note: "Page 54: 23 + 10 = 33 worked example with tens-rods; 16 problems" },
  { ch: 2, t: "NUMBER OPERATIONS", topic: "Add two 2-digit numbers (no carry)",
    pdf: [59, 59], skill: "pictorial_abstract", cpa: "pictorial",
    note: "Page 55: 43+16=59 worked example; 12 problems" },
  { ch: 2, t: "NUMBER OPERATIONS", topic: "Mental addition with word problems",
    pdf: [60, 60], skill: "word_problem", cpa: "abstract",
    note: "Page 56: Asad pencils, Fahad balloons, Mariam balls, apples, birds — 5 word problems" },
  { ch: 2, t: "NUMBER OPERATIONS", topic: "Construct addition equations from picture sets",
    pdf: [61, 61], skill: "retrieval", cpa: "abstract",
    note: "Page 57: count chicks/ice creams/dice and write the addition equation" },
  { ch: 2, t: "NUMBER OPERATIONS", topic: "Subtraction concept: 'how much smaller' through pairing",
    pdf: [62, 62], skill: "concrete", cpa: "concrete",
    note: "Page 58: keys-and-locks pairing — 3 is 2 smaller than 5; dice-pairs fill-in-blanks" },
  { ch: 2, t: "NUMBER OPERATIONS", topic: "Subtraction symbol (-): take away",
    pdf: [63, 63], skill: "concrete", cpa: "concrete",
    note: "Page 59: fishing scene 6 fish - 2 = 4; birds flying away; strawberries/apples" },
  { ch: 2, t: "NUMBER OPERATIONS", topic: "Take-away with images and writing the subtraction equation",
    pdf: [64, 64], skill: "pictorial_abstract", cpa: "pictorial",
    note: "Page 60: ice creams, books, erasers, pencils, apples, sharpeners, fish — write 7-2=5 etc." },
  { ch: 2, t: "NUMBER OPERATIONS", topic: "Subtract 1-digit + ones from 2-digit numbers",
    pdf: [65, 65], skill: "pictorial_abstract", cpa: "pictorial",
    note: "Page 61: 6-3=3 problems + 17-3=14 with pencil bundle visual" },
  { ch: 2, t: "NUMBER OPERATIONS", topic: "Subtract tens from 2-digit numbers",
    pdf: [66, 66], skill: "pictorial_abstract", cpa: "pictorial",
    note: "Page 62: 65-20=45 worked example with manipulative; 18 problems" },
  { ch: 2, t: "NUMBER OPERATIONS", topic: "Subtract 2-digit numbers from 2-digit numbers (no borrow)",
    pdf: [67, 67], skill: "pictorial_abstract", cpa: "pictorial",
    note: "Page 63: 85-43=42 worked example; 8 apple problems; complete missing-addend/subtrahend" },
  { ch: 2, t: "NUMBER OPERATIONS", topic: "Mental subtraction with word problems",
    pdf: [68, 68], skill: "word_problem", cpa: "abstract",
    note: "Page 64: sweets, balloons, roses, pencils, eggs — 5 mental subtraction word problems" },
  { ch: 2, t: "NUMBER OPERATIONS", topic: "Construct subtraction equations from picture sets",
    pdf: [69, 69], skill: "retrieval", cpa: "abstract",
    note: "Page 65: count remaining balls/ice-creams/pencils/roses after some are crossed out, write equation" },

  // ===================== UNIT 3: MEASUREMENT OF LENGTH AND MASS (PDF 70-75, 6 pages) =====================
  // 6 LPs

  { ch: 3, t: "MEASUREMENT OF LENGTH AND MASS", topic: "Long, longer, longest (comparing lengths)",
    pdf: [70, 70], skill: "concrete", cpa: "concrete",
    note: "Page 66: tape measures, train cars, pencils — tick longest, cross longer; colour by length" },
  { ch: 3, t: "MEASUREMENT OF LENGTH AND MASS", topic: "Short, shorter, shortest (comparing shortness)",
    pdf: [71, 71], skill: "concrete", cpa: "concrete",
    note: "Page 67: boys, chickens, envelopes — tick short, cross shortest; colour by shortness" },
  { ch: 3, t: "MEASUREMENT OF LENGTH AND MASS", topic: "Tall, taller, tallest (comparing heights)",
    pdf: [72, 72], skill: "concrete", cpa: "concrete",
    note: "Page 68: trees, giraffes, boys — tick taller; colour by tallness" },
  { ch: 3, t: "MEASUREMENT OF LENGTH AND MASS", topic: "High, higher, highest (comparing altitude)",
    pdf: [73, 73], skill: "concrete", cpa: "concrete",
    note: "Page 69: kites, buildings, mountains — tick highest; colour by height" },
  { ch: 3, t: "MEASUREMENT OF LENGTH AND MASS", topic: "Heavy, heavier, heaviest (comparing mass)",
    pdf: [74, 74], skill: "concrete", cpa: "concrete",
    note: "Page 70: goat/cow/elephant, melons, cat/dog/horse — tick heaviest" },
  { ch: 3, t: "MEASUREMENT OF LENGTH AND MASS", topic: "Light, lighter, lightest (comparing lightness)",
    pdf: [75, 75], skill: "concrete", cpa: "concrete",
    note: "Page 71: rose/tulip/leaf, tools, balloon/basketball/tennis-ball — tick light, cross lightest" },

  // ===================== UNIT 4: MONEY (PDF 76-82, 7 pages) =====================
  // 7 LPs

  { ch: 4, t: "MONEY", topic: "Pakistani currency: coins (Rs 1, 2, 5) and notes (Rs 10, 20, 50, 100)",
    pdf: [76, 76], skill: "concrete", cpa: "concrete",
    note: "Page 72: front and back of Pakistani coins and currency notes (Quaid e Azam)" },
  { ch: 4, t: "MONEY", topic: "Equivalent sets of money: matching combinations of coins/notes",
    pdf: [77, 77], skill: "concrete", cpa: "concrete",
    note: "Page 73: Rs 5 = two Rs 2 + one Rs 1; Rs 50 = five Rs 10; Rs 100 = two Rs 50 etc." },
  { ch: 4, t: "MONEY", topic: "How much money to pay (addition with money)",
    pdf: [78, 78], skill: "word_problem", cpa: "abstract",
    note: "Page 74: ice cream Rs 5 + candy Rs 2 = Rs 7; cone+truck, kite+truck, ice cream+bus" },
  { ch: 4, t: "MONEY", topic: "How much money is left (subtraction with money)",
    pdf: [79, 79], skill: "word_problem", cpa: "abstract",
    note: "Page 75: Rs 90 - Rs 70 = Rs 20 (train); teddy, rocking horse, ball" },
  { ch: 4, t: "MONEY", topic: "Comparing money and making change up to Rs 100",
    pdf: [80, 80], skill: "word_problem", cpa: "abstract",
    note: "Page 76: change notes into coins (Rs 10 = ten Rs 1); how much extra to buy Rs 85 doll if I have Rs 50" },
  { ch: 4, t: "MONEY", topic: "Subtract and find correct change (matching amount returned)",
    pdf: [81, 81], skill: "word_problem", cpa: "abstract",
    note: "Page 77: amount paid vs goods cost, circle correct change; Ali has Rs 100 — which toys can he buy?" },
  { ch: 4, t: "MONEY", topic: "Add money combinations (notes + coins + notes practice)",
    pdf: [82, 82], skill: "retrieval", cpa: "abstract",
    note: "Page 78: 8 boxes — sum each set (Rs 20 + Rs 5 + Rs 1 etc.)" },

  // ===================== UNIT 5: TIME AND DATE (PDF 83-87, 5 pages) =====================
  // 5 LPs

  { ch: 5, t: "TIME AND DATE", topic: "Reading the analog clock — hours (X o'clock)",
    pdf: [83, 83], skill: "concrete", cpa: "concrete",
    note: "Page 79: minute and hour hand labelled; 6 clock faces show 3, 4, 6, 9, 12, 1 o'clock" },
  { ch: 5, t: "TIME AND DATE", topic: "Reading the digital clock — hours (08:00 = 8 o'clock)",
    pdf: [84, 84], skill: "concrete", cpa: "concrete",
    note: "Page 80: digital clock 08:00; 6 digital clocks 09:00 02:00 11:00 06:00 05:00 03:00" },
  { ch: 5, t: "TIME AND DATE", topic: "Days of the week (Monday-Sunday, 1st-7th)",
    pdf: [85, 85], skill: "concrete", cpa: "concrete",
    note: "Page 81: scroll-banners for each day with ordinal label; fill 'There are ___ days', today/yesterday/tomorrow" },
  { ch: 5, t: "TIME AND DATE", topic: "Day before / day after / sequencing days",
    pdf: [86, 86], skill: "pictorial_abstract", cpa: "pictorial",
    note: "Page 82: day-after table, day-before table, fill in 7 sequences (Monday __ __, Tuesday __ __ etc.)" },
  { ch: 5, t: "TIME AND DATE", topic: "Months of the solar year (January-December, 1st-12th)",
    pdf: [87, 87], skill: "concrete", cpa: "concrete",
    note: "Page 83: 12 numbered banners with month names" },

  // ===================== UNIT 6: GEOMETRY (PDF 88-100, 13 pages) =====================
  // 11 LPs

  { ch: 6, t: "GEOMETRY", topic: "Identification of basic shapes: introduction (join similar shapes) + names",
    pdf: [88, 89], skill: "concrete", cpa: "concrete",
    note: "Page 84: join wheel/watermelon/book to similar real objects. Page 85: 5 named shapes (Rectangle, Square, Circle, Oval, Triangle) — match shape to its name" },
  { ch: 6, t: "GEOMETRY", topic: "Match basic shapes to real-life objects",
    pdf: [90, 91], skill: "pictorial_abstract", cpa: "pictorial",
    note: "Page 86: tick the object that looks like circle/square/triangle/rectangle/oval. Page 87: colour similar shapes" },
  { ch: 6, t: "GEOMETRY", topic: "Count basic shapes in a scene (oval, square, triangle, rectangle, circle)",
    pdf: [92, 92], skill: "pictorial_abstract", cpa: "pictorial",
    note: "Page 88: outdoor scene with mountains, flowers, house, chicks, trees — count each shape type" },
  { ch: 6, t: "GEOMETRY", topic: "Patterns: what comes next (predict next item from sequence)",
    pdf: [93, 93], skill: "pictorial_abstract", cpa: "pictorial",
    note: "Page 89: pencil pattern (yellow/blue), chicken pattern (5 colours); colour the last uncoloured objects in pattern rows" },
  { ch: 6, t: "GEOMETRY", topic: "Patterns: ordering/sequencing items (give correct order)",
    pdf: [94, 94], skill: "pictorial_abstract", cpa: "pictorial",
    note: "Page 90: cupcakes 1-2-3 worked; bicycles/cars/motorbikes; fruits; balloons; lamps/iron/bulb — number the boxes in given order" },
  { ch: 6, t: "GEOMETRY", topic: "Position: inside or outside",
    pdf: [95, 95], skill: "concrete", cpa: "concrete",
    note: "Page 91: pond scene with rabbit (outside), swans (inside); colour stars inside circle; colour balls outside triangle" },
  { ch: 6, t: "GEOMETRY", topic: "Position: above or below",
    pdf: [96, 96], skill: "concrete", cpa: "concrete",
    note: "Page 92: green balloon above yellow; tick parrot above tree, cross goldfinch below; clock above picture frame" },
  { ch: 6, t: "GEOMETRY", topic: "Position: over or under",
    pdf: [97, 97], skill: "concrete", cpa: "concrete",
    note: "Page 93: flag over house, dog under tree; cat on chair vs mouse below; lamp/cup on table vs ball under" },
  { ch: 6, t: "GEOMETRY", topic: "Position: far or near",
    pdf: [98, 98], skill: "concrete", cpa: "concrete",
    note: "Page 94: red boat near, green boat far; sun (far) vs ball (near); chicken (near) vs balloons (far)" },
  { ch: 6, t: "GEOMETRY", topic: "Position: before or after (sequence)",
    pdf: [99, 99], skill: "concrete", cpa: "concrete",
    note: "Page 95: car before bus, van after bus; child before/after Danish; mouse vs dog around the cat" },
  { ch: 6, t: "GEOMETRY", topic: "Position: right or left",
    pdf: [100, 100], skill: "concrete", cpa: "concrete",
    note: "Page 100: window left of chair, vase right; tick object on left, cross on right (boy with eraser, girl with pencils)" },
];

// ---------------- emit JSONL ----------------

const TEXTBOOK_ID = 'sindh_maths_g1';
const STAGE = '05_chunking';
const SCHEMA_VERSION = 'curated_v2_verified_eyeballed';
const JOBID = 'curated-v2-' + new Date().toISOString().slice(0, 10);

function emitJsonl(outPath) {
  const ts = new Date().toISOString();
  const lines = SEGMENTS.map((s, i) => ({
    stage: STAGE,
    jobId: JOBID,
    timestamp: ts,
    textbook_id: TEXTBOOK_ID,
    chapter_number: s.ch,
    chapter_title: s.t,
    segment_index: i + 1,
    skill_type: s.skill,
    cpa_phase: s.cpa,
    page_start: String(s.pdf[0] - 4),  // printed page = PDF page - 4
    page_end: String(s.pdf[1] - 4),
    pdf_pages: s.pdf,
    page_count: s.pdf[1] - s.pdf[0] + 1,
    topic: s.topic,
    curator_note: s.note,
    schema_version: SCHEMA_VERSION,
    cpa_enforced: false,
  }));
  const out = lines.map(l => JSON.stringify(l)).join('\n') + '\n';
  fs.writeFileSync(outPath, out);
  return lines.length;
}

if (require.main === module) {
  const outPath = path.resolve(__dirname, '..', 'runs', 'sindh_maths_g1_segments_curated_v2.jsonl');
  const n = emitJsonl(outPath);
  console.log(`Wrote ${n} curated segments to ${outPath}`);
  // Sanity: print per-chapter breakdown
  const byCh = {};
  for (const s of SEGMENTS) byCh[s.ch] = (byCh[s.ch] || 0) + 1;
  for (const ch of Object.keys(byCh).sort()) console.log(`  Ch ${ch}: ${byCh[ch]} LPs`);
}

module.exports = { SEGMENTS, emitJsonl };
