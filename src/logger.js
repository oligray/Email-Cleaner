const DECISIONS_KEY = 'email_cleaner_decisions';
const SESSION_STORAGE_KEY = 'email_cleaner_session_id';

function startSession() {
  const id = new Date().toISOString();
  sessionStorage.setItem(SESSION_STORAGE_KEY, id);
  return id;
}

function getSessionId() {
  const id = sessionStorage.getItem(SESSION_STORAGE_KEY);
  return id || startSession();
}

async function logDeletion(domain, sender, deletedEmails, keptEmails, dateWindow) {
  const entry = {
    session_id: getSessionId(),
    domain,
    sender,
    action: 'deleted',
    deleted_count: deletedEmails.length,
    rescued_count: keptEmails.length,
    deleted_emails: deletedEmails.slice(0, 100).map((e) => ({ id: e.id, subject: e.subject, date: e.date })),
    kept_emails: keptEmails.map((e) => ({ id: e.id, subject: e.subject, date: e.date })),
    window: dateWindow,
    timestamp: new Date().toISOString()
  };

  const result = await browser.storage.local.get(DECISIONS_KEY);
  const decisions = Array.isArray(result[DECISIONS_KEY]) ? result[DECISIONS_KEY] : [];
  decisions.push(entry);
  await browser.storage.local.set({ [DECISIONS_KEY]: decisions });
}

async function logKeep(domain, sender, keptEmails, dateWindow) {
  const entry = {
    session_id: getSessionId(),
    domain,
    sender,
    action: 'kept',
    deleted_count: 0,
    rescued_count: keptEmails.length,
    deleted_emails: [],
    kept_emails: keptEmails.map((e) => ({ id: e.id, subject: e.subject, date: e.date })),
    window: dateWindow,
    timestamp: new Date().toISOString()
  };

  const result = await browser.storage.local.get(DECISIONS_KEY);
  const decisions = Array.isArray(result[DECISIONS_KEY]) ? result[DECISIONS_KEY] : [];
  decisions.push(entry);
  await browser.storage.local.set({ [DECISIONS_KEY]: decisions });
}

async function getDecisions() {
  const result = await browser.storage.local.get(DECISIONS_KEY);
  const decisions = Array.isArray(result[DECISIONS_KEY]) ? result[DECISIONS_KEY] : [];
  return decisions.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

async function getDecisionForDomain(domain) {
  const decisions = await getDecisions();
  return decisions.find((d) => d.domain === domain) || null;
}

async function clearSession() {
  await browser.storage.local.remove(DECISIONS_KEY);
}

async function exportDecisions() {
  const decisions = await getDecisions();
  return JSON.stringify(decisions, null, 2);
}
