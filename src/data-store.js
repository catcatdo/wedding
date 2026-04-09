const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { HEADERS } = require('./constants');
const { formatPhone } = require('./utils');

class LocalStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async ensureFile() {
    await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      await fs.promises.access(this.filePath);
    } catch {
      await fs.promises.writeFile(this.filePath, '[]\n', 'utf8');
    }
  }

  async readAll() {
    await this.ensureFile();
    const raw = await fs.promises.readFile(this.filePath, 'utf8');
    return JSON.parse(raw).map(normalizeRecord);
  }

  async writeAll(records) {
    await this.ensureFile();
    await fs.promises.writeFile(this.filePath, JSON.stringify(records, null, 2) + '\n', 'utf8');
  }

  async list() {
    return this.readAll();
  }

  async getById(id) {
    const records = await this.readAll();
    return records.find((record) => String(record.id) === String(id)) || null;
  }

  async update(id, changes) {
    const records = await this.readAll();
    const index = records.findIndex((record) => String(record.id) === String(id));
    if (index === -1) return null;
    records[index] = normalizeRecord({ ...records[index], ...changes, id: records[index].id });
    await this.writeAll(records);
    return records[index];
  }
}

class GoogleSheetsStore {
  constructor(config) {
    this.config = config;
  }

  async getClient() {
    const auth = new google.auth.JWT({
      email: this.config.clientEmail,
      key: this.config.privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    return google.sheets({ version: 'v4', auth });
  }

  async getSheetName(client) {
    if (this.config.sheetName) return this.config.sheetName;
    const meta = await client.spreadsheets.get({ spreadsheetId: this.config.spreadsheetId });
    return meta.data.sheets?.[0]?.properties?.title;
  }

  async readMatrix() {
    const client = await this.getClient();
    const sheetName = await this.getSheetName(client);
    const range = `${sheetName}!A:Z`;
    const res = await client.spreadsheets.values.get({ spreadsheetId: this.config.spreadsheetId, range });
    const rows = res.data.values || [];
    return { client, sheetName, rows };
  }

  async ensureHeaders(client, sheetName, rows) {
    const headers = rows[0] || [];
    let changed = false;
    HEADERS.forEach((header) => {
      if (!headers.includes(header)) {
        headers.push(header);
        changed = true;
      }
    });
    if (changed || rows.length === 0) {
      await client.spreadsheets.values.update({
        spreadsheetId: this.config.spreadsheetId,
        range: `${sheetName}!1:1`,
        valueInputOption: 'RAW',
        requestBody: { values: [headers] }
      });
    }
    return headers;
  }

  async readAll() {
    const { client, sheetName, rows } = await this.readMatrix();
    const headers = await this.ensureHeaders(client, sheetName, rows);
    const bodyRows = (rows.slice(1) || []).filter((row) => row.some((cell) => String(cell || '').trim() !== ''));
    const records = bodyRows.map((row, idx) => normalizeRecord(Object.fromEntries(headers.map((header, i) => [header, row[i] || '']))));
    const missingIds = records.filter((record) => !record.id);
    if (missingIds.length) {
      const repaired = records.map((record) => normalizeRecord(record));
      const values = [headers, ...repaired.map((record) => headers.map((header) => record[header] || ''))];
      await client.spreadsheets.values.update({
        spreadsheetId: this.config.spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values }
      });
      return repaired;
    }
    return records;
  }

  async list() {
    return this.readAll();
  }

  async getById(id) {
    const records = await this.readAll();
    return records.find((record) => String(record.id) === String(id)) || null;
  }

  async update(id, changes) {
    const { client, sheetName, rows } = await this.readMatrix();
    const headers = await this.ensureHeaders(client, sheetName, rows);
    const records = (rows.slice(1) || []).map((row) => normalizeRecord(Object.fromEntries(headers.map((header, i) => [header, row[i] || '']))));
    const index = records.findIndex((record) => String(record.id) === String(id));
    if (index === -1) return null;
    records[index] = normalizeRecord({ ...records[index], ...changes, id: records[index].id });
    const values = [headers, ...records.map((record) => headers.map((header) => record[header] || ''))];
    await client.spreadsheets.values.update({
      spreadsheetId: this.config.spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values }
    });
    return records[index];
  }
}

function normalizeRecord(record = {}) {
  const normalized = {};
  for (const header of HEADERS) normalized[header] = String(record[header] || '').trim();
  normalized.id = normalized.id || `row-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  normalized['전화번호'] = formatPhone(normalized['전화번호']);
  return normalized;
}

function createStore(config) {
  const canUseGoogle = config.dataSource === 'google-sheets' && config.google.spreadsheetId && config.google.clientEmail && config.google.privateKey;
  return canUseGoogle ? new GoogleSheetsStore(config.google) : new LocalStore(config.localDataPath);
}

module.exports = { createStore };
