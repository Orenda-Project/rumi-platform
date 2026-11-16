'use strict';

/**
 * Ogg Opus toolkit for the text-to-speech gateway: read a stream, tell a whole stream from a cut
 * one, measure its exact playable duration, and join several clips into one logical stream.
 *
 * Why the gateway needs it:
 *   - The vendor streams audio over HTTP. The body can be cut partway and still arrive with a
 *     success status, and the vendor also ends audio at two minutes without an error. The Ogg
 *     framing is the only reliable witness: every page carries a CRC, and a whole stream ends on a
 *     page flagged end-of-stream (EOS). A cut stream either stops inside a page or never reaches EOS.
 *   - Long voice notes are synthesised as several parts in parallel. Gluing the files together byte
 *     for byte gives a chained Ogg file (one logical stream after another, each with its own headers
 *     and its own timeline), not one stream. So the parts' packets are re-paged into ONE logical
 *     stream instead, and nothing is re-encoded.
 *
 * Format facts relied on below (RFC 3533 for Ogg, RFC 7845 for Opus in Ogg, RFC 6716 for the TOC):
 *   - A page is a 27-byte header ("OggS", version 0, flags, 64-bit granule position, serial,
 *     sequence number, CRC, segment count), then a table of lacing values, then the body.
 *   - A packet is laid out as 255-byte segments; a lacing value below 255 ends the packet. So a
 *     packet can run on from one page into the next, which is then flagged "continued".
 *   - Packet 0 is the OpusHead (channel count, pre-skip, input sample rate), packet 1 the OpusTags,
 *     and every packet after that is audio.
 *   - A page's granule position counts the 48 kHz samples decoded through the last packet that ends
 *     on that page, pre-skip included; -1 means no packet ends there. The decoder drops the first
 *     `preSkip` samples, and the last page's granule may stop short of the last packet's end (end
 *     trimming). So the playable length is (finalGranule - preSkip) / 48000.
 *
 * Pure: Node built-ins only, no I/O, no logging.
 */

const CAPTURE = 'OggS';
const HEADER_BYTES = 27;
const MAX_SEGMENTS = 255; // lacing values one page can hold
const FLAG_CONTINUED = 0x01;
const FLAG_BOS = 0x02;
const FLAG_EOS = 0x04;
const OPUS_RATE = 48000; // Opus granule positions always count 48 kHz samples
const PAGE_TARGET_SAMPLES = OPUS_RATE; // pages written by concatOggOpus carry about 1 s of audio
const OPUS_HEAD_MIN_BYTES = 19;

/**
 * The one error this module throws. `code` names the state, so a caller can branch and log on it:
 *   not_ogg       not a valid Ogg stream: a JSON error body, an MP3, an empty response, or a page
 *                 missing from the middle of the stream
 *   bad_crc       a page is damaged: its bytes do not match its checksum
 *   truncated     the stream stops partway, inside a page or inside a packet
 *   no_opus_head  the first packet is not an OpusHead: Ogg, but not Opus
 *   no_opus_tags  the second packet is not an OpusTags header
 *   no_eos        every page is whole, but the last one is not flagged end-of-stream
 *   no_audio      the headers are there, but no audio packet follows (or no clip was given)
 *   mismatch      more than one logical stream in one buffer, or clips that cannot share a decoder
 */
class OggOpusError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'OggOpusError';
    this.code = code;
  }
}

// Ogg's CRC-32: polynomial 0x04C11DB7, initial value 0, no bit reflection, no final xor.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let r = i << 24;
    for (let bit = 0; bit < 8; bit += 1) r = (r & 0x80000000) ? (r << 1) ^ 0x04c11db7 : r << 1;
    table[i] = r >>> 0;
  }
  return table;
})();

function crcUpdate(crc, bytes, start, end) {
  let c = crc;
  for (let i = start; i < end; i += 1) c = ((c << 8) ^ CRC_TABLE[((c >>> 24) ^ bytes[i]) & 0xff]) >>> 0;
  return c;
}

function crc32(bytes) {
  return crcUpdate(0, bytes, 0, bytes.length);
}

