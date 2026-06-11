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

    getOldestEmails(message.accountId || null, limit)
      .then((emails) => {
        sendResponse({
          success: true,
          series: detectSeries(emails, minCount)
        });
      })
      .catch((error) => {
        console.error('Failed to build series:', error);
        sendResponse({
          success: false,
          error: error && error.message ? error.message : String(error)
        });
      });

    return true;
  }

  if (message.action === 'getEmailsBySender') {
    const accountId = message.accountId || null;
    const sender = (message.sender || '').toString().trim().toLowerCase();

    const queryOptions = {
      includeSubFolders: false
    };

    if (accountId) {
      queryOptions.folderId = `${accountId}://INBOX`;
    }

    browser.messages.query(queryOptions)
      .then((result) => {
        const messages = result && Array.isArray(result.messages)
          ? result.messages
          : Array.isArray(result)
            ? result
            : [];

        const normalizedSender = sender.replace(/[<>]/g, '').trim();
        const filtered = messages
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
