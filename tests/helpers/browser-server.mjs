// Test-only PeerJS signaling. It relays SDP/ICE JSON, never file bytes.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { WebSocketServer } from 'ws';
const clients = new Map();
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json' };
const server = createServer(async (req,res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path.endsWith('/runtime-config.js')) {
    const config = { peerOptions: { host:'127.0.0.1', port:4173, path:'/peerjs', secure:false }, iceServers:[], acceptTimeoutMs:5000, ackTimeoutMs:15000, sessionTimeoutMs:10000 };
    res.setHeader('Content-Type','text/javascript'); res.end(`window.BULUTSUZ_CONFIG = ${JSON.stringify(config)};`); return;
  }
  try {
    const filename = resolve('dist', '.' + (path === '/' ? '/index.html' : path));
    if (!filename.startsWith(resolve('dist') + '/')) throw new Error('invalid path');
    res.setHeader('Content-Type', types[extname(filename)] || 'application/octet-stream');
    res.end(await readFile(filename));
  } catch { res.writeHead(404);res.end('not found'); }
});
const wss = new WebSocketServer({ server });
wss.on('connection', (socket,req) => {
  const id = new URL(req.url,'http://localhost').searchParams.get('id');
  if (!id || clients.has(id)) { socket.send(JSON.stringify({type:'ID-TAKEN'}));socket.close();return; }
  clients.set(id,socket);
  socket.send(JSON.stringify({type:'OPEN'}));
  socket.on('message',(data) => {
    const message = JSON.parse(data.toString());
    if (!['OFFER','ANSWER','CANDIDATE','LEAVE'].includes(message.type)) return;
    const target = clients.get(message.dst);
    if (target?.readyState === 1) target.send(JSON.stringify({...message,src:id}));
    else socket.send(JSON.stringify({type:'EXPIRE',src:message.dst,payload:message.payload}));
  });
  socket.on('close',()=> { if (clients.get(id)===socket) clients.delete(id); });
});
server.listen(4173,'127.0.0.1');