const ZERO_CRC_FIELD = new Uint8Array(4);

// A page's checksum covers the whole page with its own 4-byte CRC field (bytes 22-25) read as zero.
function pageCrc(bytes, start, end) {
  let crc = crcUpdate(0, bytes, start, start + 22);
  crc = crcUpdate(crc, ZERO_CRC_FIELD, 0, 4);
  return crcUpdate(crc, bytes, start + 26, end);
}

// Frame lengths in 48 kHz samples by TOC config number (RFC 6716 section 3.1): SILK-only configs
// 0-11 are 10/20/40/60 ms, hybrid 12-15 are 10/20 ms, CELT-only 16-31 are 2.5/5/10/20 ms.
const SILK_FRAME = [480, 960, 1920, 2880];
const HYBRID_FRAME = [480, 960];
const CELT_FRAME = [120, 240, 480, 960];

/**
 * How many 48 kHz samples one Opus packet decodes to, from its TOC byte: the frame length comes
 * from the config (toc >> 3) and the frame count from the code (toc & 3): code 0 is one frame,
 * codes 1 and 2 are two, and code 3 carries the count in the low 6 bits of the next byte. An empty
 * packet counts as 0, and so does a code 3 packet missing its count byte (a decoder rejects it).
 *
 * @param {Buffer} packet
 * @returns {number}
 */
function packetSamples(packet) {
  if (!packet || packet.length === 0) return 0;
  const toc = packet[0];
  const config = toc >> 3;
  let frame;
  if (config < 12) frame = SILK_FRAME[config & 3];
  else if (config < 16) frame = HYBRID_FRAME[config & 1];
  else frame = CELT_FRAME[config & 3];
  const code = toc & 3;
  let frames;
  if (code === 0) frames = 1;
  else if (code < 3) frames = 2;
  else frames = packet.length > 1 ? packet[1] & 0x3f : 0;
  return frames * frame;
}

function sumSamples(packets) {
  return packets.reduce((sum, packet) => sum + packet.samples, 0);
}

function asBuffer(input) {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (input instanceof ArrayBuffer) return Buffer.from(input);
  return null;
}

// Enough of a rejected input for the error message to tell a JSON error body from an MP3 or an
// empty response.
function describeStart(bytes) {
  if (!bytes) return 'the input is not a Buffer';
  if (bytes.length === 0) return 'the input is empty';
  return `the input does not start with an Ogg page (first bytes 0x${bytes.subarray(0, 8).toString('hex')})`;
}

function startsWith(packet, magic) {
  return packet.length >= magic.length && packet.toString('latin1', 0, magic.length) === magic;
}

/**
 * Reads a single-stream Ogg Opus buffer.
 *
 * Every whole page must pass its CRC. Bytes at the end that do not make up a whole page (a stream
 * cut mid-page) do not throw: they set `truncated` and reading stops there, so the caller still
 * learns how much audio arrived. A packet left open on the last whole page, with no page to
 * continue it, also counts as truncated: the stream was cut between pages, partway through it.
 *
 * @param {Buffer|Uint8Array} buf
 * @returns {{ serial: number, channels: number, preSkip: number, inputSampleRate: number,
 *   head: Buffer, tags: Buffer, packets: Array<{ data: Buffer, samples: number }>,
 *   finalGranule: number, eos: boolean, truncated: boolean }}
 *   `packets` are the audio packets in order (their `data` may share memory with `buf`);
 *   `finalGranule` is the granule of the last whole page on which a packet ends;
 *   `eos` is true when the last whole page is flagged end-of-stream.
 * @throws {OggOpusError} not_ogg, bad_crc, mismatch, no_opus_head, no_opus_tags; or truncated
 *   when the stream stops before both of its header packets are whole.
 */
