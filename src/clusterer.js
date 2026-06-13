function extractSender(email) {
  const author = (email.author || email.from || '').toString().trim();

  const match = author.match(/<([^>]+)>/);
  if (match && match[1]) {
    return match[1].toLowerCase();
  }

  return author.toLowerCase();
}

function extractDomain(emailAddress) {
  const at = emailAddress.lastIndexOf('@');
  if (at === -1) return emailAddress;
  const host = emailAddress.slice(at + 1).toLowerCase();
  const parts = host.split('.');
  if (parts.length < 2) return host;
  if (parts[parts.length - 1].length === 2 && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

function detectSeries(emails, minCount = 2) {
  const senderGroups = new Map();

  (emails || []).forEach((email) => {
    const sender = extractSender(email);
    if (!senderGroups.has(sender)) {
      senderGroups.set(sender, []);
    }
    senderGroups.get(sender).push(email);
  });

  const senderEntries = Array.from(senderGroups.entries())
    .filter(([, groupEmails]) => groupEmails.length >= Math.max(1, Number(minCount) || 2))
    .map(([sender, groupEmails]) => ({
      sender,
      count: groupEmails.length,
      emails: groupEmails
    }));

  const domainGroups = new Map();
  senderEntries.forEach((entry) => {
    const domain = extractDomain(entry.sender);
    if (!domainGroups.has(domain)) {
      domainGroups.set(domain, []);
    }
    domainGroups.get(domain).push(entry);
  });

  return Array.from(domainGroups.entries())
    .map(([domain, senders]) => {
      const totalCount = senders.reduce((sum, s) => sum + s.count, 0);
      const totalSize = senders.reduce((sum, s) => sum + s.emails.reduce((s2, e) => s2 + (Number(e.size) || 0), 0), 0);
      const allDates = senders.flatMap((s) => s.emails.map((e) => e.date || null)).filter(Boolean);
      const oldestDate = allDates.length > 0
        ? allDates.reduce((oldest, d) => (new Date(d) < new Date(oldest) ? d : oldest))
        : null;
      return { domain, totalCount, totalSize, oldestDate, senders };
    })
    .sort((a, b) => b.totalCount - a.totalCount);
}
