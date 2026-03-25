/* ─────────────────────────────────────────────────────────────────────────
   Tones-and-Bones  |  Wealth Command Center  |  app.js
   Polls /api/metrics every 30s, drives all dynamic UI sections.
   ───────────────────────────────────────────────────────────────────────── */

let metrics   = null;
let journal   = JSON.parse(localStorage.getItem('tnb_journal') || '[]');
let events    = [];
let eventSrc  = null;
let currentSection = 'research';

// ── Boot ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  fetchMetrics();
  fetchResearch();
  renderJournal();
  startEventStream();
  setInterval(fetchMetrics, 30000);

  document.getElementById('journalForm').addEventListener('submit', saveJournalEntry);
  document.getElementById('fileInput').addEventListener('change', handleFileUpload);
  document.getElementById('cmdInput').addEventListener('keydown', handleCommand);
});

// ── Section Nav ───────────────────────────────────────────────────────────
function showSection(id) {
  currentSection = id;
  ['research', 'cashclaw', 'leads', 'scaling'].forEach(s => {
    document.getElementById('section-' + s).classList.toggle('hidden', s !== id);
    const nav = document.getElementById('nav-' + s);
    if (nav) {
      nav.className = s === id
        ? 'flex items-center gap-2 px-2 py-2 rounded-sm bg-primary/10 text-primary border border-primary/20'
        : 'flex items-center gap-2 px-2 py-2 rounded-sm text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors';
    }
  });

  const titles = {
    research:  ['Research & Idea Workspace', 'Risk-aware market intelligence for equities, crypto, macro, and sports-betting.'],
    cashclaw:  ['CashClaw Agent', 'Autonomous revenue engine — Moltlaunch marketplace, Agent 32180.'],
    leads:     ['Lead Pipeline', 'GHL + Whop ingest → Claude AI scoring → CRM sync.'],
    scaling:   ['Scaling Phases', '5-phase roadmap: Lock San Diego → Cross-Vertical.'],
  };
  document.getElementById('sectionTitle').innerHTML =
    `<span class="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(13,242,70,0.5)]"></span>${titles[id][0]}`;
  document.getElementById('sectionSubtitle').textContent = titles[id][1];

  if (id === 'cashclaw' && metrics) renderCashClaw(metrics);
  if (id === 'leads'    && metrics) renderLeads(metrics);
  if (id === 'scaling'  && metrics) renderScaling(metrics);
}

// ── Metrics Fetch ─────────────────────────────────────────────────────────
async function fetchMetrics() {
  try {
    const res = await fetch('/api/metrics');
    if (!res.ok) throw new Error(res.statusText);
    metrics = await res.json();
    applyMetrics(metrics);
    pushEvent('INFO', 'Metrics refreshed');
  } catch (e) {
    pushEvent('WARN', 'Metrics fetch failed — agent may be offline');
    setHealthBadge('Offline', false);
  }
}

function applyMetrics(m) {
  // Sidebar revenue
  set('sideEthEarned', (m.revenue?.ethEarned ?? '0.000000') + ' ETH');
  set('sideMonthlyUsd', '$' + (m.revenue?.monthlyUsd ?? 0).toFixed(2));
  set('sideWhopOrders', m.revenue?.whopOrders ?? '0');
  set('sideStripeMode', (m.revenue?.stripeMode ?? 'test').toUpperCase());

  // Agent badge
  const running = m.agent?.status === 'running';
  const dot = document.getElementById('agentDot');
  if (dot) {
    dot.className = 'status-dot ' + (running ? 'dot-green' : 'dot-yellow');
  }
  set('agentStatusText', `Agent ${m.agent?.id ?? '?'} · ${m.agent?.status ?? '?'}`);

  // Health tiles
  updateTile('agent',   running, `Uptime: ${formatMs(m.uptime)}`);
  updateTile('pantheon', m.pantheon?.connected,
    m.pantheon?.connected ? 'Connected to PaperClip' : 'Standalone mode');
  const stripeLive = m.revenue?.stripeMode === 'live';
  updateTile('stripe', true,
    stripeLive ? 'Live mode' : 'Test mode — switch in Stripe dashboard',
    stripeLive ? 'green' : 'yellow');
  const xActive = m.social?.xApiStatus === 'active';
  updateTile('x', xActive,
    xActive ? 'Auto-posting active' : 'API depleted — add credits',
    xActive ? 'green' : 'red');

  // Wallet checklist
  renderWalletChecklist(m);

  setHealthBadge(running ? 'Healthy' : 'Degraded', running);

  // Update active section
  if (currentSection === 'cashclaw') renderCashClaw(m);
  if (currentSection === 'leads')    renderLeads(m);
  if (currentSection === 'scaling')  renderScaling(m);
}

