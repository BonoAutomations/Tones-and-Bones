async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed');
  }

  return payload;
}

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

function renderJournalEntries(entries) {
  const journalEntries = document.getElementById('journalEntries');

  if (!entries.length) {
    journalEntries.classList.add('empty');
    journalEntries.textContent = 'No saved ideas yet.';
    return;
  }

  journalEntries.classList.remove('empty');
  journalEntries.innerHTML = entries
    .map(
      (entry) => `
        <div class="entry">
          <h3>${entry.name}</h3>
          <p><strong>Saved:</strong> ${new Date(entry.createdAt).toLocaleString()}</p>
          <p><strong>Thesis:</strong> ${entry.thesis}</p>
          <p><strong>Risk / invalidation:</strong> ${entry.risk}</p>
        </div>`
    )
    .join('');
}

async function loadResearch() {
  const payload = await fetchJson('/api/research');
  renderCards('marketCards', payload.markets);
  renderCards('cryptoCards', payload.crypto);
  renderCards('bettingCards', payload.betting);
  renderChecklist(payload.wallet);
}

async function loadJournal() {
  const payload = await fetchJson('/api/journal');
  renderJournalEntries(payload.entries);
}

async function summarizeFiles(files) {
  const fileSummary = document.getElementById('fileSummary');

  if (!files.length) {
    fileSummary.classList.add('empty');
    fileSummary.textContent = 'No files uploaded yet.';
    return;
  }

  const filePayload = await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      content: await file.text()
    }))
  );

  const payload = await fetchJson('/api/uploads/summarize', {
    method: 'POST',
    body: JSON.stringify({ files: filePayload })
  });

  fileSummary.classList.remove('empty');
  fileSummary.innerHTML = payload.summaries
    .map(
      (summary) => `
        <div class="entry">
          <strong>${summary.name}</strong>
          <p>${summary.preview}${summary.size > 220 ? '…' : ''}</p>
        </div>`
    )
    .join('');
}

async function bootstrap() {
  await Promise.all([loadResearch(), loadJournal()]);

  document.getElementById('fileInput').addEventListener('change', async (event) => {
    try {
      const files = Array.from(event.target.files || []);
      await summarizeFiles(files);
    } catch (error) {
      const fileSummary = document.getElementById('fileSummary');
      fileSummary.classList.remove('empty');
      fileSummary.innerHTML = `<div class="entry"><strong>Upload error</strong><p>${error.message}</p></div>`;
    }
  });

  document.getElementById('journalForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = {
      name: document.getElementById('ideaName').value.trim(),
      thesis: document.getElementById('ideaThesis').value.trim(),
      risk: document.getElementById('ideaRisk').value.trim()
    };

    try {
      const result = await fetchJson('/api/journal', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      renderJournalEntries(result.entries);
      event.target.reset();
    } catch (error) {
      const journalEntries = document.getElementById('journalEntries');
      journalEntries.classList.remove('empty');
      journalEntries.innerHTML = `<div class="entry"><strong>Save error</strong><p>${error.message}</p></div>`;
    }
  });
}

bootstrap().catch((error) => {
  const journalEntries = document.getElementById('journalEntries');
  journalEntries.classList.remove('empty');
  journalEntries.innerHTML = `<div class="entry"><strong>Startup error</strong><p>${error.message}</p></div>`;
});
