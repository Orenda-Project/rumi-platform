/**
 * quiz-intent-router.service.js — promptQuizConfirmation(), the front half
 * of the two-button quiz-intent flow. Was previously dead: text-message.handler.js
 * never called isQuizIntent()/this function, so "create a quiz on X for grade Y"
 * fell through to the generic lesson_plan/presentation/video/general LLM
 * classifier and was misrouted to lesson_plan. See handleConfirmationButton's
 * own tests (none existed before this file) for the back half.
 */

jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
jest.mock('../../bot/shared/services/cache/railway-redis.service', () => ({
  get: jest.fn(), set: jest.fn().mockResolvedValue(true), delete: jest.fn(),
}));
jest.mock('../../bot/shared/services/whatsapp.service', () => ({
  sendMessage: jest.fn().mockResolvedValue(true),
  sendInteractiveButtons: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../bot/shared/config/supabase', () => ({ from: jest.fn() }));
jest.mock('../../bot/shared/services/openai.service', () => ({
  createChatCompletion: jest.fn().mockResolvedValue({
    choices: [{ message: { content: 'operating systems' } }],
  }),
}));

const RedisService = require('../../bot/shared/services/cache/railway-redis.service');
const WhatsAppService = require('../../bot/shared/services/whatsapp.service');
const OpenAIService = require('../../bot/shared/services/openai.service');
const QuizIntentRouter = require('../../bot/shared/services/quiz/quiz-intent-router.service');

const USER = { id: 'user-1' };
const FROM = 'slack:U0123ABC';

afterEach(() => jest.clearAllMocks());

describe('promptQuizConfirmation', () => {
  it('extracts the topic via a small LLM call and stashes {topic, language} under quiz_intent_pending:<userId>', async () => {
    await QuizIntentRouter.promptQuizConfirmation(USER, FROM, 'create a quiz on operating systems for grade 12', 'en');

    expect(OpenAIService.createChatCompletion).toHaveBeenCalledTimes(1);
    expect(RedisService.set).toHaveBeenCalledWith(
      QuizIntentRouter._PENDING_INTENT_KEY(USER.id),
      JSON.stringify({ topic: 'operating systems', language: 'en' }),
      QuizIntentRouter._PENDING_INTENT_TTL_SEC
    );
  });

  it('shows the two-button confirmation (Send to class / Show in chat) with the topic in the body', async () => {
    await QuizIntentRouter.promptQuizConfirmation(USER, FROM, 'create a quiz on operating systems for grade 12', 'en');

    expect(WhatsAppService.sendInteractiveButtons).toHaveBeenCalledWith(FROM, expect.objectContaining({
      body: expect.stringContaining('operating systems'),
      buttons: [
        { id: 'quiz_send_to_class', title: 'Send to class' },
        { id: 'quiz_show_in_chat', title: 'Show in chat' },
      ],
    }));
  });

  it('renders Urdu button titles and body when language is "ur"', async () => {
    await QuizIntentRouter.promptQuizConfirmation(USER, FROM, 'کوئز بنائیں', 'ur');

    const call = WhatsAppService.sendInteractiveButtons.mock.calls[0][1];
    expect(call.buttons[0].title).toBe('کلاس کو بھیجیں');
    expect(call.buttons[1].title).toBe('چیٹ میں دکھائیں');
  });

  it('defaults to English when no language is given', async () => {
    await QuizIntentRouter.promptQuizConfirmation(USER, FROM, 'quiz me', undefined);
    const call = WhatsAppService.sendInteractiveButtons.mock.calls[0][1];
    expect(call.buttons[0].title).toBe('Send to class');
  });

  it('still shows the confirmation with generic copy when topic extraction returns null', async () => {
    OpenAIService.createChatCompletion.mockResolvedValueOnce({ choices: [{ message: { content: 'null' } }] });

    await QuizIntentRouter.promptQuizConfirmation(USER, FROM, 'quiz me', 'en');

    expect(RedisService.set).toHaveBeenCalledWith(
      QuizIntentRouter._PENDING_INTENT_KEY(USER.id),
      JSON.stringify({ topic: '', language: 'en' }),
      QuizIntentRouter._PENDING_INTENT_TTL_SEC
    );
    const call = WhatsAppService.sendInteractiveButtons.mock.calls[0][1];
    expect(call.body).not.toContain('undefined');
    expect(call.body).not.toContain('null');
  });

  it('still shows the confirmation (with no topic) when topic extraction itself throws', async () => {
    OpenAIService.createChatCompletion.mockRejectedValueOnce(new Error('rate limited'));

    await QuizIntentRouter.promptQuizConfirmation(USER, FROM, 'quiz me', 'en');

    expect(WhatsAppService.sendInteractiveButtons).toHaveBeenCalledTimes(1);
  });

  it('does nothing when user is missing or has no id', async () => {
    await QuizIntentRouter.promptQuizConfirmation(null, FROM, 'quiz me', 'en');
    await QuizIntentRouter.promptQuizConfirmation({}, FROM, 'quiz me', 'en');

    expect(WhatsAppService.sendInteractiveButtons).not.toHaveBeenCalled();
    expect(RedisService.set).not.toHaveBeenCalled();
  });
});
