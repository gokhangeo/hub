import Peer from 'peerjs';
import QRCode from 'qrcode';
import { createSHA256 } from 'hash-wasm';
import './styles.css';
import {
  CHUNK_SIZE, MAX_BUFFERED_AMOUNT, PROTOCOL_VERSION,
  connectionFingerprint, createTransferId, formatBytes, formatDuration,
  generateSecureCode, isValidCode, normalizeCode, sanitizeFilename,
  validateMessage, validateMetadata
} from './protocol.js';
import { takeSharedFiles } from './shared-files.js';

await import(/* @vite-ignore */ `${import.meta.env.BASE_URL}runtime-config.js`);

const DEFAULT_CONFIG = {
  peerOptions: {},
  iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }],
  iceServersUrl: '',
  maxFileBytes: 10 * 1024 ** 3,
  maxMemoryFileBytes: 200 * 1024 ** 2,
  maxChunks: 200000,
  maxConcurrentInbound: 3,
  acceptTimeoutMs: 120000,
  ackTimeoutMs: 120000
};
const CONFIG = Object.freeze({ ...DEFAULT_CONFIG, ...(window.BULUTSUZ_CONFIG || {}) });
const $ = (id) => document.getElementById(id);

let peer;
let myId = '';
let currentConnection = null;
let pendingConnection = null;
let qrScanner = null;
let Html5QrcodeClass = null;
let installPrompt = null;
let currentReceiveRequest = null;
let sendingQueue = Promise.resolve();
let sharedFilesQueue = [];
let iceServers = CONFIG.iceServers;
const connectionStates = new WeakMap();
const outboundTransfers = new Map();
const inboundTransfers = new Map();
const responseWaiters = new Map();
const receiveQueue = [];
const transferCards = new Map();

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  $('toast-region').append(toast);
  window.setTimeout(() => toast.remove(), 5200);
}

function setStatus(text, state = 'waiting') {
  $('status-text').textContent = text;
  $('status-dot').className = `status-dot status-dot--${state}`;
}

function setConnectedUi(connected) {
  $('send-panel').classList.toggle('panel--disabled', !connected);
  $('send-panel').setAttribute('aria-disabled', String(!connected));
  $('connect-button').textContent = connected ? 'Bağlantıyı kes' : 'Bağlan';
  $('connect-button').classList.toggle('button--danger', connected);
  $('connect-button').classList.toggle('button--primary', !connected);
  $('peer-fingerprint').hidden = !connected;
}

function buildShareUrl(id = myId) {
  const url = new URL(import.meta.env.BASE_URL, window.location.origin);
  url.searchParams.set('join', id);
  return url.toString();
}

