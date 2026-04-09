const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const port = 3100;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wgl-smoke-'));
const tempDataPath = path.join(tempDir, 'records.json');
fs.copyFileSync(path.join(process.cwd(), 'data', 'records.json'), tempDataPath);
const env = {
  ...process.env,
  PORT: String(port),
  SESSION_SECRET: 'smoke-secret',
  USER_ACCESS_CODE: 'user-code',
  ADMIN_ACCESS_CODE: 'admin-code',
  DATA_SOURCE: 'local',
  LOCAL_DATA_PATH: tempDataPath,
  COOKIE_SECURE: 'false'
};

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  const child = spawn(process.execPath, ['src/server.js'], { env, stdio: 'inherit' });
  try {
    await new Promise((r) => setTimeout(r, 1500));
    const health = await request('GET', '/api/health');
    if (health.status !== 200) throw new Error('health failed');

    const list = await request('GET', '/api/records?q=');
    if (list.status !== 200) throw new Error('records failed');
    const parsed = JSON.parse(list.body);
    if (!Array.isArray(parsed.records) || !parsed.records.length) throw new Error('no records returned');
    const record = parsed.records[0];
    if (!String(record['상대계좌번호'] || '').includes('*')) throw new Error('account number was not masked for public users');
    if (record['메모']) throw new Error('memo was exposed to public users');

    const phoneUpdate = await request(
      'PATCH',
      `/api/records/${encodeURIComponent(record.id)}`,
      JSON.stringify({ '전화번호': '01099998888', '메모': 'should-not-apply' }),
      { 'Content-Type': 'application/json' }
    );
    if (phoneUpdate.status !== 200) throw new Error('public phone update failed');
    const updated = JSON.parse(phoneUpdate.body).record;
    if (updated['전화번호'] !== '010-9999-8888') throw new Error('phone update was not applied');
    if (updated['메모']) throw new Error('memo was returned after public update');

    const verify = await request('GET', `/api/records/${encodeURIComponent(record.id)}`);
    if (verify.status !== 200) throw new Error('record fetch failed');
    const verifiedRecord = JSON.parse(verify.body).record;
    if (verifiedRecord['전화번호'] !== '010-9999-8888') throw new Error('phone update did not persist');
    if (verifiedRecord['메모']) throw new Error('memo was exposed on detail view');

    const login = await request('POST', '/api/auth/login', JSON.stringify({ code: 'admin-code' }), { 'Content-Type': 'application/json' });
    if (login.status !== 200) throw new Error('admin login failed');
    const cookie = login.headers['set-cookie']?.[0]?.split(';')[0];
    const adminDetail = await request('GET', `/api/records/${encodeURIComponent(record.id)}`, null, { Cookie: cookie });
    if (adminDetail.status !== 200) throw new Error('admin detail fetch failed');
    const adminRecord = JSON.parse(adminDetail.body).record;
    if (String(adminRecord['상대계좌번호'] || '').includes('*')) throw new Error('admin should receive unmasked account number');
    if (adminRecord['메모'] !== '신랑측 가족') throw new Error('public update should not modify memo');
    console.log('Smoke test passed');
  } finally {
    child.kill('SIGTERM');
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
