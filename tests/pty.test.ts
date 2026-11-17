import { describe, expect, it } from "bun:test";
import { appendRollingBuffer, decodePtyChunk, MAX_PTY_BUFFER_SIZE } from "../server/pty";

function hasLoneSurrogate(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = str.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        return true;
      }
      i++;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function feedChunks(chunks: Uint8Array[], maxSize = MAX_PTY_BUFFER_SIZE) {
  const decoder = new TextDecoder("utf-8");
  const emitted: string[] = [];
  let buffer = "";

  for (const chunk of chunks) {
    const str = decodePtyChunk(decoder, chunk);
    if (str.length > 0) {
      buffer = appendRollingBuffer(buffer, str, maxSize);
      emitted.push(str);
    }
  }

  return { onDataOutput: emitted.join(""), buffer };
}

describe("PTY UTF-8 streaming decode and rolling buffer", () => {
  it("preserves a 4-byte emoji split 1/3 and 3/1 across chunks", () => {
    const emoji = "🚀";
    const bytes = new TextEncoder().encode(emoji);
    expect(bytes.length).toBe(4);

    const split13 = feedChunks([bytes.slice(0, 1), bytes.slice(1)]);
    expect(split13.onDataOutput).toBe(emoji);
    expect(split13.buffer).toBe(emoji);
    expect(split13.onDataOutput).not.toContain("\uFFFD");

    const split31 = feedChunks([bytes.slice(0, 3), bytes.slice(3)]);
    expect(split31.onDataOutput).toBe(emoji);
    expect(split31.buffer).toBe(emoji);
    expect(split31.onDataOutput).not.toContain("\uFFFD");
  });

  it("preserves a 3-byte character split 1/2 and 2/1 across chunks", () => {
    const char = "あ";
    const bytes = new TextEncoder().encode(char);
    expect(bytes.length).toBe(3);

    const split12 = feedChunks([bytes.slice(0, 1), bytes.slice(1)]);
    expect(split12.onDataOutput).toBe(char);
    expect(split12.buffer).toBe(char);
    expect(split12.onDataOutput).not.toContain("\uFFFD");

    const split21 = feedChunks([bytes.slice(0, 2), bytes.slice(2)]);
    expect(split21.onDataOutput).toBe(char);
    expect(split21.buffer).toBe(char);
    expect(split21.onDataOutput).not.toContain("\uFFFD");
  });

  it("trims rolling buffer above 128 KB without leaving lone surrogates or U+FFFD", () => {
    const decoder = new TextDecoder("utf-8");
    const encoder = new TextEncoder();
    // Prefix with 1 UTF-16 code unit ("a") so 2-unit emoji pairs cross even/odd boundaries
    // and force the 128 KB slice boundary to land mid-surrogate pair.
    const payload = `a${"🚀".repeat(MAX_PTY_BUFFER_SIZE / 2 + 100)}`;
    const bytes = encoder.encode(payload);

    let buffer = "";
    const chunkSize = 4097; // odd chunk size to also split multi-byte UTF-8 sequences
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const str = decodePtyChunk(decoder, bytes.subarray(offset, offset + chunkSize));
      if (str.length > 0) {
        buffer = appendRollingBuffer(buffer, str, MAX_PTY_BUFFER_SIZE);
      }
    }

    expect(buffer.length).toBeLessThanOrEqual(MAX_PTY_BUFFER_SIZE);
    expect(buffer.length).toBeGreaterThan(MAX_PTY_BUFFER_SIZE - 4);
    expect(buffer).not.toContain("\uFFFD");
    expect(hasLoneSurrogate(buffer)).toBe(false);
  });
});
