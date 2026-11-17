/* ============================================================
   TeamWork — single-page front end (no build step, no dependencies)
   ============================================================ */
'use strict';

const STATUS = { todo: 'К выполнению', in_progress: 'В работе', done: 'Готово' };
const PRIORITY = { high: 'Высокий', medium: 'Средний', low: 'Низкий' };
const ROLE = { owner: 'Владелец', manager: 'Менеджер', member: 'Участник' };

const S = {
  token: localStorage.getItem('tw.token'),
  user: null,
  route: { name: 'projects', id: null, tab: 'board' },
  board: { view: 'board', query: '', mine: false },
  timers: [],
  unread: 0,
};

/* ------------------------------------------------------------ icons */
const P = (d) => `<path d="${d}"/>`;
const ICONS = {
  folder: P('M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'),
  check: '<polyline points="9 11 12 14 22 4"/>' + P('M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11'),
  bell: P('M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9') + P('M13.73 21a2 2 0 0 1-3.46 0'),
  user: P('M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2') + '<circle cx="12" cy="7" r="4"/>',
  users: P('M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2') + '<circle cx="9" cy="7" r="4"/>' + P('M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'),
  sun: '<circle cx="12" cy="12" r="4"/>' + P('M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'),
  moon: P('M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z'),
  plus: P('M12 5v14M5 12h14'),
  menu: P('M3 6h18M3 12h18M3 18h18'),
  back: P('M19 12H5M12 19l-7-7 7-7'),
  trash: P('M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'),
  close: P('M18 6 6 18M6 6l12 12'),
  link: P('M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71') + P('M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'),
  chat: P('M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'),
  file: P('M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z') + '<polyline points="13 2 13 9 20 9"/>',
  activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  board: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  list: P('M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01'),
  logout: P('M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4') + '<polyline points="16 17 21 12 16 7"/>' + P('M21 12H9'),
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/>' + P('M16 2v4M8 2v4M3 10h18'),
  archive: '<polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5" rx="1"/>' + P('M10 12h4'),
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/>' + P('M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'),
};
const icon = (name, size = 18) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

/* ------------------------------------------------------------ dom helper */
function el(tag, props, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (key === 'value') node.value = value;
    else if (key === 'checked' || key === 'selected' || key === 'disabled') node[key] = !!value;
    else node.setAttribute(key, value);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === '') continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}
const $ = (sel, root = document) => root.querySelector(sel);

/* ------------------------------------------------------------ small utils */
const today = () => new Date().toISOString().slice(0, 10);

function fmtDate(value, withTime = true) {
  if (!value) return '';
  const date = new Date(String(value).includes('T') ? value : value.replace(' ', 'T') + 'Z');
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ru-RU', withTime
    ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}

function relativeDay(dateStr) {
  if (!dateStr) return 'без срока';
  const days = Math.round((new Date(dateStr + 'T00:00:00Z') - new Date(today() + 'T00:00:00Z')) / 86400000);
  if (days === 0) return 'сегодня';
  if (days === 1) return 'завтра';
  if (days === -1) return 'вчера';
  if (days < 0) return `просрочено на ${-days} дн.`;
  if (days <= 6) return `через ${days} дн.`;
  return new Date(dateStr).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

/** Russian plural forms: plural(2, 'задача', 'задачи', 'задач') → 'задачи'. */
function plural(count, one, few, many) {
  const tens = count % 100;
  const units = count % 10;
  if (units === 1 && tens !== 11) return one;
  if (units >= 2 && units <= 4 && (tens < 10 || tens >= 20)) return few;
  return many;
}
const tasksWord = (n) => plural(n, 'задача', 'задачи', 'задач');
const peopleWord = (n) => plural(n, 'участник', 'участника', 'участников');

const fmtSize = (bytes) => bytes >= 1048576
  ? (bytes / 1048576).toFixed(1) + ' МБ'
  : Math.max(1, Math.round(bytes / 1024)) + ' КБ';

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

function avatar(name, size = '') {
  let hash = 0;
  for (const ch of String(name || '')) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  const node = el('div', { class: 'avatar' + (size ? ' ' + size : ''), title: name || '' }, initials(name));
  node.style.background = `linear-gradient(135deg, hsl(${hash} 62% 52%), hsl(${(hash + 38) % 360} 62% 44%))`;
  return node;
}

/* ------------------------------------------------------------ api */
async function api(path, options = {}) {
  const headers = {};
  if (S.token) headers.Authorization = 'Bearer ' + S.token;
  let body = options.body;
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const response = await fetch('/api' + path, { ...options, headers, body });
  if (options.raw) return response;

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && S.token && !path.startsWith('/auth/log') && !path.startsWith('/auth/reg')) {
      signOut();
    }
    throw new Error(data.error || 'Не удалось выполнить запрос');
  }
  return data;
}

/* ------------------------------------------------------------ toasts */
function toast(message, kind = '') {
  const node = el('div', { class: 'toast' + (kind ? ' ' + kind : '') }, message);
  $('#toasts').append(node);
  setTimeout(() => {
    node.style.transition = 'opacity .2s';
    node.style.opacity = '0';
    setTimeout(() => node.remove(), 220);
  }, 3600);
}

/** Wrap an async handler so failures surface as a toast instead of an unhandled rejection. */
const guard = (fn) => async (event) => {
  if (event && typeof event.preventDefault === 'function') event.preventDefault();
  try { await fn(event); } catch (error) { toast(error.message, 'err'); }
};

/* ------------------------------------------------------------ modals */
function openModal(build, { narrow = false, onClose } = {}) {
  const backdrop = el('div', { class: 'modal-back' });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const modal = el('div', { class: 'modal' + (narrow ? ' narrow' : '') });
  backdrop.append(modal);
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', onKey);
  build(modal, close);
  document.body.append(backdrop);
  const focusable = modal.querySelector('input, textarea, select, button');
  if (focusable) focusable.focus();
  return close;
}

function confirmDialog({ title, text, confirmText = 'Подтвердить', danger = false }) {
  return new Promise((resolve) => {
    let answer = false;
    openModal((modal, dismiss) => {
      const decide = (value) => { answer = value; dismiss(); };
      modal.append(
        el('div', { class: 'modal-head' }, el('div', {}, el('h2', {}, title))),
        el('div', { class: 'modal-body' }, el('p', { class: 'dim' }, text)),
        el('div', { class: 'modal-foot' },
          el('button', { class: 'btn ghost', onclick: () => decide(false) }, 'Отмена'),
          el('button', { class: 'btn' + (danger ? ' danger' : ''), onclick: () => decide(true) }, confirmText)),
      );
    }, { narrow: true, onClose: () => resolve(answer) });
  });
}

