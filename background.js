function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function collectAllMessages(queryOptions) {
  return browser.messages.query({
    ...queryOptions,
    messagesPerPage: 100,
    autoPaginationTimeout: 1000
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