// ── Section Renderers ─────────────────────────────────────────────────────
function renderCashClaw(m) {
  set('cc-status', m.agent?.status ?? '—');
  set('cc-active', m.tasks?.active ?? '—');
  set('cc-completed', m.tasks?.completed ?? '—');
  set('cc-failed', m.tasks?.failed ?? '—');

  const rev = document.getElementById('cc-revenue');
  if (rev) rev.innerHTML = [
    row('ETH Earned', (m.revenue?.ethEarned ?? '0') + ' ETH', 'text-primary'),
    row('USD This Month', '$' + (m.revenue?.monthlyUsd ?? 0).toFixed(2), 'text-primary'),
    row('Whop Orders',    m.revenue?.whopOrders ?? 0),
    row('Stripe Mode',    (m.revenue?.stripeMode ?? 'test').toUpperCase(),
        m.revenue?.stripeMode === 'live' ? 'text-primary' : 'text-yellow-400'),
    row('Tasks Declined', m.tasks?.declined ?? 0),
  ].join('');

  const pan = document.getElementById('cc-pantheon');
  if (pan) pan.innerHTML = [
    row('Status', m.pantheon?.connected ? 'CONNECTED' : 'STANDALONE',
        m.pantheon?.connected ? 'text-primary' : 'text-yellow-400'),
    row('Pending Directives', m.pantheon?.pendingDirectives ?? 0),
    row('Last Heartbeat',     m.pantheon?.lastHeartbeat
        ? new Date(m.pantheon.lastHeartbeat).toLocaleTimeString() : '—'),
    row('Reports to',         'Hermes (CFO)', 'text-blue-400'),
    row('Receives from',      'Apollo (PM)',  'text-blue-400'),
  ].join('');

  const soc = document.getElementById('cc-social');
  if (soc) soc.innerHTML = [
    card('Tweets Posted',  m.social?.tweetsPosted ?? 0),
    card('X API',          (m.social?.xApiStatus ?? '?').toUpperCase()),
    card('Replies Sent',   m.social?.engagementReplies ?? 0),
  ].join('');
}

function renderLeads(m) {
  set('ld-total',  m.leads?.total     ?? '—');
  set('ld-scored', m.leads?.scored    ?? '—');
  set('ld-hot',    m.leads?.qualified ?? '—');
  set('ld-warm',   m.leads?.nurtured  ?? '—');
}

function renderScaling(m) {
  if (!m.scaling) return;
  const s = m.scaling;
  set('sc-phaseName', `Phase ${s.currentPhase}: ${s.phaseName}`);
  set('sc-kpi', `${s.kpiProgress} / ${s.kpiTarget} ${s.kpiUnit} (${s.kpiPercent}%)`);
  const bar = document.getElementById('sc-bar');
  if (bar) bar.style.width = Math.min(100, s.kpiPercent) + '%';

  const ms = document.getElementById('sc-milestones');
  if (ms) {
    ms.innerHTML = (s.pendingMilestones?.length)
      ? s.pendingMilestones.map(m =>
          `<div class="flex items-start gap-2 py-0.5"><span class="text-yellow-400 shrink-0">◯</span><span>${m}</span></div>`
        ).join('')
      : '<div class="text-primary">All milestones complete!</div>';
  }
}