async function resolveIceServers() {
  if (!CONFIG.iceServersUrl) return CONFIG.iceServers;
  try {
    const response = await fetch(CONFIG.iceServersUrl, { credentials: 'include', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    if (!Array.isArray(body.iceServers) || body.iceServers.length === 0) throw new Error('ICE listesi boş');
    return body.iceServers;
  } catch (error) {
    console.warn('Kurumsal ICE kimlik bilgileri alınamadı:', error);
    showToast('Kurumsal TURN bilgisi alınamadı; doğrudan bağlantı denenecek.', 'error');
    return CONFIG.iceServers;
  }
}

async function initPeer() {
  setStatus('Sinyal sunucusuna bağlanılıyor…', 'busy');
  iceServers = await resolveIceServers();
  myId = generateSecureCode();
  $('device-code').value = myId;
  const peerOptions = {
    ...CONFIG.peerOptions,
    debug: CONFIG.peerOptions.debug ?? 1,
    config: { ...(CONFIG.peerOptions.config || {}), iceServers }
  };
  peer = new Peer(myId, peerOptions);

  peer.on('open', async (id) => {
    myId = id;
    $('device-code').value = id;
    setStatus('Hazır. Güvenli bağlantı bekleniyor.', 'ready');
    await renderQr();
    const joinCode = normalizeCode(new URLSearchParams(location.search).get('join') || '');
    if (isValidCode(joinCode) && joinCode !== myId) {
      $('peer-code').value = joinCode;
      connectToPeer(joinCode);
    }
  });

  peer.on('connection', (connection) => wireConnection(connection, true));
  peer.on('disconnected', () => {
    setStatus('Sinyal bağlantısı yenileniyor…', 'busy');
    window.setTimeout(() => {
      if (peer && !peer.destroyed && peer.disconnected) peer.reconnect();
    }, 1200);
  });
  peer.on('error', handlePeerError);
}

function handlePeerError(error) {
  console.error('PeerJS:', error);
  const messages = {
    'id-taken': 'Cihaz kodu çakıştı; yeni güvenli kod oluşturuluyor.',
    'peer-unavailable': 'Hedef cihaz bulunamadı. Kodun açık olduğunu kontrol edin.',
    network: 'Sinyal sunucusuna erişilemiyor. Kurumsal ağ ayarlarını kontrol edin.',
    'server-error': 'Sinyal sunucusu geçici olarak yanıt vermiyor.'
  };
  showToast(messages[error.type] || `Bağlantı hatası: ${error.message || error.type}`, 'error');
  setStatus(messages[error.type] || 'Bağlantı hatası', 'error');
  if (error.type === 'id-taken') renewIdentity();
}

async function renderQr() {
  try {
    await QRCode.toCanvas($('qr-canvas'), buildShareUrl(), { width: 220, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#312e81', light: '#ffffff' } });
    $('qr-loading').hidden = true;
  } catch (error) {
    console.error(error);
    $('qr-loading').textContent = 'QR kod üretilemedi';
  }
}

function connectToPeer(value) {
  const target = normalizeCode(value);
  if (!isValidCode(target)) return showToast('Geçerli güvenli cihaz kodunu girin.', 'error');
  if (!peer?.open) return showToast('Cihaz kodunuz henüz hazır değil.', 'error');
  if (target === myId) return showToast('Aynı cihaza bağlanamazsınız.', 'error');
  if (currentConnection) return disconnectCurrent('Yeni bağlantı başlatıldı.');
  setStatus(`${target} cihazına bağlanılıyor…`, 'busy');
  const connection = peer.connect(target, { reliable: true, serialization: 'binary' });
  wireConnection(connection, false);
}

function wireConnection(connection, incoming) {
  const state = { incoming, approved: false, active: false, opened: false, timeout: null };
  connectionStates.set(connection, state);
  connection.on('open', () => {
    state.opened = true;
    if (incoming) {
      if (state.approved) acceptIncomingConnection(connection);
    } else {
      connection.send({ type: 'hello', version: PROTOCOL_VERSION });
      setStatus('Karşı cihazın onayı bekleniyor…', 'busy');
      state.timeout = window.setTimeout(() => rejectCandidate(connection, 'Bağlantı onayı zaman aşımına uğradı.'), CONFIG.acceptTimeoutMs);
    }
  });
  connection.on('data', (message) => routeMessage(connection, message));
  connection.on('close', () => handleConnectionClosed(connection));
  connection.on('error', (error) => {
    console.error('Veri kanalı:', error);
    if (connection === currentConnection) disconnectCurrent('Veri kanalı hatası oluştu.');
    else rejectCandidate(connection, 'Bağlantı kurulamadı.');
  });

  if (incoming) {
    if (pendingConnection) pendingConnection.close();
    pendingConnection = connection;
    $('connection-peer').textContent = connection.peer;
    $('connection-dialog').showModal();
    setStatus('Gelen bağlantı onayınızı bekliyor.', 'busy');
  }
}

function routeMessage(connection, message) {
  if (!validateMessage(message)) return;
  const state = connectionStates.get(connection);
  if (message.type === 'connection-accepted' && !state?.incoming) {
    window.clearTimeout(state.timeout);
    activateConnection(connection);
    return;
  }
  if (message.type === 'connection-rejected') {
    rejectCandidate(connection, 'Karşı cihaz bağlantıyı reddetti.');
    return;
  }
  if (connection !== currentConnection || !state?.active) return;
  handleTransferMessage(message).catch((error) => {
    console.error('Aktarım mesajı:', error);
    showToast('Aktarım paketi işlenemedi.', 'error');
  });
}

function approvePendingConnection() {
  if (!pendingConnection) return;
  const connection = pendingConnection;
  const state = connectionStates.get(connection);
  state.approved = true;
  pendingConnection = null;
  if (state.opened || connection.open) acceptIncomingConnection(connection);
  else setStatus('Güvenli veri kanalı kuruluyor…', 'busy');
}

function acceptIncomingConnection(connection) {
  if (currentConnection && currentConnection !== connection) disconnectCurrent('Bağlantı başka cihazla değiştirildi.');
  activateConnection(connection);
  connection.send({ type: 'connection-accepted', version: PROTOCOL_VERSION });
}

async function activateConnection(connection) {
  const state = connectionStates.get(connection);
  if (!state || state.active) return;
  state.active = true;
  currentConnection = connection;
  setConnectedUi(true);
  setStatus(`${connection.peer} cihazıyla güvenli kanal aktif.`, 'ready');
  $('fingerprint-value').textContent = await connectionFingerprint(myId, connection.peer);
  showToast('Güvenli WebRTC veri kanalı kuruldu.', 'success');
  inspectConnectionRoute(connection);
  flushSharedFiles();
}

function rejectCandidate(connection, reason) {
  const state = connectionStates.get(connection);
  if (state?.timeout) window.clearTimeout(state.timeout);
  try { if (connection.open) connection.send({ type: 'connection-rejected' }); } catch {}
  connection.close();
  if (pendingConnection === connection) pendingConnection = null;
  showToast(reason, 'error');
  if (!currentConnection) setStatus('Hazır. Güvenli bağlantı bekleniyor.', 'ready');
}

function handleConnectionClosed(connection) {
  if (connection !== currentConnection) return;
  currentConnection = null;
  setConnectedUi(false);
  setStatus('Bağlantı kapandı. Yeniden bağlanabilirsiniz.', 'waiting');
  markActiveTransfersFailed('Bağlantı kesildi; yeniden deneyebilirsiniz.');
}

function disconnectCurrent(message = 'Bağlantı kullanıcı tarafından kapatıldı.') {
  if (currentConnection) {
    const connection = currentConnection;
    currentConnection = null;
    connection.close();
  }
  setConnectedUi(false);
  setStatus('Hazır. Güvenli bağlantı bekleniyor.', 'ready');
  markActiveTransfersFailed(message);
  showToast(message);
}

async function inspectConnectionRoute(connection) {
  try {
    await new Promise((resolve) => setTimeout(resolve, 900));
    const stats = await connection.peerConnection?.getStats();
    let route = 'Doğrudan bağlantı';
    stats?.forEach((report) => {
      if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) {
        const local = stats.get(report.localCandidateId);
        const remote = stats.get(report.remoteCandidateId);
        if (local?.candidateType === 'relay' || remote?.candidateType === 'relay') route = 'Şifreli TURN rölesi';
      }
    });
    $('network-badge').textContent = route;
  } catch { $('network-badge').textContent = 'Güvenli WebRTC'; }
}

function waitForResponse(key, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      responseWaiters.delete(key);
      reject(new Error('Karşı cihaz yanıt vermedi.'));
    }, timeoutMs);
    responseWaiters.set(key, (message) => {
      window.clearTimeout(timeout);
      responseWaiters.delete(key);
      resolve(message);
    });
  });
}

