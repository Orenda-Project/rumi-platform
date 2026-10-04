/**
 * Attendance Generator Service
 * Excel generation for attendance records in the shape of a paper class register
 *
 * Created: January 24, 2026
 */

const ExcelJS = require('exceljs');
const { logToFile } = require('../utils/logger');
const { redactUrl } = require('../utils/redact-url');
const AttendanceRegister = require('./attendance-register.service');

/**
 * Column definitions for the daily attendance sheet
 */
const COLUMNS = {
  rollNumber: { header: 'Roll #', key: 'rollNumber', width: 8 },
  studentName: { header: 'Student Name', key: 'studentName', width: 25 },
  fatherName: { header: 'Father Name', key: 'fatherName', width: 25 },
  status: { header: 'Status', key: 'status', width: 10 }
};

/**
 * Color palette for styling
 */
const COLORS = {
  headerBg: 'FF4472C4',     // Blue header
  headerText: 'FFFFFFFF',    // White text
  presentBg: 'FFE2EFDA',     // Light green
  presentText: 'FF006400',   // Dark green
  absentBg: 'FFFCE4D6',      // Light red/orange
  absentText: 'FFC00000',    // Dark red
  borderColor: 'FFD9D9D9'    // Light gray
};

class AttendanceGeneratorService {
  /**
   * Format date for display in DD-MM-YYYY format
   *
   * @param {Date|string} date - Date to format
   * @returns {string} Formatted date string
   */
  static formatDateForDisplay(date) {
    const d = date instanceof Date ? date : new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }

  /**
   * Generate Excel filename
   *
   * @param {string} className - Class name
   * @param {string|null} section - Section (optional)
   * @param {string} date - Date string
   * @returns {string} Sanitized filename
   */
  static formatFileName(className, section, date) {
    // Sanitize class name (remove special chars)
    const sanitizedClass = className.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
    const dateStr = this.formatDateForDisplay(date);

    if (section) {
      const sanitizedSection = section.replace(/[^a-zA-Z0-9]/g, '');
      return `Attendance_${sanitizedClass}_${sanitizedSection}_${dateStr}.xlsx`;
    }

    return `Attendance_${sanitizedClass}_${dateStr}.xlsx`;
  }

  /**
   * Get display character for attendance status
   *
   * @param {string} status - present/absent/unknown
   * @returns {string} P, A, or ?
   */
  static getStatusDisplay(status) {
    const lower = (status || '').toLowerCase();
    if (lower === 'present') return 'P';
    if (lower === 'absent') return 'A';
    return '?';
  }

  /**
   * Prepare data rows for Excel
   *
   * @param {Array} records - Attendance records
   * @returns {Array} Array of row arrays [rollNumber, studentName, fatherName, status]
   */
  static prepareAttendanceRows(records) {
    // Sort by roll number
    const sorted = [...records].sort((a, b) => (a.rollNumber || 0) - (b.rollNumber || 0));

    return sorted.map(record => [
      record.rollNumber || 0,
      record.studentName || '',
      record.fatherName || '-',
      this.getStatusDisplay(record.status)
    ]);
  }

  /**
   * Calculate summary statistics
   *
   * @param {Array} records - Attendance records
   * @returns {Object} Stats object
   */
  static calculateSummaryStats(records) {
    const total = records.length;
    const present = records.filter(r => r.status === 'present').length;
    const absent = records.filter(r => r.status === 'absent').length;
    const leave = records.filter(r => r.status === 'leave').length;

    const rate = total > 0 ? ((present / total) * 100) : 0;
    const attendanceRate = rate === 100 || rate === 0
      ? `${rate}%`
      : `${rate.toFixed(2)}%`;

    return {
      total,
      present,
      absent,
      leave,
      attendanceRate
    };
  }

  /**
   * Get column width configuration
   *
   * @returns {Object} Width values
   */
  static getColumnWidths() {
    return {
      rollNumber: 8,
      studentName: 25,
      fatherName: 25,
      status: 10
    };
  }

