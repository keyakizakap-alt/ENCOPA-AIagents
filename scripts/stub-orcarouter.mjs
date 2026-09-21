// Stub OrcaRouter used by the integration tests. It records every request it receives and
// replies according to a script the test sets, so the retry, cache and prompt-cache paths
// can be exercised without contacting a real provider. Never used outside `pnpm test`.
import { createServer } from 'node:http';

const port = Number(process.env.TEST_STUB_PORT || 3011);
let script = { mode: 'ok', remaining: 0 };
let requests = [];

const json = (res, status, value) => {
  const payload = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
};

const read = req => new Promise(resolve => {
  let raw = '';
  req.on('data', chunk => { raw += chunk });
  req.on('end', () => { try { resolve(JSON.parse(raw)) } catch { resolve(null) } });
});

createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);

  if (url.pathname === '/__control') {
    script = { ...{ mode: 'ok', remaining: 0 }, ...(await read(req)) };
    requests = [];
    return json(res, 200, { ok: true });
  }
  if (url.pathname === '/__requests') {
    return json(res, 200, { requests });
  }
  if (url.pathname !== '/v1/chat/completions') {
    return json(res, 404, { error: 'not_found' });
  }

  const body = await read(req);
  requests.push({ body, authorization: req.headers.authorization ?? null });

  // `remaining` failures are served first, then the mode falls through to a success.
  if (script.remaining > 0) {
    script = { ...script, remaining: script.remaining - 1 };
    if (script.mode === 'timeout') return; // hold the socket open until the client aborts
    return json(res, script.mode === 'http_400' ? 400 : 500, { error: { message: 'stub failure' } });
  }
  if (script.mode === 'always_400') return json(res, 400, { error: { message: 'stub rejects this request' } });
  if (script.mode === 'always_500') return json(res, 500, { error: { message: 'stub is down' } });
  if (script.mode === 'always_timeout') return;

  return json(res, 200, {
    model: script.model ?? 'stub/model-a',
    choices: [{ message: { content: script.content ?? 'スタブが返した評価方針の説明です。' } }],
    usage: { prompt_tokens_details: { cached_tokens: script.cachedTokens ?? 0 } },
  });
}).listen(port, '127.0.0.1', () => {
  console.log(`stub orcarouter listening on ${port}`);
});