function renderWalletChecklist(m) {
  const el = document.getElementById('walletChecklist');
  if (!el) return;
  const checks = [
    { label: 'CashClaw Agent',  ok: m.agent?.status === 'running',        note: m.agent?.status ?? '?' },
    { label: 'Stripe Mode',     ok: m.revenue?.stripeMode === 'live',     note: (m.revenue?.stripeMode ?? 'test').toUpperCase() },
    { label: 'X API Credits',   ok: m.social?.xApiStatus === 'active',    note: m.social?.xApiStatus ?? '?' },
    { label: 'Pantheon Bridge', ok: m.pantheon?.connected,                note: m.pantheon?.connected ? 'Connected' : 'Standalone' },
    { label: 'Whop Store',      ok: (m.revenue?.whopOrders ?? 0) >= 0,   note: 'Read-only ✓' },
  ];
  el.innerHTML = checks.map(c =>
    `<div class="check-item flex justify-between items-center py-1">
       <span class="${c.ok ? 'text-text-main' : 'text-text-muted'}">${c.label}</span>
       <span class="${c.ok ? 'text-primary' : 'text-yellow-400'} text-[11px]">${c.note}</span>
     </div>`
  ).join('');
}

// ── Research Cards ────────────────────────────────────────────────────────
async function fetchResearch() {
  try {
    const res = await fetch('/api/research');
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    renderCards('marketCards',  data.market);
    renderCards('cryptoCards',  data.crypto);
    renderCards('bettingCards', data.betting);
    pushEvent('INFO', 'Research cards loaded');
  } catch (e) {
    renderCards('marketCards',  defaultResearch.market);
    renderCards('cryptoCards',  defaultResearch.crypto);
    renderCards('bettingCards', defaultResearch.betting);
  }
}

function renderCards(id, items) {
  const el = document.getElementById(id);
  if (!el || !items) return;
  el.innerHTML = items.map(item =>
    `<div class="border border-border-color rounded-sm p-2 bg-background-dark hover:border-primary/40 transition-colors">
       <div class="font-medium text-[12px] text-text-main mb-0.5">${item.title}</div>
       <div class="text-[11px] text-text-muted">${item.body}</div>
       ${item.tag ? `<span class="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full border border-border-color text-text-muted">${item.tag}</span>` : ''}
     </div>`
  ).join('');
}

const defaultResearch = {
  market: [
    { title: 'Fed Policy Watch', body: 'Rate trajectory signals key for risk asset allocation. Monitor PCE data.', tag: 'Macro' },
    { title: 'AI Sector Rotation', body: 'Semi and infrastructure plays leading. Watch NVDA, AVGO, TSM supply chain.', tag: 'Equities' },
  ],
  crypto: [
    { title: 'ETH Base L2 Activity', body: 'On-chain activity growing. Agent wallet on Base — low fees for task payouts.', tag: 'On-chain' },
    { title: 'BTC Institutional Flows', body: 'ETF inflows watch. Whale accumulation zones near current levels.', tag: 'Structure' },
  ],
  betting: [
    { title: 'Line Value Framework', body: 'Track closing line value. Bet only when edge exceeds vig. Log every bet.', tag: 'Edge' },
    { title: 'Prop Market Inefficiency', body: 'Player props often mispriced early. Target markets before sharp action.', tag: 'Specials' },
  ],
};

// ── File Summarizer ───────────────────────────────────────────────────────
async function handleFileUpload(e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;

  const el = document.getElementById('fileSummary');
  el.innerHTML = '<div class="shimmer h-8 rounded-sm"></div>';
  el.classList.remove('italic');

  const contents = await Promise.all(files.map(async f => {
    const text = await f.text().catch(() => `[binary: ${f.name}]`);
    return `=== ${f.name} ===\n${text.slice(0, 4000)}`;
  }));

  try {
    const res = await fetch('/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: contents.join('\n\n'), filenames: files.map(f => f.name) }),
    });
    const data = await res.json();
    el.innerHTML = `<div class="text-text-main whitespace-pre-wrap">${escHtml(data.summary)}</div>`;
    pushEvent('INFO', `Summarized: ${files.map(f => f.name).join(', ')}`);
  } catch {
    el.innerHTML = '<span class="text-danger">Summarization failed — check agent is running.</span>';
  }
}

