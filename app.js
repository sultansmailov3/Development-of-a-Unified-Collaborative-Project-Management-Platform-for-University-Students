const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { token: localStorage.getItem('token'), user: null, project: null, tab: 'tasks', timer: null };
const STATUS = { todo: 'К выполнению', in_progress: 'В работе', done: 'Готово' };
const PRIO = { low: 'Низкий', medium: 'Средний', high: 'Высокий' };

async function api(path, opts = {}) {
  const headers = { Authorization: 'Bearer ' + S.token };
  if (opts.body && !(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const r = await fetch('/api' + path, { ...opts, headers });
  if (opts.raw) return r;
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && S.token && !path.startsWith('/auth/')) logout();
  if (!r.ok) throw new Error(d.error || 'Ошибка');
  return d;
}
const form = (f) => Object.fromEntries(new FormData(f));
function logout() { localStorage.removeItem('token'); S.token = S.user = S.project = null; clearInterval(S.timer); render(); }
function guard(fn) { return async (e) => { e?.preventDefault?.(); try { await fn(e); } catch (x) { alert(x.message); } }; }

async function render() {
  clearInterval(S.timer);
  if (!S.token) return authView();
  try { S.user = S.user || await api('/auth/me'); } catch { return logout(); }
  $('#who').innerHTML = `${esc(S.user.name)} <button class="ghost" id="out">Выйти</button>`;
  $('#out').onclick = logout;
  S.project ? projectView() : listView();
}

function authView() {
  $('#who').textContent = '';
  $('#app').innerHTML = `<div class="card"><h2>Вход / регистрация</h2>
    <form id="f"><input name="name" placeholder="Имя (только для регистрации)">
    <input name="email" type="email" placeholder="Email" required>
    <input name="password" type="password" placeholder="Пароль" required>
    <button>Войти</button><button type="button" class="ghost" data-m="register">Регистрация</button></form>
    <div class="err" id="e"></div></div>`;
  const go = async (mode) => {
    try {
      const d = await api('/auth/' + mode, { method: 'POST', body: form($('#f')) });
      S.token = d.token; S.user = d.user; localStorage.setItem('token', d.token); render();
    } catch (x) { $('#e').textContent = x.message; }
  };
  $('#f').onsubmit = (e) => { e.preventDefault(); go('login'); };
  $('[data-m=register]').onclick = () => go('register');
}

async function listView() {
  const list = await api('/projects');
  $('#app').innerHTML = `<div class="card"><h3>Новый проект</h3><form id="f">
    <input name="title" placeholder="Название" required><input name="description" placeholder="Описание"><button>Создать</button></form></div>
    <h3>Мои проекты</h3>` + (list.map((p) => `<div class="card" data-id="${p.id}" style="cursor:pointer">
    <div class="row"><b>${esc(p.title)}</b><span class="mut">${p.role === 'owner' ? 'владелец' : 'участник'}</span></div>
    <div class="mut">${esc(p.description)}</div>
    <div class="bar"><i style="width:${p.total ? (100 * p.done) / p.total : 0}%"></i></div>
    <span class="mut">Выполнено ${p.done} из ${p.total}</span></div>`).join('') || '<p class="mut">Пока нет проектов</p>');
  $('#f').onsubmit = guard(async () => { await api('/projects', { method: 'POST', body: form($('#f')) }); render(); });
  document.querySelectorAll('[data-id]').forEach((el) => (el.onclick = () => { S.project = { id: el.dataset.id }; S.tab = 'tasks'; render(); }));
}

async function projectView() {
  const p = (S.project = await api('/projects/' + S.project.id));
  const tabs = { tasks: 'Задачи', chat: 'Обсуждение', files: 'Файлы', team: 'Команда' };
  $('#app').innerHTML = `<div class="row"><h2>${esc(p.title)}</h2><button class="ghost" id="back">← Проекты</button></div>
    <p class="mut">${esc(p.description)}</p>
    <div class="tabs">${Object.entries(tabs).map(([k, v]) => `<button class="${S.tab === k ? '' : 'ghost'}" data-t="${k}">${v}</button>`).join('')}</div>
    <div id="body"></div>`;
  $('#back').onclick = () => { S.project = null; render(); };
  document.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { S.tab = b.dataset.t; clearInterval(S.timer); projectView(); }));
  await { tasks: tasksTab, chat: chatTab, files: filesTab, team: teamTab }[S.tab](p);
}

