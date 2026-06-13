function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function collectAllMessages(queryOptions) {
  return browser.messages.query({
    ...queryOptions,
    messagesPerPage: 250,
    autoPaginationTimeout: 10000
  }).then((page) => {
    const allMessages = Array.isArray(page.messages) ? page.messages.slice() : [];

    return (function loadNext(listId) {
      if (!listId) {
        return Promise.resolve(allMessages);
      }

      return browser.messages.continueList(listId).then((nextPage) => {
        if (Array.isArray(nextPage.messages)) {
          allMessages.push(...nextPage.messages);
        }

        return loadNext(nextPage.id || null);
      });
    })(page.id || null);
  });
}

async function runBackgroundDeletion(ids, tabId) {
  const chunkSize = 50;
  const total = ids.length;
  let done = 0;

  function notify(action, extra) {
    if (!tabId) return;
    browser.tabs.sendMessage(tabId, { action, total, done, ...extra }).catch(() => {});
  }

  try {
    for (let i = 0; i < total; i += chunkSize) {
      await browser.messages.delete(ids.slice(i, i + chunkSize));
      done += Math.min(chunkSize, total - i);
      notify('deletionProgress');
    }
    notify('deletionComplete');
  } catch (error) {
    console.error('Background deletion error:', error);
    notify('deletionError');
  }
}