// ── Idea Journal ──────────────────────────────────────────────────────────
function saveJournalEntry(e) {
  e.preventDefault();
  const entry = {
    id: Date.now(),
    name:   document.getElementById('ideaName').value.trim(),
    thesis: document.getElementById('ideaThesis').value.trim(),
    risk:   document.getElementById('ideaRisk').value.trim(),
    ts:     new Date().toISOString(),
  };
  journal.unshift(entry);
  localStorage.setItem('tnb_journal', JSON.stringify(journal.slice(0, 100)));
  renderJournal();
  e.target.reset();
  pushEvent('INFO', `Journal: "${entry.name}" saved`);
}

function renderJournal() {
  const el = document.getElementById('journalEntries');
  if (!el) return;
  if (!journal.length) {
    el.innerHTML = '<span class="empty">No entries yet.</span>';
    return;
  }
  el.innerHTML = journal.slice(0, 20).map(j =>
    `<div class="entry">
       <div class="flex justify-between items-start">
         <span class="font-semibold text-text-main">${escHtml(j.name)}</span>
         <span class="text-[10px] text-text-muted shrink-0 ml-2">${new Date(j.ts).toLocaleString()}</span>
       </div>
       <div class="text-text-muted mt-0.5">📈 ${escHtml(j.thesis)}</div>
       <div class="text-danger/80 mt-0.5">⚠️ ${escHtml(j.risk)}</div>
     </div>`
  ).join('');
}

// ── Live Event Stream ─────────────────────────────────────────────────────
function startEventStream() {
  // Use SSE for real-time agent events; fall back to polling on error
  try {
    eventSrc = new EventSource('/api/events/stream');
    eventSrc.onmessage = e => {
      try { const ev = JSON.parse(e.data); pushEvent(ev.level, ev.message, true); }
      catch {}
    };
    eventSrc.onerror = () => {
      // SSE not available — poll every 10s for latest events
      if (eventSrc) { eventSrc.close(); eventSrc = null; }
      setInterval(pollEvents, 10000);
    };
  } catch {
    setInterval(pollEvents, 10000);
  }
}

async function pollEvents() {
  try {
    const res = await fetch('/api/events/latest?limit=5');
    if (!res.ok) return;
    const data = await res.json();
    (data.events || []).forEach(ev => pushEvent(ev.level, ev.message, true));
  } catch {}
}

function pushEvent(level, message, fromServer = false) {
  const el = document.getElementById('eventStream');
  if (!el) return;

  // Remove "waiting" placeholder
  const waiting = el.querySelector('[data-waiting]');
  if (waiting) waiting.remove();

  const colors = { INFO: 'text-primary', WARN: 'text-yellow-400', ERROR: 'text-danger', EXEC: 'text-blue-400' };
  const ts = new Date().toTimeString().split(' ')[0] + '.' + String(Date.now() % 1000).padStart(3, '0');
  const div = document.createElement('div');
  div.className = `flex gap-2 py-0.5 px-2 hover:bg-surface-hover rounded-sm ${level === 'ERROR' ? 'bg-danger/10 border border-danger/20' : ''}`;
  div.innerHTML =
    `<span class="text-text-muted shrink-0">${ts}</span>
     <span class="${colors[level] || 'text-text-muted'} shrink-0">[${level}]</span>
     <span class="text-text-main truncate">${escHtml(message)}</span>`;

  el.prepend(div);
  // Keep max 50 events
  while (el.children.length > 50) el.removeChild(el.lastChild);
}

