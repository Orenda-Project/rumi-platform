/**
 * Discord screen mapping for the tap-to-mark attendance Flow-equivalent —
 * the counterpart to slack-views/attendance-marking.view.js, shaped for
 * discord-modal-flow.js's screenToSteps()/mergeScreenData() contract.
 *
 * MARK_ABSENT is one (or more, chunked) multi-select StringSelectMenu
 * field(s) over attendance-marking-endpoint.js's dynamically-sized
 * `data.students` array — the same chunking need as discord-views/
 * exam-confirm.view.js's CONFIRM_STUDENTS: real class sizes (20-40 students)
 * routinely exceed Discord's 25-option StringSelectMenu cap.
 *
 * Convention matches docs/flows/attendance-marking-flow.json's CheckboxGroup
 * and slack-views/attendance-marking.view.js: selecting a student marks them
 * ABSENT; everyone else is present. Unlike exam-confirm's all-pre-selected
 * "confirmed" semantics, nothing is pre-selected here (default: everyone
 * present) — a selected box means the opposite thing on this screen.
 *
 * No text-fields modal at all for this screen — it's one (or two+) selects,
 * nothing else, so it never opens a Discord Modal (see discord-modal-flow.js's
 * runScreen(): a screen with zero textFields acks directly and calls
 * exchange(), skipping showModal() entirely).
 */

const { StringSelectMenuBuilder } = require('discord.js');

const CHUNK_SIZE = 25;

function toOption(row) {
  return { label: String(row.title).slice(0, 100), value: String(row.id).slice(0, 100) };
}

function chunkStudents(students) {
  const chunks = [];
  for (let i = 0; i < students.length; i += CHUNK_SIZE) {
    chunks.push(students.slice(i, i + CHUNK_SIZE));
  }
  return chunks;
}

function buildChunkMenu(chunk, fieldName, placeholder) {
  return new StringSelectMenuBuilder()
    .setCustomId(fieldName)
    .setPlaceholder(placeholder)
    .setMinValues(0)
    .setMaxValues(chunk.length)
    .addOptions(chunk.map(toOption));
}

function screenToSteps(screen, data) {
  if (screen === 'MARK_ABSENT') {
    const students = data?.students || [];
    const chunks = chunkStudents(students);
    const classDisplay = data?.class_display || 'this class';

    const steps = chunks.map((chunk, i) => ({
      fieldName: `absent_students_chunk_${i}`,
      promptText: chunks.length > 1
        ? `Check who's ABSENT in ${classDisplay} (${i + 1}/${chunks.length}). Everyone else will be marked present:`
        : `Check who's ABSENT in ${classDisplay}. Everyone else will be marked present:`,
      buildMenu: () => buildChunkMenu(chunk, `absent_students_chunk_${i}`, `Students ${i + 1}-${i + chunk.length} of ${students.length}`),
      multi: true,
    }));

    return { steps, textFields: [], title: 'Mark Attendance' };
  }

  throw new Error(`discord-views/attendance-marking: no screen mapping for "${screen}"`);
}

function mergeScreenData(screen, enumAnswers) {
  if (screen === 'MARK_ABSENT') {
    const absentStudentIds = Object.keys(enumAnswers)
      .filter((key) => key.startsWith('absent_students_chunk_'))
      .sort()
      .flatMap((key) => enumAnswers[key] || []);
    return { absent_student_ids: absentStudentIds };
  }
  return {};
}

module.exports = { screenToSteps, mergeScreenData, chunkStudents, toOption, CHUNK_SIZE };
