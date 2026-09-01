// M4 面板 UI PanelUI（技术方案 V0.2 4.M4 / P2.5 里程碑，原型设计 V0.2 3.2/3.3）。
// 职责：渲染弹幕库面板的可视界面；全部数据操作经消息协议走 service worker。
// 边界：不含业务规则；不读写站点 DOM。

import './panel.css';
import '../shared/backup-ui.css';
import {
  DANMAKU_MAX_LENGTH,
  DEFAULT_GROUP_ID,
  GROUP_NAME_MAX_LENGTH,
  MESSAGES,
  STORAGE_KEYS,
} from '../shared/constants.ts';
import { sendMessage } from '../shared/messaging.ts';
import { exportBackupToFile, importBackupFromFile } from '../shared/backup-ui.ts';
import { createStorageWatcher } from './storage-watcher.ts';
import type { Danmaku, Group } from '../shared/types.ts';

interface GroupWithCount extends Group {
  count: number;
}

interface ListData {
  items: Danmaku[];
  total: number;
  hasMore: boolean;
}

type SortKey = 'latest' | 'oldest' | 'length';

const PAGE_SIZE = 50;

// ── 状态 ──────────────────────────────────────
const state = {
  groups: [] as GroupWithCount[],
  selectedGroupId: null as string | null, // null = 全部弹幕
  keyword: '',
  sort: 'latest' as SortKey,
  page: 1,
  items: [] as Danmaku[],
  total: 0,
  hasMore: false,
  loading: false,
  batchMode: false,
  checked: new Set<string>(),
  editingId: null as string | null,
  renamingGroupId: null as string | null,
  creatingGroup: false,
  fillMode: 'replace' as 'replace' | 'append',
  /** 活动标签页适配状态：ok / no_active_tab / unsupported / adapter_down */
  siteStatus: null as string | null,
};

// ── DOM 工具 ──────────────────────────────────
function must<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`面板结构缺失：#${id}`);
  return el as T;
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

const navEl = must('group-nav');
const listEl = must('list-container');
const countEl = must('count');
const batchBarEl = must('batch-bar');
const batchCountEl = must('batch-count');
const usageEl = must('usage');
const modalRoot = must('modal-root');
const toastWrap = must('toast-wrap');

