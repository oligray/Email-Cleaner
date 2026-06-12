let currentSeries = [];
let currentDomain = null;
let currentEmails = [];
let deletedThisSession = 0;
let currentWindowFrom = null;
let currentWindowTo = null;
let deletedFromCurrentView = false;

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
    body.innerHTML = '<tr><td colspan="3" class="empty">No repeated sender groups found.</td></tr>';
    return;
  }

  body.innerHTML = currentSeries.map((item) => `
    <tr class="clickable-row" data-domain="${item.domain}">
      <td>${item.domain}</td>
      <td>${item.totalCount}</td>
      <td>${formatDate(item.oldestDate)}</td>
    </tr>
  `).join('');

  body.querySelectorAll('tr[data-domain]').forEach((row) => {
    row.addEventListener('click', () => openDomainView(row.getAttribute('data-domain')));
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
  const meta = document.getElementById('drill-down-meta');

  if (currentEmails.length === 0) {
    body.innerHTML = '<tr><td colspan="5" class="empty">No emails found for this domain.</td></tr>';
    meta.textContent = '';
    updateDeleteFooter();
    return;
  }

  const newestDate = currentEmails.reduce((latest, item) => {
    const d = item.date ? new Date(item.date) : null;
    return d && (!latest || d > latest) ? d : latest;
  }, null);
  meta.textContent = newestDate ? `Most recent email: ${newestDate.toLocaleString()}` : '';

  body.innerHTML = currentEmails.map((item, index) => {
    const isNewGroup = index > 0 && currentEmails[index - 1].sender !== item.sender;
    const spacerRow = isNewGroup
      ? `<tr class="sender-spacer"><td><input type="checkbox" class="group-checkbox" data-group-sender="${item.sender}" checked /></td><td colspan="4"></td></tr>`
      : '';
    return `${spacerRow}
      <tr class="clickable-row" data-message-id="${item.id}">
        <td><input type="checkbox" class="email-checkbox" data-id="${item.id}" checked /></td>
        <td class="muted">${item.sender || ''}</td>
        <td>${item.subject}</td>
        <td>${formatDate(item.date)}</td>
        <td>${formatSize(item.size)} KB</td>
      </tr>
    `;
  }).join('');

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

        body.querySelectorAll('.group-checkbox').forEach((cb) => {
          if (cb.getAttribute('data-group-sender') === email.sender) {
            const groupEmails = currentEmails.filter((e) => e.sender === email.sender);
            const allChecked = groupEmails.every((e) => e.checked);
            const someChecked = groupEmails.some((e) => e.checked);
            cb.checked = allChecked;
            cb.indeterminate = !allChecked && someChecked;
          }
        });
      }
    });
  });

  body.querySelectorAll('.group-checkbox').forEach((checkbox) => {
    checkbox.addEventListener('change', (event) => {
      const groupSender = event.target.getAttribute('data-group-sender');
      const isChecked = event.target.checked;
      event.target.indeterminate = false;

      currentEmails.forEach((item) => {
        if (item.sender === groupSender) {
          item.checked = isChecked;
        }
      });

      body.querySelectorAll('.email-checkbox').forEach((cb) => {
        const id = Number(cb.getAttribute('data-id'));
        const email = currentEmails.find((e) => e.id === id);
        if (email && email.sender === groupSender) {
          cb.checked = isChecked;
        }
      });

      document.getElementById('select-all-checkbox').checked = currentEmails.length > 0 && currentEmails.every((item) => item.checked);
      updateDeleteFooter();
    });
  });

  document.getElementById('select-all-checkbox').checked = currentEmails.length > 0 && currentEmails.every((item) => item.checked);
  updateDeleteFooter();
}

function openDomainView(domain) {
  const domainEntry = currentSeries.find((entry) => entry.domain === domain);
  if (!domainEntry) {
    return;
  }

  currentDomain = domain;
  deletedFromCurrentView = false;
  document.getElementById('drill-down-title').textContent = domain;
  showDrillDownView();
  document.getElementById('drill-down-status').classList.add('hidden');
  document.getElementById('drill-down-status').textContent = '';

  Promise.all(
    domainEntry.senders.map((senderEntry) =>
      browser.runtime.sendMessage({
        action: 'getEmailsBySender',
        sender: senderEntry.sender,
        accountId: null
      }).then((response) => {
        if (response && response.success) {
          return (response.emails || []).map((email) => ({ ...email, sender: senderEntry.sender }));
        }
        return [];
      }).catch(() => [])
    )
  ).then((results) => {
    const allEmails = results.flat().sort((a, b) => {
      const senderCmp = a.sender.localeCompare(b.sender);
      if (senderCmp !== 0) return senderCmp;
      return new Date(b.date || 0) - new Date(a.date || 0);
    });
    renderDrillDown(allEmails);
  }).catch((error) => {
    console.error('Failed to load domain emails:', error);
    document.getElementById('drill-down-body').innerHTML = '<tr><td colspan="5" class="empty">Unable to load emails for this domain.</td></tr>';
  });
}

