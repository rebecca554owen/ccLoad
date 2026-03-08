// ==================== 渠道排序功能 ====================
// 拖拽排序实现,优先级相差10

// 渠道类型颜色配置
const CHANNEL_TYPE_COLORS = {
  anthropic: '#3b82f6',
  openai: '#10b981',
  azure: '#0ea5e9',
  bedrock: '#f59e0b',
  vertex: '#8b5cf6',
  openrouter: '#ec4899',
  cohere: '#06b6d4',
  groq: '#f97316',
  deepseek: '#6366f1',
  qwen: '#14b8a6',
  zhipu: '#a855f7',
  baidu: '#3b82f6',
  ollama: '#84cc16',
  custom: '#6b7280'
};

// 优先级步长常量
const PRIORITY_STEP = 10;

let sortChannels = []; // 存储排序中的渠道列表
let draggedItem = null; // 当前拖拽的元素

// 打开排序模态框
function showSortModal() {
  const modal = document.getElementById('sortModal');
  if (!modal) return;

  // 获取当前渠道列表(使用筛选后的渠道)
  const sourceChannels = filteredChannels.length > 0 ? filteredChannels : channels;

  if (!sourceChannels || sourceChannels.length === 0) {
    window.showError(window.t('channels.loadChannelsFailed'));
    return;
  }

  // 复制渠道列表并按优先级排序(从高到低)
  sortChannels = [...sourceChannels].sort((a, b) => {
    // 优先级从高到低
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    // 优先级相同时按ID排序
    return a.id - b.id;
  });

  // 渲染排序列表
  renderSortList();

  // 显示模态框(使用show类实现居中)
  modal.classList.add('show');
}

// 关闭排序模态框
function closeSortModal() {
  const modal = document.getElementById('sortModal');
  if (modal) {
    modal.classList.remove('show');
  }
  sortChannels = [];
  draggedItem = null;
}

// 渲染排序列表
function renderSortList() {
  const container = document.getElementById('sortListContainer');
  if (!container) return;

  container.innerHTML = '';

  if (sortChannels.length === 0) {
    container.innerHTML = `<p style="text-align: center; color: var(--neutral-500); padding: 40px;">${window.t('channels.noChannelsForSort')}</p>`;
    return;
  }

  sortChannels.forEach((channel, index) => {
    const item = createSortItem(channel, index);
    container.appendChild(item);
  });

  // 添加拖拽事件监听
  attachDragListeners();

  // Translate dynamically rendered elements
  if (window.i18n && window.i18n.translatePage) {
    window.i18n.translatePage();
  }
}

// 状态徽章样式映射
const STATUS_BADGE_STYLES = {
  disabled: { bg: 'var(--neutral-200)', color: 'var(--neutral-600)', i18nKey: 'channels.statusDisabled' },
  cooldown: { bg: 'var(--error-100)', color: 'var(--error-600)', i18nKey: 'channels.cooldownStatus' },
  normal: { bg: 'var(--success-100)', color: 'var(--success-600)', i18nKey: 'channels.statusNormal' }
};

// 创建状态徽章
function createStatusBadge(style) {
  return `<span style="background: ${style.bg}; color: ${style.color}; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 500;">${window.t(style.i18nKey)}</span>`;
}

// 获取渠道状态徽章
function getStatusBadge(channel) {
  if (!channel.enabled) {
    return createStatusBadge(STATUS_BADGE_STYLES.disabled);
  }
  if (channel.cooldown_until && new Date(channel.cooldown_until) > new Date()) {
    return createStatusBadge(STATUS_BADGE_STYLES.cooldown);
  }
  return createStatusBadge(STATUS_BADGE_STYLES.normal);
}

// 渲染模板（通用函数）
function renderTemplate(templateId, replacements) {
  const template = document.getElementById(templateId);
  if (!template) return '';

  let html = template.innerHTML;
  for (const [key, value] of Object.entries(replacements)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    html = html.replace(regex, value);
  }
  return html;
}

// 创建排序卡片
function createSortItem(channel, index) {
  const html = renderTemplate('tpl-sort-item', {
    id: channel.id,
    name: escapeHtml(channel.name),
    priority: channel.priority,
    statusBadge: getStatusBadge(channel)
  });

  const div = document.createElement('div');
  div.innerHTML = html;
  const item = div.firstElementChild;

  // 设置索引属性用于拖拽
  item.dataset.index = index;

  return item;
}