  /**
   * Get header cell style
   *
   * @returns {Object} ExcelJS style object
   */
  static getHeaderStyle() {
    return {
      font: {
        bold: true,
        color: { argb: COLORS.headerText },
        size: 11
      },
      fill: {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLORS.headerBg }
      },
      alignment: {
        horizontal: 'center',
        vertical: 'middle'
      },
      border: {
        top: { style: 'thin', color: { argb: COLORS.borderColor } },
        left: { style: 'thin', color: { argb: COLORS.borderColor } },
        bottom: { style: 'thin', color: { argb: COLORS.borderColor } },
        right: { style: 'thin', color: { argb: COLORS.borderColor } }
      }
    };
  }

  /**
   * Get present status cell style
   *
   * @returns {Object} ExcelJS style object
   */
  static getPresentStyle() {
    return {
      font: {
        bold: true,
        color: { argb: COLORS.presentText }
      },
      fill: {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLORS.presentBg }
      },
      alignment: {
        horizontal: 'center',
        vertical: 'middle'
      }
    };
  }

  /**
   * Get absent status cell style
   *
   * @returns {Object} ExcelJS style object
   */
  static getAbsentStyle() {
    return {
      font: {
        bold: true,
        color: { argb: COLORS.absentText }
      },
      fill: {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLORS.absentBg }
      },
      alignment: {
        horizontal: 'center',
        vertical: 'middle'
      }
    };
  }

  /**
   * Get default cell style
   *
   * @returns {Object} ExcelJS style object
   */
  static getDefaultCellStyle() {
    return {
      alignment: {
        vertical: 'middle'
      },
      border: {
        top: { style: 'thin', color: { argb: COLORS.borderColor } },
        left: { style: 'thin', color: { argb: COLORS.borderColor } },
        bottom: { style: 'thin', color: { argb: COLORS.borderColor } },
        right: { style: 'thin', color: { argb: COLORS.borderColor } }
      }
    };
  }

  /**
   * Create Excel workbook buffer
   *
   * @param {Object} metadata - Class/session metadata
   * @param {Array} records - Attendance records
   * @returns {Promise<Buffer>} Excel file buffer
   */
  static async createExcelBuffer(metadata, records) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Rumi - Digital Teacher Coach';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Attendance', {
      views: [{ state: 'frozen', ySplit: 5 }] // Freeze header rows
    });

    // Set column widths
    const widths = this.getColumnWidths();
    sheet.columns = [
      { width: widths.rollNumber },
      { width: widths.studentName },
      { width: widths.fatherName },
      { width: widths.status }
    ];

    // Add title row
    const titleRow = sheet.addRow(['Attendance Register']);
    sheet.mergeCells('A1:D1');
    titleRow.font = { bold: true, size: 16 };
    titleRow.alignment = { horizontal: 'center' };
    titleRow.height = 25;

    // Add metadata rows
    const className = metadata.section
      ? `${metadata.className} - ${metadata.section}`
      : metadata.className;

    sheet.addRow(['Class:', className]);
    sheet.addRow(['Date:', this.formatDateForDisplay(metadata.date)]);
    if (metadata.teacherName) {
      sheet.addRow(['Teacher:', metadata.teacherName]);
    }

    // Add empty row before data
    sheet.addRow([]);

    // Add header row
    const headerRow = sheet.addRow(['Roll #', 'Student Name', 'Father Name', 'Status']);
    const headerStyle = this.getHeaderStyle();
    headerRow.eachCell((cell) => {
      Object.assign(cell, { style: headerStyle });
    });
    headerRow.height = 22;

    // Add data rows
    const rows = this.prepareAttendanceRows(records);
    const defaultStyle = this.getDefaultCellStyle();
    const presentStyle = this.getPresentStyle();
    const absentStyle = this.getAbsentStyle();

    for (const rowData of rows) {
      const row = sheet.addRow(rowData);

      // Apply default style to all cells
      row.eachCell((cell, colNumber) => {
        Object.assign(cell, { style: defaultStyle });

        // Status column (4) gets special styling
        if (colNumber === 4) {
          if (cell.value === 'P') {
            Object.assign(cell, { style: { ...defaultStyle, ...presentStyle } });
          } else if (cell.value === 'A') {
            Object.assign(cell, { style: { ...defaultStyle, ...absentStyle } });
          }
        }
      });
    }

    // Add summary row
    sheet.addRow([]);
    const stats = this.calculateSummaryStats(records);
    sheet.addRow(['Summary:', `Total: ${stats.total}`, `Present: ${stats.present}`, `Absent: ${stats.absent}`]);
    sheet.addRow(['', '', 'Attendance Rate:', stats.attendanceRate]);

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    logToFile('Excel attendance generated', {
      className: metadata.className,
      date: metadata.date,
      records: records.length,
      bufferSize: buffer.length
    });

    return Buffer.from(buffer);
  }

  /**
   * Generate attendance Excel and upload to R2
   *
   * @param {Object} r2Service - R2 service instance
   * @param {Object} metadata - Session metadata
   * @param {Array} records - Attendance records
   * @returns {Promise<{buffer: Buffer, url: string, fileName: string}>}
   */
  static async generateAndUpload(r2Service, metadata, records) {
    // Generate Excel buffer
    const buffer = await this.createExcelBuffer(metadata, records);

    // Generate filename
    const fileName = this.formatFileName(
      metadata.className,
      metadata.section,
      metadata.date
    );

    // Upload to R2
    const key = `attendance/${metadata.userId || 'unknown'}/${fileName}`;
    const url = await r2Service.uploadBuffer(buffer, key, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    logToFile('Attendance Excel uploaded to R2', {
      key,
      url: redactUrl(url),
      fileName
    });

    return {
      buffer,
      url,
      fileName
    };
  }

  // =========================================================================
  // MONTHLY CUMULATIVE REGISTER METHODS
  // =========================================================================

  /**
   * Month names for display and filenames
   */
  static MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  /**
   * Day abbreviations for column headers
   */
  static DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  /**
   * Get weekend days (Saturday, Sunday) for a given month
   * Returns array of day numbers (1-31) that are weekends
   *
   * @param {number} year - Year (e.g., 2026)
   * @param {number} month - Month (1-12)
   * @returns {number[]} Array of weekend day numbers
   */
  static getWeekendDays(year, month) {
    if (!year || !month) return [];

    const weekends = [];
    const daysInMonth = new Date(year, month, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        weekends.push(day);
      }
    }

    return weekends;
  }

  /**
   * Format monthly register filename
   *
   * @param {string} className - Class name
   * @param {string|null} section - Section (optional)
   * @param {number} month - Month (1-12)
   * @param {number} year - Year
   * @returns {string} Filename like "Attendance_Grade_5_A_January_2026.xlsx"
   */
  static formatMonthlyFileName(className, section, month, year) {
    const sanitizedClass = (className || 'Class').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
    const monthName = this.MONTH_NAMES[month - 1];

    if (section) {
      const sanitizedSection = section.replace(/[^a-zA-Z0-9]/g, '');
      return `Attendance_${sanitizedClass}_${sanitizedSection}_${monthName}_${year}.xlsx`;
    }

    return `Attendance_${sanitizedClass}_${monthName}_${year}.xlsx`;
  }

  /**
   * Flatten month sessions into the one record shape the register reads:
   * { student_id, date: 'YYYY-MM-DD', status }.
   *
   * @param {Array} sessions - Session records with attendance_records
   * @returns {Array}
   */
  static flattenSessions(sessions) {
    return (sessions || []).flatMap((session) => (session.attendance_records || []).map((r) => ({
      student_id: r.student_id,
      date: session.session_date,
      status: r.status
    })));
  }

  /**
   * Build attendance matrix from students and sessions
   * Creates { studentId: { student, days: { day: 'P'|'A'|'L' } } }
   *
   * Delegates to the register builder, which keeps Leave as its own status and reads
   * the day off the date string (`new Date(date).getDate()` is the day before in a
   * negative UTC offset).
   *
   * @param {Array} students - Array of student objects
   * @param {Array} sessions - Array of session objects with attendance_records
   * @returns {Object} Matrix indexed by student ID
   */
  static buildAttendanceMatrix(students, sessions) {
    const matrix = AttendanceRegister.buildMatrix(students, this.flattenSessions(sessions));
    for (const entry of Object.values(matrix)) {
      entry.student = entry.person;
    }
    return matrix;
  }

  /**
   * Calculate monthly statistics for a student — the student rule: a leave day is a
   * marked day the child was not in the room.
   *
   * @param {Object} days - Object with day numbers as keys and 'P'|'A'|'L' as values
   * @returns {Object} { present, absent, leave, percentage }
   */
  static calculateStudentMonthlyStats(days) {
    return AttendanceRegister.monthlyStats(days, { subject: 'student' });
  }

  /**
   * Create the monthly class register from pre-fetched data.
   *
   * @param {Object} metadata - { className, section }
   * @param {number} month - Month (1-12)
   * @param {number} year - Year
   * @param {Array} students - Student records
   * @param {Array} sessions - Session records with attendance_records
   * @returns {Promise<Buffer>} Excel buffer
   */
  static async createMonthlyRegisterBufferFromData(metadata, month, year, students, sessions) {
    const title = metadata.section
      ? `${metadata.className} - ${metadata.section}`
      : metadata.className;
    const people = [...(students || [])].sort((a, b) => (a.roll_number || 0) - (b.roll_number || 0));

    return AttendanceRegister.createMonthlyRegisterBuffer(
      { title, subject: 'student' },
      month,
      year,
      people,
      this.flattenSessions(sessions)
    );
  }
}

module.exports = AttendanceGeneratorService;
