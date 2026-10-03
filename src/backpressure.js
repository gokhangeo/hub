import { MAX_BUFFERED_AMOUNT } from './protocol.js';

export async function waitForBuffer(connection, isCancelled = () => false, timeoutMs = 30000) {
  if (!connection?.open || isCancelled()) throw new Error('Aktarım iptal edildi veya bağlantı kesildi.');
  const channel = connection.dataChannel;
  if (!channel || (channel.bufferedAmount <= MAX_BUFFERED_AMOUNT && !connection.bufferSize)) return;
  channel.bufferedAmountLowThreshold = Math.floor(MAX_BUFFERED_AMOUNT / 3);
  await new Promise((resolve, reject) => {
    let interval;
    let timeout;
    const clean = () => { clearInterval(interval); clearTimeout(timeout); channel.removeEventListener('bufferedamountlow', check); channel.removeEventListener('close', check); };
    const check = () => {
      if (!connection.open || channel.readyState === 'closed' || isCancelled()) { clean(); reject(new Error('Aktarım iptal edildi veya bağlantı kesildi.')); }
      else if (channel.bufferedAmount <= MAX_BUFFERED_AMOUNT && !connection.bufferSize) { clean(); resolve(); }
    };
    timeout = setTimeout(() => { clean(); reject(new Error('Gönderim tamponu zaman aşımına uğradı. Yeniden deneyin.')); }, timeoutMs);
    interval = setInterval(check, 100);
    channel.addEventListener('bufferedamountlow', check);
    channel.addEventListener('close', check);
    check();
  });
}
