/**
 * exceljs mock for the OSS root test suite.
 *
 * exceljs is a runtime dependency in bot/node_modules but not the root, and
 * CI runs the ROOT suite before `cd bot && npm ci` — so any test that
 * reaches bot/shared/services/attendance-generator.service.js (Excel
 * register generation) needs this or the suite fails in CI for reasons
 * unrelated to the test itself.
 *
 * Only the surface attendance-generator.service.js actually touches: a
 * Workbook whose addWorksheet() returns a worksheet with addRow()/
 * mergeCells()/getColumn(), each producing row/cell/column stand-ins that
 * tolerate arbitrary property writes (font/alignment/fill/border/numFmt —
 * cosmetic styling this suite never asserts on) and a real eachCell()
 * iteration, plus xlsx.writeBuffer().
 */

function createCell() {
  return {}; // plain object — arbitrary property writes (font/fill/...) just land on it
}

function createRow(values) {
  const cells = (values || []).map(() => createCell());
  return {
    getCell: jest.fn((i) => cells[i - 1] || createCell()),
    eachCell: jest.fn((callback) => cells.forEach((cell, i) => callback(cell, i + 1))),
  };
}

function createColumn() {
  return {};
}

function createWorksheet() {
  const columns = [];
  return {
    columns: [],
    addRow: jest.fn((values) => createRow(values)),
    mergeCells: jest.fn(),
    getColumn: jest.fn((i) => {
      columns[i - 1] = columns[i - 1] || createColumn();
      return columns[i - 1];
    }),
  };
}

class Workbook {
  constructor() {
    this.creator = undefined;
    this.created = undefined;
    this.xlsx = { writeBuffer: jest.fn(async () => Buffer.from('')) };
  }

  addWorksheet() {
    return createWorksheet();
  }
}

module.exports = { Workbook };