function resolveResponse(key, message) {
  responseWaiters.get(key)?.(message);
}

async function processFiles(files) {
  const list = Array.from(files || []);
  if (!list.length) return;
  if (!currentConnection?.open) {
    sharedFilesQueue.push(...list);
    updateSharedFilesBanner();
    showToast('Dosyalar kuyruğa alındı. Önce alıcı cihaza bağlanın.');
    return;
  }
  for (const file of list) {
    if (file.size > CONFIG.maxFileBytes) {
      showToast(`${file.name}: ${formatBytes(CONFIG.maxFileBytes)} sınırını aşıyor.`, 'error');
      continue;
    }
    sendingQueue = sendingQueue.then(() => sendFile(file)).catch((error) => console.error(error));
  }
}

async function sendFile(file, existingId) {
  if (!currentConnection?.open) throw new Error('Bağlantı kapalı.');
  const id = existingId || createTransferId();
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const transfer = { id, file, totalChunks, sentBytes: 0, startedAt: performance.now(), cancelled: false, state: 'waiting' };
  outboundTransfers.set(id, transfer);
  createTransferCard(transfer, 'outgoing');
  updateTransferCard(id, { state: 'waiting', label: 'Alıcı onayı bekleniyor' });

  try {
    const acceptPromise = waitForResponse(`${id}:accept`, CONFIG.acceptTimeoutMs);
    currentConnection.send({ type: 'file-meta', id, name: file.name, size: file.size, mime: file.type || 'application/octet-stream', totalChunks, version: PROTOCOL_VERSION });
    const accepted = await acceptPromise;
    if (accepted.type !== 'file-accepted') throw new Error(accepted.reason || 'Alıcı dosyayı reddetti.');
    const resumeFrom = Number.isSafeInteger(accepted.resumeFrom) ? Math.max(0, Math.min(totalChunks, accepted.resumeFrom)) : 0;
    transfer.state = 'sending';
    transfer.sentBytes = Math.min(file.size, resumeFrom * CHUNK_SIZE);
    updateTransferCard(id, { state: 'sending', label: 'Gönderiliyor' });
    const hasher = await createSHA256();
    hasher.init();

    for (let index = 0, offset = 0; offset < file.size; index += 1, offset += CHUNK_SIZE) {
      if (transfer.cancelled) throw new Error('Aktarım iptal edildi.');
      if (!currentConnection?.open) throw new Error('Bağlantı kesildi.');
      const data = new Uint8Array(await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer());
      hasher.update(data);
      if (index >= resumeFrom) {
        await waitForBuffer(currentConnection);
        currentConnection.send({ type: 'file-chunk', id, index, data: data.buffer });
        transfer.sentBytes = Math.min(file.size, offset + data.byteLength);
        updateProgress(transfer, transfer.sentBytes, resumeFrom ? 'Kaldığı yerden gönderiliyor' : 'Gönderiliyor');
      }
    }

    const hash = hasher.digest('hex');
    const ackPromise = waitForResponse(`${id}:ack`, CONFIG.ackTimeoutMs);
    currentConnection.send({ type: 'file-end', id, hash, bytes: file.size, totalChunks });
    updateTransferCard(id, { state: 'verifying', label: 'Alıcı doğruluyor' });
    const acknowledgement = await ackPromise;
    if (acknowledgement.type !== 'file-ack') throw new Error(acknowledgement.reason || 'Alıcı doğrulaması başarısız.');
    transfer.state = 'complete';
    updateTransferCard(id, { state: 'complete', label: 'Doğrulandı ve alındı', percent: 100 });
    showToast(`“${sanitizeFilename(file.name)}” doğrulanarak alındı.`, 'success');
  } catch (error) {
    transfer.state = 'failed';
    updateTransferCard(id, { state: 'failed', label: error.message, retry: true });
    showToast(`${sanitizeFilename(file.name)}: ${error.message}`, 'error');
  }
}

