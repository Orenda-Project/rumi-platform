/**
 * Unit Tests: storeLessonPlan Duplicate Prevention
 * TDD for fix: Prevent duplicate lesson plan records
 */

describe('storeLessonPlan - Duplicate Prevention', () => {
  let mockSupabase;
  let storeLessonPlan;

  beforeEach(() => {
    jest.resetModules();

    // Create chainable mock for Supabase
    const createChainableMock = () => {
      const chain = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        single: jest.fn()
      };
      return chain;
    };

    mockSupabase = createChainableMock();
    jest.doMock('../../shared/config/supabase', () => mockSupabase);

    storeLessonPlan = require('../../shared/database/bot-helpers').storeLessonPlan;
  });

  afterEach(() => {
    jest.resetModules();
  });

  it('should return existing record if duplicate found within 10 minutes', async () => {
    // Arrange: Existing lesson plan found
    const existingPlan = {
      id: 'existing-uuid',
      topic: 'Potential Energy',
      gamma_url: 'https://gamma.app/existing',
      created_at: new Date().toISOString()
    };

    mockSupabase.single
      .mockResolvedValueOnce({ data: existingPlan, error: null }) // First call: duplicate check
      .mockResolvedValueOnce({ data: null, error: null }); // Second call: shouldn't happen

    // Act
    const result = await storeLessonPlan(
      'user-uuid',
      'Potential Energy',
      'lesson_plan',
      'https://gamma.app/new',
      'https://r2.example.com/new.pdf'
    );

    // Assert: Returns existing, no insert called
    expect(result).toEqual(existingPlan);
    expect(mockSupabase.insert).not.toHaveBeenCalled();
  });

  it('should insert new record if no duplicate found', async () => {
    // Arrange: No existing plan
    const newPlan = {
      id: 'new-uuid',
      topic: 'Kinetic Energy',
      gamma_url: 'https://gamma.app/new'
    };

    mockSupabase.single
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } }) // No duplicate
      .mockResolvedValueOnce({ data: newPlan, error: null }); // Insert result

    // Act
    const result = await storeLessonPlan(
      'user-uuid',
      'Kinetic Energy',
      'lesson_plan',
      'https://gamma.app/new',
      null
    );

    // Assert: Insert was called
    expect(mockSupabase.insert).toHaveBeenCalled();
  });

  it('should check for duplicates within 10 minute window', async () => {
    // Arrange: No duplicate in time window
    const newPlan = {
      id: 'new-uuid',
      topic: 'Friction',
      gamma_url: 'https://gamma.app/new'
    };

    mockSupabase.single
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } }) // No duplicate
      .mockResolvedValueOnce({ data: newPlan, error: null }); // Insert result

    // Act
    await storeLessonPlan(
      'user-uuid',
      'Friction',
      'lesson_plan',
      'https://gamma.app/new',
      null
    );

    // Assert: gte was called with a time ~10 minutes ago
    expect(mockSupabase.gte).toHaveBeenCalled();
    const gteCall = mockSupabase.gte.mock.calls[0];
    expect(gteCall[0]).toBe('created_at');
    // Verify time is approximately 10 minutes ago
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const providedTime = new Date(gteCall[1]);
    const timeDiff = Math.abs(tenMinutesAgo - providedTime);
    expect(timeDiff).toBeLessThan(5000); // Within 5 seconds tolerance
  });
});
