const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'channels.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'channels.css'), 'utf8');

test('编辑弹窗动态输入框复用统一浅色输入样式类', () => {
  const requiredClasses = [
    /class="inline-key-input\s+form-input\s+modal-inline-input"/,
    /class="inline-url-input\s+form-input\s+modal-inline-input"/,
    /class="redirect-from-input\s+form-input\s+modal-inline-input"/,
    /class="redirect-to-input\s+form-input\s+modal-inline-input"/
  ];

  requiredClasses.forEach((pattern) => {
    assert.match(html, pattern);
  });
});

test('统一浅色输入样式显式锁定文字颜色和配色方案', () => {
  const styleBlockMatch = css.match(/\.modal-inline-input\s*\{[^}]+\}/);
  assert.ok(styleBlockMatch, '缺少 .modal-inline-input 样式');

  const styleBlock = styleBlockMatch[0];
  assert.match(styleBlock, /color:\s*var\(--neutral-900\)/);
  assert.match(styleBlock, /color-scheme:\s*light/);
});

test('测试渠道模型下拉显式锁定文字颜色和浅色控件配色', () => {
  const styleBlockMatch = css.match(/\.model-select\s*\{[^}]+\}/);
  assert.ok(styleBlockMatch, '缺少 .model-select 样式');

  const styleBlock = styleBlockMatch[0];
  assert.match(styleBlock, /color:\s*var\(--neutral-900\)/);
  assert.match(styleBlock, /color-scheme:\s*light/);
});