async function waitForBuffer(connection) {
  if (!connection?.open) throw new Error('Bağlantı kesildi.');
  const channel = connection.dataChannel;
  if (!channel || channel.bufferedAmount <= MAX_BUFFERED_AMOUNT) return;
  channel.bufferedAmountLowThreshold = Math.floor(MAX_BUFFERED_AMOUNT / 3);
  await new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('Gönderim tamponu zaman aşımına uğradı.')), 30000);
    const done = () => { window.clearTimeout(timeout); channel.removeEventListener('bufferedamountlow', done); resolve(); };
    channel.addEventListener('bufferedamountlow', done, { once: true });
  });
}

async function handleTransferMessage(message) {
  if (message.type === 'file-meta') return enqueueIncomingMetadata(message);
  if (message.type === 'file-accepted' || message.type === 'file-rejected') return resolveResponse(`${message.id}:accept`, message);
  if (message.type === 'file-ack' || message.type === 'file-error') {
    resolveResponse(`${message.id}:ack`, message);
    resolveResponse(`${message.id}:accept`, message);
    return;
  }
  if (message.type === 'file-chunk') return receiveChunk(message);
  if (message.type === 'file-end') return finishIncomingTransfer(message);
  if (message.type === 'file-cancel') return cancelIncomingTransfer(message.id, 'Gönderici aktarımı iptal etti.');
}

function enqueueIncomingMetadata(meta) {
  const validation = validateMetadata(meta, CONFIG);
  const existing = inboundTransfers.get(meta.id);
  if (validation.ok && existing?.state === 'paused' && existing.peerId === currentConnection.peer && existing.size === meta.size && existing.totalChunks === meta.totalChunks && existing.safeName === validation.name) {
    existing.state = 'receiving';
    existing.startedAt = performance.now();
    currentConnection.send({ type: 'file-accepted', id: meta.id, resumeFrom: existing.expectedIndex });
    updateTransferCard(meta.id, { state: 'receiving', label: `${existing.expectedIndex}. parçadan devam ediyor`, retry: false });
    return;
  }
  if (!validation.ok || existing || receiveQueue.some((item) => item.id === meta.id)) {
    currentConnection.send({ type: 'file-rejected', id: meta.id, reason: validation.reason || 'Yinelenen aktarım isteği.' });
    return;
  }
  if (inboundTransfers.size >= CONFIG.maxConcurrentInbound) {
    currentConnection.send({ type: 'file-rejected', id: meta.id, reason: 'Aynı anda çok fazla dosya alınıyor.' });
    return;
  }
  receiveQueue.push({ ...meta, safeName: validation.name });
  createTransferCard({ id: meta.id, file: { name: validation.name, size: meta.size } }, 'incoming');
  updateTransferCard(meta.id, { state: 'waiting', label: 'Onay bekliyor' });
  showNextReceiveRequest();
}

function showNextReceiveRequest() {
  if (currentReceiveRequest || !receiveQueue.length) return;
  currentReceiveRequest = receiveQueue.shift();
  $('receive-file-name').textContent = currentReceiveRequest.safeName;
  $('receive-file-size').textContent = `${formatBytes(currentReceiveRequest.size)} · ${currentReceiveRequest.mime || 'Bilinmeyen tür'}`;
  const needsDisk = currentReceiveRequest.size > CONFIG.maxMemoryFileBytes;
  $('receive-storage-note').textContent = needsDisk
    ? ('showSaveFilePicker' in window ? 'Büyük dosya doğrudan seçtiğiniz konuma yazılacak.' : `Bu tarayıcı doğrudan disk yazmayı desteklemiyor; ${formatBytes(CONFIG.maxMemoryFileBytes)} sınırı uygulanır.`)
    : 'Dosya SHA-256 ile doğrulandıktan sonra indirilecek.';
  $('receive-dialog').showModal();
}

