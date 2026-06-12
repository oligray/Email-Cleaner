function normalizeEmailRecord(message) {
  return {
    id: message.id,
    subject: message.subject || '(no subject)',
    author: message.author || message.from || '',
    date: message.date || message.receivedDate || null,
    size: Number(message.size) || 0
  };
}

function getOldestEmails(accountId, limit = 100, fromDate = null, toDate = null) {
  const queryOptions = {
    includeSubFolders: false,
    messagesPerPage: 100,
    autoPaginationTimeout: 1000
  };

  if (fromDate) {
    queryOptions.fromDate = fromDate;
  }

  if (toDate) {
    queryOptions.toDate = toDate;
  }

  if (accountId) {
    queryOptions.folderId = `${accountId}://INBOX`;
  }

  return browser.messages.query(queryOptions)
    .then((result) => {
      const items = result && Array.isArray(result.messages)
        ? result.messages
        : Array.isArray(result)
          ? result
          : [];

      const fromMs = fromDate ? new Date(fromDate).getTime() : null;
      const toMs = toDate ? new Date(toDate).getTime() : null;

      const filtered = items.filter((message) => {
        const dateMs = new Date(message.date || message.receivedDate || 0).getTime();
        if (fromMs !== null && dateMs < fromMs) {
          return false;
        }
        if (toMs !== null && dateMs > toMs) {
          return false;
        }
        return true;
      });

      const ordered = filtered
        .slice()
        .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

      const maxResults = Math.max(1, Number(limit) || 100);
      return ordered
        .slice(0, maxResults)
        .map(normalizeEmailRecord);
    });
}

