window.BULUTSUZ_CONFIG = Object.freeze({
  peerOptions: {},
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
  ],
  iceServersUrl: '',
  maxFileBytes: 10 * 1024 * 1024 * 1024,
  maxMemoryFileBytes: 200 * 1024 * 1024,
  maxChunks: 200000,
  maxConcurrentInbound: 3,
  acceptTimeoutMs: 120000,
  ackTimeoutMs: 120000
});
