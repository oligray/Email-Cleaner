let currentSeries = [];
let currentDomain = null;
let currentEmails = [];
let deletedThisSession = 0;
let currentWindowFrom = null;
let currentWindowTo = null;
let deletedFromCurrentView = false;
let currentMode = 'windowed';
let currentAccountId = null;
let accountCount = 0;
let sortColumn = 'totalCount';
let sortDirection = 'desc';

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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

function sortedSeries() {
  return currentSeries.slice().sort((a, b) => {
    let aVal, bVal;
    if (sortColumn === 'totalSize') {
      aVal = a.totalSize || 0;
      bVal = b.totalSize || 0;
    } else if (sortColumn === 'oldestDate') {
      aVal = a.oldestDate ? new Date(a.oldestDate).getTime() : 0;
      bVal = b.oldestDate ? new Date(b.oldestDate).getTime() : 0;
    } else {
      aVal = a.totalCount || 0;
      bVal = b.totalCount || 0;
    }
    return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
  });
}

function updateSortHeaders() {
  document.querySelectorAll('th[data-sort-col]').forEach((th) => {
    const col = th.getAttribute('data-sort-col');
    const labels = { totalCount: 'Email Count', totalSize: 'Total Size', oldestDate: 'Oldest Date' };
    th.textContent = col === sortColumn
      ? `${labels[col]} ${sortDirection === 'desc' ? '↓' : '↑'}`
      : labels[col];
  });
}

function renderSeries(series) {
  currentSeries = Array.isArray(series) ? series : [];
  const body = document.getElementById('results-body');
  updateSortHeaders();

  if (currentSeries.length === 0) {
    body.innerHTML = '<tr><td colspan="4" class="empty">No repeated sender groups found.</td></tr>';
    return;
  }

  body.innerHTML = sortedSeries().map((item) => `
    <tr class="clickable-row" data-domain="${item.domain}">
      <td>${item.domain}</td>
      <td>${item.totalCount}</td>
      <td>${formatSize((item.totalSize || 0) / 1024)} MB</td>
      <td>${formatDate(item.oldestDate)}</td>
    </tr>
  `).join('');

  body.querySelectorAll('tr[data-domain]').forEach((row) => {
    row.addEventListener('click', () => openDomainView(row.getAttribute('data-domain')));
  });
}

function updateModeUI() {
  const isWindowed = currentMode === 'windowed';
  document.getElementById('previous-window-button').classList.toggle('hidden', !isWindowed);
  document.getElementById('next-window-button').classList.toggle('hidden', !isWindowed);
  document.getElementById('window-range-label').classList.toggle('hidden', !isWindowed);
  document.getElementById('mode-toggle-button').textContent = isWindowed ? 'Full scan' : 'Windowed';
}

function showSeriesView() {
  document.getElementById('series-view').classList.remove('hidden');
  document.getElementById('drill-down-view').classList.add('hidden');
  window.scrollTo(0, 0);
}

function showDrillDownView() {
  document.getElementById('series-view').classList.add('hidden');
  document.getElementById('drill-down-view').classList.remove('hidden');
}

function showAccountPickerView() {
  document.getElementById('account-picker-view').classList.remove('hidden');
  document.getElementById('series-view').classList.add('hidden');
  document.getElementById('drill-down-view').classList.add('hidden');
  document.getElementById('current-account-label').classList.add('hidden');
  document.getElementById('change-account-button').classList.add('hidden');
  document.getElementById('mode-toggle-button').classList.add('hidden');
}

function selectAccount(id, name) {
  currentAccountId = id;
  document.getElementById('account-picker-view').classList.add('hidden');
  document.getElementById('current-account-label').textContent = name;
  document.getElementById('current-account-label').classList.remove('hidden');
  if (accountCount > 1) {
    document.getElementById('change-account-button').classList.remove('hidden');
  }
  document.getElementById('mode-toggle-button').classList.remove('hidden');
  updateModeUI();
  showSeriesView();
  loadSeries();
}

