const state = { records: [], selected: null, defaultLimit: 50, mode: 'edit' };

const els = {
  searchInput: document.getElementById('searchInput'),
  searchButton: document.getElementById('searchButton'),
  refreshButton: document.getElementById('refreshButton'),
  resultsList: document.getElementById('resultsList'),
  resultCount: document.getElementById('resultCount'),
  statusMessage: document.getElementById('statusMessage'),
  formStatusMessage: document.getElementById('formStatusMessage'),
  selectedId: document.getElementById('selectedId'),
  permissionHint: document.getElementById('permissionHint'),
  recordForm: document.getElementById('recordForm'),
  newRecordButton: document.getElementById('newRecordButton'),
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

function setFormStatus(message, type = '') {
  els.formStatusMessage.textContent = message;
  els.formStatusMessage.className = `status form-status ${type}`.trim();
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
  els.permissionHint.textContent = state.mode === 'create'
    ? '새 기록을 추가하는 중입니다. 거래일시와 출금도 함께 입력해주세요.'
    : '누구나 조회하고 수정할 수 있습니다. 전화번호는 010 뒤의 숫자 8자리만 입력하면 됩니다.';
  els.description.disabled = false;
  els.bank.disabled = false;
  els.accountNumber.disabled = false;
  els.accountHolder.disabled = false;
  els.phone.disabled = false;
  els.memo.disabled = false;
  els.recordForm.querySelector('button[type="submit"]').disabled = false;
  els.resetButton.disabled = false;
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
    if (record) selectRecord(record, { scroll: true });
  }));
}

function resetForm() {
  state.selected = null;
  state.mode = 'edit';
  els.selectedId.textContent = '선택 없음';
  els.recordForm.reset();
  els.recordId.value = '';
  setFormStatus('');
  updateRoleUi();
  renderResults();
}

function selectRecord(record, options = {}) {
  state.selected = record;
  state.mode = 'edit';
  els.selectedId.textContent = record.id;
  els.recordId.value = record.id || '';
  els.dateTime.value = record['거래일시'] || '';
  els.amount.value = record['출금'] || '';
  els.description.value = record['거래내용'] || '';
  els.bank.value = record['상대은행'] || '';
  els.accountNumber.value = record['상대계좌번호'] || '';
  els.accountHolder.value = record['상대계좌예금주명'] || '';
  els.phone.value = getPhoneSubscriberDigits(record['전화번호'] || '');
  els.memo.value = record['메모'] || '';
  setFormStatus('선택한 기록을 수정할 수 있습니다.', 'success');
  updateRoleUi();
  renderResults();
  if (options.scroll && window.matchMedia('(max-width: 900px)').matches) {
    document.querySelector('.form-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function startCreateMode() {
  state.selected = null;
  state.mode = 'create';
  els.recordForm.reset();
  els.recordId.value = '';
  els.selectedId.textContent = '새 기록';
  setFormStatus('새 기록 내용을 입력한 뒤 저장하세요.', 'success');
  updateRoleUi();
  if (window.matchMedia('(max-width: 900px)').matches) {
    document.querySelector('.form-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  els.dateTime.focus();
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

function getPhoneSubscriberDigits(value) {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  if (digits.startsWith('010') && digits.length >= 11) return digits.slice(3, 11);
  return digits.slice(0, 8);
}

function normalizePhoneInput() {
  els.phone.value = getPhoneSubscriberDigits(els.phone.value);
}

async function handleSubmit(event) {
  event.preventDefault();
  const creating = state.mode === 'create' || !els.recordId.value;
  if (!creating && !els.recordId.value) {
    setStatus('먼저 기록을 선택해주세요.', 'error');
    return setFormStatus('먼저 왼쪽 목록에서 기록을 선택해주세요.', 'error');
  }
  try {
    setStatus(creating ? '추가 중...' : '저장 중...');
    setFormStatus(creating ? '새 기록을 추가하는 중...' : '저장 중...');
    const path = creating ? '/api/records' : `/api/records/${encodeURIComponent(els.recordId.value)}`;
    const method = creating ? 'POST' : 'PATCH';
    const data = await api(path, { method, body: JSON.stringify(getPayload()) });
    const index = state.records.findIndex((record) => record.id === data.record.id);
    if (index !== -1) state.records[index] = data.record;
    else state.records.unshift(data.record);
    selectRecord(data.record);
    setStatus(creating ? '새 기록이 추가되었습니다.' : '저장되었습니다.', 'success');
    setFormStatus(creating ? '새 기록이 추가되었습니다.' : '저장되었습니다.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
    setFormStatus(error.message, 'error');
  }
}

function bindEvents() {
  els.searchButton.addEventListener('click', () => loadRecords(els.searchInput.value.trim()).catch((error) => setStatus(error.message, 'error')));
  els.refreshButton.addEventListener('click', () => loadRecords('').catch((error) => setStatus(error.message, 'error')));
  els.newRecordButton.addEventListener('click', startCreateMode);
  els.resetButton.addEventListener('click', resetForm);
  els.recordForm.addEventListener('submit', handleSubmit);
  els.phone.addEventListener('input', normalizePhoneInput);
  els.searchInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); loadRecords(els.searchInput.value.trim()).catch((error) => setStatus(error.message, 'error')); } });
}

async function init() {
  bindEvents();
  updateRoleUi();
  renderResults();
  try {
    await loadConfig();
    updateRoleUi();
    await loadRecords('');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

init();
