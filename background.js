browser.browserAction.onClicked.addListener(() => {
  browser.tabs.create({
    url: browser.runtime.getURL('tab/review.html')
  });
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.action !== 'getSeries') {
    return false;
  }

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