// 获取渠道类型颜色
function getChannelTypeColor(type) {
  return CHANNEL_TYPE_COLORS[type.toLowerCase()] || CHANNEL_TYPE_COLORS.custom;
}

// 添加拖拽事件监听
function attachDragListeners() {
  const items = document.querySelectorAll('.sort-item');

  items.forEach(item => {
    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragend', handleDragEnd);
    item.addEventListener('dragover', handleDragOver);
    item.addEventListener('dragenter', handleDragEnter);
    item.addEventListener('dragleave', handleDragLeave);
    item.addEventListener('drop', handleDrop);
  });
}

// 拖拽开始
function handleDragStart(e) {
  draggedItem = this;
  this.style.opacity = '0.5';
  e.dataTransfer.effectAllowed = 'move';
}

// 清除所有拖拽样式
function clearDragStyles() {
  document.querySelectorAll('.sort-item').forEach(item => {
    item.style.borderTop = '';
    item.style.borderBottom = '';
  });
}

// 设置拖拽插入指示器
function setDragInsertIndicator(item, position) {
  if (position === 'top') {
    item.style.borderTop = '2px solid var(--primary-500)';
    item.style.borderBottom = '';
  } else {
    item.style.borderTop = '';
    item.style.borderBottom = '2px solid var(--primary-500)';
  }
}

// 拖拽结束
function handleDragEnd(e) {
  this.style.opacity = '1';
  clearDragStyles();
  draggedItem = null;
}

// 拖拽经过
function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  e.dataTransfer.dropEffect = 'move';
  return false;
}

// 拖拽进入
function handleDragEnter(e) {
  if (this === draggedItem) return;

  // 显示插入位置提示
  const rect = this.getBoundingClientRect();
  const midpoint = rect.top + rect.height / 2;
  setDragInsertIndicator(this, e.clientY < midpoint ? 'top' : 'bottom');
}

// 拖拽离开
function handleDragLeave(e) {
  clearDragStyles();
}

// 放置
function handleDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }

  if (this === draggedItem) return false;

  const draggedIndex = parseInt(draggedItem.dataset.index);
  const targetIndex = parseInt(this.dataset.index);

  if (draggedIndex === targetIndex) return false;

  // 计算插入位置
  const rect = this.getBoundingClientRect();
  const midpoint = rect.top + rect.height / 2;
  const insertBefore = e.clientY < midpoint;

  // 更新数组顺序
  const draggedChannel = sortChannels[draggedIndex];
  sortChannels.splice(draggedIndex, 1);

  // 简化插入位置计算
  let newIndex = targetIndex;
  if (draggedIndex < targetIndex) {
    newIndex = insertBefore ? targetIndex - 1 : targetIndex;
  } else {
    newIndex = insertBefore ? targetIndex : targetIndex + 1;
  }

  sortChannels.splice(newIndex, 0, draggedChannel);

  // 重新渲染
  renderSortList();

  return false;
}

// 保存排序
async function saveSortOrder() {
  if (sortChannels.length === 0) {
    window.showNotification(window.t('channels.sortNoChanges'), 'warning');
    return;
  }

  // 计算新的优先级(从高到低,相差PRIORITY_STEP)
  const updates = sortChannels.map((channel, index) => ({
    id: channel.id,
    priority: (sortChannels.length - index) * PRIORITY_STEP
  }));

  try {
    const result = await fetchDataWithAuth('/admin/channels/batch-priority', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ updates })
    });

    window.showSuccess(window.t('channels.sortSaveSuccess'));
    closeSortModal();
    if (typeof clearChannelsCache === 'function') clearChannelsCache();
    const currentType = (filters && filters.channelType) ? filters.channelType : 'all';
    if (typeof loadChannels === 'function') await loadChannels(currentType);
  } catch (error) {
    console.error('Save sort order failed:', error);
    window.showError(error.message || window.t('channels.sortSaveFailed'));
  }
}

// 初始化排序按钮事件
document.addEventListener('DOMContentLoaded', function() {
  const sortBtn = document.getElementById('btn_sort');
  if (sortBtn) {
    sortBtn.addEventListener('click', showSortModal);
  }

  // 点击模态框背景关闭
  const sortModal = document.getElementById('sortModal');
  if (sortModal) {
    sortModal.addEventListener('click', function(e) {
      if (e.target === sortModal) {
        closeSortModal();
      }
    });
  }
});