/* ------------------------------------------------------------ routing */
function parseRoute() {
  const invite = location.pathname.match(/^\/invite\/([\w-]+)/);
  if (invite) return { name: 'invite', token: invite[1] };

  const hash = location.hash.replace(/^#\/?/, '');
  const [head, a, b] = hash.split('/');
  if (head === 'p' && a) return { name: 'project', id: a, tab: b || 'board' };
  if (['tasks', 'inbox', 'profile'].includes(head)) return { name: head };
  return { name: 'projects' };
}

const go = (hash) => { location.hash = hash; };

function signOut() {
  localStorage.removeItem('tw.token');
  S.token = null;
  S.user = null;
  stopTimers();
  location.hash = '';
  render();
}

const stopTimers = () => { S.timers.forEach(clearInterval); S.timers = []; };

/* ------------------------------------------------------------ theme */
function applyTheme(mode) {
  const resolved = mode === 'auto'
    ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : mode;
  document.documentElement.setAttribute('data-theme', resolved);
  localStorage.setItem('tw.theme', mode);
}
function currentTheme() { return localStorage.getItem('tw.theme') || 'auto'; }
applyTheme(currentTheme());
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (currentTheme() === 'auto') applyTheme('auto');
});

/* ============================================================ app shell */
async function render() {
  stopTimers();
  const route = S.route = parseRoute();
  const root = $('#app');

  if (!S.token) {
    if (route.name === 'invite') sessionStorage.setItem('tw.invite', route.token);
    return authView(root);
  }

  if (!S.user) {
    try { S.user = await api('/auth/me'); }
    catch { return signOut(); }
  }

  if (route.name === 'invite') return inviteView(root, route.token);

  const pending = sessionStorage.getItem('tw.invite');
  if (pending) { sessionStorage.removeItem('tw.invite'); history.replaceState(null, '', '/invite/' + pending); return render(); }

  root.replaceChildren(buildShell(route));
  const page = $('#page');
  try {
    if (route.name === 'projects') await projectsView(page);
    else if (route.name === 'tasks') await myTasksView(page);
    else if (route.name === 'inbox') await inboxView(page);
    else if (route.name === 'profile') await profileView(page);
    else if (route.name === 'project') await projectView(page, route.id, route.tab);
  } catch (error) {
    page.replaceChildren(emptyState('close', 'Не удалось загрузить', error.message));
  }
  refreshBadge();
}

function buildShell(route) {
  const shell = el('div', { class: 'shell' });

  const navButton = (name, label, iconName, withBadge) => el('button', {
    class: 'nav-item' + (route.name === name ? ' active' : ''),
    onclick: () => { shell.classList.remove('menu-open'); go('/' + name); },
  },
    el('span', { class: 'nav-ico', html: icon(iconName) }),
    label,
    withBadge
      ? el('span', { class: 'nav-badge' + (S.unread ? '' : ' hidden'), id: 'badge' }, S.unread || '')
      : null,
  );

  const sidebar = el('aside', { class: 'sidebar' },
    el('div', { class: 'brand' },
      el('div', { class: 'brand-mark' }, 'T'),
      el('div', { class: 'brand-name' }, 'TeamWork')),
    el('nav', { class: 'nav' },
      navButton('projects', 'Проекты', 'folder'),
      navButton('tasks', 'Мои задачи', 'check'),
      navButton('inbox', 'Уведомления', 'bell', true)),
    el('div', { class: 'sidebar-foot' },
      el('div', { class: 'nav-sep' }),
      el('button', {
        class: 'userbox',
        onclick: () => { shell.classList.remove('menu-open'); go('/profile'); },
      },
        avatar(S.user.name),
        el('div', { class: 'grow' },
          el('div', { class: 'truncate strong sm' }, S.user.name),
          el('div', { class: 'truncate xs faint' }, S.user.email)),
        el('span', { class: 'nav-ico faint', html: icon('user', 16) })),
      el('div', { class: 'row tight', style: 'margin-top:8px' },
        el('button', {
          class: 'btn subtle sm grow',
          title: 'Переключить тему',
          onclick: (e) => {
            const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            applyTheme(next);
            e.currentTarget.innerHTML = icon(next === 'dark' ? 'sun' : 'moon', 15)
              + `<span style="margin-left:6px">${next === 'dark' ? 'Светлая' : 'Тёмная'}</span>`;
          },
          html: icon(document.documentElement.getAttribute('data-theme') === 'dark' ? 'sun' : 'moon', 15)
            + `<span style="margin-left:6px">${document.documentElement.getAttribute('data-theme') === 'dark' ? 'Светлая' : 'Тёмная'}</span>`,
        }),
        el('button', { class: 'btn subtle sm', title: 'Выйти', onclick: signOut, html: icon('logout', 15) }))),
  );

  const topbar = el('header', { class: 'topbar' },
    el('button', {
      class: 'btn quiet back', title: 'Меню', html: icon('menu'),
      onclick: () => {
        shell.classList.add('menu-open');
        shell.append(el('div', {
          class: 'scrim',
          onclick: (e) => { shell.classList.remove('menu-open'); e.currentTarget.remove(); },
        }));
      },
    }),
    el('div', { class: 'grow', id: 'topbar-slot' }),
  );

  shell.append(sidebar, el('div', { class: 'main' }, topbar, el('main', { class: 'page', id: 'page' })));
  return shell;
}

function setTopbar(...nodes) {
  const slot = $('#topbar-slot');
  if (slot) slot.replaceChildren(el('div', { class: 'row between' }, ...nodes));
}

function emptyState(iconName, title, text, action) {
  return el('div', { class: 'empty' },
    el('div', { class: 'empty-ico', html: icon(iconName, 36) }),
    el('h3', {}, title),
    text ? el('p', { class: 'sm' }, text) : null,
    action || null);
}

async function refreshBadge() {
  if (!S.token || !S.user) return;
  try {
    const { feed } = await api('/projects/my/notifications');
    const lastSeen = Number(localStorage.getItem('tw.seen.' + S.user.id) || 0);
    S.unread = feed.filter((item) => item.id > lastSeen).length;
    const badge = $('#badge');
    if (badge) {
      badge.textContent = String(S.unread);
      badge.classList.toggle('hidden', S.unread === 0);
    }
  } catch { /* badge is best-effort */ }
}

