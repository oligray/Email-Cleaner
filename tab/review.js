let currentSeries = [];
let currentSender = null;
let currentEmails = [];
let deletedThisSession = 0;

function formatDate(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function formatSize(size) {
  return Math.max(0, Math.round((Number(size) || 0) / 1024 * 10) / 10).toFixed(1);
}

function renderSeries(series) {
  currentSeries = Array.isArray(series) ? series : [];
  const body = document.getElementById('results-body');

  if (currentSeries.length === 0) {
    body.innerHTML = '<tr><td colspan="4" class="empty">No repeated sender groups found.</td></tr>';
    return;
  }

  body.innerHTML = currentSeries.map((item) => {
    const oldestDate = item.emails
      .slice()
      .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0))[0]?.date || null;
    const totalSize = (item.emails || []).reduce((sum, email) => sum + (Number(email.size) || 0), 0);

    return `
      <tr class="clickable-row" data-sender="${item.sender}">
        <td>${item.sender}</td>
        <td>${item.count}</td>
        <td>${formatSize(totalSize / 1024)} KB</td>
        <td>${formatDate(oldestDate)}</td>
      </tr>
    `;
  }).join('');

  body.querySelectorAll('tr[data-sender]').forEach((row) => {
    row.addEventListener('click', () => openSenderView(row.getAttribute('data-sender')));
  });
}

function showSeriesView() {
  document.getElementById('series-view').classList.remove('hidden');
  document.getElementById('drill-down-view').classList.add('hidden');
}

function showDrillDownView() {
  document.getElementById('series-view').classList.add('hidden');
  document.getElementById('drill-down-view').classList.remove('hidden');
}

function updateDeleteFooter() {
  const selected = currentEmails.filter((item) => item.checked);
  const totalSizeBytes = selected.reduce((sum, item) => sum + (Number(item.size) || 0), 0);
  const button = document.getElementById('delete-button');
  button.disabled = selected.length === 0;
  button.textContent = `Delete ${selected.length} email${selected.length === 1 ? '' : 's'} (${formatSize(totalSizeBytes)} KB)`;
}

function openEmailInViewer(messageId) {
  if (!messageId || !browser.messageDisplay || typeof browser.messageDisplay.open !== 'function') {
    return Promise.reject(new Error('Message display API is unavailable.'));
  }

  return browser.messageDisplay.open({
    messageId: Number(messageId),
    active: true
  });
}

function renderDrillDown(emails) {
  currentEmails = (emails || []).map((item) => ({ ...item, checked: true }));
  const body = document.getElementById('drill-down-body');

  if (currentEmails.length === 0) {
    body.innerHTML = '<tr><td colspan="4" class="empty">No emails found for this sender.</td></tr>';
    updateDeleteFooter();
    return;
  }

  body.innerHTML = currentEmails.map((item) => `
    <tr class="clickable-row" data-message-id="${item.id}">
      <td><input type="checkbox" class="email-checkbox" data-id="${item.id}" checked /></td>
      <td>${item.subject}</td>
      <td>${formatDate(item.date)}</td>
      <td>${formatSize(item.size)} KB</td>
      <td></td>
    </tr>
  `).join('');

  body.querySelectorAll('tr[data-message-id]').forEach((row) => {
    row.addEventListener('click', (event) => {
      if (event.target && event.target.closest('input[type="checkbox"]')) {
        return;
      }

      const id = row.getAttribute('data-message-id');
      openEmailInViewer(id).catch((error) => {
        console.error('Failed to open message in Thunderbird:', error);
      });
    });
  });

  body.querySelectorAll('.email-checkbox').forEach((checkbox) => {
    checkbox.addEventListener('change', (event) => {
      const id = Number(event.target.getAttribute('data-id'));
      const email = currentEmails.find((item) => item.id === id);
      if (email) {
        email.checked = event.target.checked;
        updateDeleteFooter();
        document.getElementById('select-all-checkbox').checked = currentEmails.length > 0 && currentEmails.every((item) => item.checked);
      }
    });
  });

  document.getElementById('select-all-checkbox').checked = currentEmails.length > 0 && currentEmails.every((item) => item.checked);
  updateDeleteFooter();
}