function loadAccounts() {
  browser.accounts.list()
    .then((accounts) => {
      accountCount = accounts.length;
      if (accounts.length === 1) {
        selectAccount(accounts[0].id, accounts[0].name);
        return;
      }
      const list = document.getElementById('account-list');
      list.innerHTML = accounts.map((a) => `
        <tr class="clickable-row" data-account-id="${escapeHtml(a.id)}" data-account-name="${escapeHtml(a.name)}">
          <td>${escapeHtml(a.name)}</td>
        </tr>
      `).join('');
      list.querySelectorAll('tr[data-account-id]').forEach((row) => {
        row.addEventListener('click', () => {
          selectAccount(row.getAttribute('data-account-id'), row.getAttribute('data-account-name'));
        });
      });
      showAccountPickerView();
    })
    .catch((err) => {
      console.error('Failed to load accounts:', err);
    });
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

  const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;

  body.innerHTML = currentEmails.map((item, index) => {
    const isFirstInGroup = index === 0 || currentEmails[index - 1].sender !== item.sender;
    let spacerRow = '';
    if (isFirstInGroup) {
      const mostRecentDate = item.date ? new Date(item.date).getTime() : 0;
      const unsubscribeCell = mostRecentDate >= sixtyDaysAgo
        ? `<td><button class="unsubscribe-btn" type="button" data-message-id="${item.id}">Unsubscribe</button></td>`
        : '<td></td>';
      spacerRow = `<tr class="sender-spacer"><td><input type="checkbox" class="group-checkbox" data-group-sender="${item.sender}" checked /></td><td colspan="3"></td>${unsubscribeCell}</tr>`;
    }
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

  body.querySelectorAll('.unsubscribe-btn').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      openUnsubscribeLink(btn, Number(btn.getAttribute('data-message-id')));
    });
  });

  document.getElementById('select-all-checkbox').checked = currentEmails.length > 0 && currentEmails.every((item) => item.checked);
  updateDeleteFooter();
}

function walkParts(part, contentType) {
  if (!part) return null;
  if (part.contentType && part.contentType.startsWith(contentType) && part.body) {
    return part.body;
  }
  if (Array.isArray(part.parts)) {
    for (const sub of part.parts) {
      const found = walkParts(sub, contentType);
      if (found) return found;
    }
  }
  return null;
}

function extractUnsubscribeFromBody(full) {
  const htmlBody = walkParts(full, 'text/html');
  if (htmlBody) {
    const doc = new DOMParser().parseFromString(htmlBody, 'text/html');
    const anchors = Array.from(doc.querySelectorAll('a[href]'));
    const candidates = anchors.filter((a) => {
      const text = (a.textContent || '').toLowerCase();
      const href = (a.getAttribute('href') || '').toLowerCase();
      return text.includes('unsubscribe') || href.includes('unsubscribe');
    });
    // Prefer anchors where visible text says "unsubscribe"; take last occurrence (footer)
    const textMatches = candidates.filter((a) => (a.textContent || '').toLowerCase().includes('unsubscribe'));
    const best = textMatches.length > 0 ? textMatches[textMatches.length - 1] : candidates[candidates.length - 1];
    if (best) {
      const href = best.getAttribute('href') || '';
      if (href.startsWith('https://') || href.startsWith('http://') || href.startsWith('mailto:')) {
        return href;
      }
    }
  }

  const textBody = walkParts(full, 'text/plain');
  if (textBody) {
    const lower = textBody.toLowerCase();
    const idx = lower.lastIndexOf('unsubscribe');
    if (idx !== -1) {
      const context = textBody.slice(Math.max(0, idx - 20), idx + 500);
      const urlMatch = context.match(/https?:\/\/[^\s)>\]"]+/);
      if (urlMatch) return urlMatch[0];
    }
  }

  return null;
}

function parseMailtoDetails(mailtoUrl) {
  const withoutScheme = mailtoUrl.slice('mailto:'.length);
  const [toRaw, queryString] = withoutScheme.split('?');
  const details = { to: [decodeURIComponent(toRaw)] };
  if (queryString) {
    const params = new URLSearchParams(queryString);
    if (params.get('subject')) details.subject = params.get('subject');
    if (params.get('body')) details.body = params.get('body');
  }
  return details;
}

