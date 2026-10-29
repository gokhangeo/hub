export const PROTOCOL_VERSION = 2;
export const CHUNK_SIZE = 64 * 1024;
export const MAX_BUFFERED_AMOUNT = 1024 * 1024;
// Copied text is sent as a small UTF-8 file and shown in place instead of downloaded.
export const TEXT_MAX_BYTES = 1024 * 1024;
// Short 6-digit code people can read aloud and type; the QR also carries a secret key
// that lets the scanner in without a tap, while a typed code needs the sender's approval.
export const CODE_PATTERN = /^BT-\d{6}$/;
export const KEY_PATTERN = /^[A-HJ-NP-Z2-9]{16}$/;

const SAFE_NAME_MAX = 180;
const VALID_TYPES = new Set([
  'hello', 'connection-accepted', 'connection-rejected',
  'file-meta', 'file-accepted', 'file-rejected', 'file-chunk',
  'file-end', 'file-ack', 'file-error', 'file-cancel'
]);

export function generateSecureCode(random = globalThis.crypto) {
  if (!random?.getRandomValues) throw new Error('Güvenli rastgele sayı üreticisi bulunamadı.');
  const buffer = new Uint32Array(1);
  let value;
  // Rejection sampling keeps every 6-digit code equally likely.
  do { value = random.getRandomValues(buffer)[0]; } while (value >= 4294000000);
  return `BT-${String(value % 1000000).padStart(6, '0')}`;
}

export function generateSessionKey(random = globalThis.crypto) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = random.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
}

export function normalizeCode(value = '') {
  const digits = String(value).replace(/\D/g, '').slice(0, 6);
  return digits ? `BT-${digits}` : '';
}

export function isValidCode(value) {
  const raw = String(value || '').trim().toUpperCase().replace(/[\s-]/g, '');
  const body = raw.startsWith('BT') ? raw.slice(2) : raw;
  return /^\d{6}$/.test(body);
}

// Shown to people as "482 913".
export function displayCode(code) {
  const digits = String(code || '').replace(/\D/g, '');
  return digits.length === 6 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : '';
}

// Both the original invitation URLs and sender QR URLs stay compatible.
export function codeFromLink(value, base = 'https://localhost/') {
  try {
    const url = new URL(value, base);
    const code = url.searchParams.get('receive') || url.searchParams.get('join') || '';
    return isValidCode(code) ? normalizeCode(code) : '';
  } catch { return isValidCode(value) ? normalizeCode(value) : ''; }
}

export function keyFromLink(value, base = 'https://localhost/') {
  try {
    const key = new URL(value, base).searchParams.get('k') || '';
    return KEY_PATTERN.test(key) ? key : '';
  } catch { return ''; }
}

export function receiveLink(base, code, key = '') {
  if (!isValidCode(code)) throw new Error('Geçersiz cihaz kodu.');
  const url = new URL(base);
  url.search = '';
  url.hash = '';
  url.searchParams.set('receive', normalizeCode(code));
  if (KEY_PATTERN.test(key)) url.searchParams.set('k', key);
  return url.toString();
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
  if (meta.kind !== undefined && meta.kind !== 'text') return { ok: false, reason: 'Aktarım türü geçersiz.' };
  const name = sanitizeFilename(meta.name);
  return meta.kind === 'text' && meta.size <= TEXT_MAX_BYTES ? { ok: true, name, kind: 'text' } : { ok: true, name };
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