browser.browserAction.onClicked.addListener(() => {
  browser.tabs.create({
    url: browser.runtime.getURL('tab/review.html')
  });
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) {
    return false;
  }

  if (message.action === 'getSeries') {
    const limit = Number(message.limit) || 100;
    const minCount = Number(message.minCount) || 2;

    Promise.all([getCursor(), getWindowSize()])
      .then(([cursor, windowSize]) => {
        const baseCursor = cursor || new Date();

        return getOldestEmails(message.accountId || null, 1)
          .then((oldestEmails) => {
            const oldestDate = oldestEmails && oldestEmails.length > 0 ? oldestEmails[0].date : null;
            const effectiveFromDate = cursor || oldestDate || baseCursor;
            const toDate = addMonths(new Date(effectiveFromDate), windowSize);

            if (!cursor) {
              return setCursor(new Date(effectiveFromDate)).then(() => ({ effectiveFromDate, toDate }));
            }

            return { effectiveFromDate, toDate };
          })
          .then(({ effectiveFromDate, toDate }) => {
            return getOldestEmails(message.accountId || null, limit, effectiveFromDate, toDate)
              .then((emails) => {
                sendResponse({
                  success: true,
                  series: detectSeries(emails, minCount),
                  fromDate: effectiveFromDate,
                  toDate
                });
              });
          });
      })
      .catch((error) => {
        console.error('Failed to build series:', error);
        sendResponse({ success: false, error: error && error.message ? error.message : String(error) });
      });

    return true;
  }

  if (message.action === 'advanceCursor') {
    Promise.all([getCursor(), getWindowSize()])
      .then(([cursor, windowSize]) => {
        const currentCursor = cursor || new Date();
        const direction = message.direction === 'previous' ? -1 : 1;
        const nextCursor = addMonths(new Date(currentCursor), direction * windowSize);
        const toDate = addMonths(new Date(nextCursor), windowSize);

        return setCursor(nextCursor).then(() => ({
          success: true,
          fromDate: nextCursor,
          toDate
        }));
      })
      .then((result) => sendResponse(result))
      .catch((error) => {
        console.error('Failed to advance cursor:', error);
        sendResponse({ success: false, error: error && error.message ? error.message : String(error) });
      });

    return true;
  }

  if (message.action === 'getEmailsBySender') {
    const sender = (message.sender || '').toString().trim().toLowerCase();
    const normalizedSender = sender.replace(/[<>]/g, '').trim();

    browser.folders.query({ specialUse: ['inbox'] })
      .then((inboxFolders) => {
        const queries = inboxFolders.map((folder) =>
          collectAllMessages({
            folderId: folder.id,
            includeSubFolders: false,
            ...(normalizedSender ? { author: normalizedSender } : {})
          })
        );
        return Promise.all(queries).then((results) => {
          const seen = new Set();
          return results.flat().filter((item) => {
            const key = item.headerMessageId || `${item.date}::${item.subject}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        });
      })
      .then((items) => {
        const filtered = items
          .filter((item) => {
            const author = (item.author || item.from || '').toString().toLowerCase();
            return author.includes(normalizedSender) || author.replace(/[<>]/g, '').includes(normalizedSender);
          })
          .map((item) => ({
            id: item.id,
            subject: item.subject || '(no subject)',
            date: item.date || item.receivedDate || null,
            size: item.size || 0
          }))
          .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

        sendResponse({
          success: true,
          emails: filtered
        });
      })
      .catch((error) => {
        console.error('Failed to fetch emails for sender:', error);
        sendResponse({
          success: false,
          error: error && error.message ? error.message : String(error)
        });
      });

    return true;
  }

  if (message.action === 'getInboxFolders') {
    const filterAccountId = message.accountId || null;
    browser.folders.query({ specialUse: ['inbox'] })
      .then((folders) => {
        const filtered = filterAccountId
          ? folders.filter((f) => f.accountId === filterAccountId)
          : folders;
        sendResponse({ success: true, folderIds: filtered.map((f) => f.id) });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error && error.message ? error.message : String(error) });
      });
    return true;
  }

  if (message.action === 'scanMailbox') {
    const minCount = Number(message.minCount) || 2;
    const filterAccountId = message.accountId || null;

    browser.folders.query({ specialUse: ['inbox'] })
      .then((inboxFolders) => {
        const folders = filterAccountId
          ? inboxFolders.filter((f) => f.accountId === filterAccountId)
          : inboxFolders;
        const queries = folders.map((folder) =>
          collectAllMessages({ folderId: folder.id, includeSubFolders: false })
        );
        return Promise.all(queries).then((results) => {
          const seen = new Set();
          return results.flat().filter((item) => {
            const key = item.headerMessageId || `${item.date}::${item.subject}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          }).map(normalizeEmailRecord);
        });
      })
      .then((emails) => {
        sendResponse({ success: true, series: detectSeries(emails, minCount) });
      })
      .catch((error) => {
        console.error('Failed to scan mailbox:', error);
        sendResponse({ success: false, error: error && error.message ? error.message : String(error) });
      });

    return true;
  }

  if (message.action === 'unsubscribePost') {
    const url = (message.url || '').toString();
    if (!url.startsWith('https://') && !url.startsWith('http://')) {
      sendResponse({ success: false, error: 'Invalid URL' });
      return true;
    }

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click'
    })
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error('Unsubscribe POST failed:', error);
        sendResponse({ success: false, error: error && error.message ? error.message : String(error) });
      });

    return true;
  }

  if (message.action === 'startBackgroundDeletion') {
    const ids = Array.isArray(message.ids) ? message.ids.filter((id) => Number.isFinite(Number(id))) : [];
    const tabId = sender && sender.tab && sender.tab.id;
    sendResponse({ success: true });
    runBackgroundDeletion(ids, tabId).catch(console.error);
    return true;
  }

  if (message.action === 'deleteEmails') {
    const ids = Array.isArray(message.ids) ? message.ids.filter((id) => Number.isFinite(Number(id))) : [];

    if (ids.length === 0) {
      sendResponse({ success: true, deletedCount: 0 });
      return true;
    }

    browser.messages.delete(ids)
      .then(() => {
        sendResponse({ success: true, deletedCount: ids.length });
      })
      .catch((error) => {
        console.error('Failed to delete emails:', error);
        sendResponse({
          success: false,
          error: error && error.message ? error.message : String(error)
        });
      });

    return true;
  }

  return false;
});

// The legacy install-time query/delete flow is intentionally disabled.
// Kept here for reference while the UI-focused flow is being developed.
// browser.runtime.onInstalled.addListener(() => {
//   browser.messages.query({
//     subject: 'Security alert',
//     folderId: 'account1://INBOX',
//     includeSubFolders: false
//   })
//     .then((results) => {
//       const matchingMessages = results && Array.isArray(results.messages)
//         ? results.messages
//         : Array.isArray(results)
//           ? results
//           : [];
//
//       console.log('Messages matching "Security alert":', matchingMessages);
//       console.log('Match count:', matchingMessages.length);
//
//       if (matchingMessages.length > 0) {
//         const oldestMessage = matchingMessages
//           .slice()
//           .sort((a, b) => new Date(a.date) - new Date(b.date))[0];
//
//         return browser.messages.delete([oldestMessage.id]).then(() => {
//           console.log('Deleted the oldest matching message.');
//         });
//       }
//
//       console.log('No matching message to delete automatically.');
//       return null;
//     })
//     .catch((error) => {
//       console.error('Error during message query/delete:', error);
//     });
// });