function parseOggOpus(buf) {
  const bytes = asBuffer(buf);
  if (!bytes || !startsWith(bytes, CAPTURE)) throw new OggOpusError('not_ogg', describeStart(bytes));

  const packets = []; // every whole packet, the two header packets included
  let pieces = []; // the start of a packet that the next page should continue
  let serial = null;
  let prevSeq = null;
  let finalGranule = 0;
  let eos = false;
  let truncated = false;
  let offset = 0;

  while (offset < bytes.length) {
    const left = bytes.length - offset;
    const seen = Math.min(left, CAPTURE.length);
    if (bytes.toString('latin1', offset, offset + seen) !== CAPTURE.slice(0, seen)) {
      throw new OggOpusError('not_ogg', `no Ogg page starts at byte ${offset}`);
    }
    // The header, the segment table or the body is shorter than declared: the stream stops here.
    if (left < HEADER_BYTES) { truncated = true; break; }
    if (bytes[offset + 4] !== 0) {
      throw new OggOpusError('not_ogg', `unsupported Ogg version ${bytes[offset + 4]} at byte ${offset}`);
    }
    const segments = bytes[offset + 26];
    if (left < HEADER_BYTES + segments) { truncated = true; break; }
    let bodyBytes = 0;
    for (let i = 0; i < segments; i += 1) bodyBytes += bytes[offset + HEADER_BYTES + i];
    const pageBytes = HEADER_BYTES + segments + bodyBytes;
    if (left < pageBytes) { truncated = true; break; }

    const seq = bytes.readUInt32LE(offset + 18);
    if (pageCrc(bytes, offset, offset + pageBytes) !== bytes.readUInt32LE(offset + 22)) {
      throw new OggOpusError('bad_crc', `page ${seq} at byte ${offset} does not match its CRC`);
    }

    const flags = bytes[offset + 5];
    const pageSerial = bytes.readUInt32LE(offset + 14);
    if (serial === null) {
      serial = pageSerial;
    } else if (pageSerial !== serial || (flags & FLAG_BOS)) {
      // A second serial, or a second beginning-of-stream page: two clips glued byte for byte.
      throw new OggOpusError('mismatch', `a second logical stream starts at byte ${offset}; only one is supported`);
    }
    if (eos) throw new OggOpusError('not_ogg', `page ${seq} at byte ${offset} comes after the end-of-stream page`);
    if (prevSeq !== null && seq !== ((prevSeq + 1) >>> 0)) {
      throw new OggOpusError('not_ogg', `page ${seq} at byte ${offset} follows page ${prevSeq}: a page is missing or repeated`);
    }

    const continued = (flags & FLAG_CONTINUED) !== 0;
    if (continued && pieces.length === 0) {
      // On the first page, the buffer does not begin with the OpusHead; later, a page went missing.
      if (prevSeq === null) throw new OggOpusError('no_opus_head', 'the stream starts in the middle of a packet, not with an OpusHead');
      throw new OggOpusError('not_ogg', `page ${seq} at byte ${offset} continues a packet that never started`);
    }
    if (!continued && pieces.length > 0) {
      throw new OggOpusError('not_ogg', `page ${seq} at byte ${offset} abandons the packet the previous page left open`);
    }

    let at = offset + HEADER_BYTES + segments;
    let packetStart = at;
    for (let i = 0; i < segments; i += 1) {
      const lace = bytes[offset + HEADER_BYTES + i];
      at += lace;
      if (lace < 255) {
        const tail = bytes.subarray(packetStart, at);
        packets.push(pieces.length > 0 ? Buffer.concat([...pieces, tail]) : tail);
        pieces = [];
        packetStart = at;
      }
    }
    if (packetStart < at) pieces.push(bytes.subarray(packetStart, at));

    const granule = Number(bytes.readBigInt64LE(offset + 6));
    if (granule >= 0) finalGranule = granule; // -1: no packet ends on this page
    eos = (flags & FLAG_EOS) !== 0;
    prevSeq = seq;
    offset += pageBytes;
  }

  if (pieces.length > 0) truncated = true;

  const [head, tags] = packets;
  if (!head) {
    if (truncated) throw new OggOpusError('truncated', 'the stream stops before its OpusHead header is whole');
    throw new OggOpusError('no_opus_head', 'the stream holds no packets');
  }
  if (!startsWith(head, 'OpusHead') || head.length < OPUS_HEAD_MIN_BYTES) {
    throw new OggOpusError('no_opus_head', 'the first packet is not an OpusHead header: this is not Opus audio');
  }
  if (!tags) {
    if (truncated) throw new OggOpusError('truncated', 'the stream stops before its OpusTags header is whole');
    throw new OggOpusError('no_opus_tags', 'the stream ends after its OpusHead header');
  }
  if (!startsWith(tags, 'OpusTags')) {
    throw new OggOpusError('no_opus_tags', 'the second packet is not an OpusTags header');
  }

  return {
    serial,
    channels: head[9],
    preSkip: head.readUInt16LE(10),
    inputSampleRate: head.readUInt32LE(12),
    head,
    tags,
    packets: packets.slice(2).map((data) => ({ data, samples: packetSamples(data) })),
    finalGranule,
    eos,
    truncated,
  };
}