/* ============================================================ auth */
function authView(root) {
  let mode = 'login';

  const draw = () => {
    const error = el('div', { class: 'form-error hidden' });
    const nameField = el('input', { name: 'name', placeholder: 'Как вас зовут', autocomplete: 'name', required: true });
    const emailField = el('input', { name: 'email', type: 'email', placeholder: 'student@astanait.edu.kz', autocomplete: 'email', required: true });
    const passField = el('input', { name: 'password', type: 'password', placeholder: '••••••••', autocomplete: mode === 'login' ? 'current-password' : 'new-password', required: true });
    const submit = el('button', { class: 'btn block', type: 'submit' }, mode === 'login' ? 'Войти' : 'Создать аккаунт');

    const form = el('form', {
      onsubmit: guard(async () => {
        error.classList.add('hidden');
        submit.disabled = true;
        try {
          const payload = mode === 'login'
            ? { email: emailField.value, password: passField.value }
            : { name: nameField.value, email: emailField.value, password: passField.value };
          const data = await api('/auth/' + mode, { method: 'POST', body: payload });
          S.token = data.token;
          S.user = data.user;
          localStorage.setItem('tw.token', data.token);
          render();
        } catch (e) {
          error.textContent = e.message;
          error.classList.remove('hidden');
          submit.disabled = false;
        }
      }),
    },
      mode === 'register' ? el('label', { class: 'field' }, el('span', {}, 'Имя'), nameField) : null,
      el('label', { class: 'field' }, el('span', {}, 'Email'), emailField),
      el('label', { class: 'field' }, el('span', {}, 'Пароль'), passField),
      mode === 'register' ? el('p', { class: 'xs faint', style: 'margin:-6px 0 12px' }, 'Не короче 6 символов') : null,
      submit,
    );

    root.replaceChildren(el('div', { class: 'auth-wrap' },
      el('div', { class: 'auth' },
        el('div', { class: 'brand' },
          el('div', { class: 'brand-mark' }, 'T'),
          el('div', { class: 'brand-name' }, 'TeamWork')),
        el('h1', {}, mode === 'login' ? 'С возвращением' : 'Создайте аккаунт'),
        el('p', { class: 'sub' }, mode === 'login'
          ? 'Войдите, чтобы продолжить работу над проектами'
          : 'Один аккаунт для всех ваших командных проектов'),
        error,
        form,
        el('div', { class: 'auth-switch' },
          mode === 'login' ? 'Ещё нет аккаунта? ' : 'Уже зарегистрированы? ',
          el('button', { type: 'button', onclick: () => { mode = mode === 'login' ? 'register' : 'login'; draw(); } },
            mode === 'login' ? 'Зарегистрироваться' : 'Войти')))));
  };

  draw();
}

/* ============================================================ invite */
async function inviteView(root, token) {
  root.replaceChildren(el('div', { class: 'auth-wrap' }, el('div', { class: 'auth' }, el('p', { class: 'dim center' }, 'Проверяем приглашение…'))));

  const finish = (nodes) => root.replaceChildren(el('div', { class: 'auth-wrap' }, el('div', { class: 'auth' }, ...nodes)));

  try {
    const info = await api('/projects/invite/' + encodeURIComponent(token));
    const accept = el('button', { class: 'btn block' }, info.already_member ? 'Открыть проект' : 'Присоединиться к проекту');
    accept.addEventListener('click', guard(async () => {
      accept.disabled = true;
      const result = await api(`/projects/invite/${encodeURIComponent(token)}/accept`, { method: 'POST' });
      history.replaceState(null, '', '/');
      toast(result.already_member ? 'Вы уже в этой команде' : 'Вы присоединились к проекту', 'ok');
      go('/p/' + result.project_id + '/board');
      render();
    }));

    finish([
      el('div', { class: 'brand' }, el('div', { class: 'brand-mark' }, 'T'), el('div', { class: 'brand-name' }, 'TeamWork')),
      el('h1', {}, 'Приглашение в проект'),
      el('p', { class: 'sub' }, `Вас приглашают присоединиться как «${ROLE[info.role] || info.role}»`),
      el('div', { class: 'card', style: 'margin-bottom:18px' },
        el('h3', {}, info.project.title),
        info.project.description ? el('p', { class: 'sm dim', style: 'margin:6px 0 0' }, info.project.description) : null),
      accept,
      el('div', { class: 'auth-switch' }, el('button', { onclick: () => { history.replaceState(null, '', '/'); go('/projects'); render(); } }, 'Вернуться к моим проектам')),
    ]);
  } catch (error) {
    finish([
      el('div', { class: 'brand' }, el('div', { class: 'brand-mark' }, 'T'), el('div', { class: 'brand-name' }, 'TeamWork')),
      el('h1', {}, 'Приглашение недействительно'),
      el('p', { class: 'sub' }, error.message),
      el('button', { class: 'btn block', onclick: () => { history.replaceState(null, '', '/'); go('/projects'); render(); } }, 'К моим проектам'),
    ]);
  }
}

/* ============================================================ projects */
async function projectsView(page) {
  const projects = await api('/projects');
  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);

  setTopbar(
    el('h1', {}, 'Проекты'),
    el('button', { class: 'btn', onclick: () => newProjectModal(), html: icon('plus', 16) + '<span style="margin-left:6px">Новый проект</span>' }),
  );

  const card = (p) => {
    const percent = p.total ? Math.round((100 * p.done) / p.total) : 0;
    return el('article', {
      class: 'card hoverable', onclick: () => go('/p/' + p.id + '/board'),
      style: p.archived ? 'opacity:.62' : null,
    },
      el('div', { class: 'row between', style: 'align-items:flex-start' },
        el('div', { class: 'grow' },
          el('h3', { class: 'truncate' }, p.title),
          el('p', { class: 'sm dim', style: 'margin:4px 0 0' }, p.description || 'Без описания')),
        el('span', { class: 'pill' + (p.role === 'owner' ? ' brand' : '') }, ROLE[p.role] || p.role)),
      el('div', { class: 'progress', style: 'margin:14px 0 8px' },
        el('i', { class: percent === 100 && p.total ? 'full' : '', style: `width:${percent}%` })),
      el('div', { class: 'row between xs dim' },
        el('span', {}, p.total ? `${p.done} из ${p.total} · ${percent}%` : 'Задач пока нет'),
        el('span', { class: 'row tight' },
          p.overdue ? el('span', { class: 'pill late' }, `${p.overdue} просрочено`) : null,
          el('span', {}, `${p.people} ${peopleWord(p.people)}`))),
    );
  };

  const grid = (items) => el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:12px' }, items.map(card));

  page.replaceChildren(
    active.length
      ? grid(active)
      : emptyState('folder', 'Пока нет проектов',
        'Создайте первый проект — и приглашайте команду по ссылке.',
        el('button', { class: 'btn', style: 'margin-top:14px', onclick: () => newProjectModal() }, 'Создать проект')),
    archived.length ? el('div', {}, el('div', { class: 'section-title' }, 'Архив'), grid(archived)) : null,
  );
}

function newProjectModal() {
  openModal((modal, close) => {
    const title = el('input', { placeholder: 'Например: Курсовая по базам данных', required: true });
    const description = el('textarea', { placeholder: 'Пара слов о проекте (необязательно)', rows: 3 });
    modal.append(
      el('form', { onsubmit: guard(async () => {
        const { id } = await api('/projects', { method: 'POST', body: { title: title.value, description: description.value } });
        close();
        toast('Проект создан', 'ok');
        go('/p/' + id + '/board');
      }) },
        el('div', { class: 'modal-head' }, el('div', {}, el('h2', {}, 'Новый проект'))),
        el('div', { class: 'modal-body' },
          el('label', { class: 'field' }, el('span', {}, 'Название'), title),
          el('label', { class: 'field' }, el('span', {}, 'Описание'), description)),
        el('div', { class: 'modal-foot' },
          el('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Отмена'),
          el('button', { class: 'btn', type: 'submit' }, 'Создать'))),
    );
  }, { narrow: true });
}

