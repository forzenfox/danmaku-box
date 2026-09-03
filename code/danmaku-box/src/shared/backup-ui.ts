// 共享备份 UI 助手（面板与设置页共用；P6 里程碑）。
// 文件下载经 Blob + <a download>（不申请 downloads 权限，技术方案 9.2）；
// 冲突策略弹窗与导入汇总使用自绘模态（原型设计 V0.2 3.5）。

import { MESSAGES, SCHEMA_VERSION } from './constants.ts';
import { sendMessage } from './messaging.ts';
import { mergeLibrary, parseBackup, type BackupFile } from '../background/backup.ts';

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function today(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

/** 通用模态：返回所点按钮的 value；关闭遮罩返回 null */
export function showModal(options: {
  title: string;
  content?: HTMLElement;
  buttons: Array<{ text: string; value: string; primary?: boolean; danger?: boolean }>;
}): Promise<string | null> {
  return new Promise((resolve) => {
    const prev = document.documentElement.querySelector('.dk-modal-mask');
    prev?.remove();
    const mask = document.createElement('div');
    mask.className = 'dk-modal-mask';
    const modal = document.createElement('div');
    modal.className = 'dk-modal';
    const title = document.createElement('h3');
    title.textContent = options.title;
    modal.appendChild(title);
    if (options.content) modal.appendChild(options.content);
    const actions = document.createElement('div');
    actions.className = 'dk-modal-actions';
    for (const btn of options.buttons) {
      const el = document.createElement('button');
      el.type = 'button';
      el.textContent = btn.text;
      el.className = `dk-btn${btn.primary ? ' dk-btn-primary' : ''}${btn.danger ? ' dk-btn-danger' : ''}`;
      el.addEventListener('click', () => {
        mask.remove();
        resolve(btn.value);
      });
      actions.appendChild(el);
    }
    modal.appendChild(actions);
    mask.appendChild(modal);
    mask.addEventListener('click', (e) => {
      if (e.target === mask) {
        mask.remove();
        resolve(null);
      }
    });
    document.documentElement.appendChild(mask);
  });
}

/** 导出备份并触发下载；返回是否成功 */
export async function exportBackupToFile(label = '备份'): Promise<boolean> {
  const r = await sendMessage<{ backup: BackupFile }>(MESSAGES.EXPORT_BACKUP);
  if (!r.ok || !r.data) {
    await showModal({
      title: '导出失败',
      buttons: [{ text: '知道了', value: 'ok', primary: true }],
    });
    return false;
  }
  downloadJson(`danmaku-box-${label}-${today()}.json`, r.data.backup);
  return true;
}

/** 导入恢复全流程：校验 → 冲突策略弹窗 → （覆盖时先下载临时备份）→ 执行 → 汇总 */
export async function importBackupFromFile(file: File): Promise<boolean> {
  const text = await file.text();
  let backup: BackupFile;
  try {
    backup = parseBackup(text);
  } catch {
    await showModal({
      title: '文件格式不正确',
      content: buildText('请使用本产品导出的备份文件。'),
      buttons: [{ text: '知道了', value: 'ok', primary: true }],
    });
    return false;
  }

  // 预演合并，计算重复条数（当前库全量经 EXPORT_BACKUP 取得）
  const current = await sendMessage<{ backup: BackupFile }>(MESSAGES.EXPORT_BACKUP);
  if (!current.ok || !current.data) {
    await showModal({
      title: '读取当前库失败',
      buttons: [{ text: '知道了', value: 'ok', primary: true }],
    });
    return false;
  }
  const preview = mergeLibrary(
    { groups: current.data.backup.groups, danmaku: current.data.backup.danmaku },
    { groups: backup.groups, danmaku: backup.danmaku },
  );

  // 冲突策略弹窗（原型 3.5：合并/覆盖单选，默认合并）
  const radioWrap = document.createElement('div');
  radioWrap.className = 'dk-radio-group';
  const mergeRadio = buildRadio(
    'strategy',
    'merge',
    `合并：跳过重复弹幕，同名分组按名称合并`,
    true,
  );
  const overwriteRadio = buildRadio(
    'strategy',
    'overwrite',
    '覆盖：以备份文件为准替换当前库（执行前自动下载当前库临时备份）',
    false,
  );
  radioWrap.appendChild(mergeRadio);
  radioWrap.appendChild(overwriteRadio);
  const intro = buildText(`检测到备份文件中有 ${preview.skipped} 条弹幕与当前库内容重复。`);
  const wrap = document.createElement('div');
  wrap.appendChild(intro);
  wrap.appendChild(radioWrap);

  const choice = await showModal({
    title: '导入恢复',
    content: wrap,
    buttons: [
      { text: '取消', value: 'cancel' },
      { text: '执行', value: 'run', primary: true },
    ],
  });
  if (choice !== 'run') return false;

  const strategy = overwriteRadio.querySelector('input')!.checked ? 'overwrite' : 'merge';
  if (strategy === 'overwrite') {
    // 覆盖前自动下载当前库临时备份（PRD FR-05 可挽回要求）
    downloadJson(`danmaku-box-临时备份-${today()}.json`, current.data.backup);
  }

  const r = await sendMessage<{ added: number; skipped: number; mergedGroups: number }>(
    MESSAGES.IMPORT_BACKUP,
    { backup, strategy },
  );
  if (r.ok && r.data) {
    await showModal({
      title: '导入完成',
      content: buildText(
        `新增 ${r.data.added} 条、跳过 ${r.data.skipped} 条` +
          (r.data.mergedGroups > 0 ? `，合并同名分组 ${r.data.mergedGroups} 个` : ''),
      ),
      buttons: [{ text: '知道了', value: 'ok', primary: true }],
    });
    return true;
  }
  await showModal({
    title: '导入失败',
    content: buildText(r.error?.message ?? '请稍后重试'),
    buttons: [{ text: '知道了', value: 'ok', primary: true }],
  });
  return false;
}

/** 清空全部数据（设置页危险区）：二次确认 → 自动下载临时备份 → 覆盖空库 */
export async function clearAllLibrary(): Promise<boolean> {
  const body = buildText(
    '将删除全部弹幕与分组，且不可恢复。执行前会自动下载当前库的临时备份文件。',
  );
  const choice = await showModal({
    title: '清空全部数据？',
    content: body,
    buttons: [
      { text: '取消', value: 'cancel' },
      { text: '清空', value: 'run', danger: true },
    ],
  });
  if (choice !== 'run') return false;

  // 先自动下载当前库临时备份（PRD FR-05 / 原型 3.5）
  await exportBackupToFile('清空前临时备份');

  const r = await sendMessage(MESSAGES.IMPORT_BACKUP, {
    backup: { version: SCHEMA_VERSION, danmaku: [], groups: [] },
    strategy: 'overwrite',
  });
  return r.ok;
}

function buildText(text: string): HTMLElement {
  const el = document.createElement('p');
  el.className = 'dk-modal-text';
  el.textContent = text;
  return el;
}

/**
 * 构造单选项：返回整体 label（含 input[type=radio] + 文本 span，外层 .dk-radio 负责样式）。
 * 注意必须返回 label 而非 input——若只返回 input，label 与文本 span 游离于 DOM 外被丢弃，
 * 弹框将只见空圆圈、不见选项文字（2026-09-03 实测漏洞）。
 */
export function buildRadio(
  name: string,
  value: string,
  label: string,
  checked: boolean,
): HTMLLabelElement {
  const labelEl = document.createElement('label');
  labelEl.className = 'dk-radio';
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = name;
  input.value = value;
  input.checked = checked;
  // 显式 class 便于 CSS 命中；color/font-size 继承 .dk-radio，防止外部 reset 隐藏
  const span = document.createElement('span');
  span.className = 'dk-radio-label';
  span.textContent = label;
  labelEl.appendChild(input);
  labelEl.appendChild(span);
  return labelEl;
}