// Playable seconds: the decoder drops the first `preSkip` samples, and the final granule already
// leaves out any end trim. Never negative, even for a stream that stops inside its pre-skip.
function secondsOf(parsed) {
  return Math.max(0, parsed.finalGranule - parsed.preSkip) / OPUS_RATE;
}

const INCOMPLETE = {
  truncated: 'the stream stops partway through a page or a packet',
  // Checked because a stream cut exactly on a page boundary looks whole page by page: only the
  // missing end-of-stream flag shows that the vendor never finished it.
  no_eos: 'every page is whole, but the last one is not flagged end-of-stream',
  no_audio: 'the stream holds its headers but no audio',
};

// checkComplete's verdict, plus the parse behind it so that concatOggOpus reads each part once.
function inspect(buf) {
  let parsed;
  try {
    parsed = parseOggOpus(buf);
  } catch (err) {
    // Anything other than an OggOpusError would be a defect in this module, not a property of the
    // bytes. It is still reported as unreadable input, because checkComplete promises not to throw.
    return { ok: false, reason: err instanceof OggOpusError ? err.code : 'not_ogg', detail: err.message };
  }
  const seconds = secondsOf(parsed);
  let reason = null;
  if (parsed.truncated) reason = 'truncated';
  else if (!parsed.eos) reason = 'no_eos';
  else if (parsed.packets.length === 0) reason = 'no_audio';
  if (reason) return { ok: false, reason, durationSec: seconds, detail: INCOMPLETE[reason], parsed };
  return { ok: true, durationSec: seconds, parsed };
}

/**
 * Is this a whole Ogg Opus stream, safe to send as a voice note? Never throws.
 *
 * @param {Buffer|Uint8Array} buf
 * @returns {{ ok: true, durationSec: number } | { ok: false, reason: string, durationSec?: number }}
 *   `reason` is an OggOpusError code (not_ogg, bad_crc, truncated, no_opus_head, no_opus_tags,
 *   no_eos, no_audio, mismatch). `durationSec` comes with a failure whenever the stream could be
 *   read, and then says how much audio arrived in whole pages.
 */
function checkComplete(buf) {
  const result = inspect(buf);
  if (result.ok) return { ok: true, durationSec: result.durationSec };
  if (result.durationSec === undefined) return { ok: false, reason: result.reason };
  return { ok: false, reason: result.reason, durationSec: result.durationSec };
}

/**
 * Playable length in seconds, (finalGranule - preSkip) / 48000, never negative. For a cut stream
 * it is the audio that arrived in whole pages.
 *
 * @param {Buffer|Uint8Array} buf
 * @returns {number}
 * @throws {OggOpusError} as parseOggOpus does
 */
function durationSec(buf) {
  return secondsOf(parseOggOpus(buf));
}

function buildPage({ flags, granule, serial, sequence, lacing, chunks }) {
  const header = Buffer.alloc(HEADER_BYTES + lacing.length);
  header.write(CAPTURE, 0, 'latin1');
  header[5] = flags; // byte 4, the stream structure version, stays 0
  header.writeBigInt64LE(BigInt(granule), 6);
  header.writeUInt32LE(serial, 14);
  header.writeUInt32LE(sequence, 18);
  header[26] = lacing.length;
  header.set(lacing, HEADER_BYTES);
  const page = Buffer.concat([header, ...chunks]);
  page.writeUInt32LE(crc32(page), 22); // the CRC field is still zero while the CRC is computed
  return page;
}

