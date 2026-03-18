const marketResearch = [
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
];

const cryptoResearch = [
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
];

const bettingResearch = [
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
];

const walletReadiness = [
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
];

function renderCards(targetId, items) {
  const target = document.getElementById(targetId);
  target.innerHTML = items
    .map(
      (item) => `
        <div class="card">
          <div class="meta">${item.tag ?? 'Checklist'}</div>
          <h3>${item.title}</h3>
          <p>${item.body}</p>
        </div>`
    )
    .join('');
}

function renderChecklist(items) {
  const target = document.getElementById('walletChecklist');
  target.innerHTML = items
    .map(
      (item) => `
        <div class="check-item">
          <h3>${item.title}</h3>
          <p>${item.body}</p>
        </div>`
    )
    .join('');
}

function summarizeContent(name, text) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const preview = normalized.slice(0, 220) || 'Empty file';
  return `<div class="entry"><strong>${name}</strong><p>${preview}${normalized.length > 220 ? '…' : ''}</p></div>`;
}

document.getElementById('fileInput').addEventListener('change', async (event) => {
  const files = Array.from(event.target.files || []);
  const container = document.getElementById('fileSummary');

  if (!files.length) {
    container.classList.add('empty');
    container.textContent = 'No files uploaded yet.';
    return;
  }

  const summaries = await Promise.all(
    files.map(async (file) => {
      try {
        const content = await file.text();
        return summarizeContent(file.name, content);
      } catch (error) {
        return `<div class="entry"><strong>${file.name}</strong><p>Unable to read file: ${error.message}</p></div>`;
      }
    })
  );

  container.classList.remove('empty');
  container.innerHTML = summaries.join('');
});

const journalForm = document.getElementById('journalForm');
const journalEntries = document.getElementById('journalEntries');
const savedIdeas = [];

journalForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const idea = {
    name: document.getElementById('ideaName').value.trim(),
    thesis: document.getElementById('ideaThesis').value.trim(),
    risk: document.getElementById('ideaRisk').value.trim()
  };

  savedIdeas.unshift(idea);
  journalForm.reset();
  journalEntries.classList.remove('empty');
  journalEntries.innerHTML = savedIdeas
    .map(
      (entry) => `
        <div class="entry">
          <h3>${entry.name}</h3>
          <p><strong>Thesis:</strong> ${entry.thesis}</p>
          <p><strong>Risk / invalidation:</strong> ${entry.risk}</p>
        </div>`
    )
    .join('');
});

renderCards('marketCards', marketResearch);
renderCards('cryptoCards', cryptoResearch);
renderCards('bettingCards', bettingResearch);
renderChecklist(walletReadiness);
