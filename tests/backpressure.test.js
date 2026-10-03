import { expect, it, vi } from 'vitest';
import { waitForBuffer } from '../src/backpressure.js';
function connection() { const channel = new EventTarget(); channel.bufferedAmount=2*1024*1024;channel.readyState='open';return {open:true,bufferSize:0,dataChannel:channel}; }
it('waits for the channel and PeerJS queue to drain',async () => {
  const conn=connection();const pending=waitForBuffer(conn);conn.dataChannel.bufferedAmount=0;conn.dataChannel.dispatchEvent(new Event('bufferedamountlow'));await pending;
});
it('rejects a closed channel instead of waiting for 30 seconds',async () => {
  const conn=connection();const pending=waitForBuffer(conn);conn.open=false;conn.dataChannel.dispatchEvent(new Event('close'));await expect(pending).rejects.toThrow('bağlantı kesildi');
});
it('cleans listeners on timeout',async () => {
  const conn=connection();const remove=vi.spyOn(conn.dataChannel,'removeEventListener');await expect(waitForBuffer(conn,()=>false,1)).rejects.toThrow('zaman aşımı');expect(remove).toHaveBeenCalledTimes(2);
});
