export const PROTOCOL_VERSION = 2;
export const CHUNK_SIZE = 64 * 1024;
export const MAX_BUFFERED_AMOUNT = 1024 * 1024;
export const CODE_PATTERN = /^BT-(?:[A-HJ-NP-Z2-9]{4}-){3}[A-HJ-NP-Z2-9]{4}$/;

const SAFE_NAME_MAX = 180;
const VALID_TYPES = new Set([
  'hello', 'connection-accepted', 'connection-rejected',
  'file-meta', 'file-accepted', 'file-rejected', 'file-chunk',
  'file-end', 'file-ack', 'file-error', 'file-cancel'
]);

export function generateSecureCode(random = globalThis.crypto) {
  if (!random?.getRandomValues) throw new Error('Güvenli rastgele sayı üreticisi bulunamadı.');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = random.getRandomValues(new Uint8Array(16));
  const body = Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
  return `BT-${body.match(/.{1,4}/g).join('-')}`;
}

export function normalizeCode(value = '') {
  const raw = String(value).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const withoutPrefix = raw.startsWith('BT') ? raw.slice(2) : raw;
  const body = withoutPrefix.slice(0, 16);
  return body ? `BT-${body.match(/.{1,4}/g).join('-')}` : '';
}

export function isValidCode(value) {
  return CODE_PATTERN.test(normalizeCode(value));
}

export function createTransferId(random = globalThis.crypto) {
  const bytes = random.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function sanitizeFilename(value) {
  const name = String(value || 'dosya')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^[.\s]+/, '')
    .trim();
  return (name || 'dosya').slice(0, SAFE_NAME_MAX);
}

export function validateMessage(message) {
  return Boolean(message && typeof message === 'object' && VALID_TYPES.has(message.type));
}

export function validateMetadata(meta, limits) {
  if (!meta || meta.type !== 'file-meta') return { ok: false, reason: 'Geçersiz aktarım isteği.' };
  if (!/^[a-f0-9]{24}$/.test(String(meta.id))) return { ok: false, reason: 'Geçersiz aktarım kimliği.' };
  if (!Number.isSafeInteger(meta.size) || meta.size < 0 || meta.size > limits.maxFileBytes) return { ok: false, reason: 'Dosya boyutu izin verilen sınırın dışında.' };
  const expectedChunks = Math.ceil(meta.size / CHUNK_SIZE);
  if (!Number.isSafeInteger(meta.totalChunks) || meta.totalChunks !== expectedChunks || meta.totalChunks > limits.maxChunks) return { ok: false, reason: 'Parça bilgisi geçersiz.' };
  if (typeof meta.name !== 'string' || !meta.name.trim() || meta.name.length > SAFE_NAME_MAX * 2) return { ok: false, reason: 'Dosya adı geçersiz.' };
  if (typeof meta.mime !== 'string' || meta.mime.length > 160) return { ok: false, reason: 'Dosya türü geçersiz.' };
  return { ok: true, name: sanitizeFilename(meta.name) };
}

export function formatBytes(bytes, decimals = 1) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : decimals)} ${units[index]}`;
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'hesaplanıyor';
  if (seconds < 60) return `${Math.ceil(seconds)} sn`;
  return `${Math.floor(seconds / 60)} dk ${Math.ceil(seconds % 60)} sn`;
}

export async function connectionFingerprint(firstId, secondId) {
  const input = [firstId, secondId].sort().join('|');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
  return hex.slice(0, 4).match(/.{2}/g).join(' ') + ' · ' + hex.slice(4, 8).match(/.{2}/g).join(' ');
}
