const path = require('path');
require('dotenv').config();

function toBool(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

module.exports = {
  port: Number(process.env.PORT || 3000),
  appBaseUrl: process.env.APP_BASE_URL || '',
  sessionSecret: process.env.SESSION_SECRET || 'change-me',
  userAccessCode: process.env.USER_ACCESS_CODE || '',
  adminAccessCode: process.env.ADMIN_ACCESS_CODE || '',
  dataSource: process.env.DATA_SOURCE || 'local',
  defaultLimit: Math.min(Math.max(Number(process.env.DEFAULT_LIMIT || 50), 1), 200),
  cookieSecure: toBool(process.env.COOKIE_SECURE, false),
  trustProxy: toBool(process.env.TRUST_PROXY, true),
  auditLogPath: process.env.AUDIT_LOG_PATH || path.join(process.cwd(), 'data', 'audit.log'),
  localDataPath: process.env.LOCAL_DATA_PATH || path.join(process.cwd(), 'data', 'records.json'),
  google: {
    spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '',
    sheetName: process.env.GOOGLE_SHEETS_SHEET_NAME || '',
    clientEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
    privateKey: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n')
  }
};
