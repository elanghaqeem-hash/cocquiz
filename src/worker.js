import legacyWorker, { QuizRoom as LegacyQuizRoom } from './index.js';

const ROOM_CODE_RE = /^[A-Z0-9]{6}$/;
const MAX_PARTICIPANTS = 100;
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const HOST_USERNAME = 'admin';
const HOST_PASSWORD_SHA256 = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';
const HOST_SESSION_COOKIE = 'cocquiz_host_session';
const HOST_SESSION_TTL_SECONDS = 8 * 60 * 60;
const textEncoder = new TextEncoder();

const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extraHeaders,
    },
  });

function randomRoomCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ROOM_ALPHABET[byte & 31]).join('');
}

function bearerToken(request) {
  const value = request.headers.get('authorization') || '';
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

async function readJson(request) {
  try {
    return await request.clone().json();
  } catch {
    return null;
  }
}

function parseCookies(request) {
  const raw = request.headers.get('cookie') || '';
  const cookies = {};
  for (const part of raw.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = value;
  }
  return cookies;
}

async function sha256Hex(value) {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', textEncoder.encode(String(value)))
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function secureEqual(a, b) {
  const aDigest = new Uint8Array(await crypto.subtle.digest('SHA-256', textEncoder.encode(String(a))));
  const bDigest = new Uint8Array(await crypto.subtle.digest('SHA-256', textEncoder.encode(String(b))));
  let diff = 0;
  for (let i = 0; i < aDigest.length; i += 1) diff |= aDigest[i] ^ bDigest[i];
  return diff === 0;
}

function hostUsername() {
  return HOST_USERNAME;
}

function hostSessionStub(env, token) {
  const id = env.HOST_SESSION.idFromName(token);
  return env.HOST_SESSION.get(id);
}

export class HostSession {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/create' && request.method === 'POST') {
      const body = await readJson(request);
      if (!body || body.username !== HOST_USERNAME || !Number.isFinite(body.exp)) {
        return json({ error: 'Invalid session payload' }, 400);
      }
      await this.ctx.storage.put('session', { username: body.username, exp: body.exp });
      await this.ctx.storage.setAlarm(body.exp * 1000);
      return json({ ok: true }, 201);
    }

    if (url.pathname === '/validate' && request.method === 'GET') {
      const session = await this.ctx.storage.get('session');
      if (!session) return json({ authenticated: false }, 401);
      if (session.exp <= Math.floor(Date.now() / 1000)) {
        await this.ctx.storage.delete('session');
        return json({ authenticated: false }, 401);
      }
      return json({ authenticated: true, username: session.username, exp: session.exp });
    }

    if (url.pathname === '/delete' && request.method === 'POST') {
      await this.ctx.storage.delete('session');
      return json({ ok: true });
    }

    return json({ error: 'Not found' }, 404);
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}

async function createHostSession(env) {
  const token = crypto.randomUUID();
  const exp = Math.floor(Date.now() / 1000) + HOST_SESSION_TTL_SECONDS;
  const response = await hostSessionStub(env, token).fetch(
    new Request('https://session/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: HOST_USERNAME, exp }),
    })
  );
  if (!response.ok) throw new Error('Gagal membuat sesi host');
  return token;
}

async function getHostSession(request, env) {
  const token = parseCookies(request)[HOST_SESSION_COOKIE];
  if (!token) return null;
  const response = await hostSessionStub(env, token).fetch(
    new Request('https://session/validate', { method: 'GET' })
  );
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  return payload?.authenticated ? { u: payload.username, exp: payload.exp } : null;
}