function openSenderView(sender) {
  const item = currentSeries.find((entry) => entry.sender === sender);
  if (!item) {
    return;
  }

  currentSender = sender;
  document.getElementById('drill-down-title').textContent = sender;
  showDrillDownView();
  document.getElementById('drill-down-status').classList.add('hidden');
  document.getElementById('drill-down-status').textContent = '';

  browser.runtime.sendMessage({
    action: 'getEmailsBySender',
    sender,
    accountId: null
  }).then((response) => {
    if (response && response.success) {
      renderDrillDown(response.emails || []);
      return;
    }

    throw new Error('Unable to load sender emails.');
  }).catch((error) => {
    console.error('Failed to load sender emails:', error);
    document.getElementById('drill-down-body').innerHTML = '<tr><td colspan="4" class="empty">Unable to load emails for this sender.</td></tr>';
  });
}

function deleteSelectedEmails() {
  const selected = currentEmails.filter((item) => item.checked).map((item) => item.id);
  if (selected.length === 0) {
    return;
  }

  const confirmed = window.confirm(`Delete ${selected.length} selected email${selected.length === 1 ? '' : 's'}?`);
  if (!confirmed) {
    return;
  }

  document.getElementById('delete-button').disabled = true;
  browser.runtime.sendMessage({ action: 'deleteEmails', ids: selected })
    .then((response) => {
      if (response && response.success) {
        deletedThisSession += selected.length;
        updateDeletedTotal();
        currentSeries = currentSeries.filter((item) => item.sender !== currentSender);
        renderSeries(currentSeries);
        showSeriesView();
        const status = document.getElementById('series-status');
        status.textContent = `Deleted ${response.deletedCount || selected.length} email${(response.deletedCount || selected.length) === 1 ? '' : 's'}.`;
        status.classList.remove('hidden');
        setTimeout(() => status.classList.add('hidden'), 2500);
        return;
      }

      throw new Error('Delete failed.');
    })
    .catch((error) => {
      console.error('Failed to delete selected emails:', error);
      document.getElementById('delete-button').disabled = false;
    });
}

function formatWindowLabel(fromDate, toDate) {
  return `Reviewing: ${formatDate(fromDate)} – ${formatDate(toDate)}`;
}

function updateDeletedTotal() {
  document.getElementById('deleted-total-label').textContent = `${deletedThisSession} emails deleted this session`;
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
        document.getElementById('window-range-label').textContent = formatWindowLabel(response.fromDate, response.toDate);
        return;
      }

      throw new Error('No response from background script.');
    })
    .catch((error) => {
      console.error('Failed to load series:', error);
      document.getElementById('results-body').innerHTML = '<tr><td colspan="3" class="empty">Unable to load review data.</td></tr>';
    });
}

document.getElementById('back-button').addEventListener('click', () => {
  showSeriesView();
});

document.getElementById('next-window-button').addEventListener('click', () => {
  browser.runtime.sendMessage({ action: 'advanceCursor', direction: 'next' }).then(() => loadSeries());
});

document.getElementById('previous-window-button').addEventListener('click', () => {
  browser.runtime.sendMessage({ action: 'advanceCursor', direction: 'previous' }).then(() => loadSeries());
});

document.getElementById('delete-button').addEventListener('click', () => {
  deleteSelectedEmails();
});

document.getElementById('select-all-checkbox').addEventListener('change', (event) => {
  currentEmails.forEach((item) => {
    item.checked = event.target.checked;
  });
  document.querySelectorAll('.email-checkbox').forEach((checkbox) => {
    checkbox.checked = event.target.checked;
  });
  updateDeleteFooter();
});

updateDeletedTotal();
window.addEventListener('load', loadSeries);