// ── toast（面板顶部右对齐，2 秒消失）─────────
function toast(text: string, type: 'success' | 'warn' = 'success') {
  const el = h('div', `toast toast-${type}`, text);
  toastWrap.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

function errorText(code: string | undefined, fallback: string): string {
  const map: Record<string, string> = {
    NAME_EXISTS: '分组名已存在',
    NAME_INVALID: `分组名须为 1-${GROUP_NAME_MAX_LENGTH} 字符`,
    GROUP_LIMIT: '分组数量已达上限',
    BUILTIN_GROUP: '内置分组不可操作',
    NOT_FOUND: '目标不存在，列表已刷新',
    INVALID_CONTENT: `弹幕内容须为 1-${DANMAKU_MAX_LENGTH} 字`,
    READ_FAILED: '本地数据读取失败，请重试',
    WRITE_FAILED: '写入失败，请重试',
    STORAGE_FULL: '存储空间不足，收藏未成功，请导出并清理',
  };
  if (code && code in map) return map[code] as string;
  return fallback;
}

// ── 数据加载 ─────────────────────────────────
async function loadGroups(): Promise<void> {
  const r = await sendMessage<{ groups: GroupWithCount[] }>(MESSAGES.GET_GROUPS);
  if (r.ok && r.data) state.groups = r.data.groups;
}

async function loadList(reset = true): Promise<void> {
  if (state.loading) return;
  state.loading = true;
  if (reset) state.page = 1;
  renderLoading();
  const r = await sendMessage<ListData>(MESSAGES.LIST_DANMAKU, {
    groupId: state.selectedGroupId,
    keyword: state.keyword,
    sort: state.sort,
    page: state.page,
    pageSize: PAGE_SIZE,
  });
  if (r.ok && r.data) {
    state.items = reset ? r.data.items : [...state.items, ...r.data.items];
    state.total = r.data.total;
    state.hasMore = r.data.hasMore;
  } else if (reset) {
    state.items = [];
    state.total = 0;
    state.hasMore = false;
    if (r.error?.code === 'READ_FAILED') toast(errorText('READ_FAILED', ''), 'warn');
  }
  state.loading = false;
  renderAll();
}

async function persistSelectedGroup(): Promise<void> {
  await sendMessage(MESSAGES.SAVE_SETTINGS, {
    patch: { last_selected_group: state.selectedGroupId },
  });
}

// ── 渲染：分组导航 ───────────────────────────
function renderNav(): void {
  navEl.replaceChildren();

  const totalAll = state.groups.reduce((sum, g) => sum + g.count, 0);
  navEl.appendChild(
    navItem(String(state.selectedGroupId === null), '全部弹幕', totalAll, null, () => {
      state.selectedGroupId = null;
      void selectAndLoad();
    }),
  );

  for (const g of state.groups) {
    if (g.id === DEFAULT_GROUP_ID) {
      const star = h('span', 'star', '★');
      navEl.appendChild(
        navItem(String(state.selectedGroupId === g.id), g.name, g.count, star, () => {
          state.selectedGroupId = g.id;
          void selectAndLoad();
        }),
      );
    } else if (state.renamingGroupId === g.id) {
      const wrap = h('div', 'nav-item');
      const input = document.createElement('input');
      input.className = 'nav-input';
      input.value = g.name;
      input.maxLength = GROUP_NAME_MAX_LENGTH;
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') void renameGroup(g.id, input.value);
        if (e.key === 'Escape') {
          state.renamingGroupId = null;
          renderNav();
        }
      });
      input.addEventListener('blur', () => {
        if (state.renamingGroupId === g.id) {
          state.renamingGroupId = null;
          renderNav();
        }
      });
      wrap.appendChild(input);
      navEl.appendChild(wrap);
      input.focus();
    } else {
      const item = navItem(String(state.selectedGroupId === g.id), g.name, g.count, null, () => {
        state.selectedGroupId = g.id;
        void selectAndLoad();
      });
      const more = document.createElement('button');
      more.className = 'nav-more';
      more.type = 'button';
      more.textContent = '⋮';
      more.title = '分组操作';
      more.addEventListener('click', (e) => {
        e.stopPropagation();
        showGroupMenu(e as MouseEvent, g);
      });
      item.appendChild(more);
      navEl.appendChild(item);
    }
  }

  // ＋ 新建分组（行内输入）
  if (state.creatingGroup) {
    const wrap = h('div', 'nav-item');
    const input = document.createElement('input');
    input.className = 'nav-input';
    input.placeholder = '分组名（1-12 字）';
    input.maxLength = GROUP_NAME_MAX_LENGTH;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void createGroup(input.value);
      if (e.key === 'Escape') {
        state.creatingGroup = false;
        renderNav();
      }
    });
    input.addEventListener('blur', () => {
      if (state.creatingGroup) {
        state.creatingGroup = false;
        renderNav();
      }
    });
    wrap.appendChild(input);
    navEl.appendChild(wrap);
    input.focus();
  } else {
    const add = h('div', 'nav-new-group', '＋ 新建分组');
    add.addEventListener('click', () => {
      state.creatingGroup = true;
      renderNav();
    });
    navEl.appendChild(add);
  }
}

function navItem(
  active: string,
  name: string,
  count: number,
  prefix: HTMLElement | null,
  onClick: () => void,
): HTMLElement {
  const item = h('div', `nav-item${active === 'true' ? ' active' : ''}`);
  if (prefix) item.appendChild(prefix);
  item.appendChild(h('span', 'nav-name', name));
  item.appendChild(h('span', 'nav-count', String(count)));
  item.addEventListener('click', onClick);
  return item;
}

function showGroupMenu(e: MouseEvent, g: GroupWithCount): void {
  closeGroupMenu();
  const menu = h('div', 'group-menu');
  const rename = document.createElement('button');
  rename.type = 'button';
  rename.textContent = '重命名';
  rename.addEventListener('click', () => {
    closeGroupMenu();
    state.renamingGroupId = g.id;
    renderNav();
  });
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'menu-danger';
  del.textContent = '删除分组';
  del.addEventListener('click', () => {
    closeGroupMenu();
    void deleteGroup(g);
  });
  menu.appendChild(rename);
  menu.appendChild(del);
  menu.style.left = `${Math.min(e.clientX, window.innerWidth - 110)}px`;
  menu.style.top = `${e.clientY}px`;
  menu.id = 'group-menu-popup';
  document.body.appendChild(menu);
  setTimeout(() => {
    document.addEventListener('click', closeGroupMenu, { once: true });
  });
}

