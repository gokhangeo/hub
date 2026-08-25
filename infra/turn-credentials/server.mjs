import { createHmac, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

const required = ['TURN_SECRET', 'TURN_HOST', 'ALLOWED_ORIGIN'];
for (const name of required) if (!process.env[name]) throw new Error(`${name} environment variable is required`);
const port = Number(process.env.PORT || 8080);

createServer((request, response) => {
  const origin = request.headers.origin || '';
  if (request.method !== 'GET' || request.url !== '/api/ice') return send(response, 404, { error: 'not_found' });
  if (origin !== process.env.ALLOWED_ORIGIN) return send(response, 403, { error: 'origin_denied' });

  const expiresAt = Math.floor(Date.now() / 1000) + 15 * 60;
  const username = `${expiresAt}:${randomBytes(8).toString('hex')}`;
  const credential = createHmac('sha1', process.env.TURN_SECRET).update(username).digest('base64');
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Vary', 'Origin');
  response.setHeader('Cache-Control', 'no-store');
  send(response, 200, {
    iceServers: [
      { urls: [`stun:${process.env.TURN_HOST}:3478`] },
      { urls: [`turn:${process.env.TURN_HOST}:3478?transport=udp`, `turn:${process.env.TURN_HOST}:3478?transport=tcp`, `turns:${process.env.TURN_HOST}:443?transport=tcp`], username, credential }
    ],
    expiresAt
  });
}).listen(port, '0.0.0.0', () => console.log(`TURN credential service listening on ${port}`));

function send(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(body));
}
