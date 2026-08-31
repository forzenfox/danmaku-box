// 设置页入口（M9 设置 / M8 备份 / M10 诊断的 UI 装配，P6 里程碑，原型 3.5）。
import '../shared/backup-ui.css';
import './settings.css';
import { MESSAGES } from '../shared/constants.ts';
import { sendMessage } from '../shared/messaging.ts';
import {
  clearAllLibrary,
  downloadJson,
  exportBackupToFile,
  importBackupFromFile,
} from '../shared/backup-ui.ts';

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`设置页结构缺失：#${id}`);
  return node as T;
}

async function loadSettings(): Promise<void> {
  const r = await sendMessage<{
    settings: {
      fillMode: string;
      fillAfterBehavior: string;
      chatContextMenuEnabled: boolean;
    };
  }>(MESSAGES.GET_SETTINGS);
  if (!r.ok || !r.data) return;
  const s = r.data.settings;
  const mode = document.querySelector<HTMLInputElement>(
    `input[name="fillMode"][value="${s.fillMode}"]`,
  );
  if (mode) mode.checked = true;
  const behavior = document.querySelector<HTMLInputElement>(
    `input[name="fillAfterBehavior"][value="${s.fillAfterBehavior}"]`,
  );
  if (behavior) behavior.checked = true;
  el<HTMLInputElement>('chat-context-menu').checked = s.chatContextMenuEnabled;
}

async function savePatch(patch: Record<string, unknown>): Promise<void> {
  await sendMessage(MESSAGES.SAVE_SETTINGS, { patch });
}

async function loadUsage(): Promise<void> {
  try {
    const used = await chrome.storage.local.getBytesInUse(null);
    const quota = chrome.storage.local.QUOTA_BYTES ?? 10 * 1024 * 1024;
    const usage = el('usage');
    const ratio = used / quota;
    usage.textContent = `${fmtBytes(used)} / ${fmtBytes(quota)}（${Math.round(ratio * 100)}%）`;
    if (ratio >= 0.8) usage.classList.add('usage-warn');
  } catch {
    el('usage').textContent = '—';
  }
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

async function init(): Promise<void> {
  await loadSettings();
  void loadUsage();

  // 回填模式 / 回填后行为 / 右键开关
  document.querySelectorAll<HTMLInputElement>('input[name="fillMode"]').forEach((input) => {
    input.addEventListener('change', () => void savePatch({ fillMode: input.value }));
  });
  document
    .querySelectorAll<HTMLInputElement>('input[name="fillAfterBehavior"]')
    .forEach((input) => {
      input.addEventListener('change', () => void savePatch({ fillAfterBehavior: input.value }));
    });
  el<HTMLInputElement>('chat-context-menu').addEventListener('change', (e) => {
    void savePatch({ chatContextMenuEnabled: (e.target as HTMLInputElement).checked });
  });

  // 数据管理
  el('btn-export').addEventListener('click', () => void exportBackupToFile());

  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = 'application/json,.json';
  importInput.style.display = 'none';
  document.body.appendChild(importInput);
  el('btn-import').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    importInput.value = '';
    if (!file) return;
    if (await importBackupFromFile(file)) void loadUsage();
  });

  // 诊断信息导出（M10：本地日志 + 版本 + 用量，不上报）
  el('btn-diag').addEventListener('click', async () => {
    const r = await sendMessage<{
      diagnostics: {
        version: string;
        logs: Array<{ ts: string; level: string; module: string; message: string }>;
        storage: { used: number; quota: number };
      };
    }>(MESSAGES.GET_DIAG);
    if (r.ok && r.data) {
      downloadJson('danmaku-box-diagnostics.json', r.data.diagnostics);
    }
  });

  // 危险操作：清空全部数据（二次确认 + 自动临时备份 + 覆盖空库）
  el('btn-clear').addEventListener('click', async () => {
    if (await clearAllLibrary()) void loadUsage();
  });
}

void init();