function closeGroupMenu(): void {
  document.getElementById('group-menu-popup')?.remove();
}

// ── 渲染：列表 ───────────────────────────────
function platformLabel(p: string): string {
  if (p === 'douyu') return '斗鱼';
  if (p === 'douyin') return '抖音';
  return '手动';
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min}分钟前`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}天前`;
  if (days < 30) return `${Math.floor(days / 7)}周前`;
  return new Date(iso).toLocaleDateString('zh-CN');
}

function renderList(): void {
  listEl.replaceChildren();

  // 空态（原型 1.3.2）
  if (state.total === 0) {
    const empty = h('div', 'empty-state');
    const isEmptyLib = state.groups.every((g) => g.count === 0) && state.keyword === '';
    if (state.keyword !== '') {
      empty.appendChild(h('div', 'empty-title', '没有找到相关弹幕'));
      const clearBtn = h('button', 'btn', '清除搜索');
      clearBtn.type = 'button';
      clearBtn.addEventListener('click', () => {
        const search = must<HTMLInputElement>('search');
        search.value = '';
        state.keyword = '';
        void loadList();
      });
      empty.appendChild(clearBtn);
    } else if (isEmptyLib) {
      empty.appendChild(h('div', 'empty-title', '还没有收藏任何弹幕'));
      const steps = h('div', 'empty-steps');
      steps.appendChild(h('div', undefined, '① 直播间右键弹幕，快速收藏'));
      steps.appendChild(h('div', undefined, '② 左侧新建分组，按用途归类'));
      steps.appendChild(h('div', undefined, '③ 点击弹幕条目，一键回填'));
      empty.appendChild(steps);
      const add = h('button', 'btn btn-primary', '手动添加第一条弹幕');
      add.type = 'button';
      add.addEventListener('click', () => void showNewDanmakuModal());
      empty.appendChild(add);
    } else {
      empty.appendChild(h('div', 'empty-title', '该分组还没有弹幕'));
      empty.appendChild(h('div', undefined, '去直播间右键收藏，或在全部弹幕中移动到这里'));
    }
    listEl.appendChild(empty);
    return;
  }

  for (const item of state.items) {
    listEl.appendChild(renderItem(item));
  }

  if (state.hasMore) {
    listEl.appendChild(h('div', 'loading-hint', '下拉加载更多…'));
  }
}

function renderItem(item: Danmaku): HTMLElement {
  const row = h('div', 'danmaku-item');
  const main = h('div', 'item-main');

  if (state.batchMode) {
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'item-check';
    check.checked = state.checked.has(item.id);
    check.addEventListener('change', () => {
      if (check.checked) state.checked.add(item.id);
      else state.checked.delete(item.id);
      renderBatchBar();
    });
    main.appendChild(check);
  }

  const content = h('div', `item-content${item.content === '' ? ' empty-content' : ''}`);
  if (item.content === '') {
    content.textContent = '［纯表情弹幕］';
    content.title = '该弹幕无文本内容';
  } else {
    content.textContent = item.content;
    if (item.content.length > 50) content.title = item.content;
  }
  content.addEventListener('click', () => void fillDanmaku(item));
  main.appendChild(content);

  // 行内编辑态
  if (state.editingId === item.id) {
    row.replaceChildren();
    const input = document.createElement('input');
    input.className = 'edit-input';
    input.value = item.content;
    input.maxLength = DANMAKU_MAX_LENGTH;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void updateDanmaku(item.id, input.value);
      if (e.key === 'Escape') {
        state.editingId = null;
        renderList();
      }
    });
    row.appendChild(input);
    input.focus();
    return row;
  }

  // 常态（非批量）行内仅保留回填/编辑；移动/删除并入底部批量栏（spec §5.2）。
  // 批量模式行内不渲染任何按钮，仅勾选框 + 内容。
  if (!state.batchMode) {
    const actions = h('div', 'item-actions');

    const fill = h('button', 'btn', '回填');
    fill.type = 'button';
    if (item.content === '') {
      fill.disabled = true;
      fill.title = '该弹幕无文本内容，无法回填';
    } else if (state.siteStatus !== 'ok') {
      fill.disabled = true;
      fill.title =
        state.siteStatus === 'adapter_down'
          ? '直播页已改版，回填暂不可用，请等待插件更新'
          : '请在斗鱼直播间页面使用';
    }
    fill.addEventListener('click', () => void fillDanmaku(item));
    actions.appendChild(fill);

    const edit = h('button', 'btn', '编辑');
    edit.type = 'button';
    edit.addEventListener('click', () => {
      state.editingId = item.id;
      renderList();
    });
    actions.appendChild(edit);

    main.appendChild(actions);
  }
  row.appendChild(main);

  const meta = h('div', 'item-meta');
  const source = item.room
    ? `${platformLabel(item.platform)} · ${item.room}`
    : platformLabel(item.platform);
  meta.appendChild(h('span', undefined, source));
  meta.appendChild(h('span', undefined, timeAgo(item.created_at)));
  row.appendChild(meta);
  return row;
}

