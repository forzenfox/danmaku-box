// M3 右键收藏 ContextMenuController（技术方案 V0.2 4.M3 / P3 里程碑，原型设计 V0.2 3.1）。
// 职责：在页面内渲染自定义右键菜单并上报收藏命令。
// 边界：不直接访问存储；不做回填；不包含业务校验。
// UI 经 Shadow DOM 挂载，与直播页面样式完全隔离（融入而非改造）。

import { GROUP_NAME_MAX_LENGTH, MESSAGES } from '../shared/constants.ts';
import { sendMessage } from '../shared/messaging.ts';
import type { MenuGroup } from '../background/danmaku-store.ts';
import type { SiteAdapter } from './adapters/types.ts';
import { computeMenuPosition } from './menu-position.ts';

export interface ContextMenuControllerDeps {
  adapter: SiteAdapter;
}

const MENU_Z_INDEX = 2147483600; // 高于站方悬浮工具条（P5 遮挡处理依据）

const MENU_STYLES = `
  :host { all: initial; }
  .ctx-menu {
    position: fixed; z-index: ${MENU_Z_INDEX};
    background: #fff; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,.14);
    min-width: 168px; max-width: 280px; padding: 6px 0;
    font: 13px/1.4 system-ui, -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif;
    color: #1f2329; cursor: default;
  }
  .ctx-head { padding: 6px 14px 4px; font-size: 11px; color: #86909c; }
  .ctx-item { padding: 7px 14px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .ctx-item:hover { background: #f2f3f5; }
  .ctx-item .ctx-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ctx-item .ctx-mark { color: #00b42a; font-size: 11px; flex-shrink: 0; }
  .ctx-item.disabled { color: #c9cdd4; cursor: not-allowed; }
  .ctx-item.disabled:hover { background: none; }
  .ctx-sep { height: 1px; background: #e5e6eb; margin: 4px 0; }
  .ctx-input {
    width: calc(100% - 28px); margin: 4px 14px; padding: 5px 8px;
    border: 1px solid #1652f0; border-radius: 4px; font-size: 13px; outline: none;
  }
  .ctx-toast {
    position: fixed; top: 16px; right: 16px; z-index: ${MENU_Z_INDEX};
    background: #fff; border: 1px solid #b7f0c5; color: #00b42a;
    border-radius: 4px; padding: 6px 12px; font: 12px/1.4 system-ui, sans-serif;
    box-shadow: 0 2px 8px rgba(0,0,0,.08); animation: ctx-toast-in .15s ease-out;
  }
  .ctx-toast.warn { border-color: #ffe4ba; color: #ff7d00; }
  @keyframes ctx-toast-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
`;

export interface ContextMenuController {
  mount(): void;
}

