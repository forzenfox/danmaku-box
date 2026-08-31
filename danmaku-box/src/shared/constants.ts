// 全局常量：值与技术方案 V0.2 第 5.2 节消息协议、6.3 节存储 key、
// 6.2 节实体约束一一对应，改动前必须同步技术方案与测试。

/** 消息协议消息名（技术方案 5.2，共 22 个） */
export const MESSAGES = {
  CS_READY: 'CS_READY',
  GET_MENU_CONTEXT: 'GET_MENU_CONTEXT',
  COLLECT_DANMAKU: 'COLLECT_DANMAKU',
  LIST_DANMAKU: 'LIST_DANMAKU',
  GET_GROUPS: 'GET_GROUPS',
  CREATE_GROUP: 'CREATE_GROUP',
  RENAME_GROUP: 'RENAME_GROUP',
  DELETE_GROUP: 'DELETE_GROUP',
  REORDER_GROUPS: 'REORDER_GROUPS',
  CREATE_DANMAKU: 'CREATE_DANMAKU',
  UPDATE_DANMAKU: 'UPDATE_DANMAKU',
  DELETE_DANMAKU: 'DELETE_DANMAKU',
  MOVE_DANMAKU: 'MOVE_DANMAKU',
  FILL_REQUEST: 'FILL_REQUEST',
  FILL_ACTION: 'FILL_ACTION',
  GET_SITE_STATE: 'GET_SITE_STATE',
  GET_SETTINGS: 'GET_SETTINGS',
  SAVE_SETTINGS: 'SAVE_SETTINGS',
  EXPORT_BACKUP: 'EXPORT_BACKUP',
  IMPORT_BACKUP: 'IMPORT_BACKUP',
  GET_DIAG: 'GET_DIAG',
  PANEL_OPENED: 'PANEL_OPENED',
  PANEL_CLOSED: 'PANEL_CLOSED',
} as const;

/** 存储 key（技术方案 6.3，共 5 个） */
export const STORAGE_KEYS = {
  danmaku: 'db.danmaku',
  groups: 'db.groups',
  settings: 'db.settings',
  diagLogs: 'diag.logs',
  schemaVersion: 'meta.schemaVersion',
} as const;

/** 稳定错误码（技术方案 5.2，共 17 个） */
export const ERROR_CODES = {
  STORAGE_FULL: 'STORAGE_FULL',
  INVALID_CONTENT: 'INVALID_CONTENT',
  READ_FAILED: 'READ_FAILED',
  WRITE_FAILED: 'WRITE_FAILED',
  NAME_EXISTS: 'NAME_EXISTS',
  NAME_INVALID: 'NAME_INVALID',
  GROUP_LIMIT: 'GROUP_LIMIT',
  BUILTIN_GROUP: 'BUILTIN_GROUP',
  NOT_FOUND: 'NOT_FOUND',
  NO_ACTIVE_TAB: 'NO_ACTIVE_TAB',
  SITE_UNSUPPORTED: 'SITE_UNSUPPORTED',
  ADAPTER_DOWN: 'ADAPTER_DOWN',
  NOT_LOGGED_IN: 'NOT_LOGGED_IN',
  NO_INPUT: 'NO_INPUT',
  DELIVERY_FAILED: 'DELIVERY_FAILED',
  BAD_FORMAT: 'BAD_FORMAT',
  MIGRATE_FAILED: 'MIGRATE_FAILED',
} as const;

/** 内置默认分组 id（不可删除、不可重命名） */
export const DEFAULT_GROUP_ID = 'g_default';

/** 弹幕内容上限（斗鱼输入框实测 maxlength=50） */
export const DANMAKU_MAX_LENGTH = 50;

/** 分组名上限 */
export const GROUP_NAME_MAX_LENGTH = 12;

/** 分组数量上限（含内置默认分组） */
export const GROUP_LIMIT = 50;

/** 弹幕库列表分页大小 */
export const LIST_PAGE_SIZE = 50;

/** 诊断日志环形缓冲上限 */
export const DIAG_LOG_LIMIT = 200;

/** 备份文件数据结构版本号 */
export const SCHEMA_VERSION = 1;
