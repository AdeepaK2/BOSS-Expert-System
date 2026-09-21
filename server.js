// B0SS local server: serves the app and lets the knowledge editor save.
//
//   node server.js            http://localhost:8080/web/
//                             http://localhost:8080/web/editor.html
//
// No dependencies. It serves the repository root, so the assessment page
// reads kb/*.pl directly and a saved edit shows up on the next run.
//
// A save is refused unless the edited knowledge base consults and passes
// kb/boss_kbcheck.pl with no errors (kbtools.js). The previous files are
// copied to kb/.history/<time>/ first, and build.js is re-run so the
// file:// bundle matches what was saved.
//
// The passcode (BOSS_EDITOR_PASS, default "boss-admin") separates the
// knowledge engineer from the ordinary user. It is a demonstration of
// the role, not security: the server listens on this machine only.
// Set it in a .env file beside this one (see .env.example) or in the
// environment; a variable already in the environment wins over .env.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { KB_FILES, CHECK_FILE, parseCases, validate } = require('./web/kbtools.js');

const ROOT = __dirname;

// Minimal .env reader: KEY=value lines, # comments, optional quotes.
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_]\w*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
} catch (e) { /* no .env: defaults apply */ }

const KB = path.join(ROOT, 'kb');
const HISTORY = path.join(KB, '.history');
const PORT = +process.env.PORT || 8080;
const PASS = process.env.BOSS_EDITOR_PASS || 'boss-admin';
const MAX_BODY = 1 << 20;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.pl': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.json': 'application/json', '.pdf': 'application/pdf',
  '.md': 'text/plain; charset=utf-8'
};

const read = f => fs.readFileSync(path.join(KB, f), 'utf8');
const readAll = () => Object.fromEntries(KB_FILES.concat(CHECK_FILE).map(f => [f, read(f)]));
const readCases = () => parseCases(fs.readFileSync(path.join(ROOT, 'test', 'cases.pl'), 'utf8'));

function passOk(req) {
  const given = String(req.headers['x-boss-pass'] || '');
  const h = s => crypto.createHash('sha256').update(s).digest();
  return crypto.timingSafeEqual(h(given), h(PASS));
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function body(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('too large')); req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (e) { reject(new Error('bad json')); }
    });
  });
}

// Only the five knowledge files may be written. The checker is never
// taken from the request: the knowledge must not bring its own judge.
function editedFiles(sent) {
  const files = readAll();
  for (const f of KB_FILES) if (typeof (sent || {})[f] === 'string') files[f] = sent[f];
  return files;
}

async function api(req, res, url) {
  if (url === '/api/kb' && req.method === 'GET') {
    return send(res, 200, { files: readAll(), cases: readCases(), editable: KB_FILES });
  }
  if (!passOk(req)) return send(res, 401, { error: 'Wrong passcode.' });

  if (url === '/api/login' && req.method === 'POST') return send(res, 200, { ok: true });

  if (url === '/api/validate' && req.method === 'POST') {
    const { files } = await body(req);
    return send(res, 200, await validate(editedFiles(files), readCases()));
  }

  if (url === '/api/kb' && req.method === 'POST') {
    const { files } = await body(req);
    const next = editedFiles(files);
    const report = await validate(next, readCases());
    if (!report.ok) return send(res, 422, { error: 'The knowledge base has errors; nothing was saved.', report });

    const changed = KB_FILES.filter(f => next[f] !== read(f));
    if (changed.length) {
      const dir = path.join(HISTORY, new Date().toISOString().replace(/[:.]/g, '-'));
      fs.mkdirSync(dir, { recursive: true });
      for (const f of changed) fs.copyFileSync(path.join(KB, f), path.join(dir, f));
      for (const f of changed) fs.writeFileSync(path.join(KB, f), next[f]);
      execFileSync(process.execPath, [path.join(ROOT, 'build.js')], { cwd: ROOT });
      console.log(`saved ${changed.join(', ')} (backup: kb/.history/${path.basename(dir)})`);
    }
    return send(res, 200, { ok: true, changed, report });
  }
  send(res, 404, { error: 'Unknown endpoint.' });
}

function serveFile(req, res, url) {
  const rel = decodeURIComponent(url).replace(/^\/+/, '') || 'index.html';
  const file = path.normalize(path.join(ROOT, rel));
  // Stay inside the repository, and never serve dotfiles (.git, .history).
  if (!file.startsWith(ROOT + path.sep) && file !== ROOT) return send(res, 403, { error: 'Forbidden.' });
  if (path.relative(ROOT, file).split(path.sep).some(p => p.startsWith('.'))) return send(res, 404, { error: 'Not found.' });

  fs.stat(file, (err, st) => {
    if (err) return send(res, 404, { error: 'Not found.' });
    const target = st.isDirectory() ? path.join(file, 'index.html') : file;
    if (st.isDirectory() && !url.endsWith('/')) {
      res.writeHead(301, { Location: url + '/' }); return res.end();
    }
    fs.readFile(target, (e, data) => {
      if (e) return send(res, 404, { error: 'Not found.' });
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(target)] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      res.end(data);
    });
  });
}

http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  try {
    if (url.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed.' });
    serveFile(req, res, url);
  } catch (e) {
    send(res, 400, { error: e.message });
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`B0SS             http://localhost:${PORT}/web/`);
  console.log(`Knowledge editor http://localhost:${PORT}/web/editor.html`);
  if (!process.env.BOSS_EDITOR_PASS) console.log('Editor passcode: boss-admin (set BOSS_EDITOR_PASS in .env to change it)');
});
