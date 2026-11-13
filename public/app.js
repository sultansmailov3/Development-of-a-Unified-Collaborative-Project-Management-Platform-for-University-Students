const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = {
  token: localStorage.getItem('token'), user: null, project: null, tab: 'tasks', timer: null,
  page: 'list', f: { view: 'board', q: '', mine: false },
};
const STATUS = { todo: 'К выполнению', in_progress: 'В работе', done: 'Готово' };
const PRIO = { low: 'Низкий', medium: 'Средний', high: 'Высокий' };
const today = () => new Date().toISOString().slice(0, 10);

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
function logout() { localStorage.removeItem('token'); S.token = S.user = S.project = null; S.page = 'list'; clearInterval(S.timer); render(); }
function guard(fn) { return async (e) => { e?.preventDefault?.(); try { await fn(e); } catch (x) { alert(x.message); } }; }
function fmtDate(s) { return s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : ''; }

async function render() {
  clearInterval(S.timer);
  if (!S.token) return authView();
  try { S.user = S.user || await api('/auth/me'); } catch { return logout(); }
  $('#who').innerHTML = `<span class="nav">
    <button class="${!S.project && S.page === 'list' ? '' : 'ghost'}" data-p="list">Проекты</button>
    <button class="${!S.project && S.page === 'my' ? '' : 'ghost'}" data-p="my">Мои задачи</button></span>
    <span>${esc(S.user.name)} <button class="ghost" id="out">Выйти</button></span>`;
  $('#out').onclick = logout;
  document.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { S.page = b.dataset.p; S.project = null; render(); }));
  if (S.project) return projectView();
  S.page === 'my' ? myTasksView() : listView();
}

function authView() {
  $('#who').textContent = '';
  $('#app').innerHTML = `<div class="card"><h2>Вход / регистрация</h2>
    <form id="f"><input name="name" placeholder="Имя (только для регистрации)">
    <input name="email" type="email" placeholder="Email" required>
    <input name="password" type="password" placeholder="Пароль (от 6 символов)" required>
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
    <h3>Мои проекты</h3>` + (list.map((p) => `<div class="card click" data-id="${p.id}">
    <div class="row"><b>${esc(p.title)}</b><span class="mut">${p.role === 'owner' ? 'владелец' : 'участник'}</span></div>
    <div class="mut">${esc(p.description)}</div>
    <div class="bar"><i style="width:${p.total ? (100 * p.done) / p.total : 0}%"></i></div>
    <span class="mut">Выполнено ${p.done} из ${p.total}</span></div>`).join('') || '<p class="mut">Пока нет проектов — создайте первый</p>');
  $('#f').onsubmit = guard(async () => { await api('/projects', { method: 'POST', body: form($('#f')) }); render(); });
  document.querySelectorAll('[data-id]').forEach((el) => (el.onclick = () => { S.project = { id: el.dataset.id }; S.tab = 'tasks'; render(); }));
}