async function acceptReceiveRequest(event) {
  event.preventDefault();
  const meta = currentReceiveRequest;
  if (!meta) return;
  let writable = null;
  const mustStream = meta.size > CONFIG.maxMemoryFileBytes;
  try {
    if (mustStream) {
      if (!('showSaveFilePicker' in window)) throw new Error(`Tarayıcının güvenli bellek sınırı ${formatBytes(CONFIG.maxMemoryFileBytes)}.`);
      const handle = await window.showSaveFilePicker({ suggestedName: meta.safeName, types: [{ description: meta.mime || 'Dosya', accept: { [meta.mime || 'application/octet-stream']: ['.' + (meta.safeName.split('.').pop() || 'bin')] } }] });
      writable = await handle.createWritable();
    }
    const hasher = await createSHA256();
    hasher.init();
    inboundTransfers.set(meta.id, {
      ...meta, writable, hasher, chunks: writable ? null : [], expectedIndex: 0,
      receivedBytes: 0, startedAt: performance.now(), writeChain: Promise.resolve(), state: 'receiving',
      peerId: currentConnection.peer
    });
    currentConnection.send({ type: 'file-accepted', id: meta.id });
    updateTransferCard(meta.id, { state: 'receiving', label: 'Alınıyor' });
    closeReceiveDialog();
  } catch (error) {
    currentConnection.send({ type: 'file-rejected', id: meta.id, reason: error.name === 'AbortError' ? 'Alıcı kaydetme işlemini iptal etti.' : error.message });
    updateTransferCard(meta.id, { state: 'failed', label: error.name === 'AbortError' ? 'Kaydetme iptal edildi' : error.message });
    closeReceiveDialog();
  }
}

function rejectReceiveRequest() {
  if (!currentReceiveRequest) return;
  currentConnection?.send({ type: 'file-rejected', id: currentReceiveRequest.id, reason: 'Alıcı dosyayı reddetti.' });
  updateTransferCard(currentReceiveRequest.id, { state: 'failed', label: 'Reddedildi' });
  closeReceiveDialog();
}

function closeReceiveDialog() {
  if ($('receive-dialog').open) $('receive-dialog').close();
  currentReceiveRequest = null;
  window.setTimeout(showNextReceiveRequest, 0);
}

function receiveChunk(message) {
  const transfer = inboundTransfers.get(message.id);
  if (!transfer || transfer.state !== 'receiving') return;
  const data = message.data instanceof ArrayBuffer ? new Uint8Array(message.data) : ArrayBuffer.isView(message.data) ? new Uint8Array(message.data.buffer, message.data.byteOffset, message.data.byteLength) : null;
  const remaining = transfer.size - transfer.receivedBytes;
  if (!data || message.index !== transfer.expectedIndex || data.byteLength > CHUNK_SIZE || data.byteLength > remaining) {
    return failIncomingTransfer(transfer, 'Geçersiz veya sırası bozuk dosya parçası.');
  }
  transfer.expectedIndex += 1;
  transfer.receivedBytes += data.byteLength;
  transfer.writeChain = transfer.writeChain.then(async () => {
    transfer.hasher.update(data);
    if (transfer.writable) await transfer.writable.write(data);
    else transfer.chunks.push(data);
  }).catch((error) => failIncomingTransfer(transfer, `Dosya yazılamadı: ${error.message}`));
  updateProgress(transfer, transfer.receivedBytes, 'Alınıyor');
}

async function finishIncomingTransfer(message) {
  const transfer = inboundTransfers.get(message.id);
  if (!transfer || transfer.state !== 'receiving') return;
  try {
    await transfer.writeChain;
    if (transfer.receivedBytes !== transfer.size || transfer.expectedIndex !== transfer.totalChunks || message.bytes !== transfer.size || message.totalChunks !== transfer.totalChunks) throw new Error('Dosya eksik alındı.');
    const calculatedHash = transfer.hasher.digest('hex');
    if (!/^[a-f0-9]{64}$/.test(message.hash) || calculatedHash !== message.hash) throw new Error('SHA-256 bütünlük doğrulaması başarısız.');
    if (transfer.writable) await transfer.writable.close();
    else downloadBlob(new Blob(transfer.chunks, { type: transfer.mime || 'application/octet-stream' }), transfer.safeName);
    transfer.state = 'complete';
    updateTransferCard(transfer.id, { state: 'complete', label: 'Doğrulandı ve kaydedildi', percent: 100 });
    currentConnection.send({ type: 'file-ack', id: transfer.id, hash: calculatedHash });
    showToast(`“${transfer.safeName}” doğrulanarak kaydedildi.`, 'success');
    inboundTransfers.delete(transfer.id);
  } catch (error) {
    await failIncomingTransfer(transfer, error.message);
  }
}

