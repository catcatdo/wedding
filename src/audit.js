const fs = require('fs');
const path = require('path');

async function appendAuditLine(filePath, entry) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.appendFile(filePath, JSON.stringify({ ...entry, at: new Date().toISOString() }) + '\n', 'utf8');
}

module.exports = { appendAuditLine };