function renderLoading(): void {
  if (state.items.length === 0) {
    listEl.replaceChildren(h('div', 'loading-hint', '加载中…'));
  }
}

function renderCount(): void {
  countEl.textContent = `共 ${state.total} 条`;
}

function renderBatchBar(): void {
  batchBarEl.classList.toggle('hidden', !state.batchMode);
  batchCountEl.textContent = `已选 ${state.checked.size} 条`;
  must<HTMLButtonElement>('btn-batch').textContent = state.batchMode ? '退出批量' : '批量管理';
}

async function renderUsage(): Promise<void> {
  try {
    const used = await chrome.storage.local.getBytesInUse(null);
    const quota = chrome.storage.local.QUOTA_BYTES ?? 10 * 1024 * 1024;
    usageEl.textContent = `存储用量 ${fmtBytes(used)} / ${fmtBytes(quota)}`;
    usageEl.classList.toggle('usage-warn', used / quota >= 0.8);
  } catch {
    usageEl.textContent = '存储用量 —';
  }
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

function renderAll(): void {
  renderNav();
  renderList();
  renderCount();
  renderBatchBar();
}

// ── 领域操作 ─────────────────────────────────
async function selectAndLoad(): Promise<void> {
  state.editingId = null;
  if (state.batchMode) exitBatch();
  renderAll();
  void persistSelectedGroup();
  await loadList();
}

async function createGroup(rawName: string): Promise<void> {
  state.creatingGroup = false;
  const r = await sendMessage<{ group: Group }>(MESSAGES.CREATE_GROUP, { name: rawName });
  if (r.ok && r.data) {
    toast(`已创建「${r.data.group.name}」`);
    await loadGroups();
    state.selectedGroupId = r.data.group.id;
    renderNav();
    void persistSelectedGroup();
    // 列表刷新由存储变更监听统一驱动（保留当前分组/筛选状态）
  } else {
    toast(errorText(r.error?.code, '创建失败'), 'warn');
    renderNav();
  }
}

async function renameGroup(id: string, rawName: string): Promise<void> {
  state.renamingGroupId = null;
  const r = await sendMessage<{ group: Group }>(MESSAGES.RENAME_GROUP, { id, name: rawName });
  if (r.ok) {
    toast('已重命名');
    await loadGroups();
    renderNav();
  } else {
    toast(errorText(r.error?.code, '重命名失败'), 'warn');
    renderNav();
  }
}

async function deleteGroup(g: GroupWithCount): Promise<void> {
  const ok = await confirmModal({
    title: `删除分组「${g.name}」？`,
    body: `组内 ${g.count} 条弹幕将移入「默认收藏」，不会被删除。`,
    confirmText: '删除',
  });
  if (!ok) return;
  const r = await sendMessage<{ movedCount: number }>(MESSAGES.DELETE_GROUP, { id: g.id });
  if (r.ok && r.data) {
    toast(`已删除分组，${r.data.movedCount} 条弹幕移入「默认收藏」`);
    if (state.selectedGroupId === g.id) state.selectedGroupId = null;
    await loadGroups();
    void persistSelectedGroup();
    // 列表刷新由存储变更监听统一驱动
  } else {
    toast(errorText(r.error?.code, '删除失败'), 'warn');
  }
}

async function updateDanmaku(id: string, content: string): Promise<void> {
  state.editingId = null;
  const r = await sendMessage(MESSAGES.UPDATE_DANMAKU, { id, content });
  if (r.ok) {
    toast('已保存');
    await loadGroups();
    // 列表刷新由存储变更监听统一驱动
  } else {
    toast(errorText(r.error?.code, '保存失败'), 'warn');
    renderList();
  }
}

async function deleteDanmaku(ids: string[]): Promise<void> {
  const r = await sendMessage<{ deleted: number }>(MESSAGES.DELETE_DANMAKU, { ids });
  if (r.ok && r.data) {
    toast(`已删除 ${r.data.deleted} 条`);
    state.checked.clear();
    if (state.batchMode) exitBatch();
    await loadGroups();
    // 列表刷新由存储变更监听统一驱动
  } else {
    toast(errorText(r.error?.code, '删除失败'), 'warn');
    renderList();
  }
}

async function moveDanmaku(ids: string[]): Promise<void> {
  const targetId = await groupPickerModal();
  if (!targetId) return;
  const r = await sendMessage<{ moved: number }>(MESSAGES.MOVE_DANMAKU, {
    ids,
    targetGroupId: targetId,
  });
  if (r.ok && r.data) {
    toast(`已移动 ${r.data.moved} 条`);
    state.checked.clear();
    if (state.batchMode) exitBatch();
    await loadGroups();
    // 列表刷新由存储变更监听统一驱动
  } else {
    toast(errorText(r.error?.code, '移动失败'), 'warn');
  }
}

async function fillDanmaku(item: Danmaku): Promise<void> {
  if (item.content === '') {
    toast('该弹幕无文本内容，无法回填', 'warn');
    return;
  }
  const r = await sendMessage<{ ok: boolean; truncated?: boolean }>(MESSAGES.FILL_REQUEST, {
    content: item.content,
    mode: state.fillMode,
  });
  if (r.ok && r.data?.ok) {
    toast(r.data.truncated ? '已回填（超长已截断），可直接发送' : '已回填，可直接发送');
  } else if (r.error?.code === 'SITE_UNSUPPORTED') {
    toast('请在斗鱼直播间页面使用', 'warn');
  } else if (r.error?.code === 'ADAPTER_DOWN') {
    toast('直播页已改版，回填暂不可用，请等待插件更新', 'warn');
  } else {
    toast(r.error?.message ?? '回填暂不可用，请稍后重试', 'warn');
  }
}

// ── 批量模式 ─────────────────────────────────
function enterBatch(): void {
  state.batchMode = true;
  state.checked.clear();
  renderAll();
}

function exitBatch(): void {
  state.batchMode = false;
  state.checked.clear();
  renderAll();
}

// ── 模态 ────────────────────────────────────
function confirmModal(opts: {
  title: string;
  body: string;
  confirmText: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const mask = h('div', 'modal-mask');
    const modal = h('div', 'modal');
    modal.appendChild(h('h3', undefined, opts.title));
    modal.appendChild(h('div', 'modal-body', opts.body));
    const actions = h('div', 'modal-actions');
    const cancel = h('button', 'btn', '取消');
    cancel.type = 'button';
    cancel.addEventListener('click', () => {
      mask.remove();
      resolve(false);
    });
    const confirm = h('button', 'btn btn-primary', opts.confirmText);
    confirm.type = 'button';
    confirm.addEventListener('click', () => {
      mask.remove();
      resolve(true);
    });
    actions.appendChild(cancel);
    actions.appendChild(confirm);
    modal.appendChild(actions);
    mask.appendChild(modal);
    mask.addEventListener('click', (e) => {
      if (e.target === mask) {
        mask.remove();
        resolve(false);
      }
    });
    modalRoot.appendChild(mask);
  });
}

