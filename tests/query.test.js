const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadQueryModule(browserStub) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'query.js'), 'utf8');
  const context = vm.createContext({
    browser: browserStub,
    console,
    Date,
    Number,
    Math,
    Array,
    Map,
    Promise,
    Object
  });

  vm.runInContext(source, context, { filename: 'src/query.js' });

  return {
    getOldestEmails: context.getOldestEmails,
    normalizeEmailRecord: context.normalizeEmailRecord
  };
}

test('getOldestEmails sends the active date window to Thunderbird', async () => {
  const calls = [];
  const browserStub = {
    messages: {
      query(queryOptions) {
        calls.push(queryOptions);
        return Promise.resolve({
          messages: [
            { id: 1, subject: 'Old', author: 'alpha@example.com', date: '2024-01-10T00:00:00Z', size: 1000 },
            { id: 2, subject: 'Middle', author: 'beta@example.com', date: '2024-02-10T00:00:00Z', size: 2000 },
            { id: 3, subject: 'Latest', author: 'gamma@example.com', date: '2024-03-10T00:00:00Z', size: 3000 }
          ],
          messageListId: null
        });
      }
    }
  };

  const { getOldestEmails } = loadQueryModule(browserStub);
  const results = await getOldestEmails(null, 10, '2024-02-01T00:00:00Z', '2024-04-01T00:00:00Z');

  assert.equal(results.length, 2);
  assert.deepEqual(results.map((item) => item.id), [2, 3]);
  assert.equal(calls[0].fromDate, '2024-02-01T00:00:00Z');
  assert.equal(calls[0].toDate, '2024-04-01T00:00:00Z');
});

test('getOldestEmails filters by date window and sorts chronologically', async () => {
  const browserStub = {
    messages: {
      query() {
        return Promise.resolve({
          messages: [
            { id: 10, subject: 'A', author: 'a@example.com', date: '2024-04-10T00:00:00Z', size: 500 },
            { id: 20, subject: 'B', author: 'b@example.com', date: '2024-05-10T00:00:00Z', size: 700 },
            { id: 30, subject: 'C', author: 'c@example.com', date: '2024-06-10T00:00:00Z', size: 900 }
          ],
          messageListId: null
        });
      },
      continueList() {
        return Promise.resolve({ messages: [], messageListId: null });
      }
    }
  };

  const { getOldestEmails } = loadQueryModule(browserStub);
  const results = await getOldestEmails(null, 10, '2024-04-15T00:00:00Z', '2024-05-31T23:59:59Z');

  assert.deepEqual(results.map((item) => item.id), [20]);
});
