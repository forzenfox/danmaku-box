import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFillText } from '../../src/content/build-fill-text.ts';

// 回填文本构建（PRD FR-04：替换/追加模式 + 超长截断；纯函数便于测试）。

describe('buildFillText', () => {
  it('替换模式：直接写入新内容', () => {
    const r = buildFillText({
      current: '旧内容',
      incoming: '666冲冲冲',
      mode: 'replace',
      maxLength: 50,
    });
    assert.deepEqual(r, { text: '666冲冲冲', truncated: false });
  });

  it('替换模式：超过上限截断并标记', () => {
    const incoming = 'x'.repeat(60);
    const r = buildFillText({ current: '', incoming, mode: 'replace', maxLength: 50 });
    assert.equal(r.text.length, 50);
    assert.equal(r.truncated, true);
  });

  it('追加模式：输入框为空时直接写入', () => {
    const r = buildFillText({ current: '', incoming: '666', mode: 'append', maxLength: 50 });
    assert.deepEqual(r, { text: '666', truncated: false });
  });

  it('追加模式：以空格衔接已有内容', () => {
    const r = buildFillText({
      current: '生日快乐',
      incoming: '666',
      mode: 'append',
      maxLength: 50,
    });
    assert.equal(r.text, '生日快乐 666');
    assert.equal(r.truncated, false);
  });

  it('追加模式：拼接后超上限截断并标记', () => {
    const r = buildFillText({
      current: 'x'.repeat(48),
      incoming: 'yyyyy',
      mode: 'append',
      maxLength: 50,
    });
    assert.equal(r.text.length, 50);
    assert.equal(r.truncated, true);
  });

  it('恰好等于上限不标记截断', () => {
    const r = buildFillText({
      current: '',
      incoming: 'x'.repeat(50),
      mode: 'replace',
      maxLength: 50,
    });
    assert.equal(r.truncated, false);
  });
});
