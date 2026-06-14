function normalizeEmailRecord(message) {
  return {
    id: message.id,
    subject: message.subject || '(no subject)',
    author: message.author || message.from || '',
    date: message.date || message.receivedDate || null,
    size: Number(message.size) || 0
  };
}

function getOldestEmails(folderId, limit = 100, fromDate = null, toDate = null) {
  const queryOptions = {
    includeSubFolders: false,
    messagesPerPage: 250,
    autoPaginationTimeout: 10000
  };

  if (fromDate) {
    queryOptions.fromDate = fromDate;
  }

  if (toDate) {
    queryOptions.toDate = toDate;
  }

  if (folderId) {
    queryOptions.folderId = folderId;
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

      const maxResults = Number(limit) || 0;
      const capped = maxResults > 0 ? ordered.slice(0, maxResults) : ordered;
      return capped.map(normalizeEmailRecord);
    });
}

