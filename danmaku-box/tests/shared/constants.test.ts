import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MESSAGES,
  STORAGE_KEYS,
  ERROR_CODES,
  DEFAULT_GROUP_ID,
  DANMAKU_MAX_LENGTH,
  GROUP_NAME_MAX_LENGTH,
  GROUP_LIMIT,
  LIST_PAGE_SIZE,
  DIAG_LOG_LIMIT,
  SCHEMA_VERSION,
} from '../../src/shared/constants.ts';

// 常量契约测试：值必须与技术方案 V0.2 第 5.2 节消息协议、6.3 节存储 key、
// 6.2 节实体约束、PRD V1.2 字段规则完全一致。

describe('消息协议常量（技术方案 5.2）', () => {
  it('包含全部 22 个消息名且值稳定', () => {
    assert.deepStrictEqual(MESSAGES, {
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
    });
  });
});

describe('存储 key 常量（技术方案 6.3）', () => {
  it('包含 5 个存储 key 且值稳定', () => {
    assert.deepStrictEqual(STORAGE_KEYS, {
      danmaku: 'db.danmaku',
      groups: 'db.groups',
      settings: 'db.settings',
      diagLogs: 'diag.logs',
      schemaVersion: 'meta.schemaVersion',
    });
  });
});

describe('错误码常量（技术方案 5.2）', () => {
  it('包含全部 17 个稳定错误码', () => {
    assert.deepStrictEqual(ERROR_CODES, {
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
    });
  });
});

describe('业务约束常量（技术方案 6.2 / PRD V1.2 字段规则）', () => {
  it('内置默认分组 id 固定为 g_default', () => {
    assert.equal(DEFAULT_GROUP_ID, 'g_default');
  });

  it('弹幕内容上限为 50 字符（斗鱼实测）', () => {
    assert.equal(DANMAKU_MAX_LENGTH, 50);
  });

  it('分组名上限为 12 字符', () => {
    assert.equal(GROUP_NAME_MAX_LENGTH, 12);
  });

  it('分组数量上限为 50 个（含内置）', () => {
    assert.equal(GROUP_LIMIT, 50);
  });

  it('列表分页每页 50 条', () => {
    assert.equal(LIST_PAGE_SIZE, 50);
  });

  it('诊断日志环形上限 200 条', () => {
    assert.equal(DIAG_LOG_LIMIT, 200);
  });

  it('备份文件数据结构版本号为 1', () => {
    assert.equal(SCHEMA_VERSION, 1);
  });
});
