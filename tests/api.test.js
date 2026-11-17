/**
 * End-to-end API tests.
 *
 * Uses only what ships with Node (`node:test`, `node:assert`, global `fetch`),
 * so `npm test` needs no extra dependencies. Each run gets a throwaway database.
 */
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'teamwork-test-'));
process.env.DB_PATH = path.join(workDir, 'test.db');
process.env.JWT_SECRET = 'test-secret-not-used-in-production';

const { createApp } = require('../server/index');

let server;
let base;

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(workDir, { recursive: true, force: true });
});

/** Minimal JSON client. */
async function call(method, url, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(base + url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

let seq = 0;
async function makeUser(name) {
  const email = `u${++seq}.${Date.now()}@example.edu`;
  const { status, data } = await call('POST', '/api/auth/register', {
    body: { name, email, password: 'secret123' },
  });
  assert.equal(status, 201, `registration failed: ${JSON.stringify(data)}`);
  return { ...data.user, token: data.token, password: 'secret123' };
}

async function makeProject(owner, title = 'Курсовой проект') {
  const { status, data } = await call('POST', '/api/projects', { token: owner.token, body: { title } });
  assert.equal(status, 201);
  return data.id;
}

/* ============================================================ auth */

test('регистрация выдаёт токен и профиль', async () => {
  const user = await makeUser('Зара Темирова');
  assert.ok(user.token);
  assert.equal(user.name, 'Зара Темирова');

  const me = await call('GET', '/api/auth/me', { token: user.token });
  assert.equal(me.status, 200);
  assert.equal(me.data.email, user.email);
  assert.deepEqual(me.data.stats, { projects: 0, open_tasks: 0, done_tasks: 0 });
});

test('регистрация отклоняет короткий пароль, плохой email и дубликат', async () => {
  const short = await call('POST', '/api/auth/register', {
    body: { name: 'A', email: 'short@example.edu', password: '123' },
  });
  assert.equal(short.status, 400);

  const badEmail = await call('POST', '/api/auth/register', {
    body: { name: 'A', email: 'not-an-email', password: 'secret123' },
  });
  assert.equal(badEmail.status, 400);

  const user = await makeUser('Дубликат');
  const again = await call('POST', '/api/auth/register', {
    body: { name: 'Другой', email: user.email, password: 'secret123' },
  });
  assert.equal(again.status, 409);
});

test('вход проверяет пароль, а запросы без токена отклоняются', async () => {
  const user = await makeUser('Вход');

  const ok = await call('POST', '/api/auth/login', { body: { email: user.email, password: 'secret123' } });
  assert.equal(ok.status, 200);
  assert.ok(ok.data.token);

  const wrong = await call('POST', '/api/auth/login', { body: { email: user.email, password: 'wrong-one' } });
  assert.equal(wrong.status, 401);

  const anonymous = await call('GET', '/api/projects');
  assert.equal(anonymous.status, 401);

  const garbage = await call('GET', '/api/projects', { token: 'not.a.jwt' });
  assert.equal(garbage.status, 401);
});

test('повторные неудачные входы временно блокируются', async () => {
  const user = await makeUser('Под перебором');
  let last = null;
  for (let i = 0; i < 9; i += 1) {
    last = await call('POST', '/api/auth/login', { body: { email: user.email, password: 'nope' } });
  }
  assert.equal(last.status, 429, 'после серии неудач должен включаться лимит');

  // Reset so later tests that log in are unaffected.
  require('../server/routes/auth').loginLimiter.reset();
});

test('смена пароля требует текущий пароль', async () => {
  const user = await makeUser('Смена пароля');

  const wrong = await call('POST', '/api/auth/password', {
    token: user.token, body: { current: 'bad', next: 'newsecret1' },
  });
  assert.equal(wrong.status, 403);

  const tooShort = await call('POST', '/api/auth/password', {
    token: user.token, body: { current: 'secret123', next: '12' },
  });
  assert.equal(tooShort.status, 400);

  const ok = await call('POST', '/api/auth/password', {
    token: user.token, body: { current: 'secret123', next: 'newsecret1' },
  });
  assert.equal(ok.status, 200);

  const relogin = await call('POST', '/api/auth/login', { body: { email: user.email, password: 'newsecret1' } });
  assert.equal(relogin.status, 200);
});

test('имя профиля обновляется и не может быть пустым', async () => {
  const user = await makeUser('Старое имя');

  const empty = await call('PATCH', '/api/auth/me', { token: user.token, body: { name: '   ' } });
  assert.equal(empty.status, 400);

  const ok = await call('PATCH', '/api/auth/me', { token: user.token, body: { name: 'Новое имя' } });
  assert.equal(ok.status, 200);

  const me = await call('GET', '/api/auth/me', { token: user.token });
  assert.equal(me.data.name, 'Новое имя');
});

/* ============================================================ projects */

test('создатель проекта становится владельцем', async () => {
  const owner = await makeUser('Владелец');
  const id = await makeProject(owner, 'Платформа TeamWork');

  const list = await call('GET', '/api/projects', { token: owner.token });
  assert.equal(list.status, 200);
  assert.equal(list.data.length, 1);
  assert.equal(list.data[0].role, 'owner');
  assert.equal(list.data[0].total, 0);

  const one = await call('GET', `/api/projects/${id}`, { token: owner.token });
  assert.equal(one.data.members.length, 1);
  assert.equal(one.data.members[0].role, 'owner');
});

test('проект без названия не создаётся', async () => {
  const owner = await makeUser('Без названия');
  const result = await call('POST', '/api/projects', { token: owner.token, body: { title: '  ' } });
  assert.equal(result.status, 400);
});

test('посторонний не видит чужой проект', async () => {
  const owner = await makeUser('Хозяин');
  const stranger = await makeUser('Посторонний');
  const id = await makeProject(owner);

  const peek = await call('GET', `/api/projects/${id}`, { token: stranger.token });
  assert.equal(peek.status, 404, 'чужой проект должен выглядеть как несуществующий');

  const tasks = await call('GET', `/api/projects/${id}/tasks`, { token: stranger.token });
  assert.equal(tasks.status, 404);
});

/* ============================================================ tasks */

test('задачи создаются, редактируются и удаляются', async () => {
  const owner = await makeUser('Автор задач');
  const id = await makeProject(owner);

  const created = await call('POST', `/api/projects/${id}/tasks`, {
    token: owner.token,
    body: { title: 'Написать тесты', priority: 'high', deadline: '2026-12-01' },
  });
  assert.equal(created.status, 201);
  const taskId = created.data.id;

  const list = await call('GET', `/api/projects/${id}/tasks`, { token: owner.token });
  assert.equal(list.data.length, 1);
  assert.equal(list.data[0].title, 'Написать тесты');
  assert.equal(list.data[0].status, 'todo');
  assert.equal(list.data[0].author_name, 'Автор задач');

  const moved = await call('PATCH', `/api/projects/${id}/tasks/${taskId}`, {
    token: owner.token, body: { status: 'done' },
  });
  assert.equal(moved.status, 200);

  const after = await call('GET', `/api/projects/${id}/tasks`, { token: owner.token });
  assert.equal(after.data[0].status, 'done');
  assert.equal(after.data[0].title, 'Написать тесты', 'частичное обновление не должно терять поля');

  const removed = await call('DELETE', `/api/projects/${id}/tasks/${taskId}`, { token: owner.token });
  assert.equal(removed.status, 200);

  const empty = await call('GET', `/api/projects/${id}/tasks`, { token: owner.token });
  assert.equal(empty.data.length, 0);
});

test('задача проверяет название, приоритет, статус и исполнителя', async () => {
  const owner = await makeUser('Проверка задач');
  const outsider = await makeUser('Не в команде');
  const id = await makeProject(owner);

  const noTitle = await call('POST', `/api/projects/${id}/tasks`, { token: owner.token, body: { title: '' } });
  assert.equal(noTitle.status, 400);

  const foreign = await call('POST', `/api/projects/${id}/tasks`, {
    token: owner.token, body: { title: 'Задача', assignee_id: outsider.id },
  });
  assert.equal(foreign.status, 400, 'нельзя назначить задачу не члену команды');

  const task = await call('POST', `/api/projects/${id}/tasks`, { token: owner.token, body: { title: 'Задача' } });
  const badStatus = await call('PATCH', `/api/projects/${id}/tasks/${task.data.id}`, {
    token: owner.token, body: { status: 'hamburger' },
  });
  assert.equal(badStatus.status, 400);

  const badPriority = await call('PATCH', `/api/projects/${id}/tasks/${task.data.id}`, {
    token: owner.token, body: { priority: 'urgent' },
  });
  assert.equal(badPriority.status, 400);
});

test('комментарии к задаче видны команде', async () => {
  const owner = await makeUser('Комментатор');
  const id = await makeProject(owner);
  const task = await call('POST', `/api/projects/${id}/tasks`, { token: owner.token, body: { title: 'Обсудить' } });

  const empty = await call('POST', `/api/projects/${id}/tasks/${task.data.id}/comments`, {
    token: owner.token, body: { body: '   ' },
  });
  assert.equal(empty.status, 400);

  const added = await call('POST', `/api/projects/${id}/tasks/${task.data.id}/comments`, {
    token: owner.token, body: { body: 'Беру в работу' },
  });
  assert.equal(added.status, 201);

  const comments = await call('GET', `/api/projects/${id}/tasks/${task.data.id}/comments`, { token: owner.token });
  assert.equal(comments.data.length, 1);
  assert.equal(comments.data[0].author, 'Комментатор');
});

/* ============================================================ team and roles */

test('роли определяют, кто управляет проектом', async () => {
  const owner = await makeUser('Руководитель');
  const member = await makeUser('Участник');
  const id = await makeProject(owner);

  const added = await call('POST', `/api/projects/${id}/members`, {
    token: owner.token, body: { email: member.email },
  });
  assert.equal(added.status, 201);

  const twice = await call('POST', `/api/projects/${id}/members`, {
    token: owner.token, body: { email: member.email },
  });
  assert.equal(twice.status, 409);

  const memberEdits = await call('PATCH', `/api/projects/${id}`, {
    token: member.token, body: { title: 'Переименовал' },
  });
  assert.equal(memberEdits.status, 403, 'участник не может менять настройки проекта');

  const memberInvites = await call('POST', `/api/projects/${id}/members`, {
    token: member.token, body: { email: owner.email },
  });
  assert.equal(memberInvites.status, 403);

  const promote = await call('PATCH', `/api/projects/${id}/members/${member.id}`, {
    token: owner.token, body: { role: 'manager' },
  });
  assert.equal(promote.status, 200);

  const managerEdits = await call('PATCH', `/api/projects/${id}`, {
    token: member.token, body: { title: 'Теперь можно' },
  });
  assert.equal(managerEdits.status, 200, 'менеджер управляет настройками');
});

test('права владельца передаются, старый владелец становится менеджером', async () => {
  const owner = await makeUser('Первый владелец');
  const heir = await makeUser('Наследник');
  const id = await makeProject(owner);
  await call('POST', `/api/projects/${id}/members`, { token: owner.token, body: { email: heir.email } });

  const transferred = await call('POST', `/api/projects/${id}/transfer/${heir.id}`, { token: owner.token });
  assert.equal(transferred.status, 200);

  const view = await call('GET', `/api/projects/${id}`, { token: heir.token });
  assert.equal(view.data.role, 'owner');
  const previous = view.data.members.find((m) => m.id === owner.id);
  assert.equal(previous.role, 'manager');

  const deleteByOld = await call('DELETE', `/api/projects/${id}`, { token: owner.token });
  assert.equal(deleteByOld.status, 403, 'бывший владелец больше не может удалить проект');
});

test('участник покидает проект, его задачи остаются без исполнителя', async () => {
  const owner = await makeUser('Владелец ухода');
  const leaver = await makeUser('Уходящий');
  const id = await makeProject(owner);
  await call('POST', `/api/projects/${id}/members`, { token: owner.token, body: { email: leaver.email } });
  await call('POST', `/api/projects/${id}/tasks`, {
    token: owner.token, body: { title: 'Его задача', assignee_id: leaver.id },
  });

  const ownerLeaves = await call('POST', `/api/projects/${id}/leave`, { token: owner.token });
  assert.equal(ownerLeaves.status, 400, 'владелец не может просто уйти');

  const left = await call('POST', `/api/projects/${id}/leave`, { token: leaver.token });
  assert.equal(left.status, 200);

  const gone = await call('GET', `/api/projects/${id}`, { token: leaver.token });
  assert.equal(gone.status, 404);

  const tasks = await call('GET', `/api/projects/${id}/tasks`, { token: owner.token });
  assert.equal(tasks.data[0].assignee_id, null);
});

/* ============================================================ invites */

test('приглашение по ссылке добавляет участника', async () => {
  const owner = await makeUser('Пригласивший');
  const guest = await makeUser('Приглашённый');
  const id = await makeProject(owner, 'Проект по ссылке');

  const invite = await call('POST', `/api/projects/${id}/invites`, { token: owner.token, body: { role: 'member' } });
  assert.equal(invite.status, 201);
  assert.ok(invite.data.token);

  const preview = await call('GET', `/api/projects/invite/${invite.data.token}`, { token: guest.token });
  assert.equal(preview.status, 200);
  assert.equal(preview.data.project.title, 'Проект по ссылке');
  assert.equal(preview.data.already_member, false);

  const accepted = await call('POST', `/api/projects/invite/${invite.data.token}/accept`, { token: guest.token });
  assert.equal(accepted.status, 201);
  assert.equal(accepted.data.project_id, id);

  const view = await call('GET', `/api/projects/${id}`, { token: guest.token });
  assert.equal(view.status, 200);
  assert.equal(view.data.members.length, 2);

  const again = await call('POST', `/api/projects/invite/${invite.data.token}/accept`, { token: guest.token });
  assert.equal(again.data.already_member, true);
});

test('отозванная и несуществующая ссылка не работают', async () => {
  const owner = await makeUser('Отзыв ссылки');
  const guest = await makeUser('Опоздавший');
  const id = await makeProject(owner);

  const invite = await call('POST', `/api/projects/${id}/invites`, { token: owner.token });
  await call('DELETE', `/api/projects/${id}/invites/${invite.data.token}`, { token: owner.token });

  const revoked = await call('GET', `/api/projects/invite/${invite.data.token}`, { token: guest.token });
  assert.equal(revoked.status, 404);

  const nonsense = await call('GET', '/api/projects/invite/definitely-not-a-token', { token: guest.token });
  assert.equal(nonsense.status, 404);
});

/* ============================================================ discussion */

test('сообщения публикуются, чужие удалить нельзя', async () => {
  const owner = await makeUser('Автор сообщения');
  const member = await makeUser('Второй участник');
  const id = await makeProject(owner);
  await call('POST', `/api/projects/${id}/members`, { token: owner.token, body: { email: member.email } });

  const posted = await call('POST', `/api/projects/${id}/messages`, {
    token: member.token, body: { body: 'Всем привет' },
  });
  assert.equal(posted.status, 201);

  const blank = await call('POST', `/api/projects/${id}/messages`, { token: member.token, body: { body: '' } });
  assert.equal(blank.status, 400);

  const messages = await call('GET', `/api/projects/${id}/messages`, { token: owner.token });
  assert.equal(messages.data.length, 1);
  assert.equal(messages.data[0].author, 'Второй участник');

  const ownerDeletes = await call('DELETE', `/api/projects/${id}/messages/${posted.data.id}`, { token: owner.token });
  assert.equal(ownerDeletes.status, 200, 'владелец модерирует обсуждение');

  const second = await call('POST', `/api/projects/${id}/messages`, {
    token: owner.token, body: { body: 'Сообщение владельца' },
  });
  const memberDeletes = await call('DELETE', `/api/projects/${id}/messages/${second.data.id}`, { token: member.token });
  assert.equal(memberDeletes.status, 403, 'участник не может удалить чужое сообщение');
});

/* ============================================================ personal views */

test('мои задачи и уведомления собираются по всем проектам', async () => {
  const owner = await makeUser('Сводка');
  const mate = await makeUser('Коллега');
  const first = await makeProject(owner, 'Проект А');
  const second = await makeProject(owner, 'Проект Б');
  await call('POST', `/api/projects/${first}/members`, { token: owner.token, body: { email: mate.email } });

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  await call('POST', `/api/projects/${first}/tasks`, {
    token: owner.token, body: { title: 'Срочная', assignee_id: mate.id, deadline: yesterday },
  });
  await call('POST', `/api/projects/${second}/tasks`, { token: owner.token, body: { title: 'Чужая задача' } });
  const doneTask = await call('POST', `/api/projects/${first}/tasks`, {
    token: owner.token, body: { title: 'Уже сделана', assignee_id: mate.id },
  });
  await call('PATCH', `/api/projects/${first}/tasks/${doneTask.data.id}`, {
    token: owner.token, body: { status: 'done' },
  });

  const mine = await call('GET', '/api/projects/my/tasks', { token: mate.token });
  assert.equal(mine.status, 200);
  assert.equal(mine.data.length, 1, 'выполненные и чужие задачи не попадают в список');
  assert.equal(mine.data[0].title, 'Срочная');
  assert.equal(mine.data[0].project_title, 'Проект А');

  const notifications = await call('GET', '/api/projects/my/notifications', { token: mate.token });
  assert.equal(notifications.status, 200);
  assert.equal(notifications.data.due.length, 1, 'просроченная задача попадает в уведомления');
  assert.ok(notifications.data.feed.some((item) => item.kind === 'task_created'),
    'лента показывает действия других участников');
});

test('архивный проект исчезает из личных списков', async () => {
  const owner = await makeUser('Архиватор');
  const id = await makeProject(owner, 'Завершённый проект');
  await call('POST', `/api/projects/${id}/tasks`, {
    token: owner.token, body: { title: 'Остаток', assignee_id: owner.id },
  });

  const before = await call('GET', '/api/projects/my/tasks', { token: owner.token });
  assert.equal(before.data.length, 1);

  const archived = await call('POST', `/api/projects/${id}/archive`, { token: owner.token, body: { archived: true } });
  assert.equal(archived.status, 200);

  const after = await call('GET', '/api/projects/my/tasks', { token: owner.token });
  assert.equal(after.data.length, 0);

  const list = await call('GET', '/api/projects', { token: owner.token });
  assert.equal(list.data.find((p) => p.id === id).archived, 1, 'проект остаётся в списке с пометкой архива');
});

/* ============================================================ activity */

test('лента активности записывает основные события', async () => {
  const owner = await makeUser('Летописец');
  const id = await makeProject(owner);
  const task = await call('POST', `/api/projects/${id}/tasks`, { token: owner.token, body: { title: 'Событие' } });
  await call('PATCH', `/api/projects/${id}/tasks/${task.data.id}`, { token: owner.token, body: { status: 'done' } });

  const feed = await call('GET', `/api/projects/${id}/activity`, { token: owner.token });
  assert.equal(feed.status, 200);
  const kinds = feed.data.map((item) => item.kind);
  assert.ok(kinds.includes('project_created'));
  assert.ok(kinds.includes('task_created'));
  assert.ok(kinds.includes('task_done'));
});

/* ============================================================ misc */

test('служебные маршруты отвечают предсказуемо', async () => {
  const health = await fetch(base + '/api/health');
  assert.equal(health.status, 200);

  const unknown = await call('GET', '/api/unknown/endpoint');
  assert.equal(unknown.status, 404);
  assert.ok(unknown.data.error, 'неизвестный API-маршрут возвращает JSON, а не HTML');

  const page = await fetch(base + '/some/deep/link');
  assert.equal(page.status, 200);
  assert.ok((page.headers.get('content-type') || '').includes('text/html'),
    'любой не-API путь отдаёт оболочку приложения');
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
});