/* ============================================================ my tasks */
async function myTasksView(page) {
  const tasks = await api('/projects/my/tasks');
  setTopbar(el('h1', {}, 'Мои задачи'),
    el('span', { class: 'pill' }, `${tasks.length} ${tasksWord(tasks.length)} в работе`));

  if (!tasks.length) {
    return page.replaceChildren(emptyState('check', 'Открытых задач нет',
      'Всё, что назначено вам в активных проектах, появится здесь.'));
  }

  const overdue = tasks.filter((t) => t.deadline && t.deadline < today());
  const rest = tasks.filter((t) => !(t.deadline && t.deadline < today()));

  const row = (t) => el('div', {
    class: 'card hoverable', onclick: () => go('/p/' + t.project_id + '/board'),
  },
    el('div', { class: 'row between' },
      el('div', { class: 'grow' },
        el('div', { class: 'strong' }, t.title),
        el('div', { class: 'sm dim', style: 'margin-top:3px' }, t.project_title)),
      el('div', { class: 'row tight' },
        el('span', { class: 'pill ' + t.priority }, PRIORITY[t.priority]),
        el('span', { class: 'pill' }, STATUS[t.status]),
        el('span', { class: 'pill' + (t.deadline && t.deadline < today() ? ' late' : '') }, relativeDay(t.deadline)))));

  page.replaceChildren(
    overdue.length ? el('div', {}, el('div', { class: 'section-title' }, 'Просрочено'), el('div', { class: 'stack' }, overdue.map(row))) : null,
    rest.length ? el('div', {}, el('div', { class: 'section-title' }, 'Предстоит'), el('div', { class: 'stack' }, rest.map(row))) : null,
  );
}

/* ============================================================ inbox */
async function inboxView(page) {
  const { due, feed } = await api('/projects/my/notifications');
  if (feed.length) localStorage.setItem('tw.seen.' + S.user.id, String(feed[0].id));
  S.unread = 0;
  const badge = $('#badge');
  if (badge) badge.classList.add('hidden');

  setTopbar(el('h1', {}, 'Уведомления'));

  const dueRow = (t) => el('div', { class: 'card hoverable', onclick: () => go('/p/' + t.project_id + '/board') },
    el('div', { class: 'row between' },
      el('div', { class: 'grow' },
        el('div', { class: 'strong' }, t.title),
        el('div', { class: 'sm dim', style: 'margin-top:3px' }, t.project_title)),
      el('span', { class: 'pill' + (t.deadline < today() ? ' late' : ' medium') }, relativeDay(t.deadline))));

  page.replaceChildren(
    due.length
      ? el('div', {}, el('div', { class: 'section-title' }, 'Сроки на этой неделе'), el('div', { class: 'stack' }, due.map(dueRow)))
      : null,
    el('div', {},
      el('div', { class: 'section-title' }, 'Что нового в ваших проектах'),
      feed.length
        ? el('div', { class: 'card' }, feed.map((item) => activityRow(item, true)))
        : emptyState('bell', 'Пока тихо', 'Здесь появятся действия ваших сокомандников.')),
  );
}

const ACTIVITY = {
  project_created: ['folder', 'создал проект'],
  project_updated: ['folder', 'обновил описание проекта'],
  project_archived: ['archive', 'архивировал проект'],
  project_restored: ['archive', 'вернул проект из архива'],
  task_created: ['plus', 'создал задачу'],
  task_status: ['activity', 'изменил статус'],
  task_done: ['check', 'завершил задачу'],
  task_assigned: ['user', 'назначил исполнителя'],
  task_deleted: ['trash', 'удалил задачу'],
  comment_added: ['chat', 'прокомментировал'],
  file_uploaded: ['file', 'загрузил файл'],
  member_added: ['users', 'добавил участника'],
  member_joined: ['users', 'присоединился по ссылке'],
  member_left: ['users', 'покинул проект'],
  member_removed: ['users', 'удалил участника'],
  role_changed: ['users', 'изменил роль'],
  owner_changed: ['users', 'передал права владельца'],
};

function activityRow(item, withProject = false) {
  const [iconName, label] = ACTIVITY[item.kind] || ['activity', item.kind];
  return el('div', { class: 'feed-item' },
    el('div', { class: 'feed-ico', html: icon(iconName, 14) }),
    el('div', { class: 'grow' },
      el('div', { class: 'sm' },
        el('b', {}, item.author || 'Участник'), ' ', label,
        item.subject ? el('span', { class: 'dim' }, ' — ' + item.subject) : null),
      el('div', { class: 'xs faint', style: 'margin-top:2px' },
        (withProject && item.project_title ? item.project_title + ' · ' : '') + fmtDate(item.created_at))));
}

/* ============================================================ profile */
async function profileView(page) {
  const me = await api('/auth/me');
  S.user = me;
  setTopbar(el('h1', {}, 'Профиль'));

  const nameInput = el('input', { value: me.name, required: true });
  const current = el('input', { type: 'password', autocomplete: 'current-password', required: true });
  const next = el('input', { type: 'password', autocomplete: 'new-password', required: true });

  const themeButton = (mode, label) => el('button', {
    class: currentTheme() === mode ? 'on' : '',
    onclick: (e) => {
      applyTheme(mode);
      [...e.currentTarget.parentNode.children].forEach((b) => b.classList.remove('on'));
      e.currentTarget.classList.add('on');
    },
  }, label);

  page.replaceChildren(
    el('div', { class: 'card pad-lg' },
      el('div', { class: 'row', style: 'gap:14px' },
        avatar(me.name, 'lg'),
        el('div', { class: 'grow' },
          el('h2', {}, me.name),
          el('div', { class: 'sm dim' }, me.email),
          el('div', { class: 'xs faint', style: 'margin-top:2px' }, 'С нами с ' + fmtDate(me.created_at, false)))),
      el('div', { class: 'statgrid', style: 'margin-top:18px' },
        el('div', { class: 'stat' }, el('b', {}, me.stats.projects), el('span', {}, 'проектов')),
        el('div', { class: 'stat' }, el('b', {}, me.stats.open_tasks), el('span', {}, 'задач в работе')),
        el('div', { class: 'stat' }, el('b', { style: 'color:var(--ok)' }, me.stats.done_tasks), el('span', {}, 'задач завершено')))),

    el('div', { class: 'grid2', style: 'margin-top:12px' },
      el('form', { class: 'card', onsubmit: guard(async () => {
        const data = await api('/auth/me', { method: 'PATCH', body: { name: nameInput.value } });
        S.user.name = data.name;
        toast('Имя обновлено', 'ok');
        render();
      }) },
        el('h3', { style: 'margin-bottom:12px' }, 'Личные данные'),
        el('label', { class: 'field' }, el('span', {}, 'Имя'), nameInput),
        el('button', { class: 'btn' }, 'Сохранить')),

      el('form', { class: 'card', onsubmit: guard(async (e) => {
        await api('/auth/password', { method: 'POST', body: { current: current.value, next: next.value } });
        e.target.reset();
        toast('Пароль изменён', 'ok');
      }) },
        el('h3', { style: 'margin-bottom:12px' }, 'Смена пароля'),
        el('label', { class: 'field' }, el('span', {}, 'Текущий пароль'), current),
        el('label', { class: 'field' }, el('span', {}, 'Новый пароль'), next),
        el('button', { class: 'btn' }, 'Изменить пароль'))),

    el('div', { class: 'card', style: 'margin-top:12px' },
      el('div', { class: 'row between' },
        el('div', {}, el('h3', {}, 'Оформление'), el('div', { class: 'sm dim' }, 'Тема интерфейса')),
        el('div', { class: 'segmented' },
          themeButton('light', 'Светлая'), themeButton('dark', 'Тёмная'), themeButton('auto', 'Как в системе')))),
  );
}