function deleteSelectedEmails() {
  const toDelete = currentEmails.filter((item) => item.checked);
  const toKeep = currentEmails.filter((item) => !item.checked);
  const selected = toDelete.map((item) => item.id);

  if (selected.length === 0) {
    return;
  }

  const confirmed = window.confirm(`Delete ${selected.length} selected email${selected.length === 1 ? '' : 's'}?`);
  if (!confirmed) {
    return;
  }

  document.getElementById('delete-button').disabled = true;
  browser.runtime.sendMessage({ action: 'deleteEmails', ids: selected })
    .then(async (response) => {
      if (response && response.success) {
        const deletedCount = response.deletedCount || selected.length;
        deletedThisSession += selected.length;
        updateDeletedTotal();

        const dateWindow = {
          from: currentWindowFrom ? String(currentWindowFrom) : '',
          to: currentWindowTo ? String(currentWindowTo) : ''
        };

        const senderMap = new Map();
        for (const email of toDelete) {
          if (!senderMap.has(email.sender)) senderMap.set(email.sender, { deleted: [], kept: [] });
          senderMap.get(email.sender).deleted.push(email);
        }
        for (const email of toKeep) {
          if (!senderMap.has(email.sender)) senderMap.set(email.sender, { deleted: [], kept: [] });
          senderMap.get(email.sender).kept.push(email);
        }

        deletedFromCurrentView = true;
        try {
          for (const [sender, { deleted, kept }] of senderMap) {
            if (deleted.length > 0) {
              await logDeletion(currentDomain, sender, deleted, kept, dateWindow);
            }
          }
        } catch (logError) {
          console.error('Failed to log deletion:', logError);
        }

        if (toKeep.length === 0) {
          currentSeries = currentSeries.filter((item) => item.domain !== currentDomain);
          renderSeries(currentSeries);
          showSeriesView();
          const seriesStatus = document.getElementById('series-status');
          seriesStatus.textContent = `Deleted ${deletedCount} email${deletedCount === 1 ? '' : 's'}.`;
          seriesStatus.classList.remove('hidden');
          setTimeout(() => seriesStatus.classList.add('hidden'), 2500);
        } else {
          renderDrillDown(toKeep);
          const drillStatus = document.getElementById('drill-down-status');
          drillStatus.textContent = `Deleted ${deletedCount} email${deletedCount === 1 ? '' : 's'}.`;
          drillStatus.classList.remove('hidden');
          setTimeout(() => drillStatus.classList.add('hidden'), 2500);
        }

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
        currentWindowFrom = response.fromDate || null;
        currentWindowTo = response.toDate || null;
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

document.getElementById('back-button').addEventListener('click', async () => {
  if (deletedFromCurrentView && currentDomain && currentEmails.length > 0) {
    const dateWindow = {
      from: currentWindowFrom ? String(currentWindowFrom) : '',
      to: currentWindowTo ? String(currentWindowTo) : ''
    };
    const senderMap = new Map();
    for (const email of currentEmails) {
      if (!senderMap.has(email.sender)) senderMap.set(email.sender, []);
      senderMap.get(email.sender).push(email);
    }
    try {
      for (const [sender, emails] of senderMap) {
        await logKeep(currentDomain, sender, emails, dateWindow);
      }
    } catch (logError) {
      console.error('Failed to log keep:', logError);
    }
    const domainEntry = currentSeries.find((item) => item.domain === currentDomain);
    if (domainEntry) {
      domainEntry.totalCount = currentEmails.length;
      renderSeries(currentSeries);
    }
  }
  showSeriesView();
});

document.getElementById('history-button').addEventListener('click', () => {
  browser.tabs.create({ url: browser.runtime.getURL('tab/history.html') });
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
  document.querySelectorAll('.group-checkbox').forEach((checkbox) => {
    checkbox.checked = event.target.checked;
    checkbox.indeterminate = false;
  });
  updateDeleteFooter();
});

updateDeletedTotal();
window.addEventListener('load', loadSeries);