/**
 * Lays packets out as the pages of one logical stream, numbered from 0, the first flagged
 * beginning-of-stream. A packet that does not fit in what is left of a page's 255 lacing values
 * starts a new page. A packet too long for any single page (over 65,024 bytes, which is more than
 * any real Opus packet) is split, and the page after each split is flagged as continuing it.
 */
class PageWriter {
  constructor(serial) {
    this.serial = serial;
    this.pages = [];
    this.lastGranule = 0; // granule of the latest page on which a packet ended
    this.startPage();
  }

  startPage() {
    this.lacing = [];
    this.chunks = [];
    this.granule = -1; // no packet has ended on this page yet
    this.pageSamples = 0;
    this.continued = false;
  }

  // `granuleAfter` is the stream's granule once this packet has been decoded.
  add(data, granuleAfter, samples = 0) {
    let whole = Math.floor(data.length / 255); // 255-byte segments before the final, shorter one
    if (this.lacing.length > 0 && this.lacing.length + whole + 1 > MAX_SEGMENTS) this.flush();
    let at = 0;
    while (this.lacing.length + whole + 1 > MAX_SEGMENTS) {
      const take = MAX_SEGMENTS - this.lacing.length;
      for (let i = 0; i < take; i += 1) this.lacing.push(255);
      this.chunks.push(data.subarray(at, at + take * 255));
      at += take * 255;
      whole -= take;
      this.flush();
      this.continued = true;
    }
    for (let i = 0; i < whole; i += 1) this.lacing.push(255);
    this.lacing.push(data.length - at - whole * 255);
    this.chunks.push(data.subarray(at));
    this.granule = granuleAfter;
    this.pageSamples += samples;
  }

  flush({ eos = false, granule = this.granule } = {}) {
    const sequence = this.pages.length;
    const flags = (this.continued ? FLAG_CONTINUED : 0) | (sequence === 0 ? FLAG_BOS : 0) | (eos ? FLAG_EOS : 0);
    this.pages.push(buildPage({ flags, granule, serial: this.serial, sequence, lacing: this.lacing, chunks: this.chunks }));
    if (granule >= 0) this.lastGranule = granule;
    this.startPage();
  }
}

// Clips can share one decoder only if they lay out their channels the same way: the channel count
// and mapping family, plus the stream counts and mapping table of a multichannel family.
function channelLayout(head) {
  const family = head[18];
  const table = family === 0 ? '' : head.subarray(19, 21 + head[9]).toString('hex');
  return `${head[9]}/${family}/${table}`;
}

/**
 * Joins Ogg Opus clips into ONE logical Ogg Opus stream, so a note synthesised in parts plays as a
 * single voice message with the right duration.
 *
 * The output keeps the first clip's OpusHead (and so its pre-skip) and its OpusTags, each alone on
 * its page at granule 0, then every audio packet of every clip in order, re-paged at about one
 * second per page. The serial is the first clip's. Packets are copied, never re-encoded.
 *
 * Timing. A page's granule is the running total of samples decoded through the last packet that
 * ends on it. One logical stream has one pre-skip and one end trim, so:
 *   - the decoder skips the first clip's pre-skip once. Each later clip's pre-skip samples (its
 *     encoder warm-up: 312 samples, 6.5 ms, for the vendor and for libopus) are played at the join,
 *     as a few milliseconds of near-silence;
 *   - an earlier clip's end trim (the padding its own final granule used to hide) cannot be trimmed
 *     in the middle of a stream, so it is played too;
 *   - the LAST clip's end trim is kept: the final granule is the samples of every earlier clip plus
 *     the last clip's own final granule, so the stream stops exactly where that clip stopped. Should
 *     that ever put the final granule behind the page before it, or past the audio (a malformed last
 *     clip), the plain running total is used instead.
 *
 * @param {Array<Buffer|Uint8Array>} buffers  whole Ogg Opus streams, in the order they should play
 * @returns {Buffer|Uint8Array} the joined stream; a single clip comes back as the same object,
 *   unchanged, once it has passed checkComplete
 * @throws {OggOpusError} no_audio for an empty list; for a clip that fails checkComplete, that
 *   check's reason; mismatch when the clips do not share a channel layout
 */
