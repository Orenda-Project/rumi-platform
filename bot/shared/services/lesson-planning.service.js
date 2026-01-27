const { logToFile } = require('../utils/logger');

/**
 * Lesson Planning Service
 * Simple wrapper - the actual lesson plan generation is handled by the main conversation flow
 * This service just transitions users from menu to lesson planning conversation
 */
class LessonPlanningService {
  /**
   * No actual methods needed - the menu service already asks the question
   * and the conversation flow handles the rest via Gamma API
   *
   * This file exists for consistency with service architecture
   */
}

module.exports = LessonPlanningService;