function groupPickerModal(): Promise<string | null> {
  return new Promise((resolve) => {
    const mask = h('div', 'modal-mask');
    const modal = h('div', 'modal');
    modal.appendChild(h('h3', undefined, '移动到分组'));
    const select = document.createElement('select');
    for (const g of state.groups) {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.builtin ? `★ ${g.name}` : g.name;
      select.appendChild(opt);
    }
    const newOpt = document.createElement('option');
    newOpt.value = '__new__';
    newOpt.textContent = '＋ 新建分组';
    select.appendChild(newOpt);
    modal.appendChild(select);
    const actions = h('div', 'modal-actions');
    const cancel = h('button', 'btn', '取消');
    cancel.type = 'button';
    cancel.addEventListener('click', () => {
      mask.remove();
      resolve(null);
    });
    const confirm = h('button', 'btn btn-primary', '移动');
    confirm.type = 'button';
    confirm.addEventListener('click', async () => {
      const val = select.value;
      mask.remove();
      if (val === '__new__') {
        const name = await promptModal('新建分组', '分组名（1-12 字）');
        if (name === null) return resolve(null);
        const r = await sendMessage<{ group: Group }>(MESSAGES.CREATE_GROUP, { name });
        if (r.ok && r.data) {
          await loadGroups();
          renderNav();
          resolve(r.data.group.id);
        } else {
          toast(errorText(r.error?.code, '创建失败'), 'warn');
          resolve(null);
        }
      } else {
        resolve(val);
      }
    });
    actions.appendChild(cancel);
    actions.appendChild(confirm);
    modal.appendChild(actions);
    mask.appendChild(modal);
    modalRoot.appendChild(mask);
  });
}

