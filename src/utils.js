const crypto = require('crypto');

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function makeSessionValue(role, secret) {
  const payload = JSON.stringify({ role, ts: Date.now() });
  const encoded = Buffer.from(payload).toString('base64url');
  return `${encoded}.${sign(encoded, secret)}`;
}

function readSessionValue(raw, secret) {
  if (!raw || !secret) return null;
  const [encoded, signature] = String(raw).split('.');
  if (!encoded || !signature) return null;
  const expected = sign(encoded, secret);
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  return parsed;
}

function normalizePhone(value) {
  return String(value || '').replace(/[^0-9]/g, '').slice(0, 11);
}

function formatPhone(value) {
  const digits = normalizePhone(value);
  if (digits.length === 4) return `010-****-${digits}`;
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return String(value || '').trim();
}

function validatePhone(value) {
  if (String(value || '').trim() === '') return true;
  const digits = normalizePhone(value);
  return /^\d{4}$/.test(digits);
}

function sanitizeRecord(record, role) {
  return { ...record };
}

module.exports = {
  makeSessionValue,
  readSessionValue,
  formatPhone,
  validatePhone,
  sanitizeRecord
};
