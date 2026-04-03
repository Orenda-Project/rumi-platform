/**
 * Canvas mock for OSS test suite.
 * Canvas is an optional native dependency (requires Cairo system lib).
 * This mock returns valid PNG buffers so coaching card tests pass without
 * a native canvas installation.
 */

// Minimal valid PNG: 1×1 white pixel
// PNG signature (8 bytes) + IHDR (25 bytes) + IDAT (17 bytes) + IEND (12 bytes)
const MINIMAL_PNG = Buffer.from([
  // PNG signature
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  // IHDR chunk
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde,
  // IDAT chunk
  0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54,
  0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00,
  0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, 0x33,
  // IEND chunk
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
  0xae, 0x42, 0x60, 0x82,
]);

function createCanvas() {
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    font: '',
    textAlign: '',
    lineWidth: 0,
    fillRect: jest.fn(),
    strokeRect: jest.fn(),
    fillText: jest.fn(),
    measureText: jest.fn(() => ({ width: 50 })),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
    fill: jest.fn(),
    arc: jest.fn(),
    closePath: jest.fn(),
    drawImage: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    translate: jest.fn(),
    scale: jest.fn(),
    rotate: jest.fn(),
    clip: jest.fn(),
    roundRect: jest.fn(),
    createLinearGradient: jest.fn(() => ({
      addColorStop: jest.fn(),
    })),
  };

  return {
    getContext: jest.fn(() => ctx),
    toBuffer: jest.fn(() => MINIMAL_PNG),
    width: 600,
    height: 400,
  };
}

module.exports = {
  createCanvas,
  loadImage: jest.fn(() => Promise.resolve({})),
  Canvas: jest.fn(),
  Image: jest.fn(),
};
