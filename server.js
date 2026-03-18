const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 8000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const JOURNAL_FILE = path.join(DATA_DIR, 'journal.json');

const STATIC_FILES = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/styles.css': 'styles.css',
  '/app.js': 'app.js'
};

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

const researchPayload = {
  markets: [
    {
      title: 'Equities playbook',
      tag: 'Macro + earnings',
      body:
        'Track catalyst calendars, valuation context, regime shifts, liquidity conditions, and what evidence would invalidate the thesis.'
    },
    {
      title: 'Rates and macro monitor',
      tag: 'Top-down inputs',
      body:
        'Document inflation, central-bank policy, labor data, and geopolitical events before sizing any cross-asset idea.'
    },
    {
      title: 'Alternative opportunities',
      tag: 'Private / thematic',
      body:
        'Log what is investable, what is liquid, what is speculative, and which opportunities are unsuitable without expert review.'
    }
  ],
  crypto: [
    {
      title: 'Token due diligence',
      tag: 'Protocol basics',
      body:
        'Review token utility, issuance, unlock schedules, custody constraints, concentration risks, and smart-contract exposure.'
    },
    {
      title: 'On-chain context',
      tag: 'Network health',
      body:
        'Use address growth, active wallets, exchange flows, and liquidity concentration as context — not as guarantees.'
    },
    {
      title: 'Execution controls',
      tag: 'Risk limits',
      body:
        'Set max position size, stop conditions, profit-taking plans, and rules for avoiding emotional overtrading.'
    }
  ],
  betting: [
    {
      title: 'Line shopping checklist',
      tag: 'Price discipline',
      body:
        'Compare prices across books, log expected value assumptions, and record how much edge disappears after vig and limits.'
    },
    {
      title: 'Social betting filter',
      tag: 'Crowd noise',
      body:
        'Treat influencer picks, public-ticket percentages, and hype cycles as sentiment inputs rather than confirmation.'
    },
    {
      title: 'Bankroll governance',
      tag: 'Loss containment',
      body:
        'Define stake caps, stop-loss rules, and entertainment-only budgets. If the edge cannot be explained, pass.'
    }
  ],
  wallet: [
    {
      title: 'Non-custodial model',
      body: 'Keep user keys under user control. Do not hold funds or imply insured outcomes.'
    },
    {
      title: 'Permission prompts',
      body: 'Require explicit user approval before any wallet connection or signing request.'
    },
    {
      title: 'Audit trail',
      body: 'Log research decisions separately from any future transaction layer for transparency.'
    },
    {
      title: 'Jurisdiction review',
      body: 'Review legal requirements for financial products, wagering features, and digital-asset integrations before launch.'
    }
  ]
};

function ensureStorage() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(JOURNAL_FILE)) {
    fs.writeFileSync(JOURNAL_FILE, '[]\n', 'utf8');
  }
}

function readJournalEntries() {
  ensureStorage();
  return JSON.parse(fs.readFileSync(JOURNAL_FILE, 'utf8'));
}

function writeJournalEntries(entries) {
  ensureStorage();
  fs.writeFileSync(JOURNAL_FILE, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': CONTENT_TYPES['.json'] });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message);
}

function serveStatic(res, pathname) {
  const fileName = STATIC_FILES[pathname];
  if (!fileName) {
    sendText(res, 404, 'Not found');
    return;
  }

  const filePath = path.join(ROOT, fileName);
  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 2_000_000) {
        reject(new Error('Request body too large.'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

function buildFileSummary(file) {
  const content = String(file.content || '').replace(/\s+/g, ' ').trim();
  return {
    name: String(file.name || 'untitled'),
    size: content.length,
    preview: content.slice(0, 220) || 'Empty file'
  };
}

async function routeApi(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/health') {
    sendJson(res, 200, { ok: true, service: 'tones-and-bones-backend' });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/research') {
    sendJson(res, 200, researchPayload);
    return;
  }

  if (req.method === 'GET' && pathname === '/api/journal') {
    sendJson(res, 200, { entries: readJournalEntries() });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/journal') {
    const raw = await getRequestBody(req);
    const payload = JSON.parse(raw || '{}');
    const name = String(payload.name || '').trim();
    const thesis = String(payload.thesis || '').trim();
    const risk = String(payload.risk || '').trim();

    if (!name || !thesis || !risk) {
      sendJson(res, 400, { error: 'name, thesis, and risk are required' });
      return;
    }

    const entries = readJournalEntries();
    const entry = {
      id: `${Date.now()}`,
      name,
      thesis,
      risk,
      createdAt: new Date().toISOString()
    };
    entries.unshift(entry);
    writeJournalEntries(entries);
    sendJson(res, 201, { entry, entries });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/uploads/summarize') {
    const raw = await getRequestBody(req);
    const payload = JSON.parse(raw || '{}');
    const files = Array.isArray(payload.files) ? payload.files : [];
    const summaries = files.map(buildFileSummary);
    sendJson(res, 200, { summaries });
    return;
  }

  sendText(res, 404, 'Not found');
}

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    if (parsedUrl.pathname.startsWith('/api/')) {
      await routeApi(req, res, parsedUrl.pathname);
      return;
    }

    serveStatic(res, parsedUrl.pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Internal server error' });
  }
});

server.listen(PORT, () => {
  ensureStorage();
  console.log(`Tones & Bones server running on http://localhost:${PORT}`);
});
