const state = { role: 'public', records: [], selected: null, defaultLimit: 50 };

const els = {
  accessCode: document.getElementById('accessCode'),
  loginButton: document.getElementById('loginButton'),
  logoutButton: document.getElementById('logoutButton'),
  roleBadge: document.getElementById('roleBadge'),
  searchInput: document.getElementById('searchInput'),
  searchButton: document.getElementById('searchButton'),
  refreshButton: document.getElementById('refreshButton'),
  resultsList: document.getElementById('resultsList'),
  resultCount: document.getElementById('resultCount'),
  statusMessage: document.getElementById('statusMessage'),
  selectedId: document.getElementById('selectedId'),
  permissionHint: document.getElementById('permissionHint'),
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

const editableByRole = {
  guest: ['description', 'bank', 'accountNumber', 'accountHolder', 'phone', 'memo'],
  public: ['description', 'bank', 'accountNumber', 'accountHolder', 'phone', 'memo'],
  user: ['description', 'bank', 'accountNumber', 'accountHolder', 'phone', 'memo'],
  admin: ['description', 'bank', 'accountNumber', 'accountHolder', 'phone', 'memo']
};

function setStatus(message, type = '') {
  els.statusMessage.textContent = message;
  els.statusMessage.className = `status ${type}`.trim();
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function updateRoleUi() {
  els.roleBadge.textContent = 'public';
  els.permissionHint.textContent = '누구나 조회하고 수정할 수 있습니다. 전화번호는 끝 4자리만 입력하면 010-****-1234 형태로 저장됩니다.';

  const editables = editableByRole[state.role] || editableByRole.public;
  els.description.disabled = !editables.includes('description');
  els.bank.disabled = !editables.includes('bank');
  els.accountNumber.disabled = !editables.includes('accountNumber');
  els.accountHolder.disabled = !editables.includes('accountHolder');
  els.phone.disabled = !editables.includes('phone');
  els.memo.disabled = !editables.includes('memo');
  els.recordForm.querySelector('button[type="submit"]').disabled = !editables.length;
  els.resetButton.disabled = false;
  els.logoutButton.hidden = true;
}

function renderResults() {
  els.resultCount.textContent = `${state.records.length}건`;
  if (!state.records.length) {
    els.resultsList.innerHTML = '<li class="empty">검색 결과가 없습니다.</li>';
    return;
  }
  els.resultsList.innerHTML = state.records.map((record) => `
    <li class="result-item ${state.selected?.id === record.id ? 'active' : ''}" data-id="${escapeHtml(record.id)}">
      <div class="result-title"><span>${escapeHtml(record['상대계좌예금주명'] || '(이름 없음)')}</span><span>${escapeHtml(record['출금'] || '-')}</span></div>
      <div class="result-meta">
        <div>${escapeHtml(record['거래일시'] || '')}</div>
        <div>${escapeHtml(record['상대은행'] || '-')} / ${escapeHtml(record['상대계좌번호'] || '-')}</div>
        <div>전화번호: ${escapeHtml(record['전화번호'] || '-')}</div>
      </div>
    </li>`).join('');
  document.querySelectorAll('.result-item').forEach((item) => item.addEventListener('click', () => {
    const record = state.records.find((entry) => entry.id === item.dataset.id);
    if (record) selectRecord(record);
  }));
}

function resetForm() {
  state.selected = null;
  els.selectedId.textContent = '선택 없음';
  els.recordForm.reset();
  els.recordId.value = '';
  renderResults();
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
  els.phone.value = getPhoneLastFour(record['전화번호'] || '');
  els.memo.value = record['메모'] || '';
  renderResults();
}

async function loadMe() {
  const data = await api('/api/auth/me');
  state.role = data.role;
  updateRoleUi();
}

async function loadConfig() {
  const data = await api('/api/config');
  state.defaultLimit = data.defaultLimit;
}

async function loadRecords(query = '') {
  const data = await api(`/api/records?q=${encodeURIComponent(query)}`);
  state.records = data.records || [];
  if (state.selected) {
    state.selected = state.records.find((record) => record.id === state.selected.id) || null;
    if (state.selected) selectRecord(state.selected);
    else resetForm();
  }
  renderResults();
  setStatus(`목록을 불러왔습니다. (${state.records.length}건)`, 'success');
}

function getPayload() {
  const payload = {
    '거래내용': els.description.value.trim(),
    '상대은행': els.bank.value.trim(),
    '상대계좌번호': els.accountNumber.value.trim(),
    '상대계좌예금주명': els.accountHolder.value.trim(),
    '전화번호': els.phone.value.trim(),
    '메모': els.memo.value.trim()
  };
  return payload;
}

function getPhoneLastFour(value) {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  return digits.length >= 4 ? digits.slice(-4) : digits;
}

function normalizePhoneInput() {
  els.phone.value = getPhoneLastFour(els.phone.value);
}

async function handleLogin() {
  try {
    const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ code: els.accessCode.value.trim() }) });
    state.role = data.role;
    els.accessCode.value = '';
    updateRoleUi();
    setStatus('로그인되었습니다.', 'success');
    await loadRecords('');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function handleLogout() {
  await api('/api/auth/logout', { method: 'POST', body: '{}' });
  state.role = 'guest';
  updateRoleUi();
  await loadRecords(els.searchInput.value.trim());
  if (state.selected) selectRecord(state.selected);
  else resetForm();
  setStatus('로그아웃되었습니다.', 'success');
}

async function handleSubmit(event) {
  event.preventDefault();
  if (!els.recordId.value) return setStatus('먼저 기록을 선택해주세요.', 'error');
  try {
    setStatus('저장 중...');
    const data = await api(`/api/records/${encodeURIComponent(els.recordId.value)}`, { method: 'PATCH', body: JSON.stringify(getPayload()) });
    const index = state.records.findIndex((record) => record.id === data.record.id);
    if (index !== -1) state.records[index] = data.record;
    selectRecord(data.record);
    setStatus('저장되었습니다.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

function bindEvents() {
  els.loginButton.addEventListener('click', handleLogin);
  els.logoutButton.addEventListener('click', handleLogout);
  els.searchButton.addEventListener('click', () => loadRecords(els.searchInput.value.trim()).catch((error) => setStatus(error.message, 'error')));
  els.refreshButton.addEventListener('click', () => loadRecords('').catch((error) => setStatus(error.message, 'error')));
  els.resetButton.addEventListener('click', resetForm);
  els.recordForm.addEventListener('submit', handleSubmit);
  els.phone.addEventListener('input', normalizePhoneInput);
  els.accessCode.addEventListener('keydown', (event) => { if (event.key === 'Enter') handleLogin(); });
  els.searchInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); loadRecords(els.searchInput.value.trim()).catch((error) => setStatus(error.message, 'error')); } });
}

async function init() {
  bindEvents();
  updateRoleUi();
  renderResults();
  try {
    await loadConfig();
    await loadMe();
    await loadRecords('');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

init();