function promptModal(title: string, label: string): Promise<string | null> {
  return new Promise((resolve) => {
    const mask = h('div', 'modal-mask');
    const modal = h('div', 'modal');
    modal.appendChild(h('h3', undefined, title));
    modal.appendChild(h('label', undefined, label));
    const input = document.createElement('input');
    input.maxLength = GROUP_NAME_MAX_LENGTH;
    modal.appendChild(input);
    const actions = h('div', 'modal-actions');
    const cancel = h('button', 'btn', '取消');
    cancel.type = 'button';
    cancel.addEventListener('click', () => {
      mask.remove();
      resolve(null);
    });
    const confirm = h('button', 'btn btn-primary', '确定');
    confirm.type = 'button';
    confirm.addEventListener('click', () => {
      mask.remove();
      resolve(input.value);
    });
    actions.appendChild(cancel);
    actions.appendChild(confirm);
    modal.appendChild(actions);
    mask.appendChild(modal);
    modalRoot.appendChild(mask);
    input.focus();
  });
}

function showNewDanmakuModal(): void {
  const mask = h('div', 'modal-mask');
  const modal = h('div', 'modal');
  modal.appendChild(h('h3', undefined, '新建弹幕'));
  modal.appendChild(h('label', undefined, `内容（1-${DANMAKU_MAX_LENGTH} 字）`));
  const input = document.createElement('input');
  input.maxLength = DANMAKU_MAX_LENGTH;
  input.placeholder = '输入弹幕内容…';
  modal.appendChild(input);
  modal.appendChild(h('label', undefined, '收藏到分组'));
  const select = document.createElement('select');
  for (const g of state.groups) {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.builtin ? `★ ${g.name}` : g.name;
    if (state.selectedGroupId === g.id) opt.selected = true;
    select.appendChild(opt);
  }
  modal.appendChild(select);
  const actions = h('div', 'modal-actions');
  const cancel = h('button', 'btn', '取消');
  cancel.type = 'button';
  cancel.addEventListener('click', () => mask.remove());
  const confirm = h('button', 'btn btn-primary', '收藏');
  confirm.type = 'button';
  confirm.addEventListener('click', async () => {
    const content = input.value;
    const groupId = select.value;
    const r = await sendMessage<{ id: string; duplicate: boolean }>(MESSAGES.CREATE_DANMAKU, {
      content,
      groupId,
    });
    if (r.ok && r.data) {
      mask.remove();
      if (r.data.duplicate) {
        toast('该分组已收藏此弹幕', 'warn');
      } else {
        toast('已收藏');
      }
      await loadGroups();
      // 列表刷新由存储变更监听统一驱动
    } else {
      toast(errorText(r.error?.code, '收藏失败'), 'warn');
    }
  });
  actions.appendChild(cancel);
  actions.appendChild(confirm);
  modal.appendChild(actions);
  mask.appendChild(modal);
  modalRoot.appendChild(mask);
  input.focus();
}

// ── 事件绑定 ─────────────────────────────────
let searchTimer: ReturnType<typeof setTimeout> | undefined;
must<HTMLInputElement>('search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  const value = (e.target as HTMLInputElement).value;
  searchTimer = setTimeout(() => {
    state.keyword = value;
    void loadList();
  }, 100);
});