async function failIncomingTransfer(transfer, reason) {
  if (!transfer || transfer.state === 'failed') return;
  transfer.state = 'failed';
  try { await transfer.writable?.abort(); } catch {}
  currentConnection?.send({ type: 'file-error', id: transfer.id, reason });
  updateTransferCard(transfer.id, { state: 'failed', label: reason });
  inboundTransfers.delete(transfer.id);
  showToast(`${transfer.safeName}: ${reason}`, 'error');
}

function cancelIncomingTransfer(id, reason) {
  const transfer = inboundTransfers.get(id);
  if (transfer) failIncomingTransfer(transfer, reason);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function createTransferCard(transfer, direction) {
  if (transferCards.has(transfer.id)) return;
  $('transfers-panel').hidden = false;
  const card = document.createElement('article');
  card.className = 'transfer-card';
  card.dataset.state = 'waiting';
  card.dataset.id = transfer.id;

  const top = document.createElement('div');
  top.className = 'transfer-card__top';
  const nameWrap = document.createElement('div');
  nameWrap.className = 'transfer-card__name';
  const name = document.createElement('strong');
  name.textContent = sanitizeFilename(transfer.file.name);
  name.title = name.textContent;
  const meta = document.createElement('div');
  meta.className = 'transfer-card__meta';
  meta.textContent = `${direction === 'incoming' ? 'Gelen' : 'Giden'} · ${formatBytes(transfer.file.size)}`;
  nameWrap.append(name, meta);
  const actions = document.createElement('div');
  actions.className = 'transfer-card__actions';
  const state = document.createElement('span');
  state.className = 'state';
  state.textContent = 'Hazırlanıyor';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'button button--danger';
  cancel.textContent = 'İptal';
  cancel.addEventListener('click', () => cancelTransfer(transfer.id));
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'button button--quiet';
  retry.textContent = 'Yeniden dene';
  retry.hidden = true;
  retry.addEventListener('click', () => retryTransfer(transfer.id));
  actions.append(state, cancel, retry);
  top.append(nameWrap, actions);
  const progress = document.createElement('div');
  progress.className = 'progress';
  progress.setAttribute('role', 'progressbar');
  progress.setAttribute('aria-valuemin', '0');
  progress.setAttribute('aria-valuemax', '100');
  const bar = document.createElement('span');
  progress.append(bar);
  const stats = document.createElement('div');
  stats.className = 'transfer-card__stats';
  const bytes = document.createElement('span');
  bytes.textContent = `0 B / ${formatBytes(transfer.file.size)}`;
  const speed = document.createElement('span');
  speed.textContent = 'Bekleniyor';
  stats.append(bytes, speed);
  card.append(top, progress, stats);
  $('transfer-list').prepend(card);
  transferCards.set(transfer.id, { card, state, cancel, retry, progress, bar, bytes, speed, size: transfer.file.size, direction });
}

function updateTransferCard(id, changes) {
  const ui = transferCards.get(id);
  if (!ui) return;
  if (changes.state) ui.card.dataset.state = changes.state;
  if (changes.label) ui.state.textContent = changes.label;
  if (Number.isFinite(changes.percent)) {
    const percent = Math.max(0, Math.min(100, changes.percent));
    ui.bar.style.width = `${percent}%`;
    ui.progress.setAttribute('aria-valuenow', String(Math.round(percent)));
  }
  const terminal = ['complete', 'failed'].includes(changes.state);
  if (terminal) ui.cancel.hidden = true;
  if (changes.retry === true) ui.retry.hidden = false;
  if (changes.retry === false) ui.retry.hidden = true;
  if (changes.state && !terminal) ui.cancel.hidden = false;
}

function updateProgress(transfer, bytes, label) {
  const elapsed = Math.max((performance.now() - transfer.startedAt) / 1000, 0.1);
  const speed = bytes / elapsed;
  const total = transfer.file?.size ?? transfer.size;
  const remaining = Math.max(0, total - bytes);
  const ui = transferCards.get(transfer.id);
  if (!ui) return;
  ui.bytes.textContent = `${formatBytes(bytes)} / ${formatBytes(total)}`;
  ui.speed.textContent = `${formatBytes(speed)}/sn · ${formatDuration(remaining / Math.max(speed, 1))}`;
  updateTransferCard(transfer.id, { percent: total === 0 ? 100 : bytes / total * 100, label });
}

function cancelTransfer(id) {
  const outbound = outboundTransfers.get(id);
  if (outbound && !['complete', 'failed'].includes(outbound.state)) {
    outbound.cancelled = true;
    currentConnection?.send({ type: 'file-cancel', id });
    updateTransferCard(id, { state: 'failed', label: 'İptal edildi', retry: true });
    return;
  }
  const inbound = inboundTransfers.get(id);
  if (inbound) {
    currentConnection?.send({ type: 'file-cancel', id });
    failIncomingTransfer(inbound, 'Alıcı aktarımı iptal etti.');
  }
}

function retryTransfer(id) {
  const transfer = outboundTransfers.get(id);
  if (!transfer?.file) return;
  if (!currentConnection?.open) return showToast('Devam etmek için aynı cihaza yeniden bağlanın.', 'error');
  updateTransferCard(id, { state: 'waiting', label: 'Devam isteği gönderiliyor', percent: 0, retry: false });
  sendingQueue = sendingQueue.then(() => sendFile(transfer.file, id)).catch((error) => console.error(error));
}

function markActiveTransfersFailed(reason) {
  for (const transfer of outboundTransfers.values()) {
    if (!['complete', 'failed'].includes(transfer.state)) {
      transfer.state = 'failed';
      updateTransferCard(transfer.id, { state: 'failed', label: reason, retry: true });
    }
  }
  for (const transfer of inboundTransfers.values()) {
    if (transfer.state === 'receiving') {
      transfer.state = 'paused';
      updateTransferCard(transfer.id, { state: 'failed', label: `${reason} Aynı cihaz bağlanırsa devam eder.` });
    }
  }
}

async function startQrScanner() {
  $('scanner-wrap').hidden = false;
  Html5QrcodeClass = Html5QrcodeClass || (await import('html5-qrcode')).Html5Qrcode;
  qrScanner = qrScanner || new Html5QrcodeClass('qr-reader');
  try {
    await qrScanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 230, height: 230 } }, onQrDecoded, () => {});
  } catch (error) {
    $('scanner-wrap').hidden = true;
    showToast('Kamera açılamadı. Kamera iznini ve HTTPS bağlantısını kontrol edin.', 'error');
  }
}

