import { createServer } from 'node:http';

// A scripted stand-in for the venue provider. The route's retry, circuit breaker and
// stale-cache paths are only reachable with a provider that misbehaves on demand.
const port = Number(process.argv[2] || 3012);
let requestCount = 0;
let script = { mode: 'ok', remaining: 0 };

const shop = (i) => ({
  id: `mock-${i}`,
  name: `モック居酒屋 ${i}`,
  address: '東京都千代田区丸の内1-1-1',
  lat: 35.68, lng: 139.76,
  catch: 'テスト用の店舗データです',
  access: 'テスト駅から徒歩5分',
  capacity: 60, party_capacity: 30,
  open: '17:00〜23:00', close: '日曜',
  private_room: 'あり', free_drink: 'あり', course: 'あり', non_smoking: '全面禁煙',
  genre: { name: '居酒屋', catch: 'テスト' },
  budget: { name: '5000円〜5999円', average: '5500円' },
  urls: { pc: `https://example.com/mock/${i}` },
  photo: { pc: { l: 'https://imgfp.hotp.jp/mock.jpg' } },
});

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (req.method === 'GET' && url.pathname === '/count') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ count: requestCount }));
    return;
  }
  if (req.method === 'POST' && url.pathname === '/control') {
    let raw = ''; for await (const chunk of req) raw += chunk;
    script = { mode: 'ok', remaining: 0, ...(raw ? JSON.parse(raw) : {}) };
    requestCount = 0;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (url.pathname !== '/gourmet/v1/') { res.writeHead(404); res.end(); return; }
  if (url.searchParams.get('key') !== 'test-hotpepper-key') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ results: { error: [{ message: 'Invalid key' }] } }));
    return;
  }
  requestCount += 1;
  if (script.remaining > 0) {
    script = { ...script, remaining: script.remaining - 1 };
    if (script.mode === 'timeout') return; // never answers; the route's own timeout fires
    res.writeHead(script.mode === 'http_400' ? 400 : 500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'mock failure' }));
    return;
  }
  if (script.mode === 'always_500') { res.writeHead(500); res.end(JSON.stringify({ error: 'mock is down' })); return; }
  if (script.mode === 'key_error') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ results: { error: [{ message: 'Invalid key: authorization failed' }] } }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ results: { results_available: 128, shop: [1, 2, 3].map(shop) } }));
});
server.listen(port, '127.0.0.1');
