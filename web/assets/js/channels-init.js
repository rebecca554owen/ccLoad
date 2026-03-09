// 高亮配置常量
const HIGHLIGHT_CONFIG = {
  DURATION: 1600,
  HASH_PATTERN: /^#channel-(\d+)$/
};

function highlightFromHash() {
  const m = (location.hash || '').match(HIGHLIGHT_CONFIG.HASH_PATTERN);
  if (!m) return;
  const el = document.getElementById(`channel-${m[1]}`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('channel-highlight');
  setTimeout(() => el.classList.remove('channel-highlight'), HIGHLIGHT_CONFIG.DURATION);
}

// 从URL参数获取目标渠道ID，查询其类型并返回
async function getTargetChannelType() {
  const params = new URLSearchParams(location.search);
  const channelId = params.get('id');
  if (!channelId) return null;

  try {
    const channel = await fetchDataWithAuth(`/admin/channels/${channelId}`);
    return channel.channel_type || 'anthropic';
  } catch (e) {
    console.error('Failed to get channel type:', e);
    return null;
  }
}

// localStorage key for channels page filters
const CHANNELS_FILTER_KEY = 'channels.filters';

// 重置筛选表单
function resetFilterForm() {
  document.getElementById('statusFilter').value = 'all';
  const modelFilterEl = document.getElementById('modelFilter');
  if (modelFilterEl) modelFilterEl.value = 'all';
  document.getElementById('searchInput').value = '';
  const clearBtn = document.getElementById('clearSearchBtn');
  if (clearBtn) clearBtn.style.opacity = '0';
}

// 从URL参数应用筛选
function applyFiltersFromUrl(urlChannelId) {
  filters.status = 'all';
  filters.model = 'all';
  filters.search = '';
  filters.id = urlChannelId;
  document.getElementById('idFilter').value = urlChannelId;
  resetFilterForm();
  saveChannelsFilters();
}

// 从localStorage应用筛选
function applyFiltersFromStorage(savedFilters) {
  filters.status = savedFilters.status || 'all';
  filters.model = savedFilters.model || 'all';
  filters.search = savedFilters.search || '';
  filters.id = savedFilters.id || '';
  document.getElementById('statusFilter').value = filters.status;
  document.getElementById('modelFilter').value = filters.model || 'all';
  document.getElementById('searchInput').value = filters.search;
  document.getElementById('idFilter').value = filters.id;
}

function saveChannelsFilters() {
  try {
    localStorage.setItem(CHANNELS_FILTER_KEY, JSON.stringify({
      channelType: filters.channelType,
      status: filters.status,
      model: filters.model,
      search: filters.search,
      id: filters.id
    }));
  } catch (_) {}
}

function loadChannelsFilters() {
  try {
    const saved = localStorage.getItem(CHANNELS_FILTER_KEY);
    if (saved) return JSON.parse(saved);
  } catch (_) {}
  return null;
}

function initChannelPageControls() {
  const bindings = [
    ['[data-action="show-add-channel-modal"]', 'click', showAddModal],
    ['[data-action="batch-enable-channels"]', 'click', batchEnableSelectedChannels],
    ['[data-action="batch-disable-channels"]', 'click', batchDisableSelectedChannels],
    ['[data-action="batch-refresh-merge"]', 'click', batchRefreshSelectedChannelsMerge],
    ['[data-action="batch-refresh-replace"]', 'click', batchRefreshSelectedChannelsReplace],
    ['[data-action="clear-selected-channels"]', 'click', clearSelectedChannels]
  ];

  bindings.forEach(([selector, eventName, handler]) => {
    const element = document.querySelector(selector);
    if (!element || element.dataset.bound) return;
    element.dataset.bound = 'true';
    element.addEventListener(eventName, handler);
  });

  const visibleSelectionCheckbox = document.getElementById('visibleSelectionCheckbox');
  if (visibleSelectionCheckbox && !visibleSelectionCheckbox.dataset.bound) {
    visibleSelectionCheckbox.dataset.bound = 'true';
    visibleSelectionCheckbox.addEventListener('change', toggleVisibleChannelsSelection);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Translate static elements first
  if (window.i18n && window.i18n.translatePage) {
    window.i18n.translatePage();
  }

  if (window.initTopbar) initTopbar('channels');
  initChannelPageControls();
  setupFilterListeners();
  setupImportExport();
  setupKeyImportPreview();
  setupModelImportPreview();
  if (typeof initChannelFormDirtyTracking === 'function') {
    initChannelFormDirtyTracking();
  }
  if (typeof initChannelModalAuxControls === 'function') {
    initChannelModalAuxControls();
  }
  // 初始化渠道类型变更事件委托（用于自定义端点提示）
  if (typeof initChannelTypeDelegation === 'function') {
    initChannelTypeDelegation();
  }
  if (typeof updateBatchChannelSelectionUI === 'function') {
    updateBatchChannelSelectionUI();
  }

  await window.ChannelTypeManager.renderChannelTypeRadios('channelTypeRadios');

  // 优先从 localStorage 恢复，其次检查 URL 参数，最后默认 all
  const savedFilters = loadChannelsFilters();
  const targetChannelType = await getTargetChannelType();
  const initialType = targetChannelType || (savedFilters?.channelType) || 'all';

  filters.channelType = initialType;
  const urlChannelId = new URLSearchParams(location.search).get('id');
  if (urlChannelId) {
    applyFiltersFromUrl(urlChannelId);
  } else if (savedFilters) {
    applyFiltersFromStorage(savedFilters);
  }

  // 初始化渠道类型筛选器（替换原Tab逻辑）
  await window.initChannelTypeFilter('channelTypeFilter', initialType, (type) => {
    filters.channelType = type;
    filters.model = 'all';
    filters.search = '';
    filters.id = '';
    // 清空搜索输入框
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.value = '';
      const clearBtn = document.getElementById('clearSearchBtn');
      if (clearBtn) clearBtn.style.opacity = '0';
    }
    // 清空ID筛选框
    const idFilterEl = document.getElementById('idFilter');
    if (idFilterEl) idFilterEl.value = '';
    // 重置模型筛选器
    const modelFilterEl2 = document.getElementById('modelFilter');
    if (modelFilterEl2) modelFilterEl2.value = 'all';
    saveChannelsFilters();
    loadChannels(type);
  });

  await loadDefaultTestContent();
  await loadChannelStatsRange();

  await loadChannels(initialType);
  await loadChannelStats();
  highlightFromHash();
  window.addEventListener('hashchange', highlightFromHash);

  // 监听语言切换事件，重新渲染渠道列表
  window.i18n.onLocaleChange(() => {
    renderChannels();
    updateModelOptions();
  });
});

// 模态框关闭顺序配置（按优先级从高到低）
const MODAL_CLOSE_ORDER = [
  { id: 'modelImportModal', closeFn: 'closeModelImportModal' },
  { id: 'keyImportModal', closeFn: 'closeKeyImportModal' },
  { id: 'keyExportModal', closeFn: 'closeKeyExportModal' },
  { id: 'sortModal', closeFn: 'closeSortModal' },
  { id: 'deleteModal', closeFn: 'closeDeleteModal' },
  { id: 'testModal', closeFn: 'closeTestModal' },
  { id: 'channelModal', closeFn: 'closeChannelModal' }
];

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (typeof window.getTopModal === 'function' && window.getTopModal()) return;

  for (const { id, closeFn } of MODAL_CLOSE_ORDER) {
    const modal = document.getElementById(id);
    if (modal?.classList.contains('show')) {
      window[closeFn]();
      return;
    }
  }
});
