const CONFIG = window.APP_CONFIG || {};
const state = {
  records: [],
  selected: null
};

const els = {
  searchInput: document.getElementById('searchInput'),
  searchButton: document.getElementById('searchButton'),
  refreshButton: document.getElementById('refreshButton'),
  resultsList: document.getElementById('resultsList'),
  resultCount: document.getElementById('resultCount'),
  statusMessage: document.getElementById('statusMessage'),
  selectedId: document.getElementById('selectedId'),
  recordForm: document.getElementById('recordForm'),
  resetButton: document.getElementById('resetButton'),
  recordId: document.getElementById('recordId'),
  dateTime: document.getElementById('dateTime'),
  amount: document.getElementById('amount'),
  description: document.getElementById('description'),
  bank: document.getElementById('bank'),
  accountNumber: document.getElementById('accountNumber'),
  accountHolder: document.getElementById('accountHolder'),
  phone: document.getElementById('phone'),
  memo: document.getElementById('memo')
};

function setStatus(message, type = '') {
  els.statusMessage.textContent = message;
  els.statusMessage.className = `status ${type}`.trim();
}

function ensureConfig() {
  if (!CONFIG.apiBaseUrl) {
    setStatus('config.js에 apiBaseUrl을 설정해주세요.', 'error');
    throw new Error('Missing apiBaseUrl in APP_CONFIG');
  }
}

function buildUrl(params = {}) {
  const url = new URL(CONFIG.apiBaseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });
  if (CONFIG.apiToken) {
    url.searchParams.set('token', CONFIG.apiToken);
  }
  return url.toString();
}

async function apiGet(params = {}) {
  const response = await fetch(buildUrl(params));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || 'API request failed');
  return data;
}

async function apiPost(payload) {
  const response = await fetch(buildUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      ...payload,
      token: CONFIG.apiToken || ''
    })
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || 'API request failed');
  return data;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function summarizeRecord(record) {
  const holder = record['상대계좌예금주명'] || '(이름 없음)';
  const amount = record['출금'] || '-';
  const bank = record['상대은행'] || '-';
  const account = record['상대계좌번호'] || '-';
  return { holder, amount, bank, account };
}

function renderResults(records) {
  els.resultCount.textContent = `${records.length}건`;

  if (!records.length) {
    els.resultsList.innerHTML = '<li class="empty">검색 결과가 없습니다.</li>';
    return;
  }

  els.resultsList.innerHTML = records
    .map((record) => {
      const { holder, amount, bank, account } = summarizeRecord(record);
      const active = state.selected?.id === record.id ? 'active' : '';
      return `
        <li class="result-item ${active}" data-id="${escapeHtml(record.id)}">
          <div class="result-title">
            <span>${escapeHtml(holder)}</span>
            <span>${escapeHtml(amount)}</span>
          </div>
          <div class="result-meta">
            <div>${escapeHtml(record['거래일시'] || '')}</div>
            <div>${escapeHtml(bank)} / ${escapeHtml(account)}</div>
            <div>전화번호: ${escapeHtml(record['전화번호'] || '-')}</div>
            <div>메모: ${escapeHtml(record['메모'] || '-')}</div>
          </div>
        </li>
      `;
    })
    .join('');

  [...document.querySelectorAll('.result-item')].forEach((item) => {
    item.addEventListener('click', () => {
      const record = state.records.find((entry) => entry.id === item.dataset.id);
      if (record) selectRecord(record);
    });
  });
}

function resetForm() {
  state.selected = null;
  els.selectedId.textContent = '선택 없음';
  els.recordForm.reset();
  els.recordId.value = '';
  renderResults(state.records);
}

function selectRecord(record) {
  state.selected = record;
  els.selectedId.textContent = record.id;
  els.recordId.value = record.id || '';
  els.dateTime.value = record['거래일시'] || '';
  els.amount.value = record['출금'] || '';
  els.description.value = record['거래내용'] || '';
  els.bank.value = record['상대은행'] || '';
  els.accountNumber.value = record['상대계좌번호'] || '';
  els.accountHolder.value = record['상대계좌예금주명'] || '';
  els.phone.value = record['전화번호'] || '';
  els.memo.value = record['메모'] || '';
  renderResults(state.records);
}

async function loadRecords(query = '') {
  setStatus('불러오는 중...');
  const data = await apiGet({
    action: 'list',
    q: query,
    limit: CONFIG.defaultLimit || 50
  });
  state.records = data.records || [];
  renderResults(state.records);
  if (state.selected?.id) {
    const matched = state.records.find((entry) => entry.id === state.selected.id);
    if (matched) selectRecord(matched);
  }
  setStatus(`목록을 불러왔습니다. (${state.records.length}건)`, 'success');
}

function getFormRecord() {
  return {
    id: els.recordId.value.trim(),
    '거래내용': els.description.value.trim(),
    '상대은행': els.bank.value.trim(),
    '상대계좌번호': els.accountNumber.value.trim(),
    '상대계좌예금주명': els.accountHolder.value.trim(),
    '전화번호': els.phone.value.trim(),
    '메모': els.memo.value.trim()
  };
}

async function handleSubmit(event) {
  event.preventDefault();
  try {
    setStatus('저장 중...');
    const payload = getFormRecord();
    const data = await apiPost({ action: 'upsert', record: payload });
    setStatus('저장되었습니다.', 'success');
    if (data.record) {
      state.selected = data.record;
    }
    await loadRecords(els.searchInput.value.trim());
    if (data.record) {
      selectRecord(data.record);
    }
  } catch (error) {
    console.error(error);
    setStatus(`저장 실패: ${error.message}`, 'error');
  }
}

async function handleSearch() {
  try {
    await loadRecords(els.searchInput.value.trim());
  } catch (error) {
    console.error(error);
    setStatus(`조회 실패: ${error.message}`, 'error');
  }
}

function bindEvents() {
  els.searchButton.addEventListener('click', handleSearch);
  els.refreshButton.addEventListener('click', () => loadRecords(''));
  els.resetButton.addEventListener('click', resetForm);
  els.recordForm.addEventListener('submit', handleSubmit);
  els.searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleSearch();
    }
  });
}

async function init() {
  try {
    ensureConfig();
    bindEvents();
    await loadRecords('');
  } catch (error) {
    console.error(error);
    setStatus(error.message, 'error');
  }
}

init();
