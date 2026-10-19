// DEADLINE world ranking on Firebase (public site only).
// The games were written against claude.ai's `window.claude.use('db' | 'user')`; this file gives them the
// same small surface backed by Firebase anonymous sign-in + Cloud Firestore over plain REST (no SDK), so the
// game code is identical on claude.ai and on the public site. Each game keeps its data under games/<id>/.
(() => {
  const API_KEY = 'AIzaSyAwKFsEngETvR1c-wTfWNu7bsgTS9LXRVI';
  const PROJECT = 'deadline-553ff';
  const GAME = (document.currentScript && document.currentScript.dataset.game) || 'deadline1';
  const DOCS = `projects/${PROJECT}/databases/(default)/documents`;
  const BASE = `https://firestore.googleapis.com/v1/${DOCS}`;
  const ROOT = `games/${GAME}`;
  const LS = 'deadline-fb-auth';

  const fail = (code, message) => Object.assign(new Error(message || code), { code });

  // ---------- anonymous sign-in, kept across visits (refresh token in localStorage) ----------
  let auth = null, pending = null;
  const save = () => { try { localStorage.setItem(LS, JSON.stringify(auth)); } catch (e) {} };
  async function signIn() {
    if (!auth) { try { auth = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) {} }
    if (auth && auth.refreshToken) {
      const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${API_KEY}`, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(auth.refreshToken) });
      if (r.ok) {
        const j = await r.json();
        auth = { uid: j.user_id, idToken: j.id_token, refreshToken: j.refresh_token, exp: Date.now() + j.expires_in * 1000 };
        save(); return auth.idToken;
      }
    }
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"returnSecureToken":true}' });
    if (!r.ok) throw fail('unavailable', 'sign-in failed');
    const j = await r.json();
    auth = { uid: j.localId, idToken: j.idToken, refreshToken: j.refreshToken, exp: Date.now() + j.expiresIn * 1000 };
    save(); return auth.idToken;
  }
  function token() {
    if (auth && auth.idToken && Date.now() < auth.exp - 60000) return Promise.resolve(auth.idToken);
    return pending || (pending = signIn().finally(() => { pending = null; }));
  }

  // ---------- Firestore REST values <-> plain JSON ----------
  function enc(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return { doubleValue: v };
    if (typeof v === 'string') return { stringValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
    return { mapValue: { fields: encFields(v) } };
  }
  function encFields(o) { const f = {}; for (const k of Object.keys(o)) if (o[k] !== undefined) f[k] = enc(o[k]); return f; }
  function dec(v) {
    if ('nullValue' in v) return null;
    if ('booleanValue' in v) return v.booleanValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return v.doubleValue;
    if ('stringValue' in v) return v.stringValue;
    if ('timestampValue' in v) return v.timestampValue;
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
    if ('mapValue' in v) return decFields(v.mapValue.fields || {});
    return null;
  }
  function decFields(f) { const o = {}; for (const k of Object.keys(f || {})) o[k] = dec(f[k]); return o; }
  const snap = (id, fields) => ({ id, exists: !!fields, data: () => fields ? decFields(fields) : undefined, metadata: { fromCache: false, hasPendingWrites: false } });

  async function call(url, opts = {}) {
    const t = await token();
    let r;
    try { r = await fetch(url, Object.assign({}, opts, { headers: Object.assign({ authorization: 'Bearer ' + t, 'content-type': 'application/json' }, opts.headers || {}) })); }
    catch (e) { throw fail('unavailable', 'network'); }
    if (r.status === 404) return null;
    if (r.status === 401 || r.status === 403) throw fail('permission_denied', 'not allowed');
    if (r.status === 400) throw fail('invalid_argument', 'bad request');
    if (!r.ok) throw fail('unavailable', 'HTTP ' + r.status);
    return r.status === 204 ? {} : r.json();
  }

  // ---------- the db surface the games use ----------
  const docUrl = path => `${BASE}/${ROOT}/${path.split('/').map(encodeURIComponent).join('/')}`;
  function doc(path) {
    const id = path.split('/').pop();
    return {
      id, path,
      async get() { const j = await call(docUrl(path)); return snap(id, j ? (j.fields || {}) : null); },
      async set(data) { await call(docUrl(path), { method: 'PATCH', body: JSON.stringify({ fields: encFields(data) }) }); },
      async update(data) {
        const mask = Object.keys(data).map(k => 'updateMask.fieldPaths=' + encodeURIComponent('`' + k + '`')).join('&');
        await call(docUrl(path) + '?currentDocument.exists=true&' + mask, { method: 'PATCH', body: JSON.stringify({ fields: encFields(data) }) });
      },
      async delete() { await call(docUrl(path), { method: 'DELETE' }); },
      // first-come name claims are settled by the security rules (a name doc can only be created once)
      async acquire() { return { acquired: true }; },
      onSnapshot() { return () => {}; },
      collection: sub => collection(path + '/' + sub),
    };
  }
  const OPS = { '==': 'EQUAL', '!=': 'NOT_EQUAL', '<': 'LESS_THAN', '<=': 'LESS_THAN_OR_EQUAL', '>': 'GREATER_THAN', '>=': 'GREATER_THAN_OR_EQUAL' };
  function query(path, wh = [], ob = null, lim = 0) {
    const segs = path.split('/'), cid = segs.pop(), parent = `${BASE}/${[ROOT, ...segs].join('/')}`;
    const sq = () => {
      const q = { from: [{ collectionId: cid }] };
      if (wh.length === 1) q.where = { fieldFilter: { field: { fieldPath: wh[0][0] }, op: OPS[wh[0][1]], value: enc(wh[0][2]) } };
      else if (wh.length) q.where = { compositeFilter: { op: 'AND', filters: wh.map(([f, o, v]) => ({ fieldFilter: { field: { fieldPath: f }, op: OPS[o], value: enc(v) } })) } };
      if (ob) q.orderBy = [{ field: { fieldPath: ob[0] }, direction: ob[1] === 'desc' ? 'DESCENDING' : 'ASCENDING' }];
      if (lim) q.limit = lim;
      return q;
    };
    return {
      where: (f, o, v) => query(path, [...wh, [f, o, v]], ob, lim),
      orderBy: (f, d = 'asc') => query(path, wh, [f, d], lim),
      limit: n => query(path, wh, ob, n),
      async get() {
        // an unordered query is only ever used for "how many are ahead of me": count it on the server
        // instead of downloading up to 1000 documents
        if (!ob) {
          const q = sq(); delete q.limit;
          const res = await call(`${parent}:runAggregationQuery`, { method: 'POST', body: JSON.stringify({ structuredAggregationQuery: { structuredQuery: q, aggregations: [{ alias: 'n', count: lim ? { upTo: String(lim) } : {} }] } }) });
          const f = res && res[0] && res[0].result && res[0].result.aggregateFields;
          const n = f && f.n ? Number(f.n.integerValue || 0) : 0;
          return { docs: [], size: n, empty: n === 0 };
        }
        const res = await call(`${parent}:runQuery`, { method: 'POST', body: JSON.stringify({ structuredQuery: sq() }) });
        const docs = (res || []).filter(x => x.document).map(x => snap(x.document.name.split('/').pop(), x.document.fields || {}));
        return { docs, size: docs.length, empty: !docs.length };
      },
      onSnapshot() { return () => {}; },
    };
  }
  function collection(path) { return Object.assign(query(path), { path, doc: id => doc(path + '/' + (id || Math.random().toString(36).slice(2))) }); }

  const db = { doc, collection };
  const user = {
    id: async () => { await token(); return auth.uid; },
    can: async () => true, canEdit: async () => false, isOwner: async () => false,
    me: async () => ({ id: auth ? auth.uid : null, name: '', email: null, isOwner: false, canEdit: false }),
  };
  // sign in once; if Firebase cannot be reached the games fall back to on-device records
  let ready = null;
  const boot = () => ready || (ready = token().then(() => true, () => false));
  window.claude = { use: name => boot().then(ok => ok ? ({ db, user })[name] || null : null) };
})();