function hostSessionCookie(value, maxAge = HOST_SESSION_TTL_SECONDS) {
  return `${HOST_SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

function isSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}

async function hostLogin(request, env) {
  if (!isSameOrigin(request)) return json({ error: 'Origin tidak diizinkan' }, 403);

  const body = await readJson(request);
  if (!body) return json({ error: 'Payload JSON tidak valid' }, 400);

  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const usernameOk = await secureEqual(username, hostUsername());
  const passwordOk = await secureEqual(await sha256Hex(password), HOST_PASSWORD_SHA256);
  if (!usernameOk || !passwordOk) return json({ error: 'Username atau password tidak valid' }, 401);

  const session = await createHostSession(env);
  return json(
    { ok: true, username: hostUsername() },
    200,
    { 'set-cookie': hostSessionCookie(session) }
  );
}

async function hostLogout(request, env) {
  if (!isSameOrigin(request)) return json({ error: 'Origin tidak diizinkan' }, 403);
  const token = parseCookies(request)[HOST_SESSION_COOKIE];
  if (token) {
    await hostSessionStub(env, token)
      .fetch(new Request('https://session/delete', { method: 'POST' }))
      .catch(() => null);
  }
  return json(
    { ok: true },
    200,
    { 'set-cookie': hostSessionCookie('', 0) }
  );
}

function addSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('x-frame-options', 'DENY');
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('cross-origin-opener-policy', 'same-origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function addHtmlSecurityHeaders(response) {
  const secured = addSecurityHeaders(response);
  const headers = new Headers(secured.headers);
  headers.set(
    'content-security-policy',
    "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'"
  );
  return new Response(secured.body, {
    status: secured.status,
    statusText: secured.statusText,
    headers,
  });
}

function patchClientHtml(html) {
  const oldRefresh = "async function refresh(){if(!room)return;try{var qs=isHost?'?hostToken='+encodeURIComponent(hostToken):'?pid='+encodeURIComponent(pid);var s=await api('/api/rooms/'+room+'/state'+qs);render(s)}catch(e){console.log(e)}}";
  const newRefresh = "async function refresh(){if(!room)return;try{var qs=isHost?'':'?pid='+encodeURIComponent(pid);var opt=isHost?{headers:{'authorization':'Bearer '+hostToken}}:{};var s=await api('/api/rooms/'+room+'/state'+qs,opt);render(s)}catch(e){console.log(e)}}";

  const oldAction = "async function hostAction(a){try{await api('/api/rooms/'+room+'/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({hostToken:hostToken,action:a})});refresh()}catch(e){toast(e.message)}}";
  const newAction = "async function hostAction(a){try{await api('/api/rooms/'+room+'/action',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+hostToken},body:JSON.stringify({action:a})});refresh()}catch(e){toast(e.message)}}";

  const oldJoinValidation = "if(!room||!name){toast('Isi kode dan nama');return}";
  const newJoinValidation = "if(!/^[A-Z0-9]{6}$/.test(room)||!name){toast('Kode quiz harus 6 karakter dan nama wajib diisi');return}";

  const loginPanel = `<section id="hostLoginPanel" class="panel card hidden"><div class="pill" style="display:inline-block">🔐 Host Access</div><h2>Login Host</h2><p class="lead" style="font-size:15px">Masuk terlebih dahulu untuk membuat dan mengendalikan sesi quiz.</p><div class="field"><label>Username</label><input id="hostUsername" autocomplete="username" value="admin" placeholder="Username host"></div><div class="field"><label>Password</label><input id="hostPassword" type="password" autocomplete="current-password" placeholder="Password host" onkeydown="if(event.key==='Enter')hostLogin()"></div><div class="actions"><button class="btn pink" onclick="hostLogin()">Masuk sebagai Host</button><button class="btn secondary" onclick="goHome()">Kembali</button></div><div id="hostLoginHelp" class="small" style="margin-top:14px">Akses host dilindungi autentikasi.</div></section>`;

  const authScript = `async function openHostLogin(){try{var r=await fetch('/api/host/session',{credentials:'same-origin'});var s=await r.json();hideAll();if(s.authenticated){el('hostPanel').classList.remove('hidden')}else{el('hostLoginPanel').classList.remove('hidden');setTimeout(function(){el('hostUsername').focus()},0)}}catch(e){hideAll();el('hostLoginPanel').classList.remove('hidden')}}\nasync function hostLogin(){var username=el('hostUsername').value.trim(),password=el('hostPassword').value;if(!username||!password){toast('Isi username dan password host');return}try{var r=await fetch('/api/host/login',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify({username:username,password:password})});var data=await r.json();if(!r.ok)throw new Error(data.error||'Login gagal');el('hostPassword').value='';hideAll();el('hostPanel').classList.remove('hidden');toast('Login host berhasil')}catch(e){toast(e.message)}}\nasync function logoutHost(){try{await fetch('/api/host/logout',{method:'POST',credentials:'same-origin'});}catch(e){}room='';hostToken='';isHost=false;goHome();toast('Sesi host telah keluar')}\n`;

  return html
    .replace(oldRefresh, newRefresh)
    .replace(oldAction, newAction)
    .replace(oldJoinValidation, newJoinValidation)
    .replace('onclick="showHost()">Buat Sesi sebagai Host</button>', 'onclick="openHostLogin()">Buat Sesi sebagai Host</button>')
    .replace('<section id="hostPanel"', `${loginPanel}<section id="hostPanel"`)
    .replace('<h2>Buat Sesi Quiz</h2>', '<div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><h2 style="margin:0">Buat Sesi Quiz</h2><button class="btn secondary" style="padding:9px 12px" onclick="logoutHost()">Keluar Host</button></div>')
    .replace("['home','joinPanel','hostPanel'", "['home','joinPanel','hostLoginPanel','hostPanel'")
    .replace("var room='',pid='',hostToken='',isHost=false,poll=null,current=null;", "var room='',pid='',hostToken='',isHost=false,poll=null,current=null;\n" + authScript)
    .replace('<div id="toast" class="toast hidden"></div>', '<div id="toast" class="toast hidden" role="status" aria-live="polite"></div>');
}

export class QuizRoom extends LegacyQuizRoom {
  publicState(state, participantId, host = false) {
    const result = super.publicState(state, participantId, host);

    // Participant IDs are bearer credentials for submitting answers. Never expose
    // another participant's ID in the public leaderboard.
    if (Array.isArray(result.scores)) {
      result.scores = result.scores.map(({ id: _id, ...safeScore }) => safeScore);
    }

    return result;
  }

  async fetch(request) {
    const url = new URL(request.url);
    let forwarded = request;

    if (url.pathname === '/state') {
      if (request.method !== 'GET') {
        return json({ error: 'Method not allowed' }, 405, { allow: 'GET' });
      }

      // Accept host credentials in an Authorization header so secrets do not
      // appear in URLs, logs, analytics, or browser history.
      const token = bearerToken(request);
      if (token) {
        const target = new URL(request.url);
        target.searchParams.set('hostToken', token);
        forwarded = new Request(target.toString(), request);
      }
    }

    if (url.pathname === '/join' && request.method === 'POST') {
      const current = await this.load();
      const count = Object.keys(current?.participants || {}).length;
      if (count >= MAX_PARTICIPANTS) {
        return json({ error: `Sesi sudah mencapai batas ${MAX_PARTICIPANTS} peserta` }, 429);
      }

      const body = await readJson(request);
      if (!body) return json({ error: 'Payload JSON tidak valid' }, 400);

      const name = String(body.name || '').trim();
      if (!name) return json({ error: 'Nama wajib diisi' }, 400);
      if (name.length > 32) return json({ error: 'Nama maksimal 32 karakter' }, 400);
      if (/[^\P{C}\t\n\r]/u.test(name)) return json({ error: 'Nama mengandung karakter yang tidak valid' }, 400);
    }

    if (url.pathname === '/answer' && request.method === 'POST') {
      const body = await readJson(request);
      if (!body) return json({ error: 'Payload JSON tidak valid' }, 400);
      if (!Number.isInteger(body.choice) || body.choice < 0 || body.choice > 3) {
        return json({ error: 'Pilihan tidak valid' }, 400);
      }
      if (typeof body.pid !== 'string' || body.pid.length < 16 || body.pid.length > 64) {
        return json({ error: 'Identitas peserta tidak valid' }, 400);
      }
    }

    if (url.pathname === '/action' && request.method === 'POST') {
      const body = await readJson(request);
      if (!body) return json({ error: 'Payload JSON tidak valid' }, 400);

      const token = bearerToken(request);
      if (token) {
        const headers = new Headers(request.headers);
        headers.set('content-type', 'application/json');
        forwarded = new Request(request.url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...body, hostToken: token }),
        });
      }
    }

    return addSecurityHeaders(await super.fetch(forwarded));
  }
}

async function createRoom(request, env) {
  const body = await readJson(request);
  if (!body) return json({ error: 'Payload JSON tidak valid' }, 400);

  const title = String(body.title || 'QAIP Live Challenge').trim();
  if (title.length > 80) return json({ error: 'Judul maksimal 80 karakter' }, 400);

  const questionCount = Number(body.questionCount ?? 10);
  const duration = Number(body.duration ?? 20);
  if (!Number.isFinite(questionCount) || questionCount < 1 || questionCount > 50) {
    return json({ error: 'Jumlah soal harus antara 1 dan 50' }, 400);
  }
  if (!Number.isFinite(duration) || duration < 10 || duration > 90) {
    return json({ error: 'Durasi harus antara 10 dan 90 detik' }, 400);
  }

  // Collisions are extremely unlikely, but retrying prevents a random collision
  // from surfacing as a failed room creation.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomRoomCode();
    const hostToken = crypto.randomUUID();
    const id = env.QUIZ_ROOM.idFromName(code);
    const stub = env.QUIZ_ROOM.get(id);
    const response = await stub.fetch(
      new Request('https://room/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, title, questionCount, duration, code, hostToken }),
      })
    );

    const payload = await response.json().catch(() => ({ error: 'Gagal membuat sesi' }));
    if (response.status === 409) continue;
    if (!response.ok) return json(payload, response.status);
    return json({ code, hostToken }, 201);
  }

  return json({ error: 'Tidak dapat membuat kode sesi unik. Silakan coba lagi.' }, 503);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/host/login') {
      if (request.method !== 'POST') {
        return json({ error: 'Method not allowed' }, 405, { allow: 'POST' });
      }
      return addSecurityHeaders(await hostLogin(request, env));
    }

    if (url.pathname === '/api/host/logout') {
      if (request.method !== 'POST') {
        return json({ error: 'Method not allowed' }, 405, { allow: 'POST' });
      }
      return addSecurityHeaders(await hostLogout(request, env));
    }

    if (url.pathname === '/api/host/session') {
      if (request.method !== 'GET') {
        return json({ error: 'Method not allowed' }, 405, { allow: 'GET' });
      }
      const session = await getHostSession(request, env);
      return addSecurityHeaders(json({ authenticated: Boolean(session), username: session?.u || null }));
    }

    if (url.pathname === '/api/create') {
      if (request.method !== 'POST') {
        return json({ error: 'Method not allowed' }, 405, { allow: 'POST' });
      }
      if (!(await getHostSession(request, env))) {
        return addSecurityHeaders(json({ error: 'Silakan login sebagai host terlebih dahulu' }, 401));
      }
      return addSecurityHeaders(await createRoom(request, env));
    }

    if (url.pathname.startsWith('/api/')) {
      const match = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})\/(join|state|answer|action)$/i);
      if (!match || !ROOM_CODE_RE.test(match[1].toUpperCase())) {
        return json({ error: 'API endpoint tidak ditemukan' }, 404);
      }

      const operation = match[2].toLowerCase();
      const expectedMethod = operation === 'state' ? 'GET' : 'POST';
      if (request.method !== expectedMethod) {
        return json({ error: 'Method not allowed' }, 405, { allow: expectedMethod });
      }

      const hostOperation = operation === 'action' || (operation === 'state' && Boolean(bearerToken(request)));
      if (hostOperation && !(await getHostSession(request, env))) {
        return addSecurityHeaders(json({ error: 'Sesi host berakhir. Silakan login kembali.' }, 401));
      }

      return addSecurityHeaders(await legacyWorker.fetch(request, env, ctx));
    }

    if (url.pathname === '/health') {
      return addSecurityHeaders(await legacyWorker.fetch(request, env, ctx));
    }

    if (url.pathname !== '/' && url.pathname !== '/login') {
      return new Response('Not found', {
        status: 404,
        headers: {
          'content-type': 'text/plain; charset=UTF-8',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        },
      });
    }

    const response = await legacyWorker.fetch(request, env, ctx);
    let html = patchClientHtml(await response.text());
    if (url.pathname === '/login') {
      html = html.replace(
        '</body>',
        '<script>window.addEventListener("DOMContentLoaded",function(){openHostLogin()})</script></body>'
      );
    }
    return addHtmlSecurityHeaders(
      new Response(html, {
        status: response.status,
        headers: response.headers,
      })
    );
  },
};
