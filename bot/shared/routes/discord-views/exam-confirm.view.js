/**
 * Discord screen mapping for the exam-checker student-confirmation
 * Flow-equivalent — the counterpart to slack-views/exam-confirm.view.js,
 * shaped for discord-modal-flow.js's screenToSteps()/mergeScreenData()
 * contract.
 *
 * CONFIRM_STUDENTS is one multi-select field over exam-confirm-endpoint.js's
 * dynamically-sized `data.students` array (stringified detected-student
 * indices as ids — see that endpoint's handleExamConfirmInit). Real class
 * sizes (20-40 students) routinely exceed Discord's 25-option
 * StringSelectMenu cap, so this is NOT a rare edge case to special-case: when
 * students.length > 25, the roster is split across 2 sequential select
 * steps and both selections are merged before calling exchange() — matching
 * the plan's explicit call-out that this needs handling as a first-class
 * case, not deferred.
 *
 * No text-fields modal at all for this screen — it's one (or two) selects,
 * nothing else.
 */

const { StringSelectMenuBuilder } = require('discord.js');

const CHUNK_SIZE = 25;

function toOption(row) {
  // default: true pre-selects every student in the menu's rendered state —
  // matching Slack/Meta's checkbox-group default (all checked; the teacher
  // unchecks anyone who isn't a real student) as closely as a Discord
  // StringSelectMenu allows.
  return { label: String(row.title).slice(0, 100), value: String(row.id).slice(0, 100), default: true };
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
  if (screen === 'CONFIRM_STUDENTS') {
    const students = data?.students || [];
    const chunks = chunkStudents(students);

    const steps = chunks.map((chunk, i) => ({
      fieldName: `confirmed_students_chunk_${i}`,
      promptText: chunks.length > 1
        ? `${data.heading || 'Confirm students'} (${i + 1}/${chunks.length}) — uncheck anyone who isn't a real student:`
        : `${data.heading || 'Confirm students'} — uncheck anyone who isn't a real student:`,
      buildMenu: () => buildChunkMenu(chunk, `confirmed_students_chunk_${i}`, `Students ${i + 1}-${i + chunk.length} of ${students.length}`),
      multi: true,
    }));

    return { steps, textFields: [], title: 'Confirm Students' };
  }

  throw new Error(`discord-views/exam-confirm: no screen mapping for "${screen}"`);
}

function mergeScreenData(screen, enumAnswers) {
  if (screen === 'CONFIRM_STUDENTS') {
    const confirmedStudents = Object.keys(enumAnswers)
      .filter((key) => key.startsWith('confirmed_students_chunk_'))
      .sort()
      .flatMap((key) => enumAnswers[key] || []);
    return { confirmed_students: confirmedStudents };
  }
  return {};
}

module.exports = { screenToSteps, mergeScreenData, chunkStudents, toOption, CHUNK_SIZE };