async function tasksTab(p) {
  const tasks = await api(`/projects/${p.id}/tasks`);
  const done = tasks.filter((t) => t.status === 'done').length;
  const today = new Date().toISOString().slice(0, 10);
  $('#body').innerHTML = `<div class="card"><b>Прогресс: ${done}/${tasks.length}</b>
    <div class="bar"><i style="width:${tasks.length ? (100 * done) / tasks.length : 0}%"></i></div></div>
    <div class="card"><form id="f"><input name="title" placeholder="Новая задача" required>
    <select name="assignee_id"><option value="">Без исполнителя</option>${p.members.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select>
    <select name="priority">${Object.entries(PRIO).map(([k, v]) => `<option value="${k}" ${k === 'medium' ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <input name="deadline" type="date"><button>Добавить</button></form></div>` +
    tasks.map((t) => `<div class="card"><div class="row"><b>${esc(t.title)}</b>
      <span class="tag ${t.priority}">${PRIO[t.priority]}</span></div>
      <div class="row mut"><span>👤 ${esc(t.assignee_name || '—')}</span>
      <span class="${t.deadline && t.deadline < today && t.status !== 'done' ? 'late' : ''}">📅 ${esc(t.deadline || 'без срока')}</span>
      <span><select data-s="${t.id}">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === t.status ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <button class="danger" data-d="${t.id}">✕</button></span></div></div>`).join('');
  $('#f').onsubmit = guard(async () => { await api(`/projects/${p.id}/tasks`, { method: 'POST', body: form($('#f')) }); projectView(); });
  document.querySelectorAll('[data-s]').forEach((s) => (s.onchange = guard(async () => { await api(`/projects/${p.id}/tasks/${s.dataset.s}`, { method: 'PATCH', body: { status: s.value } }); projectView(); })));
  document.querySelectorAll('[data-d]').forEach((b) => (b.onclick = guard(async () => { if (confirm('Удалить задачу?')) { await api(`/projects/${p.id}/tasks/${b.dataset.d}`, { method: 'DELETE' }); projectView(); } })));
}

async function chatTab(p) {
  $('#body').innerHTML = `<div class="card"><div id="chat"></div><form id="f"><input name="body" placeholder="Сообщение…" autocomplete="off" required><button>Отправить</button></form></div>`;
  const load = async () => {
    const ms = await api(`/projects/${p.id}/messages`);
    const box = $('#chat'); if (!box) return;
    box.innerHTML = ms.map((m) => `<div class="msg"><b>${esc(m.author)}</b> <span class="mut">${esc(m.created_at)}</span><br>${esc(m.body)}</div>`).join('');
    box.scrollTop = box.scrollHeight;
  };
  await load(); S.timer = setInterval(() => load().catch(() => {}), 5000);
  $('#f').onsubmit = guard(async () => { await api(`/projects/${p.id}/messages`, { method: 'POST', body: form($('#f')) }); $('#f').reset(); load(); });
}

async function filesTab(p) {
  const files = await api(`/projects/${p.id}/files`);
  $('#body').innerHTML = `<div class="card"><form id="f"><input type="file" name="file" required><button>Загрузить (до 10 МБ)</button></form></div>` +
    files.map((f) => `<div class="card"><a href="#" data-f="${f.id}" data-n="${esc(f.original_name)}">📎 ${esc(f.original_name)}</a>
    <span class="mut"> · ${esc(f.author)} · ${(f.size / 1024).toFixed(1)} КБ</span></div>`).join('');
  $('#f').onsubmit = guard(async () => { await api(`/projects/${p.id}/files`, { method: 'POST', body: new FormData($('#f')) }); projectView(); });
  document.querySelectorAll('[data-f]').forEach((a) => (a.onclick = guard(async () => {
    const r = await api(`/projects/${p.id}/files/${a.dataset.f}`, { raw: true });
    const url = URL.createObjectURL(await r.blob());
    Object.assign(document.createElement('a'), { href: url, download: a.dataset.n }).click(); URL.revokeObjectURL(url);
  })));
}

function teamTab(p) {
  const owner = p.role === 'owner';
  $('#body').innerHTML = (owner ? `<div class="card"><form id="f"><input name="email" type="email" placeholder="Email участника" required><button>Добавить</button></form></div>` : '') +
    p.members.map((m) => `<div class="card row"><span><b>${esc(m.name)}</b> <span class="mut">${esc(m.email)} · ${m.role === 'owner' ? 'владелец' : 'участник'}</span></span>
    ${owner && m.role !== 'owner' ? `<button class="danger" data-r="${m.id}">Убрать</button>` : ''}</div>`).join('') +
    (owner ? `<button class="danger" id="del">Удалить проект</button>` : '');
  if (!owner) return;
  $('#f').onsubmit = guard(async () => { await api(`/projects/${p.id}/members`, { method: 'POST', body: form($('#f')) }); projectView(); });
  document.querySelectorAll('[data-r]').forEach((b) => (b.onclick = guard(async () => { await api(`/projects/${p.id}/members/${b.dataset.r}`, { method: 'DELETE' }); projectView(); })));
  $('#del').onclick = guard(async () => { if (confirm('Удалить проект целиком?')) { await api('/projects/' + p.id, { method: 'DELETE' }); S.project = null; render(); } });
}

render();
