import { describe, expect, it } from 'vitest';
import {
  CHUNK_SIZE, createTransferId, generateSecureCode, isValidCode,
  normalizeCode, sanitizeFilename, validateMetadata, validateMessage
} from '../src/protocol.js';

describe('güvenli eşleştirme kodu', () => {
  it('16 karakterlik okunabilir kod üretir', () => {
    const fakeCrypto = { getRandomValues: (bytes) => bytes.fill(7) };
    const code = generateSecureCode(fakeCrypto);
    expect(code).toMatch(/^BT-(?:[A-HJ-NP-Z2-9]{4}-){3}[A-HJ-NP-Z2-9]{4}$/);
    expect(isValidCode(code)).toBe(true);
  });

  it('boşluk ve tireleri normalize eder', () => {
    expect(normalizeCode('bt abcd efgh jkmn 2345')).toBe('BT-ABCD-EFGH-JKMN-2345');
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

  it('bilinmeyen protokol mesajını reddeder', () => {
    expect(validateMessage({ type: 'run-script' })).toBe(false);
  });
});