/* ============================================================ project */
async function projectView(page, id, tab) {
  const project = await api('/projects/' + id);
  const tabs = [
    ['board', 'Доска', 'board'],
    ['chat', 'Обсуждение', 'chat'],
    ['files', 'Файлы', 'file'],
    ['team', 'Команда', 'users'],
    ['activity', 'Активность', 'activity'],
  ];

  setTopbar(
    el('div', { class: 'grow', style: 'min-width:0' },
      el('h1', { class: 'truncate' }, project.title),
      project.archived ? el('span', { class: 'pill', style: 'margin-top:4px' }, 'В архиве') : null),
    el('div', { class: 'row tight' },
      el('button', { class: 'btn ghost sm', onclick: () => go('/projects') }, 'Все проекты')),
  );

  const body = el('div', {});
  page.replaceChildren(
    el('div', { class: 'tabs' }, tabs.map(([key, label]) =>
      el('button', { class: key === tab ? 'on' : '', onclick: () => go(`/p/${id}/${key}`) }, label))),
    body,
  );

  const views = { board: boardTab, chat: chatTab, files: filesTab, team: teamTab, activity: activityTab };
  await (views[tab] || boardTab)(body, project);
}

/* ------------------------------------------------------------ board */
async function boardTab(body, project) {
  const tasks = await api(`/projects/${project.id}/tasks`);
  const done = tasks.filter((t) => t.status === 'done').length;
  const percent = tasks.length ? Math.round((100 * done) / tasks.length) : 0;
  const filters = S.board;

  const titleInput = el('input', { placeholder: 'Что нужно сделать?', required: true });
  const assigneeSelect = el('select', {}, el('option', { value: '' }, 'Без исполнителя'),
    project.members.map((m) => el('option', { value: m.id }, m.name)));
  const prioritySelect = el('select', {}, Object.entries(PRIORITY).map(([value, label]) =>
    el('option', { value, selected: value === 'medium' }, label)));
  const deadlineInput = el('input', { type: 'date' });

  const search = el('input', { placeholder: 'Поиск по задачам', value: filters.query });
  const mineToggle = el('label', { class: 'row tight sm', style: 'cursor:pointer;white-space:nowrap' },
    el('input', { type: 'checkbox', checked: filters.mine, style: 'width:auto', onchange: (e) => { filters.mine = e.target.checked; draw(); } }),
    'Только мои');

  const listHost = el('div', {});

  const reload = async () => { await boardTab(body, project); };

  const patchTask = async (task, patch) => {
    await api(`/projects/${project.id}/tasks/${task.id}`, { method: 'PATCH', body: patch });
    await reload();
  };

  const taskCard = (task, withSelect) => {
    const card = el('article', {
      class: 'taskcard' + (task.status === 'done' ? ' is-done' : ''),
      onclick: (e) => { if (!e.target.closest('select')) taskModal(project, task, reload); },
    },
      el('div', { class: 'title' }, task.title),
      el('div', { class: 'meta' },
        el('span', { class: 'pill ' + task.priority }, el('i', { class: 'dot' }), PRIORITY[task.priority]),
        task.assignee_name ? el('span', { class: 'row tight' }, avatar(task.assignee_name, 'sm'), el('span', { class: 'truncate' }, task.assignee_name)) : el('span', { class: 'faint' }, 'не назначена'),
        task.deadline
          ? (task.status === 'done'
            ? el('span', { class: 'faint' }, fmtDate(task.deadline, false))
            : el('span', { class: task.deadline < today() ? 'pill late' : 'faint' }, relativeDay(task.deadline)))
          : null,
        task.comments ? el('span', { class: 'faint' }, `${task.comments} комм.`) : null,
        withSelect ? el('select', {
          onclick: (e) => e.stopPropagation(),
          onchange: guard((e) => patchTask(task, { status: e.target.value })),
        }, Object.entries(STATUS).map(([value, label]) => el('option', { value, selected: value === task.status }, label))) : null),
    );
    if (!withSelect) enableDrag(card, task, (status) => patchTask(task, { status }));
    return card;
  };

  const draw = () => {
    const query = filters.query.trim().toLowerCase();
    const visible = tasks.filter((t) =>
      (!filters.mine || t.assignee_id === S.user.id)
      && (!query || `${t.title} ${t.description || ''}`.toLowerCase().includes(query)));

    if (filters.view === 'board') {
      listHost.replaceChildren(el('div', { class: 'board' }, Object.entries(STATUS).map(([status, label]) => {
        const columnTasks = visible.filter((t) => t.status === status);
        return el('section', { class: 'col col-' + status, dataset: { status } },
          el('div', { class: 'col-head' },
            el('i', { class: 'dot' }), el('b', {}, label),
            el('span', { class: 'count' }, columnTasks.length)),
          columnTasks.length ? columnTasks.map((t) => taskCard(t, false))
            : el('div', { class: 'xs faint center', style: 'padding:14px 6px' }, 'Перетащите задачу сюда'));
      })));
    } else {
      listHost.replaceChildren(visible.length
        ? el('div', { class: 'stack' }, visible.map((t) => taskCard(t, true)))
        : emptyState('check', 'Ничего не найдено', 'Измените поисковый запрос или фильтр.'));
    }
  };

  body.replaceChildren(
    el('div', { class: 'card' },
      el('div', { class: 'row between', style: 'margin-bottom:10px' },
        el('div', {}, el('h3', {}, 'Прогресс'),
          el('div', { class: 'sm dim' }, tasks.length ? `${done} из ${tasks.length} ${tasksWord(tasks.length)} выполнено` : 'Задач пока нет')),
        el('div', { class: 'strong', style: 'font-size:22px' }, percent + '%')),
      el('div', { class: 'progress' }, el('i', { class: percent === 100 && tasks.length ? 'full' : '', style: `width:${percent}%` }))),

    project.archived ? null : el('form', { class: 'card', onsubmit: guard(async () => {
      await api(`/projects/${project.id}/tasks`, { method: 'POST', body: {
        title: titleInput.value,
        assignee_id: assigneeSelect.value || null,
        priority: prioritySelect.value,
        deadline: deadlineInput.value || null,
      } });
      toast('Задача добавлена', 'ok');
      await reload();
    }) },
      el('div', { class: 'inline-form' },
        el('label', { class: 'field grow', style: 'flex:3 1 220px' }, el('span', {}, 'Новая задача'), titleInput),
        el('label', { class: 'field' }, el('span', {}, 'Исполнитель'), assigneeSelect),
        el('label', { class: 'field' }, el('span', {}, 'Приоритет'), prioritySelect),
        el('label', { class: 'field' }, el('span', {}, 'Срок'), deadlineInput),
        el('button', { class: 'btn' }, 'Добавить'))),

    el('div', { class: 'card', style: 'display:flex;gap:12px;align-items:center;flex-wrap:wrap' },
      el('div', { class: 'grow', style: 'min-width:180px' }, search),
      mineToggle,
      el('div', { class: 'segmented' },
        el('button', { class: filters.view === 'board' ? 'on' : '', onclick: () => { filters.view = 'board'; draw(); }, html: icon('board', 15) }),
        el('button', { class: filters.view === 'list' ? 'on' : '', onclick: () => { filters.view = 'list'; draw(); }, html: icon('list', 15) }))),

    listHost,
  );

  search.addEventListener('input', (e) => { filters.query = e.target.value; draw(); });
  draw();
}

