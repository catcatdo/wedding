var SPREADSHEET_ID = '1bAWsgZAy9WABn_STw-Po2GyyZjnurmsLufQGSA1_Oic';
var SHEET_NAME = '';
var API_TOKEN = 'replace-me';
var REQUIRED_HEADERS = [
  'id',
  '거래일시',
  '출금',
  '거래내용',
  '상대계좌번호',
  '상대은행',
  '상대계좌예금주명',
  '전화번호',
  '메모'
];

function doGet(e) {
  try {
    validateToken_(e.parameter.token || '');
    var action = (e.parameter.action || 'list').toLowerCase();

    if (action === 'list') {
      var query = e.parameter.q || '';
      var limit = Number(e.parameter.limit || 50);
      return jsonOutput_({ ok: true, records: listRecords_(query, limit) });
    }

    if (action === 'get') {
      var id = e.parameter.id || '';
      return jsonOutput_({ ok: true, record: getRecordById_(id) });
    }

    return jsonOutput_({ ok: false, error: 'Unsupported action' });
  } catch (error) {
    return jsonOutput_({ ok: false, error: error.message });
  }
}

function doPost(e) {
  try {
    var body = parseBody_(e);
    validateToken_(body.token || '');
    var action = (body.action || '').toLowerCase();

    if (action === 'upsert') {
      var record = upsertRecord_(body.record || {});
      return jsonOutput_({ ok: true, record: record });
    }

    return jsonOutput_({ ok: false, error: 'Unsupported action' });
  } catch (error) {
    return jsonOutput_({ ok: false, error: error.message });
  }
}

function listRecords_(query, limit) {
  var context = getSheetContext_();
  var rows = context.records;
  var normalized = String(query || '').trim().toLowerCase();

  if (normalized) {
    rows = rows.filter(function(record) {
      return searchableFields_(record).some(function(value) {
        return String(value || '').toLowerCase().indexOf(normalized) !== -1;
      });
    });
  }

  rows.sort(function(a, b) {
    return String(b['거래일시'] || '').localeCompare(String(a['거래일시'] || ''));
  });

  return rows.slice(0, Math.max(1, Math.min(limit || 50, 200)));
}

function getRecordById_(id) {
  var context = getSheetContext_();
  var found = context.records.find(function(record) {
    return String(record.id) === String(id);
  });
  if (!found) throw new Error('Record not found');
  return found;
}

function upsertRecord_(record) {
  var context = getSheetContext_();
  var sheet = context.sheet;
  var headers = context.headers;
  var headerMap = context.headerMap;
  var rowIndex = findRowIndexById_(context.records, record.id);
  var targetId = record.id || Utilities.getUuid();
  var merged = createEmptyRecord_(headers);

  if (rowIndex !== -1) {
    merged = context.records[rowIndex - 2];
  }

  merged.id = targetId;
  REQUIRED_HEADERS.forEach(function(header) {
    if (record.hasOwnProperty(header)) {
      merged[header] = sanitizeCell_(record[header]);
    }
  });

  var rowValues = headers.map(function(header) {
    return merged[header] || '';
  });

  if (rowIndex === -1) {
    sheet.appendRow(rowValues);
  } else {
    sheet.getRange(rowIndex, 1, 1, headers.length).setValues([rowValues]);
  }

  return getRecordById_(targetId);
}

function findRowIndexById_(records, id) {
  if (!id) return -1;
  for (var i = 0; i < records.length; i++) {
    if (String(records[i].id) === String(id)) {
      return i + 2;
    }
  }
  return -1;
}

function searchableFields_(record) {
  return [
    record.id,
    record['거래일시'],
    record['출금'],
    record['거래내용'],
    record['상대계좌번호'],
    record['상대은행'],
    record['상대계좌예금주명'],
    record['전화번호'],
    record['메모']
  ];
}

function getSheetContext_() {
  var sheet = openSheet_();
  ensureHeaders_(sheet);
  ensureIds_(sheet);

  var values = sheet.getDataRange().getValues();
  var headers = values[0] || [];
  var headerMap = buildHeaderMap_(headers);
  var records = values.slice(1).filter(function(row) {
    return row.some(function(cell) { return cell !== ''; });
  }).map(function(row) {
    return rowToRecord_(headers, row);
  });

  return {
    sheet: sheet,
    headers: headers,
    headerMap: headerMap,
    records: records
  };
}

function openSheet_() {
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  if (SHEET_NAME) {
    var namedSheet = spreadsheet.getSheetByName(SHEET_NAME);
    if (!namedSheet) throw new Error('Sheet not found: ' + SHEET_NAME);
    return namedSheet;
  }
  return spreadsheet.getSheets()[0];
}

function ensureHeaders_(sheet) {
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var headerValues = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var headers = headerValues.map(function(value) { return String(value || '').trim(); });

  if (headers.length === 1 && headers[0] === '') {
    headers = [];
  }

  var changed = false;
  REQUIRED_HEADERS.forEach(function(header) {
    if (headers.indexOf(header) === -1) {
      headers.push(header);
      changed = true;
    }
  });

  if (changed || sheet.getLastColumn() !== headers.length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function ensureIds_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return;

  var headers = values[0];
  var idIndex = headers.indexOf('id');
  if (idIndex === -1) throw new Error('id column missing');

  var changed = false;
  for (var rowIndex = 1; rowIndex < values.length; rowIndex++) {
    var row = values[rowIndex];
    var hasAnyContent = row.some(function(cell, idx) {
      return idx !== idIndex && cell !== '';
    });
    if (hasAnyContent && !row[idIndex]) {
      row[idIndex] = Utilities.getUuid();
      changed = true;
    }
  }

  if (changed) {
    sheet.getRange(2, 1, values.length - 1, headers.length).setValues(values.slice(1));
  }
}

function buildHeaderMap_(headers) {
  return headers.reduce(function(map, header, index) {
    map[header] = index;
    return map;
  }, {});
}

function rowToRecord_(headers, row) {
  return headers.reduce(function(record, header, index) {
    record[header] = row[index] == null ? '' : row[index];
    return record;
  }, {});
}

function createEmptyRecord_(headers) {
  return headers.reduce(function(record, header) {
    record[header] = '';
    return record;
  }, {});
}

function sanitizeCell_(value) {
  return value == null ? '' : String(value).trim();
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('Missing request body');
  }
  return JSON.parse(e.postData.contents);
}

function validateToken_(token) {
  if (!API_TOKEN) return;
  if (token !== API_TOKEN) {
    throw new Error('Unauthorized');
  }
}

function jsonOutput_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
