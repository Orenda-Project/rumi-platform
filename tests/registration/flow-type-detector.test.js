/**
 * Flow Type Detector Tests
 *
 * Tests the centralized flow type detection logic used in whatsapp-bot.js
 * to route nfm_reply messages to the correct handler.
 *
 * TDD: Written BEFORE copying flow-type-detector.js from production.
 *
 * Bead: bd-396
 */

const { detectFlowType } = require('../../bot/shared/utils/flow-type-detector');

describe('detectFlowType', () => {
  // -----------------------------------------------------------------------
  // Null / invalid input
  // -----------------------------------------------------------------------
  describe('invalid input', () => {
    it('returns "unknown" for null', () => {
      expect(detectFlowType(null)).toBe('unknown');
    });

    it('returns "unknown" for undefined', () => {
      expect(detectFlowType(undefined)).toBe('unknown');
    });

    it('returns "unknown" for non-object', () => {
      expect(detectFlowType('string')).toBe('unknown');
    });

    it('returns "unknown" for empty object', () => {
      expect(detectFlowType({})).toBe('unknown');
    });
  });

  // -----------------------------------------------------------------------
  // Reading Assessment (highest priority)
  // -----------------------------------------------------------------------
  describe('reading_assessment', () => {
    it('detects v1 format (screen_0_Student_Full_Name_0)', () => {
      expect(detectFlowType({
        screen_0_Student_Full_Name_0: 'John',
        screen_0_Language_1: '0_English'
      })).toBe('reading_assessment');
    });

    it('detects v2 format (Student_Full_Name)', () => {
      expect(detectFlowType({
        Student_Full_Name: 'John',
        Assessment_Mode: '0_Auto'
      })).toBe('reading_assessment');
    });

    it('detects by reading level field', () => {
      expect(detectFlowType({
        screen_0_Select_the_reading_level_2: '2_Sentences'
      })).toBe('reading_assessment');
    });
  });

  // -----------------------------------------------------------------------
  // Registration (must be checked before attendance)
  // -----------------------------------------------------------------------
  describe('registration', () => {
    it('detects by flow_token containing :registration:', () => {
      expect(detectFlowType({
        flow_token: 'abc123:registration:1707000000',
        full_name: 'Test User',
        country: 'PK'
      })).toBe('registration');
    });

    it('detects by full_name + country fields', () => {
      expect(detectFlowType({
        full_name: 'Test User',
        country: 'PK'
      })).toBe('registration');
    });

    it('registration takes priority over attendance_marking when token has :registration:', () => {
      // Registration tokens contain colons like attendance tokens
      // but they include ":registration:" which distinguishes them
      expect(detectFlowType({
        flow_token: 'userId:registration:timestamp'
      })).toBe('registration');
    });
  });

  // -----------------------------------------------------------------------
  // Attendance Setup
  // -----------------------------------------------------------------------
  describe('attendance_setup', () => {
    it('detects navigate-based format (class_name + student_list)', () => {
      expect(detectFlowType({
        class_name: 'Class 3A',
        student_list: 'Ali, Ahmed, Sara'
      })).toBe('attendance_setup');
    });

    it('detects navigate-based format (class_name + students_text)', () => {
      expect(detectFlowType({
        class_name: 'Class 3A',
        students_text: 'Student1\nStudent2'
      })).toBe('attendance_setup');
    });

    it('detects endpoint-based format (list_id + class_display)', () => {
      expect(detectFlowType({
        list_id: 'some-uuid',
        class_display: 'Class 3A - Section B'
      })).toBe('attendance_setup');
    });
  });

  // -----------------------------------------------------------------------
  // Attendance Marking
  // -----------------------------------------------------------------------
  describe('attendance_marking', () => {
    it('detects by absent_students field', () => {
      expect(detectFlowType({
        absent_students: ['student-1', 'student-2']
      })).toBe('attendance_marking');
    });

    it('detects by flow_token with colons (non-registration)', () => {
      expect(detectFlowType({
        flow_token: 'userId:classId:2026-01-01:morning:Class%203A'
      })).toBe('attendance_marking');
    });

    it('does NOT match flow_token with :registration:', () => {
      // This should be caught by registration detection first
      expect(detectFlowType({
        flow_token: 'userId:registration:timestamp'
      })).not.toBe('attendance_marking');
    });
  });

  // -----------------------------------------------------------------------
  // Priority ordering
  // -----------------------------------------------------------------------
  describe('priority ordering', () => {
    it('reading_assessment beats registration', () => {
      expect(detectFlowType({
        Student_Full_Name: 'Test',
        full_name: 'Test',
        country: 'PK'
      })).toBe('reading_assessment');
    });

    it('registration beats attendance_marking', () => {
      expect(detectFlowType({
        flow_token: 'userId:registration:timestamp',
        full_name: 'Test',
        country: 'PK'
      })).toBe('registration');
    });
  });
});
