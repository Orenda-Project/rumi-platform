/**
 * Turns an existing WhatsApp Flow *endpoint* into a text conversation.
 *
 * Why this is a builder and not a re-implementation: every data-exchange Flow
 * in bot/shared/routes/*-endpoint.js already has the same shape —
 *
 *   INIT                        -> { screen, data: { <rows>, ...values } }
 *   data_exchange(screen, data) -> { screen, data: { <rows>, ...values } }
 *                               |  { data: { error: { message } } }
 *
 * — and all of the real work (the DB queries, the validation, the actual
 * video send, the preference write) lives inside those functions. A Meta Flow
 * is only a *renderer* for them. So the sandbox doesn't need a second copy of
 * the business logic; it needs a second renderer, which is what this is: it
 * asks one question per screen field, resolves the reply by number-or-name,
 * accumulates `screenData` exactly as the Flow client would, and calls the
 * very same endpoint functions. Bugs fixed in the endpoint are fixed for both
 * channels, and a new Flow degrades to text by declaring a config here.
 *
 * Mapping from a Flow definition to a config:
 *   screen  -> stage.screen        (the value passed to data_exchange)
 *   a field -> stage.fields[]      (one chat question each)
 *   dropdown data-source key -> field.optionsKey  (e.g. `grades`, `languages`)
 *   field name in screenData -> field.id          (e.g. `grade`, `language`)
 *
 * @module endpoint-text-flow
 */

const { logToFile } = require('../../utils/logger');

/** The endpoint's own "nothing to offer / bad input" channel. */
function errorMessageOf(response) {
  return response?.data?.error?.message || null;
}

/**
 * Rows a Flow dropdown would have bound to, normalised to {id, title}.
 * Endpoints already emit {id, title} (that's what a Flow dropdown requires),
 * so this is a guard against a stray shape rather than a transformation.
 */
function rowsFrom(response, optionsKey) {
  const raw = response?.data?.[optionsKey];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => (typeof row === 'string'
      ? { id: row, title: row }
      : { id: String(row.id ?? row.value ?? ''), title: String(row.title ?? row.id ?? '') }))
    .filter((row) => row.id && row.title);
}

/**
 * The screenData a Flow client would have submitted: every field answered so
 * far, keyed by field id, valued by the chosen option's id.
 */
function screenDataFrom(answers) {
  const screenData = {};
  for (const [fieldId, answer] of Object.entries(answers || {})) {
    if (fieldId.startsWith('_')) continue; // reserved (seeded, non-field values)
    screenData[fieldId] = answer?.id;
  }
  return screenData;
}

/**
 * @param {object} config
 * @param {string} config.kind                 registry key, e.g. 'student-videos'
 * @param {(ctx) => Promise<object>} config.init
 * @param {(ctx, screen, screenData) => Promise<object>} config.exchange
 * @param {Array<{screen: string, fields: Array<{id, optionsKey, prompt?}>}>} config.stages
 * @param {(response, ctx) => string|null} [config.onFinish]  message for the terminal response
 * @param {string} [config.fallbackError]
 * @returns {object} a text-flow.js definition
 */
function buildEndpointFlow(config) {
  const { kind, init, exchange, stages, onFinish, fallbackError } = config;
  if (!kind || typeof init !== 'function' || typeof exchange !== 'function' || !stages?.length) {
    throw new Error('endpoint-text-flow: needs { kind, init, exchange, stages[] }');
  }

  const GENERIC_ERROR = fallbackError
    || 'That is not available right now. Please try again later.';

  // Flatten the stage/field tree into the flat step list text-flow.js drives,
  // remembering for each step which stage it belongs to and whether it is that
  // stage's first field (the only field that triggers an endpoint call).
  const steps = [];
  stages.forEach((stage, stageIndex) => {
    stage.fields.forEach((field, fieldIndex) => {
      steps.push({
        id: field.id,
        /**
         * A stage's FIRST field fetches: from INIT for the first stage, or by
         * submitting the previous screen for any later one. Subsequent fields
         * of the same stage read the response that fetch already produced —
         * which is why the response is carried in `context` instead of being
         * recomputed. Replaying data_exchange per render would re-run whatever
         * side effects the endpoint has (student-videos' final screen *sends a
         * video*), so replay is not merely wasteful, it is unsafe.
         */
        async options(answers, context) {
          if (fieldIndex > 0) {
            return { options: rowsFrom(context.response, field.optionsKey), context };
          }

          const ctx = context._ctx || {};
          let response;
          try {
            response = stageIndex === 0
              ? await init(ctx)
              : await exchange(ctx, stages[stageIndex - 1].screen, screenDataFrom(answers));
          } catch (error) {
            logToFile('❌ endpoint-text-flow: endpoint threw', {
              kind, screen: stage.screen, error: error.message,
            });
            response = { data: { error: { message: GENERIC_ERROR } } };
          }

          return {
            options: rowsFrom(response, field.optionsKey),
            context: { ...context, response },
          };
        },
        async prompt(answers, context) {
          const error = errorMessageOf(context.response);
          if (error) return { body: error };
          const built = field.prompt ? await field.prompt(answers, context) : {};
          return built || {};
        },
      });
    });
  });

  return {
    kind,
    steps,
    /** Submits the last screen — the step that actually performs the action. */
    async onComplete(phone, answers, context) {
      const ctx = context?._ctx || {};
      const lastScreen = stages[stages.length - 1].screen;
      let response;
      try {
        response = await exchange(ctx, lastScreen, screenDataFrom(answers));
      } catch (error) {
        logToFile('❌ endpoint-text-flow: final exchange threw', {
          kind, screen: lastScreen, error: error.message,
        });
        return { text: GENERIC_ERROR };
      }

      const error = errorMessageOf(response);
      if (error) return { text: error };

      const text = onFinish ? onFinish(response, ctx) : null;
      return { text: text || null };
    },
  };
}

module.exports = {
  buildEndpointFlow,
  rowsFrom,
  screenDataFrom,
  errorMessageOf,
};