function concatOggOpus(buffers) {
  if (!Array.isArray(buffers) || buffers.length === 0) {
    throw new OggOpusError('no_audio', 'concatOggOpus needs at least one Ogg Opus stream');
  }
  const parts = buffers.map((buf, i) => {
    const result = inspect(buf);
    if (!result.ok) {
      throw new OggOpusError(result.reason, `part ${i + 1} of ${buffers.length} is not a whole Ogg Opus stream: ${result.detail}`);
    }
    return result.parsed;
  });
  const first = parts[0];
  parts.forEach((part, i) => {
    if (channelLayout(part.head) === channelLayout(first.head)) return;
    throw new OggOpusError('mismatch', part.channels === first.channels
      ? `part ${i + 1} maps its channels differently from part 1`
      : `part ${i + 1} has ${part.channels} channel(s) but part 1 has ${first.channels}`);
  });
  if (buffers.length === 1) return buffers[0];

  const writer = new PageWriter(first.serial);
  writer.add(first.head, 0);
  writer.flush();
  writer.add(first.tags, 0);
  writer.flush();

  const audio = parts.flatMap((part) => part.packets);
  let decoded = 0;
  audio.forEach((packet, i) => {
    decoded += packet.samples;
    writer.add(packet.data, decoded, packet.samples);
    // The last packet always stays for the end-of-stream page, so that page is never empty.
    if (i < audio.length - 1 && writer.pageSamples >= PAGE_TARGET_SAMPLES) writer.flush();
  });

  const last = parts[parts.length - 1];
  let finalGranule = decoded - sumSamples(last.packets) + last.finalGranule;
  if (finalGranule < writer.lastGranule || finalGranule > decoded) finalGranule = decoded;
  writer.flush({ eos: true, granule: finalGranule });
  return Buffer.concat(writer.pages);
}

/**
 * Follows a clip's pages as its bytes arrive and says when the end-of-stream page is in.
 *
 * "The response ended" cannot be the only sign that a clip is complete: Soniox sometimes sends every
 * byte of a clip and then never closes the response (30 Sep: 6 of 100 Urdu requests). Only whole
 * pages count here, and the walk stops at anything that is not a page; checkComplete still judges
 * the clip (CRCs, packets, end-of-stream) before it is used.
 *
 * @returns {{ push(chunk: Buffer): boolean, readonly ended: boolean, buffer(): Buffer }}
 *   `push` appends bytes and returns true once the end-of-stream page is complete.
 */
function createEndWatcher() {
  let buf = Buffer.alloc(0);
  let next = 0; // where the next page starts
  let ended = false;
  let stuck = false; // bytes that are not a page: leave the verdict to checkComplete
  return {
    push(chunk) {
      buf = buf.length ? Buffer.concat([buf, chunk]) : Buffer.from(chunk);
      while (!ended && !stuck && next + HEADER_BYTES <= buf.length) {
        if (buf.toString('latin1', next, next + 4) !== CAPTURE) { stuck = true; break; }
        const segments = buf[next + 26];
        if (next + HEADER_BYTES + segments > buf.length) break;
        let size = 0;
        for (let k = 0; k < segments; k += 1) size += buf[next + HEADER_BYTES + k];
        const end = next + HEADER_BYTES + segments + size;
        if (end > buf.length) break;
        if (buf[next + 5] & FLAG_EOS) ended = true;
        next = end;
      }
      return ended;
    },
    get ended() { return ended; },
    buffer() { return buf; },
  };
}

module.exports = { OggOpusError, parseOggOpus, checkComplete, durationSec, concatOggOpus, createEndWatcher };
// For tests only: the CRC and the TOC arithmetic are checked directly against known answers.
module.exports._internals = { crc32, packetSamples };