async function myTasksView() {
  const ts = await api('/projects/my/tasks');
  $('#app').innerHTML = `<h3>Мои задачи</h3>` + (ts.map((t) => `<div class="card click" data-pid="${t.project_id}">
    <div class="row"><b>${esc(t.title)}</b><span class="tag ${t.priority}">${PRIO[t.priority]}</span></div>
    <div class="row mut"><span>📁 ${esc(t.project_title)}</span><span>${STATUS[t.status]}</span>
    <span class="${t.deadline && t.deadline < today() ? 'late' : ''}">📅 ${esc(t.deadline || 'без срока')}</span></div></div>`).join('')
    || '<p class="mut">Нет назначенных вам незавершённых задач 🎉</p>');
  document.querySelectorAll('[data-pid]').forEach((el) => (el.onclick = () => { S.project = { id: el.dataset.pid }; S.tab = 'tasks'; render(); }));
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

// ---------- Задачи: список + канбан-доска ----------
async function tasksTab(p) {
  const tasks = await api(`/projects/${p.id}/tasks`);
  const done = tasks.filter((t) => t.status === 'done').length;
  const f = S.f;
  const opts = (obj, sel) => Object.entries(obj).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v}</option>`).join('');

  $('#body').innerHTML = `<div class="card"><b>Прогресс: ${done}/${tasks.length}</b>
    <div class="bar"><i style="width:${tasks.length ? (100 * done) / tasks.length : 0}%"></i></div></div>
    <div class="card"><form id="f"><input name="title" placeholder="Новая задача" required>
    <select name="assignee_id"><option value="">Без исполнителя</option>${p.members.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select>
    <select name="priority">${opts(PRIO, 'medium')}</select>
    <input name="deadline" type="date"><button>Добавить</button></form></div>
    <div class="card toolbar"><input id="q" placeholder="🔍 Поиск по задачам" value="${esc(f.q)}">
    <label><input type="checkbox" id="mine" ${f.mine ? 'checked' : ''}> Только мои</label>
    <span class="nav"><button class="${f.view === 'board' ? '' : 'ghost'}" data-v="board">Доска</button>
    <button class="${f.view === 'list' ? '' : 'ghost'}" data-v="list">Список</button></span></div>
    <div id="tl"></div>`;

  const taskCard = (t, withSelect) => `<div class="card task click" draggable="true" data-task="${t.id}">
    <div class="row"><b>${esc(t.title)}</b><span class="tag ${t.priority}">${PRIO[t.priority]}</span></div>
    <div class="row mut"><span>👤 ${esc(t.assignee_name || '—')}</span>
    <span class="${t.deadline && t.deadline < today() && t.status !== 'done' ? 'late' : ''}">📅 ${esc(t.deadline || 'без срока')}</span>
    ${withSelect ? `<select data-s="${t.id}">${opts(STATUS, t.status)}</select>` : ''}</div></div>`;

  const draw = () => {
    const q = f.q.trim().toLowerCase();
    const list = tasks.filter((t) => (!f.mine || t.assignee_id === S.user.id)
      && (!q || `${t.title} ${t.description || ''}`.toLowerCase().includes(q)));
    $('#tl').innerHTML = f.view === 'board'
      ? `<div class="board">${Object.entries(STATUS).map(([k, v]) => {
        const col = list.filter((t) => t.status === k);
        return `<div class="col" data-col="${k}"><h4>${v} <span class="mut">${col.length}</span></h4>${col.map((t) => taskCard(t, false)).join('')}</div>`;
      }).join('')}</div>`
      : list.map((t) => taskCard(t, true)).join('') || '<p class="mut">Задач не найдено</p>';

    document.querySelectorAll('[data-task]').forEach((el) => {
      const t = tasks.find((x) => x.id == el.dataset.task);
      el.onclick = () => taskModal(p, t);
      el.ondragstart = (e) => e.dataTransfer.setData('text/plain', t.id);
    });
    document.querySelectorAll('[data-s]').forEach((s) => {
      s.onclick = (e) => e.stopPropagation();
      s.onchange = guard(async () => { await api(`/projects/${p.id}/tasks/${s.dataset.s}`, { method: 'PATCH', body: { status: s.value } }); projectView(); });
    });
    document.querySelectorAll('[data-col]').forEach((col) => {
      col.ondragover = (e) => { e.preventDefault(); col.classList.add('over'); };
      col.ondragleave = () => col.classList.remove('over');
      col.ondrop = guard(async (e) => {
        col.classList.remove('over');
        const id = e.dataTransfer.getData('text/plain');
        const t = tasks.find((x) => x.id == id);
        if (!t || t.status === col.dataset.col) return;
        await api(`/projects/${p.id}/tasks/${id}`, { method: 'PATCH', body: { status: col.dataset.col } });
        projectView();
      });
    });
  };
  draw();

  $('#f').onsubmit = guard(async () => { await api(`/projects/${p.id}/tasks`, { method: 'POST', body: form($('#f')) }); projectView(); });
  $('#q').oninput = (e) => { f.q = e.target.value; draw(); };
  $('#mine').onchange = (e) => { f.mine = e.target.checked; draw(); };
  document.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => { f.view = b.dataset.v; projectView(); }));
}

// ---------- Карточка задачи: редактирование + комментарии ----------
async function taskModal(p, t) {
  const opts = (obj, sel) => Object.entries(obj).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v}</option>`).join('');
  const el = document.createElement('div');
  el.className = 'modal';
  el.innerHTML = `<div class="card box">
    <form id="tf">
      <input class="full" name="title" value="${esc(t.title)}" required>
      <textarea class="full" name="description" rows="3" placeholder="Описание">${esc(t.description)}</textarea>
      <select name="assignee_id"><option value="">Без исполнителя</option>${p.members.map((m) => `<option value="${m.id}" ${m.id === t.assignee_id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
      <select name="priority">${opts(PRIO, t.priority)}</select>
      <select name="status">${opts(STATUS, t.status)}</select>
      <input name="deadline" type="date" value="${esc(t.deadline || '')}">
      <div class="full row"><span><button>Сохранить</button> <button type="button" class="ghost" id="x">Закрыть</button></span>
      <button type="button" class="danger" id="dt">Удалить задачу</button></div>
    </form>
    <h4>Комментарии</h4><div id="cm" class="mut">Загрузка…</div>
    <form id="cf"><input name="body" placeholder="Написать комментарий…" autocomplete="off" required><button>Отправить</button></form>
  </div>`;
  document.body.appendChild(el);
  const close = () => el.remove();
  el.onclick = (e) => { if (e.target === el) close(); };
  el.querySelector('#x').onclick = close;

  const base = `/projects/${p.id}/tasks/${t.id}`;
  const loadComments = async () => {
    const cs = await api(base + '/comments');
    el.querySelector('#cm').innerHTML = cs.map((c) => `<div class="msg"><b>${esc(c.author)}</b> <span class="mut">${esc(fmtDate(c.created_at))}</span><br>${esc(c.body)}</div>`).join('') || 'Комментариев пока нет';
  };
  loadComments().catch(() => {});

  el.querySelector('#tf').onsubmit = guard(async () => { await api(base, { method: 'PATCH', body: form(el.querySelector('#tf')) }); close(); projectView(); });
  el.querySelector('#dt').onclick = guard(async () => { if (confirm('Удалить задачу?')) { await api(base, { method: 'DELETE' }); close(); projectView(); } });
  el.querySelector('#cf').onsubmit = guard(async () => {
    const cf = el.querySelector('#cf');
    await api(base + '/comments', { method: 'POST', body: form(cf) }); cf.reset(); loadComments();
  });
}

// ---------- Обсуждение ----------
async function chatTab(p) {
  $('#body').innerHTML = `<div class="card"><div id="chat"></div><form id="f"><input name="body" placeholder="Сообщение…" autocomplete="off" required><button>Отправить</button></form></div>`;
  const load = async () => {
    const ms = await api(`/projects/${p.id}/messages`);
    const box = $('#chat'); if (!box) return;
    const stick = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    box.innerHTML = ms.map((m) => `<div class="msg"><b>${esc(m.author)}</b> <span class="mut">${esc(fmtDate(m.created_at))}</span>
      ${m.user_id === S.user.id || p.role === 'owner' ? `<a href="#" class="mut" data-x="${m.id}">удалить</a>` : ''}<br>${esc(m.body)}</div>`).join('')
      || '<p class="mut">Сообщений пока нет</p>';
    if (stick) box.scrollTop = box.scrollHeight;
    box.querySelectorAll('[data-x]').forEach((a) => (a.onclick = guard(async () => { await api(`/projects/${p.id}/messages/${a.dataset.x}`, { method: 'DELETE' }); load(); })));
  };
  await load(); $('#chat').scrollTop = $('#chat').scrollHeight;
  S.timer = setInterval(() => load().catch(() => {}), 5000);
  $('#f').onsubmit = guard(async () => {
    await api(`/projects/${p.id}/messages`, { method: 'POST', body: form($('#f')) });
    $('#f').reset(); await load(); $('#chat').scrollTop = $('#chat').scrollHeight;
  });
}

// ---------- Файлы ----------
async function filesTab(p) {
  const files = await api(`/projects/${p.id}/files`);
  $('#body').innerHTML = `<div class="card"><form id="f"><input type="file" name="file" required><button>Загрузить (до 10 МБ)</button></form></div>` +
    (files.map((f) => `<div class="card row"><span><a href="#" data-f="${f.id}" data-n="${esc(f.original_name)}">📎 ${esc(f.original_name)}</a>
    <span class="mut"> · ${esc(f.author)} · ${(f.size / 1024).toFixed(1)} КБ · ${esc(fmtDate(f.created_at))}</span></span>
    ${f.user_id === S.user.id || p.role === 'owner' ? `<button class="danger" data-del="${f.id}">✕</button>` : ''}</div>`).join('')
    || '<p class="mut">Файлов пока нет</p>');
  $('#f').onsubmit = guard(async () => { await api(`/projects/${p.id}/files`, { method: 'POST', body: new FormData($('#f')) }); projectView(); });
  document.querySelectorAll('[data-f]').forEach((a) => (a.onclick = guard(async () => {
    const r = await api(`/projects/${p.id}/files/${a.dataset.f}`, { raw: true });
    if (!r.ok) throw new Error('Не удалось скачать файл');
    const url = URL.createObjectURL(await r.blob());
    Object.assign(document.createElement('a'), { href: url, download: a.dataset.n }).click(); URL.revokeObjectURL(url);
  })));
  document.querySelectorAll('[data-del]').forEach((b) => (b.onclick = guard(async () => {
    if (confirm('Удалить файл?')) { await api(`/projects/${p.id}/files/${b.dataset.del}`, { method: 'DELETE' }); projectView(); }
  })));
}

// ---------- Команда ----------
function teamTab(p) {
  const owner = p.role === 'owner';
  $('#body').innerHTML =
    (owner ? `<div class="card"><h4>О проекте</h4><form id="pf"><input name="title" value="${esc(p.title)}" required>
      <input name="description" value="${esc(p.description)}" placeholder="Описание"><button>Сохранить</button></form></div>
      <div class="card"><form id="f"><input name="email" type="email" placeholder="Email участника (он должен быть зарегистрирован)" required><button>Добавить</button></form></div>` : '') +
    p.members.map((m) => `<div class="card row"><span><b>${esc(m.name)}</b> <span class="mut">${esc(m.email)} · ${m.role === 'owner' ? 'владелец' : 'участник'}</span></span>
    ${owner && m.role !== 'owner' ? `<button class="danger" data-r="${m.id}">Убрать</button>` : ''}</div>`).join('') +
    (owner ? `<button class="danger" id="del">Удалить проект</button>` : `<button class="danger" id="leave">Покинуть проект</button>`);
  if (!owner) {
    $('#leave').onclick = guard(async () => { if (confirm('Покинуть проект?')) { await api(`/projects/${p.id}/leave`, { method: 'POST' }); S.project = null; render(); } });
    return;
  }
  $('#pf').onsubmit = guard(async () => { await api('/projects/' + p.id, { method: 'PATCH', body: form($('#pf')) }); projectView(); });
  $('#f').onsubmit = guard(async () => { await api(`/projects/${p.id}/members`, { method: 'POST', body: form($('#f')) }); projectView(); });
  document.querySelectorAll('[data-r]').forEach((b) => (b.onclick = guard(async () => {
    if (confirm('Убрать участника из проекта?')) { await api(`/projects/${p.id}/members/${b.dataset.r}`, { method: 'DELETE' }); projectView(); }
  })));
  $('#del').onclick = guard(async () => { if (confirm('Удалить проект целиком?')) { await api('/projects/' + p.id, { method: 'DELETE' }); S.project = null; render(); } });
}

render();