async function stopQrScanner() {
  try { if (qrScanner?.isScanning) await qrScanner.stop(); } catch {}
  $('scanner-wrap').hidden = true;
}

function parseQrValue(value) {
  try { return normalizeCode(new URL(value).searchParams.get('join') || ''); }
  catch { return normalizeCode(value); }
}

async function onQrDecoded(value) {
  await stopQrScanner();
  const code = parseQrValue(value);
  if (!isValidCode(code)) return showToast('QR kod geçerli bir Bulutsuz Transfer bağlantısı değil.', 'error');
  $('peer-code').value = code;
  connectToPeer(code);
}

async function scanQrFile(file) {
  const element = document.createElement('div');
  element.id = `qr-temp-${Date.now()}`;
  element.hidden = true;
  document.body.append(element);
  Html5QrcodeClass = Html5QrcodeClass || (await import('html5-qrcode')).Html5Qrcode;
  const scanner = new Html5QrcodeClass(element.id);
  try { await onQrDecoded(await scanner.scanFile(file, true)); }
  catch { showToast('Görselde geçerli QR kod bulunamadı.', 'error'); }
  finally { try { await scanner.clear(); } catch {} element.remove(); }
}

async function loadSharedFiles() {
  const shareError = new URLSearchParams(location.search).get('share-error');
  if (shareError) {
    const messages = { limit: 'Mobil paylaşım kuyruğu en fazla 20 dosya veya toplam 512 MB kabul eder.', quota: 'Cihazda paylaşılan dosyaları kuyruğa almak için yeterli boş alan yok.', unknown: 'Paylaşılan dosyalar kuyruğa alınamadı.' };
    showToast(messages[shareError] || messages.unknown, 'error');
  }
  try {
    const files = await takeSharedFiles();
    if (files.length) {
      sharedFilesQueue.push(...files);
      updateSharedFilesBanner();
      flushSharedFiles();
    }
  } catch (error) {
    console.error(error);
    if (new URLSearchParams(location.search).has('share-target')) showToast('Paylaşılan dosyalar okunamadı.', 'error');
  }
}

function updateSharedFilesBanner() {
  $('shared-files-banner').hidden = sharedFilesQueue.length === 0;
  $('shared-files-summary').textContent = sharedFilesQueue.length ? `${sharedFilesQueue.length} dosya bağlantı kurulduğunda gönderilecek.` : '';
}

function flushSharedFiles() {
  if (!currentConnection?.open || !sharedFilesQueue.length) return;
  const files = sharedFilesQueue.splice(0);
  updateSharedFilesBanner();
  processFiles(files);
}

function renewIdentity() {
  disconnectCurrent('Cihaz kodu yenilendi.');
  if (peer && !peer.destroyed) peer.destroy();
  $('qr-loading').hidden = false;
  initPeer();
}

