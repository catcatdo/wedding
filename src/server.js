const express = require('express');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const path = require('path');
const config = require('./config');
const { ADMIN_EDITABLE_FIELDS } = require('./constants');
const { createStore } = require('./data-store');
const { makeSessionValue, readSessionValue, validatePhone, sanitizeRecord, formatPhone } = require('./utils');
const { appendAuditLine } = require('./audit');

const app = express();
const store = createStore(config);

if (config.trustProxy) app.set('trust proxy', 1);
app.use(morgan('combined'));
app.use(express.json());
app.use(cookieParser());
app.use((req, res, next) => {
  const session = readSessionValue(req.cookies.wgl_session, config.sessionSecret);
  req.role = session?.role || 'public';
  next();
});

function getEditableFields(role) {
  return ADMIN_EDITABLE_FIELDS;
}

function searchRecords(records, query, role) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return records;
  return records.filter((record) => {
    const visibleRecord = sanitizeRecord(record, role);
    return Object.values(visibleRecord).some((value) => String(value || '').toLowerCase().includes(needle));
  });
}

function sortRecords(records) {
  return [...records].sort((a, b) => String(b['거래일시'] || '').localeCompare(String(a['거래일시'] || '')));
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, dataSource: config.dataSource, appBaseUrl: config.appBaseUrl || null });
});

app.post('/api/auth/login', (req, res) => {
  const code = String(req.body?.code || '').trim();
  let role = '';
  if (config.adminAccessCode && code === config.adminAccessCode) role = 'admin';
  else if (config.userAccessCode && code === config.userAccessCode) role = 'user';
  if (!role) return res.status(401).json({ ok: false, error: '접근 코드가 올바르지 않습니다.' });
  res.cookie('wgl_session', makeSessionValue(role, config.sessionSecret), {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: 1000 * 60 * 60 * 12
  });
  res.json({ ok: true, role });
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('wgl_session');
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  res.json({ ok: true, role: 'public', permissions: getEditableFields(req.role) });
});

app.get('/api/records', async (req, res, next) => {
  try {
    const all = await store.list();
    const limit = Math.min(Math.max(Number(req.query.limit || config.defaultLimit), 1), 200);
    const limited = sortRecords(searchRecords(all, req.query.q, req.role)).slice(0, limit);
    res.json({ ok: true, records: limited.map((record) => sanitizeRecord(record, req.role)) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/records/:id', async (req, res, next) => {
  try {
    const record = await store.getById(req.params.id);
    if (!record) return res.status(404).json({ ok: false, error: '기록을 찾을 수 없습니다.' });
    res.json({ ok: true, record: sanitizeRecord(record, req.role) });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/records/:id', async (req, res, next) => {
  try {
    const editable = getEditableFields(req.role);
    const changes = {};
    for (const field of editable) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) changes[field] = String(req.body[field] || '').trim();
    }
    if (Object.keys(changes).length === 0) {
      return res.status(400).json({ ok: false, error: '변경할 항목이 없습니다.' });
    }
    if (Object.prototype.hasOwnProperty.call(changes, '전화번호')) {
      if (!validatePhone(changes['전화번호'])) {
        return res.status(400).json({ ok: false, error: '전화번호 형식이 올바르지 않습니다.' });
      }
      changes['전화번호'] = formatPhone(changes['전화번호']);
    }
    const updated = await store.update(req.params.id, changes);
    if (!updated) return res.status(404).json({ ok: false, error: '기록을 찾을 수 없습니다.' });
    await appendAuditLine(config.auditLogPath, { action: 'record.update', role: req.role, id: req.params.id, changedFields: Object.keys(changes), ip: req.ip });
    res.json({ ok: true, record: sanitizeRecord(updated, req.role) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/config', (_req, res) => {
  res.json({ ok: true, defaultLimit: config.defaultLimit, appBaseUrl: config.appBaseUrl || '' });
});

app.use(express.static(path.join(process.cwd(), 'public')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ ok: false, error: '서버 오류가 발생했습니다.' });
});

app.listen(config.port, () => {
  console.log(`Wedding gift lookup listening on :${config.port}`);
});
