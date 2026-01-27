/**
 * Mock Language Cache for Testing
 */

const getUserLanguage = jest.fn().mockResolvedValue('en');
const setUserLanguage = jest.fn().mockResolvedValue(true);

module.exports = {
  getUserLanguage,
  setUserLanguage
};
