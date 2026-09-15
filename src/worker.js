import legacyWorker, { QuizRoom as LegacyQuizRoom } from './index.js';

const ROOM_CODE_RE = /^[A-Z0-9]{6}$/;
const MAX_PARTICIPANTS = 100;
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

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

  return html
    .replace(oldRefresh, newRefresh)
    .replace(oldAction, newAction)
    .replace(oldJoinValidation, newJoinValidation)
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

    if (url.pathname === '/api/create') {
      if (request.method !== 'POST') {
        return json({ error: 'Method not allowed' }, 405, { allow: 'POST' });
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

      return addSecurityHeaders(await legacyWorker.fetch(request, env, ctx));
    }

    if (url.pathname === '/health') {
      return addSecurityHeaders(await legacyWorker.fetch(request, env, ctx));
    }

    if (url.pathname !== '/') {
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
    const html = patchClientHtml(await response.text());
    return addHtmlSecurityHeaders(
      new Response(html, {
        status: response.status,
        headers: response.headers,
      })
    );
  },
};
