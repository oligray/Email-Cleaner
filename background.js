browser.runtime.onInstalled.addListener(() => {
  browser.messages.query({
    subject: 'Security alert',
    folderId: 'account1://INBOX',
    includeSubFolders: false
  })
    .then((results) => {
      const matchingMessages = results && Array.isArray(results.messages)
        ? results.messages
        : Array.isArray(results)
          ? results
          : [];

      console.log('Messages matching "Security alert":', matchingMessages);
      console.log('Match count:', matchingMessages.length);

      if (matchingMessages.length > 0) {
        const oldestMessage = matchingMessages
          .slice()
          .sort((a, b) => new Date(a.date) - new Date(b.date))[0];

        return browser.messages.delete([oldestMessage.id]).then(() => {
          console.log('Deleted the oldest matching message.');
        });
      }

      console.log('No matching message to delete automatically.');
      return null;
    })
    .catch((error) => {
      console.error('Error during message query/delete:', error);
    });
});
