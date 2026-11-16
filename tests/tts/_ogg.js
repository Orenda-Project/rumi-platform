'use strict';
/**
 * A tiny but complete Ogg Opus stream for the gateway tests: OpusHead, OpusTags and one 20 ms
 * audio packet on an end-of-stream page, each page with a correct CRC. It is what a Soniox
 * provider double returns, so the gateway's completeness check passes as it would on real audio.
 */

const { _internals: { crc32 } } = require('../../bot/shared/services/tts/ogg-opus');

function page({ flags, granule, sequence, packet }) {
  const lacing = [];
  let left = packet.length;
  while (left >= 255) { lacing.push(255); left -= 255; }
  lacing.push(left);
  const header = Buffer.alloc(27 + lacing.length);
  header.write('OggS', 0, 'latin1');
  header[5] = flags;
  header.writeBigInt64LE(BigInt(granule), 6);
  header.writeUInt32LE(1234, 14);
  header.writeUInt32LE(sequence, 18);
  header[26] = lacing.length;
  Buffer.from(lacing).copy(header, 27);
  const out = Buffer.concat([header, packet]);
  out.writeUInt32LE(crc32(out), 22);
  return out;
}

function tinyOggOpus() {
  const preSkip = 312;
  const head = Buffer.alloc(19);
  head.write('OpusHead', 0, 'latin1');
  head[8] = 1; // version
  head[9] = 1; // mono
  head.writeUInt16LE(preSkip, 10);
  head.writeUInt32LE(48000, 12);
  const vendor = Buffer.from('test', 'latin1');
  const tags = Buffer.alloc(8 + 4 + vendor.length + 4);
  tags.write('OpusTags', 0, 'latin1');
  tags.writeUInt32LE(vendor.length, 8);
  vendor.copy(tags, 12);
  // TOC 0xF8: CELT fullband, 20 ms frame, one frame — 960 samples at 48 kHz.
  const audio = Buffer.from([0xf8, 0xff, 0xfe]);
  return Buffer.concat([
    page({ flags: 0x02, granule: 0, sequence: 0, packet: head }),
    page({ flags: 0x00, granule: 0, sequence: 1, packet: tags }),
    page({ flags: 0x04, granule: preSkip + 960, sequence: 2, packet: audio }),
  ]);
}

module.exports = { tinyOggOpus };
