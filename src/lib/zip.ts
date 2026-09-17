import { deflateRawSync } from "node:zlib";
import * as zlib from "node:zlib";

/**
 * CRC32, WITH ITS OWN LEGS.
 *
 * Node grew zlib.crc32 in 20.15. A backup is the one thing that must not
 * fail on which runtime it happened to land on, so the table version is
 * here as well and is used whenever the built-in is absent.
 */
const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf: Buffer): number => {
  const native = (zlib as unknown as { crc32?: (b: Buffer) => number }).crc32;
  if (typeof native === "function") return native(buf) >>> 0;
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/**
 * A ZIP FILE, WRITTEN BY HAND.
 *
 * Dr Raghu, 17 Sep 2026: "make a cron job that saves the codebase in module
 * form as a single zip file ... can we compact the codebase and also the
 * database?"
 *
 * Genie carries no archiving library and this does not need one. A ZIP is a
 * run of local headers, then a central directory, then a twenty-two byte
 * record saying where that directory starts — and Node has had deflate built
 * in since the beginning.
 *
 * COMPRESSED, not merely collected. Method 8 (deflate) is what every tool on
 * earth expects, and on a codebase of text it is the difference between
 * eleven megabytes and three. A database exported as JSON lines compresses
 * harder still: the field names repeat on every row, which is precisely what
 * a dictionary coder is for.
 *
 * Everything is held in memory, deliberately. A backup that streams is a
 * backup that can be half-written, and half a backup is worse than none
 * because it is indistinguishable from a whole one until the day it is
 * needed. These archives are tens of megabytes; they fit.
 */
export type ZipEntry = { name: string; data: Buffer | string };

const dosTime = (d: Date) => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
const dosDate = (d: Date) => (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;

export function makeZip(entries: ZipEntry[], when = new Date()): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  const t = dosTime(when), dt = dosDate(when);

  for (const e of entries) {
    const name = Buffer.from(e.name.replace(/^\/+/, ""), "utf8");
    const raw = typeof e.data === "string" ? Buffer.from(e.data, "utf8") : e.data;
    const packed = deflateRawSync(raw, { level: 9 });
    /* Deflate can grow a tiny or already-compressed file. Store it plainly
       when that happens rather than paying for the attempt. */
    const deflated = packed.length < raw.length;
    const body = deflated ? packed : raw;
    const method = deflated ? 8 : 0;
    const sum = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);          // version needed
    local.writeUInt16LE(0, 6);           // flags
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(t, 10);
    local.writeUInt16LE(dt, 12);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, body);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);            // version made by
    dir.writeUInt16LE(20, 6);            // version needed
    dir.writeUInt16LE(0, 8);
    dir.writeUInt16LE(method, 10);
    dir.writeUInt16LE(t, 12);
    dir.writeUInt16LE(dt, 14);
    dir.writeUInt32LE(sum, 16);
    dir.writeUInt32LE(body.length, 20);
    dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt16LE(0, 30);            // extra
    dir.writeUInt16LE(0, 32);            // comment
    dir.writeUInt16LE(0, 34);            // disk
    dir.writeUInt16LE(0, 36);            // internal attrs
    dir.writeUInt32LE(0, 38);            // external attrs
    dir.writeUInt32LE(offset, 42);
    central.push(dir, name);

    offset += local.length + name.length + body.length;
  }

  const dirBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dirBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, dirBuf, end]);
}
