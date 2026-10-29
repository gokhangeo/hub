import { describe, expect, it } from 'vitest';
import {
  CHUNK_SIZE, TEXT_MAX_BYTES, createTransferId, generateSecureCode, generateSessionKey, displayCode, isValidCode,
  normalizeCode, sanitizeFilename, validateMetadata, validateMessage
} from '../src/protocol.js';

describe('kısa eşleştirme kodu', () => {
  it('6 haneli kod üretir', () => {
    const fakeCrypto = { getRandomValues: (bytes) => bytes.fill(482913) };
    const code = generateSecureCode(fakeCrypto);
    expect(code).toBe('BT-482913');
    expect(isValidCode(code)).toBe(true);
    expect(displayCode(code)).toBe('482 913');
  });

  it('boşluklu yazımı kabul eder', () => {
    expect(isValidCode('482 913')).toBe(true);
    expect(normalizeCode('482 913')).toBe('BT-482913');
    expect(isValidCode('48291')).toBe(false);
  });

  it('QR anahtarı üretir', () => {
    const fakeCrypto = { getRandomValues: (bytes) => bytes.fill(7) };
    expect(generateSessionKey(fakeCrypto)).toMatch(/^[A-HJ-NP-Z2-9]{16}$/);
  });

  it('kriptografik aktarım kimliği üretir', () => {
    const fakeCrypto = { getRandomValues: (bytes) => bytes.fill(255) };
    expect(createTransferId(fakeCrypto)).toBe('ffffffffffffffffffffffff');
  });
});

describe('uzak veri doğrulaması', () => {
  const limits = { maxFileBytes: 1024 ** 3, maxChunks: 20000 };

  it('geçerli metadatayı kabul eder', () => {
    const size = CHUNK_SIZE + 9;
    const result = validateMetadata({
      type: 'file-meta', id: 'a'.repeat(24), name: 'rapor.pdf', size,
      mime: 'application/pdf', totalChunks: 2
    }, limits);
    expect(result).toEqual({ ok: true, name: 'rapor.pdf' });
  });

  it('bellek saldırısı yaratabilecek parça sayısını reddeder', () => {
    const result = validateMetadata({
      type: 'file-meta', id: 'b'.repeat(24), name: 'x.bin', size: 1,
      mime: 'application/octet-stream', totalChunks: 19999
    }, limits);
    expect(result.ok).toBe(false);
  });

  it('dosya adındaki HTML ve yol karakterlerini zararsızlaştırır', () => {
    expect(sanitizeFilename('../<img onerror=alert(1)>.txt')).toBe('__img onerror=alert(1)_.txt');
  });

  it('kopyalanan metin türünü yalnız küçük boyutta işaretler', () => {
    const meta = { type: 'file-meta', id: 'c'.repeat(24), name: 'kopyalanan-metin.txt', size: 12, mime: 'text/plain;charset=utf-8', totalChunks: 1, kind: 'text' };
    expect(validateMetadata(meta, limits)).toEqual({ ok: true, name: 'kopyalanan-metin.txt', kind: 'text' });
    const large = { ...meta, size: TEXT_MAX_BYTES + 1, totalChunks: Math.ceil((TEXT_MAX_BYTES + 1) / CHUNK_SIZE) };
    expect(validateMetadata(large, limits)).toEqual({ ok: true, name: 'kopyalanan-metin.txt' });
    expect(validateMetadata({ ...meta, kind: 'script' }, limits).ok).toBe(false);
  });

  it('bilinmeyen protokol mesajını reddeder', () => {
    expect(validateMessage({ type: 'run-script' })).toBe(false);
  });
});

describe('QR bağlantısı', () => {
  it('kod ve anahtarı taşır', async () => {
    const { codeFromLink, keyFromLink, receiveLink } = await import('../src/protocol.js');
    const code = 'BT-482913'; const key = 'ABCDEFGHJKLMNPQR';
    expect(codeFromLink(`https://example.com/hub/?join=${code}`)).toBe(code);
    const url = receiveLink('https://example.com/hub/?old=value', code, key);
    expect(url).toBe(`https://example.com/hub/?receive=${code}&k=${key}`);
    expect(codeFromLink(url)).toBe(code);
    expect(keyFromLink(url)).toBe(key);
  });
  it('fazla haneli kodu reddeder', () => {
    expect(isValidCode('BT-4829131')).toBe(false);
  });
});
