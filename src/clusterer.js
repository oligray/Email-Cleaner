function extractSender(email) {
  const author = (email.author || email.from || '').toString().trim();

  const match = author.match(/<([^>]+)>/);
  if (match && match[1]) {
    return match[1].toLowerCase();
  }

  return author.toLowerCase();
}

function detectSeries(emails, minCount = 2) {
  const groups = new Map();

  (emails || []).forEach((email) => {
    const sender = extractSender(email);

    if (!groups.has(sender)) {
      groups.set(sender, []);
    }

    groups.get(sender).push(email);
  });

  return Array.from(groups.entries())
    .filter(([, groupEmails]) => groupEmails.length >= Math.max(1, Number(minCount) || 2))
    .map(([sender, groupEmails]) => ({
      sender,
      count: groupEmails.length,
      emails: groupEmails
    }))
    .sort((a, b) => b.count - a.count || new Date(a.emails[0]?.date || 0) - new Date(b.emails[0]?.date || 0));
}