function openUnsubscribeLink(button, messageId) {
  button.disabled = true;
  browser.messages.getFull(messageId)
    .then(async (full) => {
      const headerValues = full.headers && full.headers['list-unsubscribe'];
      const raw = Array.isArray(headerValues) && headerValues[0] ? headerValues[0] : '';
      const urls = [...raw.matchAll(/<([^>]+)>/g)].map((m) => m[1]);
      const httpUrl = urls.find((u) => u.startsWith('https://') || u.startsWith('http://'));
      const mailtoUrl = urls.find((u) => u.startsWith('mailto:'));

      const postHeaderValues = full.headers && full.headers['list-unsubscribe-post'];
      const isOneClick = Array.isArray(postHeaderValues) &&
        postHeaderValues.some((v) => v.includes('List-Unsubscribe=One-Click'));

      if (httpUrl && isOneClick) {
        await browser.runtime.sendMessage({ action: 'unsubscribePost', url: httpUrl });
        button.textContent = 'Unsubscribed';
        return;
      }

      if (httpUrl) {
        browser.tabs.create({ url: httpUrl });
        button.textContent = 'Unsubscribed';
        return;
      }

      if (mailtoUrl) {
        const tab = await browser.compose.beginNew(parseMailtoDetails(mailtoUrl));
        await browser.compose.sendMessage(tab.id);
        button.textContent = 'Unsubscribed';
        return;
      }

      const bodyUrl = extractUnsubscribeFromBody(full);
      if (bodyUrl) {
        if (bodyUrl.startsWith('mailto:')) {
          const tab = await browser.compose.beginNew(parseMailtoDetails(bodyUrl));
          await browser.compose.sendMessage(tab.id);
        } else {
          browser.tabs.create({ url: bodyUrl });
        }
        button.textContent = 'Unsubscribed';
        return;
      }

      alert('No unsubscribe link was found in this email\'s headers or body.');
      button.disabled = false;
    })
    .catch((err) => {
      console.error('Failed to retrieve unsubscribe link:', err);
      alert('Unable to retrieve unsubscribe link.');
      button.disabled = false;
    });
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

const LARGE_DELETE_THRESHOLD = 100;

async function deleteInBackground(ids) {
  const total = ids.length;
  const chunkSize = 50;
  const progressEl = document.getElementById('deletion-progress');
  const progressText = document.getElementById('deletion-progress-text');
  const progressBar = document.getElementById('deletion-progress-bar');

  progressBar.max = total;
  progressBar.value = 0;
  progressText.textContent = `Deleting 0 / ${total} emails…`;
  progressEl.classList.remove('hidden');

  let done = 0;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    await browser.runtime.sendMessage({ action: 'deleteEmails', ids: chunk });
    done += chunk.length;
    progressBar.value = done;
    progressText.textContent = `Deleting ${done} / ${total} emails…`;
  }

  progressEl.classList.add('hidden');
  deletedThisSession += total;
  updateDeletedTotal();

  const seriesStatus = document.getElementById('series-status');
  seriesStatus.textContent = `Deleted ${total} email${total === 1 ? '' : 's'}.`;
  seriesStatus.classList.remove('hidden');
  setTimeout(() => seriesStatus.classList.add('hidden'), 4000);
}

