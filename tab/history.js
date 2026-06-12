function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderSubjectList(emails, label) {
  if (!emails || emails.length === 0) return '';
  const items = emails.map((e) => `<li>${escapeHtml(e.subject)} <span style="color:#9aa0a6">${formatDate(e.date)}</span></li>`).join('');
  return `<p class="subject-group-label">${label} (${emails.length})</p><ul class="subject-list">${items}</ul>`;
}

function renderHistory(decisions) {
  const content = document.getElementById('history-content');

  if (decisions.length === 0) {
    content.innerHTML = '<p class="no-history">No decisions recorded yet.</p>';
    return;
  }

  const sessionMap = new Map();
  for (const entry of decisions) {
    if (!sessionMap.has(entry.session_id)) sessionMap.set(entry.session_id, []);
    sessionMap.get(entry.session_id).push(entry);
  }

  let html = '';
  for (const [sessionId, entries] of sessionMap) {
    const sessionDate = formatDate(sessionId);
    html += `<h2>Session: ${escapeHtml(sessionDate)}</h2>`;
    html += `<table>
      <thead>
        <tr>
          <th>Domain</th>
          <th>Sender</th>
          <th>Deleted</th>
          <th>Rescued</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>`;

    entries.forEach((entry, i) => {
      const rowId = `detail-${escapeHtml(sessionId)}-${i}`.replace(/[^a-z0-9-]/gi, '_');
      const actionClass = entry.action === 'deleted' ? 'action-deleted' : 'action-kept';
      const actionLabel = entry.action === 'deleted' ? 'Deleted' : 'Kept';

      html += `<tr class="clickable-row" data-detail="${rowId}">
        <td>${escapeHtml(entry.domain)}</td>
        <td>${escapeHtml(entry.sender)}</td>
        <td>${entry.deleted_count}</td>
        <td>${entry.rescued_count}</td>
        <td class="${actionClass}">${actionLabel}</td>
      </tr>
      <tr id="${rowId}" class="detail-row hidden">
        <td colspan="5">
          ${renderSubjectList(entry.deleted_emails, 'Deleted')}
          ${renderSubjectList(entry.kept_emails, 'Rescued')}
        </td>
      </tr>`;
    });

    html += '</tbody></table>';
  }

  content.innerHTML = html;

  content.querySelectorAll('tr[data-detail]').forEach((row) => {
    row.addEventListener('click', () => {
      const detailId = row.getAttribute('data-detail');
      const detailRow = document.getElementById(detailId);
      if (detailRow) {
        detailRow.classList.toggle('hidden');
      }
    });
  });
}

function renderFooter(decisions) {
  const totalDeleted = decisions.reduce((sum, d) => sum + (d.deleted_count || 0), 0);
  const totalRescued = decisions.reduce((sum, d) => sum + (d.rescued_count || 0), 0);
  const sessionIds = new Set(decisions.map((d) => d.session_id));
  document.getElementById('footer-totals').textContent =
    `All time: ${totalDeleted} deleted, ${totalRescued} rescued across ${sessionIds.size} session${sessionIds.size === 1 ? '' : 's'}`;
}

async function handleExport() {
  const json = await exportDecisions();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const filename = `email-cleaner-history-${new Date().toISOString().slice(0, 10)}.json`;
  try {
    await browser.downloads.download({ url, filename, saveAs: true });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}

document.getElementById('back-button').addEventListener('click', () => {
  window.close();
});

document.getElementById('export-button').addEventListener('click', () => {
  handleExport().catch((err) => console.error('Export failed:', err));
});

getDecisions()
  .then((decisions) => {
    renderHistory(decisions);
    renderFooter(decisions);
  })
  .catch((err) => {
    console.error('Failed to load history:', err);
    document.getElementById('history-content').innerHTML = '<p class="no-history">Unable to load history.</p>';
  });
