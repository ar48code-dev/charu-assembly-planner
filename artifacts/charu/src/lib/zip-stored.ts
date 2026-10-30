const encoder = new TextEncoder();

export interface ZipEntry {
  name: string;
  content: string | Uint8Array;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let value = n;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[n] = value >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function safeName(name: string): Uint8Array {
  if (!name || name.startsWith("/") || name.split(/[\\/]/).some(part => part === "..")) {
    throw new Error("ZIP entries need safe, relative filenames.");
  }
  const encoded = encoder.encode(name.replace(/\\/g, "/"));
  if (encoded.length > 0xffff) throw new Error("ZIP entry filename is too long.");
  return encoded;
}

function write16(view: DataView, offset: number, value: number) { view.setUint16(offset, value, true); }
function write32(view: DataView, offset: number, value: number) { view.setUint32(offset, value >>> 0, true); }

/** Creates a standards-compliant, store-only ZIP without compression dependencies. */
export function createStoredZip(entries: ZipEntry[]): Uint8Array {
  if (!entries.length || entries.length > 0xffff) throw new Error("The print pack must contain between 1 and 65,535 files.");
  const names = new Set<string>();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = safeName(entry.name);
    if (names.has(entry.name)) throw new Error(`Duplicate ZIP filename: ${entry.name}`);
    names.add(entry.name);
    const content = typeof entry.content === "string" ? encoder.encode(entry.content) : entry.content;
    if (content.length > 0xffffffff) throw new Error("A ZIP entry exceeds the supported file size.");
    const crc = crc32(content);
    const local = new Uint8Array(30 + name.length + content.length);
    const localView = new DataView(local.buffer);
    write32(localView, 0, 0x04034b50);
    write16(localView, 4, 20);
    write16(localView, 6, 0x0800); // UTF-8 filename
    write16(localView, 8, 0); // store, no compression
    write16(localView, 10, 0);
    write16(localView, 12, 0x0021); // 1980-01-01
    write32(localView, 14, crc);
    write32(localView, 18, content.length);
    write32(localView, 22, content.length);
    write16(localView, 26, name.length);
    write16(localView, 28, 0);
    local.set(name, 30);
    local.set(content, 30 + name.length);
    localChunks.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    write32(centralView, 0, 0x02014b50);
    write16(centralView, 4, 20);
    write16(centralView, 6, 20);
    write16(centralView, 8, 0x0800);
    write16(centralView, 10, 0);
    write16(centralView, 12, 0);
    write16(centralView, 14, 0x0021);
    write32(centralView, 16, crc);
    write32(centralView, 20, content.length);
    write32(centralView, 24, content.length);
    write16(centralView, 28, name.length);
    write16(centralView, 30, 0);
    write16(centralView, 32, 0);
    write16(centralView, 34, 0);
    write16(centralView, 36, 0);
    write32(centralView, 38, 0);
    write32(centralView, 42, localOffset);
    central.set(name, 46);
    centralChunks.push(central);
    localOffset += local.length;
  }
  const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  write32(endView, 0, 0x06054b50);
  write16(endView, 4, 0);
  write16(endView, 6, 0);
  write16(endView, 8, entries.length);
  write16(endView, 10, entries.length);
  write32(endView, 12, centralSize);
  write32(endView, 16, localOffset);
  write16(endView, 20, 0);
  const result = new Uint8Array(localOffset + centralSize + end.length);
  let cursor = 0;
  for (const chunk of localChunks) { result.set(chunk, cursor); cursor += chunk.length; }
  for (const chunk of centralChunks) { result.set(chunk, cursor); cursor += chunk.length; }
  result.set(end, cursor);
  return result;
}