/** Pointer-based drag: works with a mouse or pen, and on touch after a short press. */
function enableDrag(card, task, onDrop) {
  card.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target.closest('select, button, a, input')) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const rect = card.getBoundingClientRect();
    const offsetX = startX - rect.left;
    const offsetY = startY - rect.top;
    let ghost = null;
    let column = null;
    let holdTimer = null;
    let dragging = false;

    const begin = () => {
      dragging = true;
      ghost = card.cloneNode(true);
      ghost.classList.add('ghost');
      ghost.style.width = rect.width + 'px';
      ghost.style.left = rect.left + 'px';
      ghost.style.top = rect.top + 'px';
      document.body.append(ghost);
      card.classList.add('dragging');
      document.body.style.userSelect = 'none';
    };

    const move = (e) => {
      if (!dragging) {
        const far = Math.hypot(e.clientX - startX, e.clientY - startY) > 6;
        if (e.pointerType === 'touch') { if (far) cleanup(); return; }
        if (!far) return;
        begin();
      }
      e.preventDefault();
      ghost.style.left = e.clientX - offsetX + 'px';
      ghost.style.top = e.clientY - offsetY + 'px';
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const next = under && under.closest('.col');
      if (next !== column) {
        if (column) column.classList.remove('over');
        column = next;
        if (column) column.classList.add('over');
      }
    };

    const cleanup = () => {
      clearTimeout(holdTimer);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cleanup);
      if (ghost) ghost.remove();
      if (column) column.classList.remove('over');
      card.classList.remove('dragging');
      document.body.style.userSelect = '';
      dragging = false;
    };

    const up = (e) => {
      const target = column;
      const wasDragging = dragging;
      cleanup();
      if (!wasDragging) return;
      e.preventDefault();
      const status = target && target.dataset.status;
      if (status && status !== task.status) onDrop(status);
    };

    if (event.pointerType === 'touch') holdTimer = setTimeout(begin, 280);
    document.addEventListener('pointermove', move, { passive: false });
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cleanup);
  });
}

/* ------------------------------------------------------------ task modal */
function taskModal(project, task, reload) {
  openModal((modal, close) => {
    const title = el('input', { value: task.title, required: true });
    const description = el('textarea', { rows: 3, placeholder: 'Детали, ссылки, критерии приёмки' }, task.description || '');
    const assignee = el('select', {}, el('option', { value: '' }, 'Без исполнителя'),
      project.members.map((m) => el('option', { value: m.id, selected: m.id === task.assignee_id }, m.name)));
    const priority = el('select', {}, Object.entries(PRIORITY).map(([v, l]) => el('option', { value: v, selected: v === task.priority }, l)));
    const status = el('select', {}, Object.entries(STATUS).map(([v, l]) => el('option', { value: v, selected: v === task.status }, l)));
    const deadline = el('input', { type: 'date', value: task.deadline || '' });
    const commentsHost = el('div', { class: 'dim sm' }, 'Загружаем комментарии…');
    const commentInput = el('input', { placeholder: 'Написать комментарий…', required: true, autocomplete: 'off' });

    const base = `/projects/${project.id}/tasks/${task.id}`;

    const loadComments = async () => {
      const comments = await api(base + '/comments');
      commentsHost.replaceChildren(comments.length
        ? el('div', {}, comments.map((c) => el('div', { class: 'msg' },
          avatar(c.author, 'sm'),
          el('div', { class: 'msg-body' },
            el('div', { class: 'msg-head' }, el('b', { class: 'sm' }, c.author), el('span', { class: 'xs faint' }, fmtDate(c.created_at))),
            el('div', { class: 'msg-text' }, c.body)),
          c.user_id === S.user.id || project.role !== 'member'
            ? el('button', { class: 'btn quiet', title: 'Удалить', html: icon('trash', 14), onclick: guard(async () => {
              await api(`${base}/comments/${c.id}`, { method: 'DELETE' });
              loadComments();
            }) })
            : null)))
        : el('div', { class: 'sm faint' }, 'Комментариев пока нет'));
    };
    loadComments().catch(() => commentsHost.replaceChildren(el('div', { class: 'sm faint' }, 'Не удалось загрузить комментарии')));

    modal.append(
      el('form', { onsubmit: guard(async () => {
        await api(base, { method: 'PATCH', body: {
          title: title.value,
          description: description.value,
          assignee_id: assignee.value || null,
          priority: priority.value,
          status: status.value,
          deadline: deadline.value || null,
        } });
        close();
        toast('Задача сохранена', 'ok');
        await reload();
      }) },
        el('div', { class: 'modal-head' },
          el('div', { class: 'grow' },
            el('h2', {}, 'Задача'),
            el('div', { class: 'xs faint', style: 'margin-top:3px' },
              `${task.author_name ? 'Создал ' + task.author_name + ' · ' : ''}${fmtDate(task.created_at)}`)),
          el('button', { class: 'btn quiet', type: 'button', title: 'Закрыть', html: icon('close', 16), onclick: close })),
        el('div', { class: 'modal-body' },
          el('label', { class: 'field' }, el('span', {}, 'Название'), title),
          el('label', { class: 'field' }, el('span', {}, 'Описание'), description),
          el('div', { class: 'grid2' },
            el('label', { class: 'field' }, el('span', {}, 'Исполнитель'), assignee),
            el('label', { class: 'field' }, el('span', {}, 'Срок'), deadline),
            el('label', { class: 'field' }, el('span', {}, 'Приоритет'), priority),
            el('label', { class: 'field' }, el('span', {}, 'Статус'), status))),
        el('div', { class: 'modal-foot' },
          el('button', { class: 'btn danger left', type: 'button', onclick: guard(async () => {
            if (!await confirmDialog({ title: 'Удалить задачу?', text: `«${task.title}» будет удалена вместе с комментариями.`, confirmText: 'Удалить', danger: true })) return;
            await api(base, { method: 'DELETE' });
            close();
            toast('Задача удалена');
            await reload();
          }) }, 'Удалить'),
          el('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Отмена'),
          el('button', { class: 'btn', type: 'submit' }, 'Сохранить'))),

      el('div', { class: 'modal-body', style: 'border-top:1px solid var(--border);padding-top:14px' },
        el('h4', { style: 'margin-bottom:8px' }, 'Комментарии'),
        commentsHost,
        el('form', { style: 'display:flex;gap:8px;margin:12px 0 18px', onsubmit: guard(async () => {
          await api(base + '/comments', { method: 'POST', body: { body: commentInput.value } });
          commentInput.value = '';
          await loadComments();
        }) },
          el('div', { class: 'grow' }, commentInput),
          el('button', { class: 'btn' }, 'Отправить'))),
    );
  });
}

