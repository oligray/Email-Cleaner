function formatDate(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function renderSeries(series) {
  const body = document.getElementById('results-body');

  if (!Array.isArray(series) || series.length === 0) {
    body.innerHTML = '<tr><td colspan="3" class="empty">No repeated sender groups found.</td></tr>';
    return;
  }

  body.innerHTML = series.map((item) => {
    const oldestDate = item.emails
      .slice()
      .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0))[0]?.date || null;

    return `
      <tr>
        <td>${item.sender}</td>
        <td>${item.count}</td>
        <td>${formatDate(oldestDate)}</td>
      </tr>
    `;
  }).join('');
}

function loadSeries() {
  browser.accounts.list()
    .then((accounts) => {
      const accountId = accounts && accounts.length > 0 ? accounts[0].id : null;
      return browser.runtime.sendMessage({
        action: 'getSeries',
        accountId,
        limit: 100,
        minCount: 2
      });
    })
    .then((response) => {
      if (response && response.success) {
        renderSeries(response.series || []);
        return;
      }

      throw new Error('No response from background script.');
    })
    .catch((error) => {
      console.error('Failed to load series:', error);
      document.getElementById('results-body').innerHTML = '<tr><td colspan="3" class="empty">Unable to load review data.</td></tr>';
    });
}

window.addEventListener('load', loadSeries);