must<HTMLSelectElement>('sort').addEventListener('change', (e) => {
  state.sort = (e.target as HTMLSelectElement).value as SortKey;
  void loadList();
});

listEl.addEventListener('scroll', () => {
  if (
    !state.loading &&
    state.hasMore &&
    listEl.scrollTop + listEl.clientHeight >= listEl.scrollHeight - 40
  ) {
    state.page += 1;
    void loadList(false);
  }
});

must<HTMLButtonElement>('btn-batch').addEventListener('click', () => {
  if (state.batchMode) exitBatch();
  else enterBatch();
});

must<HTMLButtonElement>('btn-batch-exit').addEventListener('click', exitBatch);

must<HTMLButtonElement>('btn-batch-delete').addEventListener('click', async () => {
  const ids = [...state.checked];
  if (ids.length === 0) {
    toast('请先勾选弹幕', 'warn');
    return;
  }
  const ok = await confirmModal({
    title: `删除 ${ids.length} 条弹幕？`,
    body: '删除后不可恢复。',
    confirmText: '删除',
  });
  if (ok) await deleteDanmaku(ids);
});

must<HTMLButtonElement>('btn-batch-move').addEventListener('click', async () => {
  const ids = [...state.checked];
  if (ids.length === 0) {
    toast('请先勾选弹幕', 'warn');
    return;
  }
  await moveDanmaku(ids);
});

must<HTMLButtonElement>('btn-new-danmaku').addEventListener('click', () => showNewDanmakuModal());

// 导出备份 / 导入恢复（P6；面板与设置页共用 backup-ui 流程）
must<HTMLButtonElement>('btn-export').addEventListener('click', () => void exportBackupToFile());

const importInput = document.createElement('input');
importInput.type = 'file';
importInput.accept = 'application/json,.json';
importInput.style.display = 'none';
document.body.appendChild(importInput);
must<HTMLButtonElement>('btn-import').addEventListener('click', () => importInput.click());
importInput.addEventListener('change', async () => {
  const file = importInput.files?.[0];
  importInput.value = '';
  if (!file) return;
  if (await importBackupFromFile(file)) {
    await loadGroups();
    void renderUsage();
    // 列表刷新由存储变更监听统一驱动（IMPORT 已写入 db.danmaku/db.groups）
    toast('导入完成，列表已刷新');
  }
});

// Esc 退出批量模式（不保留选中态）
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.batchMode) exitBatch();
});

// ── 启动 ─────────────────────────────────────
// 存储变更监听：content script 右键收藏等外部写入触发列表自动刷新（保留筛选条件）。
// 面板自身增删改后不主动 loadList，统一由此驱动，避免重复加载。
const storageWatcher = createStorageWatcher({
  subscribe(fn) {
    chrome.storage.onChanged.addListener(fn);
    return () => chrome.storage.onChanged.removeListener(fn);
  },
  keys: [STORAGE_KEYS.danmaku, STORAGE_KEYS.groups],
  async onChange() {
    // 保留分组/关键词/排序/页码状态，仅重拉数据（技术方案 V0.2 5.2）
    await loadGroups();
    await loadList();
  },
});
storageWatcher.mount();

async function init(): Promise<void> {
  void sendMessage(MESSAGES.PANEL_OPENED);
  // 面板打开即预查站点状态：非直播间/适配失效时「回填」预先置灰（原型 3.4.1）
  const site = await sendMessage<{ tabId: number | null; site: string | null; status: string }>(
    MESSAGES.GET_SITE_STATE,
  );
  if (site.ok && site.data) state.siteStatus = site.data.status;
  const settings = await sendMessage<{
    settings: { fillMode: 'replace' | 'append'; last_selected_group: string | null };
  }>(MESSAGES.GET_SETTINGS);
  if (settings.ok && settings.data) {
    state.fillMode = settings.data.settings.fillMode;
    const saved = settings.data.settings.last_selected_group;
    if (saved) state.selectedGroupId = saved;
  }
  await loadGroups();
  await loadList();
  void renderUsage();
}

// 面板关闭上报（生命周期钩子）
window.addEventListener('pagehide', () => void sendMessage(MESSAGES.PANEL_CLOSED));

void init();