async function deleteSelectedEmails() {
  const toDelete = currentEmails.filter((item) => item.checked);
  const toKeep = currentEmails.filter((item) => !item.checked);
  const selected = toDelete.map((item) => item.id);

  if (selected.length === 0) return;

  const confirmed = window.confirm(`Delete ${selected.length} selected email${selected.length === 1 ? '' : 's'}?`);
  if (!confirmed) return;

  document.getElementById('delete-button').disabled = true;

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

  // Large delete (>= threshold): navigate back immediately and track progress in background
  if (selected.length >= LARGE_DELETE_THRESHOLD) {
    deletedFromCurrentView = true;
    try {
      for (const [sender, { deleted, kept }] of senderMap) {
        if (deleted.length > 0) await logDeletion(currentDomain, sender, deleted, kept, dateWindow);
      }
    } catch (logError) {
      console.error('Failed to log deletion:', logError);
    }

    if (toKeep.length === 0) {
      currentSeries = currentSeries.filter((item) => item.domain !== currentDomain);
    } else {
      const domainEntry = currentSeries.find((item) => item.domain === currentDomain);
      if (domainEntry) {
        domainEntry.totalCount = toKeep.length;
        domainEntry.totalSize = toKeep.reduce((sum, e) => sum + (Number(e.size) || 0), 0);
      }
    }
    renderSeries(currentSeries);
    showSeriesView();

    deleteInBackground(selected).catch((err) => {
      console.error('Background deletion failed:', err);
      document.getElementById('deletion-progress').classList.add('hidden');
      const seriesStatus = document.getElementById('series-status');
      seriesStatus.textContent = 'Some emails could not be deleted.';
      seriesStatus.classList.remove('hidden');
      setTimeout(() => seriesStatus.classList.add('hidden'), 4000);
    });
    return;
  }

  // Standard delete: wait inline (small count or partial-group)
  try {
    const response = await browser.runtime.sendMessage({ action: 'deleteEmails', ids: selected });
    if (!response || !response.success) throw new Error('Delete failed.');

    const deletedCount = response.deletedCount || selected.length;
    deletedThisSession += selected.length;
    updateDeletedTotal();

    deletedFromCurrentView = true;
    try {
      for (const [sender, { deleted, kept }] of senderMap) {
        if (deleted.length > 0) await logDeletion(currentDomain, sender, deleted, kept, dateWindow);
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
  } catch (error) {
    console.error('Failed to delete selected emails:', error);
    document.getElementById('delete-button').disabled = false;
  }
}

function formatWindowLabel(fromDate, toDate) {
  return `Reviewing: ${formatDate(fromDate)} – ${formatDate(toDate)}`;
}

function updateDeletedTotal() {
  document.getElementById('deleted-total-label').textContent = `${deletedThisSession} emails deleted this session`;
}

function loadSeries() {
  document.getElementById('results-body').innerHTML = '<tr><td colspan="4" class="empty">Loading…</td></tr>';

  if (currentMode === 'full') {
    browser.runtime.sendMessage({ action: 'scanMailbox', minCount: 2, accountId: currentAccountId })
      .then((response) => {
        if (response && response.success) {
          renderSeries(response.series || []);
          return;
        }
        throw new Error('No response from background script.');
      })
      .catch((error) => {
        console.error('Failed to scan mailbox:', error);
        document.getElementById('results-body').innerHTML = '<tr><td colspan="4" class="empty">Unable to scan mailbox.</td></tr>';
      });
    return;
  }

  browser.runtime.sendMessage({
    action: 'getSeries',
    accountId: currentAccountId,
    limit: 100,
    minCount: 2
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
      document.getElementById('results-body').innerHTML = '<tr><td colspan="4" class="empty">Unable to load review data.</td></tr>';
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
      domainEntry.totalSize = currentEmails.reduce((sum, e) => sum + (Number(e.size) || 0), 0);
      renderSeries(currentSeries);
    }
  }
  showSeriesView();
});

document.getElementById('history-button').addEventListener('click', () => {
  browser.tabs.create({ url: browser.runtime.getURL('tab/history.html') });
});

document.getElementById('change-account-button').addEventListener('click', () => {
  showAccountPickerView();
});

document.querySelectorAll('th[data-sort-col]').forEach((th) => {
  th.addEventListener('click', () => {
    const col = th.getAttribute('data-sort-col');
    if (sortColumn === col) {
      sortDirection = sortDirection === 'desc' ? 'asc' : 'desc';
    } else {
      sortColumn = col;
      sortDirection = 'desc';
    }
    renderSeries(currentSeries);
  });
});

document.getElementById('mode-toggle-button').addEventListener('click', () => {
  currentMode = currentMode === 'windowed' ? 'full' : 'windowed';
  browser.storage.local.set({ scan_mode: currentMode });
  updateModeUI();
  showSeriesView();
  loadSeries();
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
window.addEventListener('load', () => {
  browser.storage.local.get('scan_mode').then((result) => {
    currentMode = result.scan_mode === 'full' ? 'full' : 'windowed';
    loadAccounts();
  });
});