function clearEvents() {
  const el = document.getElementById('eventStream');
  if (el) el.innerHTML = '<div data-waiting class="flex gap-2 py-1 px-2 text-text-muted"><span class="shrink-0 opacity-50">—</span><span>Cleared.</span></div>';
}

// ── Command Bar ───────────────────────────────────────────────────────────
function handleCommand(e) {
  if (e.key !== 'Enter') return;
  const cmd = e.target.value.trim().toLowerCase();
  e.target.value = '';

  if (!cmd) return;

  if (cmd === 'refresh research' || cmd === 'r research') {
    fetchResearch();
    pushEvent('EXEC', 'Research refresh triggered');
  } else if (cmd === 'refresh metrics' || cmd === 'r metrics') {
    fetchMetrics();
    pushEvent('EXEC', 'Metrics refresh triggered');
  } else if (cmd.startsWith('new journal') || cmd.startsWith('nj ')) {
    // nj <name> | <thesis> | <risk>
    const rest = cmd.replace(/^(new journal|nj)\s*/,'');
    const parts = rest.split('|').map(s => s.trim());
    if (parts.length >= 3) {
      journal.unshift({ id: Date.now(), name: parts[0], thesis: parts[1], risk: parts[2], ts: new Date().toISOString() });
      localStorage.setItem('tnb_journal', JSON.stringify(journal.slice(0, 100)));
      if (currentSection !== 'research') showSection('research');
      renderJournal();
      pushEvent('INFO', `Journal: "${parts[0]}" saved via command`);
    } else {
      pushEvent('WARN', 'Format: nj <name> | <thesis> | <risk>');
    }
  } else if (cmd === 'clear events') {
    clearEvents();
  } else if (cmd === 'cashclaw' || cmd === 'agent') {
    showSection('cashclaw');
  } else if (cmd === 'leads' || cmd === 'pipeline') {
    showSection('leads');
  } else if (cmd === 'scaling' || cmd === 'phases') {
    showSection('scaling');
  } else if (cmd === 'dashboard' || cmd === 'home') {
    showSection('research');
  } else {
    pushEvent('WARN', `Unknown command: "${cmd}"`);
  }
}

// ── Health Tiles ──────────────────────────────────────────────────────────
function updateTile(id, ok, subtitle, forceColor) {
  const dot = document.getElementById(`tile-${id}-dot`);
  const sub = document.getElementById(`tile-${id}-sub`);
  if (dot) dot.className = `w-2 h-2 rounded-full ${colorDot(ok, forceColor)}`;
  if (sub) { sub.textContent = subtitle; sub.className = `text-[11px] ${ok ? 'text-text-muted' : 'text-yellow-400'}`; }
}

function colorDot(ok, force) {
  if (force === 'red')    return 'bg-danger shadow-[0_0_6px_rgba(184,59,59,0.5)]';
  if (force === 'yellow') return 'bg-yellow-400';
  return ok ? 'bg-primary shadow-[0_0_6px_rgba(13,242,70,0.5)] animate-pulse'
            : 'bg-yellow-400';
}

function setHealthBadge(text, ok) {
  const el = document.getElementById('healthBadge');
  if (el) { el.textContent = text; el.className = `text-[11px] ${ok ? 'text-primary' : 'text-yellow-400'}`; }
}

// ── Helpers ───────────────────────────────────────────────────────────────
function set(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function row(label, value, cls = '') {
  return `<div class="flex justify-between items-center py-1 border-b border-border-color/40">
    <span class="text-text-muted text-[12px]">${label}</span>
    <span class="font-medium text-[12px] ${cls}">${value}</span>
  </div>`;
}

function card(label, value) {
  return `<div class="border border-border-color rounded-sm p-3 bg-background-dark text-center">
    <div class="text-[11px] text-text-muted mb-1">${label}</div>
    <div class="text-lg font-semibold">${value}</div>
  </div>`;
}

function formatMs(ms) {
  if (!ms) return '—';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