/* ------------------------------------------------------------ chat */
async function chatTab(body, project) {
  const host = el('div', { class: 'chat' });
  const input = el('input', { placeholder: 'Сообщение команде…', autocomplete: 'off', required: true });

  const load = async () => {
    const messages = await api(`/projects/${project.id}/messages`);
    const stick = host.scrollHeight - host.scrollTop - host.clientHeight < 60;
    host.replaceChildren(messages.length
      ? el('div', {}, messages.map((m) => el('div', { class: 'msg' },
        avatar(m.author, 'sm'),
        el('div', { class: 'msg-body' },
          el('div', { class: 'msg-head' }, el('b', { class: 'sm' }, m.author), el('span', { class: 'xs faint' }, fmtDate(m.created_at))),
          el('div', { class: 'msg-text' }, m.body)),
        m.user_id === S.user.id || project.role !== 'member'
          ? el('button', { class: 'btn quiet', title: 'Удалить', html: icon('trash', 14), onclick: guard(async () => {
            await api(`/projects/${project.id}/messages/${m.id}`, { method: 'DELETE' });
            await load();
          }) })
          : null)))
      : emptyState('chat', 'Сообщений пока нет', 'Напишите первое — команда увидит его сразу.'));
    if (stick) host.scrollTop = host.scrollHeight;
  };

  body.replaceChildren(el('div', { class: 'card' }, host,
    el('form', { style: 'display:flex;gap:8px', onsubmit: guard(async () => {
      await api(`/projects/${project.id}/messages`, { method: 'POST', body: { body: input.value } });
      input.value = '';
      await load();
      host.scrollTop = host.scrollHeight;
    }) },
      el('div', { class: 'grow' }, input),
      el('button', { class: 'btn' }, 'Отправить'))));

  await load();
  host.scrollTop = host.scrollHeight;
  S.timers.push(setInterval(() => { load().catch(() => {}); }, 5000));
}

/* ------------------------------------------------------------ files */
async function filesTab(body, project) {
  const files = await api(`/projects/${project.id}/files`);
  const picker = el('input', { type: 'file', name: 'file', required: true });

  const row = (f) => el('div', { class: 'list-row' },
    el('div', { class: 'feed-ico', html: icon('file', 14) }),
    el('div', { class: 'grow' },
      el('button', { class: 'btn quiet', style: 'padding:0;font-weight:600', onclick: guard(async () => {
        const response = await api(`/projects/${project.id}/files/${f.id}`, { raw: true });
        if (!response.ok) throw new Error('Не удалось скачать файл');
        const url = URL.createObjectURL(await response.blob());
        const link = Object.assign(document.createElement('a'), { href: url, download: f.original_name });
        link.click();
        URL.revokeObjectURL(url);
      }) }, f.original_name),
      el('div', { class: 'xs faint' }, `${f.author} · ${fmtSize(f.size)} · ${fmtDate(f.created_at)}`)),
    f.user_id === S.user.id || project.role !== 'member'
      ? el('button', { class: 'btn quiet', title: 'Удалить', html: icon('trash', 15), onclick: guard(async () => {
        if (!await confirmDialog({ title: 'Удалить файл?', text: f.original_name, confirmText: 'Удалить', danger: true })) return;
        await api(`/projects/${project.id}/files/${f.id}`, { method: 'DELETE' });
        await filesTab(body, project);
      }) })
      : null);

  body.replaceChildren(
    project.archived ? null : el('form', { class: 'card', onsubmit: guard(async (e) => {
      const data = new FormData();
      data.append('file', picker.files[0]);
      await api(`/projects/${project.id}/files`, { method: 'POST', body: data });
      e.target.reset();
      toast('Файл загружен', 'ok');
      await filesTab(body, project);
    }) },
      el('div', { class: 'inline-form' },
        el('label', { class: 'field grow' }, el('span', {}, 'Загрузить файл — до 10 МБ'), picker),
        el('button', { class: 'btn' }, 'Загрузить'))),
    files.length
      ? el('div', { class: 'card' }, el('div', { class: 'list' }, files.map(row)))
      : emptyState('file', 'Файлов пока нет', 'Загрузите материалы, чтобы они были у всей команды.'),
  );
}