export function createContextMenuController(
  deps: ContextMenuControllerDeps,
): ContextMenuController {
  const { adapter } = deps;

  let shadow: ShadowRoot | null = null;
  let menuEl: HTMLElement | null = null;
  let toastEl: HTMLElement | null = null;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let contextEnabled = true; // 设置「聊天区右键收藏」开关缓存（chrome.storage.onChanged 同步）
  let currentText = '';
  let currentHasRich = false;

  function ensureShadow(): ShadowRoot {
    if (shadow) return shadow;
    const host = document.createElement('div');
    host.dataset.danmakuBox = 'root';
    document.documentElement.appendChild(host);
    shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = MENU_STYLES;
    shadow.appendChild(style);
    return shadow;
  }

  function showToast(text: string, warn = false): void {
    const root = ensureShadow();
    toastEl?.remove();
    toastEl = document.createElement('div');
    toastEl.className = warn ? 'ctx-toast warn' : 'ctx-toast';
    toastEl.textContent = text;
    root.appendChild(toastEl);
    setTimeout(() => {
      toastEl?.remove();
      toastEl = null;
    }, 2000);
  }

  function closeMenu(): void {
    clearTimeout(closeTimer);
    if (menuEl) {
      menuEl.remove();
      menuEl = null;
    }
    document.removeEventListener('mousedown', onDocMouseDown, true);
    document.removeEventListener('keydown', onDocKeyDown, true);
    adapter.resumeDanmu();
  }

  function onDocMouseDown(e: MouseEvent): void {
    if (menuEl && e.composedPath().includes(menuEl)) return;
    closeMenu();
  }

  function onDocKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') closeMenu();
  }

  async function collectTo(groupId: string, groupName: string): Promise<void> {
    const r = await sendMessage<{ id: string; duplicate: boolean }>(MESSAGES.COLLECT_DANMAKU, {
      content: currentText,
      groupId,
      platform: adapter.site,
      room: adapter.getRoomId(),
    });
    if (r.ok && r.data) {
      if (!r.data.duplicate) {
        // 富内容弹幕：toast 注明已忽略表情/图片（FR-01 边界）
        showToast(
          currentHasRich
            ? `已收藏到「${groupName}」（已忽略表情/图片）`
            : `已收藏到「${groupName}」`,
        );
      }
      // 已收藏的分组点击不重复写入，且不再弹成功 toast（原型 D1）
    } else {
      showToast(
        r.error?.code === 'STORAGE_FULL' ? '存储空间不足，收藏未成功' : '收藏失败，请重试',
        true,
      );
    }
    closeMenu();
  }

  async function collectToNewGroup(rawName: string): Promise<void> {
    const name = rawName.trim();
    if (name.length < 1 || name.length > GROUP_NAME_MAX_LENGTH) {
      showToast(`分组名须为 1-${GROUP_NAME_MAX_LENGTH} 字`, true);
      return;
    }
    const created = await sendMessage<{ group: { id: string; name: string } }>(
      MESSAGES.CREATE_GROUP,
      {
        name,
      },
    );
    if (created.ok && created.data) {
      await collectTo(created.data.group.id, created.data.group.name);
    } else {
      showToast(created.error?.code === 'NAME_EXISTS' ? '分组名已存在' : '新建分组失败', true);
    }
  }

  function renderNewGroupInput(): void {
    if (!menuEl) return;
    menuEl.replaceChildren();
    const head = document.createElement('div');
    head.className = 'ctx-head';
    head.textContent = '新分组名（回车确认，Esc 取消）';
    const input = document.createElement('input');
    input.className = 'ctx-input';
    input.maxLength = GROUP_NAME_MAX_LENGTH;
    input.placeholder = `1-${GROUP_NAME_MAX_LENGTH} 字`;
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') void collectToNewGroup(input.value);
      if (e.key === 'Escape') closeMenu();
    });
    menuEl.appendChild(head);
    menuEl.appendChild(input);
    input.focus();
  }

  function renderMenu(x: number, y: number, groups: MenuGroup[]): void {
    const root = ensureShadow();
    closeMenu();

    menuEl = document.createElement('div');
    menuEl.className = 'ctx-menu';

    const head = document.createElement('div');
    head.className = 'ctx-head';
    head.textContent = '收藏到 ▸';
    menuEl.appendChild(head);

    for (const g of groups) {
      const item = document.createElement('div');
      item.className = 'ctx-item';
      const name = document.createElement('span');
      name.className = 'ctx-name';
      name.textContent = g.builtin ? g.name : g.name;
      item.appendChild(name);
      if (g.hasThisContent) {
        const mark = document.createElement('span');
        mark.className = 'ctx-mark';
        mark.textContent = '✓ 已收藏';
        item.appendChild(mark);
      }
      item.addEventListener('click', () => void collectTo(g.id, g.name));
      menuEl.appendChild(item);
    }

    const sep = document.createElement('div');
    sep.className = 'ctx-sep';
    menuEl.appendChild(sep);

    const newGroup = document.createElement('div');
    newGroup.className = 'ctx-item';
    newGroup.textContent = '＋ 收藏到新分组';
    newGroup.addEventListener('click', renderNewGroupInput);
    menuEl.appendChild(newGroup);

    const copy = document.createElement('div');
    copy.className = `ctx-item${currentText === '' ? ' disabled' : ''}`;
    copy.textContent = '⧉ 复制弹幕文本';
    if (currentText === '') {
      copy.title = '该弹幕无文本内容，无法复制';
    } else {
      copy.addEventListener('click', () => {
        void navigator.clipboard
          .writeText(currentText)
          .then(() => showToast('已复制'))
          .catch(() => showToast('复制失败', true))
          .finally(() => closeMenu());
      });
    }
    menuEl.appendChild(copy);

    root.appendChild(menuEl);

    // 定位：先渲染量取尺寸，再做视口避让（原型 3.1.2）
    const rect = menuEl.getBoundingClientRect();
    const pos = computeMenuPosition(
      x,
      y,
      { width: rect.width, height: rect.height },
      { width: window.innerWidth, height: window.innerHeight },
    );
    menuEl.style.left = `${pos.left}px`;
    menuEl.style.top = `${pos.top}px`;

    // 关闭条件：外部点击 / Esc / 移出 500ms（PRD FR-01）
    document.addEventListener('mousedown', onDocMouseDown, true);
    document.addEventListener('keydown', onDocKeyDown, true);
    menuEl.addEventListener('mouseleave', () => {
      clearTimeout(closeTimer);
      closeTimer = setTimeout(closeMenu, 500);
    });
    menuEl.addEventListener('mouseenter', () => clearTimeout(closeTimer));
  }

  async function onContextMenu(e: MouseEvent): Promise<void> {
    if (!contextEnabled) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    let item = adapter.findDanmakuItem(target);
    if (!item) {
      // 锁屏工具条（.Barrage-topFloater）遮挡弹幕时的坐标级命中兜底：
      // 从点击坐标的全部叠层元素中寻找弹幕条目，收藏能力不因工具条存在而失效（技术方案 8.2）
      for (const el of document.elementsFromPoint(e.clientX, e.clientY)) {
        const found = adapter.findDanmakuItem(el);
        if (found) {
          item = found;
          break;
        }
      }
    }
    if (!item) return; // 非弹幕区域：不拦截原生菜单

    e.preventDefault();
    const { text, hasRichContent } = adapter.extract(item);
    currentText = text;
    currentHasRich = hasRichContent;

    const r = await sendMessage<{ groups: MenuGroup[] }>(MESSAGES.GET_MENU_CONTEXT, {
      content: text,
    });
    if (!r.ok || !r.data) {
      showToast('本地数据读取失败', true);
      return;
    }
    adapter.pauseDanmu();
    renderMenu(e.clientX, e.clientY, r.data.groups);
  }

  // 设置同步：聊天区右键收藏开关（FR-01，chrome.storage.onChanged 实时生效）
  void chrome.storage.local.get('db.settings').then((bag) => {
    const settings = bag['db.settings'] as { chatContextMenuEnabled?: boolean } | undefined;
    if (settings && typeof settings.chatContextMenuEnabled === 'boolean') {
      contextEnabled = settings.chatContextMenuEnabled;
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes['db.settings']) return;
    const next = changes['db.settings'].newValue as
      { chatContextMenuEnabled?: boolean } | undefined;
    if (next && typeof next.chatContextMenuEnabled === 'boolean') {
      contextEnabled = next.chatContextMenuEnabled;
    }
  });

  return {
    mount(): void {
      document.addEventListener('contextmenu', (e) => void onContextMenu(e), true);
    },
  };
}