function initTheme() {
  const stored = localStorage.getItem('theme');
  document.documentElement.classList.toggle('dark', stored ? stored === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
}

function bindEvents() {
  $('theme-button').addEventListener('click', () => {
    const dark = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  });
  $('settings-button').addEventListener('click', () => $('settings-dialog').showModal());
  $('copy-code').addEventListener('click', async () => { await navigator.clipboard.writeText(myId); showToast('Güvenli cihaz kodu kopyalandı.', 'success'); });
  $('share-link').addEventListener('click', async () => {
    const url = buildShareUrl();
    if (navigator.share) {
      try { await navigator.share({ title: 'Bulutsuz Transfer bağlantısı', text: 'Bu güvenli bağlantı ile cihazıma bağlanın.', url }); return; } catch (error) { if (error.name === 'AbortError') return; }
    }
    await navigator.clipboard.writeText(url);
    showToast('Bağlantı panoya kopyalandı.', 'success');
  });
  $('renew-code').addEventListener('click', renewIdentity);
  $('connect-button').addEventListener('click', () => currentConnection ? disconnectCurrent() : connectToPeer($('peer-code').value));
  $('peer-code').addEventListener('input', (event) => { const position = event.target.selectionStart; event.target.value = normalizeCode(event.target.value); event.target.setSelectionRange(position, position); });
  $('peer-code').addEventListener('keydown', (event) => { if (event.key === 'Enter') connectToPeer(event.currentTarget.value); });
  $('connection-accept').addEventListener('click', approvePendingConnection);
  $('connection-reject').addEventListener('click', (event) => { event.preventDefault(); if (pendingConnection) rejectCandidate(pendingConnection, 'Bağlantı isteği reddedildi.'); $('connection-dialog').close(); });
  $('receive-accept').addEventListener('click', acceptReceiveRequest);
  $('receive-reject').addEventListener('click', (event) => { event.preventDefault(); rejectReceiveRequest(); });
  $('camera-button').addEventListener('click', startQrScanner);
  $('camera-close').addEventListener('click', stopQrScanner);
  $('qr-file').addEventListener('change', (event) => event.target.files[0] && scanQrFile(event.target.files[0]));
  $('drop-zone').addEventListener('click', () => $('file-input').click());
  $('drop-zone').addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('file-input').click(); } });
  $('file-input').addEventListener('change', (event) => { processFiles(event.target.files); event.target.value = ''; });
  for (const name of ['dragenter', 'dragover']) $('drop-zone').addEventListener(name, (event) => { event.preventDefault(); $('drop-zone').classList.add('is-dragging'); });
  for (const name of ['dragleave', 'drop']) $('drop-zone').addEventListener(name, (event) => { event.preventDefault(); $('drop-zone').classList.remove('is-dragging'); });
  $('drop-zone').addEventListener('drop', (event) => processFiles(event.dataTransfer.files));
  $('clear-completed').addEventListener('click', () => {
    for (const [id, ui] of transferCards) if (['complete', 'failed'].includes(ui.card.dataset.state)) { ui.card.remove(); transferCards.delete(id); }
    $('transfers-panel').hidden = transferCards.size === 0;
  });
  $('shared-files-dismiss').addEventListener('click', () => { sharedFilesQueue = []; updateSharedFilesBanner(); });
  window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); installPrompt = event; $('install-button').hidden = false; });
  $('install-button').addEventListener('click', async () => { if (installPrompt) { await installPrompt.prompt(); installPrompt = null; $('install-button').hidden = true; } });
  window.addEventListener('online', () => $('network-badge').textContent = 'Çevrimiçi');
  window.addEventListener('offline', () => $('network-badge').textContent = 'Çevrimdışı');
}

async function registerServiceWorker() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    try { await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }); }
    catch (error) { console.warn('Service worker kaydı başarısız:', error); }
  }
}

async function bootstrap() {
  initTheme();
  bindEvents();
  $('transfer-limit').textContent = `Tek dosya üst sınırı ${formatBytes(CONFIG.maxFileBytes)}. ${formatBytes(CONFIG.maxMemoryFileBytes)} üzerindeki alımlar desteklenen tarayıcılarda doğrudan diske yazılır.`;
  $('setting-signal').textContent = CONFIG.peerOptions.host || 'PeerJS genel sinyal hizmeti';
  $('setting-ice').textContent = CONFIG.iceServersUrl || iceServers.flatMap((server) => Array.isArray(server.urls) ? server.urls : [server.urls]).filter(Boolean).join(', ');
  $('setting-limit').textContent = `${formatBytes(CONFIG.maxFileBytes)} / bellek ${formatBytes(CONFIG.maxMemoryFileBytes)}`;
  $('network-badge').textContent = navigator.onLine ? 'Çevrimiçi' : 'Çevrimdışı';
  setConnectedUi(false);
  await Promise.all([registerServiceWorker(), loadSharedFiles(), initPeer()]);
}

bootstrap().catch((error) => {
  console.error(error);
  setStatus('Uygulama başlatılamadı.', 'error');
  showToast(error.message, 'error');
});