/* ------------------------------------------------------------ team */
async function teamTab(body, project) {
  const canManage = project.role === 'owner' || project.role === 'manager';
  const isOwner = project.role === 'owner';
  const invites = canManage ? await api(`/projects/${project.id}/invites`) : [];
  const reload = async () => { await projectView($('#page'), project.id, 'team'); };

  const emailInput = el('input', { type: 'email', placeholder: 'email@astanait.edu.kz', required: true });
  const roleSelect = el('select', {}, el('option', { value: 'member' }, 'Участник'), el('option', { value: 'manager' }, 'Менеджер'));

  const memberRow = (m) => el('div', { class: 'list-row' },
    avatar(m.name),
    el('div', { class: 'grow' },
      el('div', { class: 'strong sm' }, m.name, m.id === S.user.id ? el('span', { class: 'faint' }, ' — это вы') : null),
      el('div', { class: 'xs faint' }, `${m.email} · ${m.open_tasks} ${tasksWord(m.open_tasks)} в работе`)),
    isOwner && m.role !== 'owner'
      ? el('select', { style: 'width:auto', onchange: guard(async (e) => {
        await api(`/projects/${project.id}/members/${m.id}`, { method: 'PATCH', body: { role: e.target.value } });
        toast('Роль обновлена', 'ok');
        await reload();
      }) }, el('option', { value: 'member', selected: m.role === 'member' }, 'Участник'),
        el('option', { value: 'manager', selected: m.role === 'manager' }, 'Менеджер'))
      : el('span', { class: 'pill' + (m.role === 'owner' ? ' brand' : '') }, ROLE[m.role]),
    isOwner && m.role !== 'owner'
      ? el('button', { class: 'btn quiet', title: 'Передать права владельца', html: icon('user', 15), onclick: guard(async () => {
        if (!await confirmDialog({ title: 'Передать права владельца?', text: `${m.name} станет владельцем проекта, а вы — менеджером. Отменить это сможет только новый владелец.`, confirmText: 'Передать', danger: true })) return;
        await api(`/projects/${project.id}/transfer/${m.id}`, { method: 'POST' });
        toast('Права переданы', 'ok');
        await reload();
      }) })
      : null,
    canManage && m.role !== 'owner' && m.id !== S.user.id
      ? el('button', { class: 'btn quiet', title: 'Убрать из проекта', html: icon('close', 15), onclick: guard(async () => {
        if (!await confirmDialog({ title: 'Убрать участника?', text: `${m.name} потеряет доступ к проекту. Его задачи останутся без исполнителя.`, confirmText: 'Убрать', danger: true })) return;
        await api(`/projects/${project.id}/members/${m.id}`, { method: 'DELETE' });
        toast('Участник убран');
        await reload();
      }) })
      : null);

  const inviteRow = (inv) => {
    const url = `${location.origin}/invite/${inv.token}`;
    const field = el('input', { value: url, readonly: true, onclick: (e) => e.target.select() });
    return el('div', { class: 'list-row' },
      el('div', { class: 'feed-ico', html: icon('link', 14) }),
      el('div', { class: 'grow' },
        el('div', { class: 'copybox' }, field,
          el('button', { class: 'btn ghost sm', html: icon('copy', 14), title: 'Скопировать', onclick: async () => {
            try { await navigator.clipboard.writeText(url); toast('Ссылка скопирована', 'ok'); }
            catch { field.select(); toast('Выделено — скопируйте вручную'); }
          } })),
        el('div', { class: 'xs faint', style: 'margin-top:4px' },
          `Роль: ${ROLE[inv.role]} · действует до ${fmtDate(inv.expires_at, false)} · переходов: ${inv.uses}`)),
      el('button', { class: 'btn quiet', title: 'Отозвать', html: icon('trash', 15), onclick: guard(async () => {
        await api(`/projects/${project.id}/invites/${inv.token}`, { method: 'DELETE' });
        toast('Ссылка отозвана');
        await reload();
      }) }));
  };

  const titleInput = el('input', { value: project.title, required: true });
  const descInput = el('textarea', { rows: 2 }, project.description || '');

  body.replaceChildren(
    el('div', { class: 'card' },
      el('div', { class: 'card-head' }, el('h3', {}, `Команда — ${project.members.length}`)),
      el('div', { class: 'list' }, project.members.map(memberRow))),

    canManage ? el('div', { class: 'card' },
      el('div', { class: 'card-head' }, el('h3', {}, 'Добавить участника')),
      el('form', { onsubmit: guard(async (e) => {
        await api(`/projects/${project.id}/members`, { method: 'POST', body: { email: emailInput.value, role: roleSelect.value } });
        e.target.reset();
        toast('Участник добавлен', 'ok');
        await reload();
      }) },
        el('div', { class: 'inline-form' },
          el('label', { class: 'field grow' }, el('span', {}, 'Email зарегистрированного пользователя'), emailInput),
          el('label', { class: 'field', style: 'flex:0 0 150px' }, el('span', {}, 'Роль'), roleSelect),
          el('button', { class: 'btn' }, 'Добавить'))),
      el('div', { class: 'card-head', style: 'margin-top:18px' },
        el('h3', {}, 'Приглашения по ссылке'),
        el('button', { class: 'btn ghost sm', onclick: guard(async () => {
          await api(`/projects/${project.id}/invites`, { method: 'POST', body: { role: 'member' } });
          toast('Ссылка создана', 'ok');
          await reload();
        }) }, 'Создать ссылку')),
      invites.length
        ? el('div', { class: 'list' }, invites.map(inviteRow))
        : el('p', { class: 'sm faint' }, 'Ссылка действует 7 дней и позволяет присоединиться без ручного добавления.')) : null,

    canManage ? el('form', { class: 'card', onsubmit: guard(async () => {
      await api('/projects/' + project.id, { method: 'PATCH', body: { title: titleInput.value, description: descInput.value } });
      toast('Проект обновлён', 'ok');
      await reload();
    }) },
      el('div', { class: 'card-head' }, el('h3', {}, 'Настройки проекта')),
      el('label', { class: 'field' }, el('span', {}, 'Название'), titleInput),
      el('label', { class: 'field' }, el('span', {}, 'Описание'), descInput),
      el('button', { class: 'btn' }, 'Сохранить')) : null,

    el('div', { class: 'card' },
      el('div', { class: 'card-head' }, el('h3', {}, 'Управление доступом')),
      el('div', { class: 'row' },
        canManage ? el('button', { class: 'btn ghost', onclick: guard(async () => {
          await api(`/projects/${project.id}/archive`, { method: 'POST', body: { archived: !project.archived } });
          toast(project.archived ? 'Проект восстановлен' : 'Проект в архиве', 'ok');
          await reload();
        }) }, project.archived ? 'Вернуть из архива' : 'В архив') : null,
        !isOwner ? el('button', { class: 'btn ghost', onclick: guard(async () => {
          if (!await confirmDialog({ title: 'Покинуть проект?', text: 'Вы потеряете доступ. Ваши задачи останутся без исполнителя.', confirmText: 'Покинуть', danger: true })) return;
          await api(`/projects/${project.id}/leave`, { method: 'POST' });
          toast('Вы покинули проект');
          go('/projects');
        }) }, 'Покинуть проект') : null,
        isOwner ? el('button', { class: 'btn danger', onclick: guard(async () => {
          if (!await confirmDialog({ title: 'Удалить проект?', text: `«${project.title}», все задачи, сообщения и файлы будут удалены безвозвратно.`, confirmText: 'Удалить проект', danger: true })) return;
          await api('/projects/' + project.id, { method: 'DELETE' });
          toast('Проект удалён');
          go('/projects');
        }) }, 'Удалить проект') : null)),
  );
}

/* ------------------------------------------------------------ activity */
async function activityTab(body, project) {
  const items = await api(`/projects/${project.id}/activity`);
  body.replaceChildren(items.length
    ? el('div', { class: 'card' }, items.map((item) => activityRow(item)))
    : emptyState('activity', 'Пока ничего не происходило', 'Здесь появится история изменений по проекту.'));
}

/* ============================================================ boot */
window.addEventListener('hashchange', render);
window.addEventListener('popstate', render);
render();
