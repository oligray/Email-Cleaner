function normalizeEmailRecord(message) {
  return {
    id: message.id,
    subject: message.subject || '(no subject)',
    author: message.author || message.from || '',
    date: message.date || message.receivedDate || null
  };
}

function getOldestEmails(accountId, limit = 100) {
  const queryOptions = {
    includeSubFolders: false
  };

  if (accountId) {
    queryOptions.folderId = `${accountId}://INBOX`;
  }

  return browser.messages.query(queryOptions)
    .then((result) => {
      const messages = result && Array.isArray(result.messages)
        ? result.messages
        : Array.isArray(result)
          ? result
          : [];

      const maxResults = Math.max(1, Number(limit) || 100);

      return messages
        .slice()
        .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0))
        .slice(0, maxResults)
        .map(normalizeEmailRecord);
    });
}
