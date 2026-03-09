// 常量定义
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_COOLDOWN_MS = 2 * 60 * 1000;

// 渠道类型对应的默认端点
const DEFAULT_ENDPOINTS = {
  anthropic: '/v1/messages',
  codex: '/v1/responses',
  openai: '/v1/chat/completions',
  gemini: '/v1beta/models/gemini-pro:generateContent'
};

// 表单字段配置
const FORM_FIELDS = [
  { id: 'channelName', key: 'name' },
  { id: 'channelPriority', key: 'priority', transform: v => parseInt(v) || 0 },
  { id: 'channelDailyCostLimit', key: 'daily_cost_limit', transform: v => parseFloat(v) || 0 },
  { id: 'channelCustomUserAgent', key: 'custom_user_agent' },
  { id: 'channelCustomEndpoint', key: 'custom_endpoint' },
  { id: 'channelEnabled', key: 'enabled', isCheckbox: true }
];

/**
 * 更新默认端点提示（更新placeholder）
 */
function updateDefaultEndpointHint() {
  const channelType = document.querySelector('input[name="channelType"]:checked')?.value || 'anthropic';
  const defaultEndpoint = DEFAULT_ENDPOINTS[channelType] || '';
  const input = document.getElementById('channelCustomEndpoint');
  if (input && defaultEndpoint) {
    input.placeholder = `例如 ${defaultEndpoint}，留空使用默认`;
  }
}

/**
 * 渠道类型变更事件处理器 - 使用事件委托
 * 在模态框容器上监听，避免重复绑定
 */
function handleChannelTypeChange(event) {
  if (event.target.name === 'channelType') {
    updateDefaultEndpointHint();
  }
}

/**
 * 初始化渠道类型事件监听（使用事件委托，只需调用一次）
 */
function initChannelTypeDelegation() {
  const modal = document.getElementById('channelModal');
  if (modal) {
    modal.addEventListener('change', handleChannelTypeChange);
  }
}

/**
 * 重置模态框状态
 */
function resetModalState() {
  editingChannelId = null;
  currentChannelKeyCooldowns = [];
  redirectTableData = [];
  selectedModelIndices.clear();
  currentModelFilter = '';
  inlineURLTableData = [''];
  selectedURLIndices.clear();
  inlineKeyTableData = [''];
  inlineKeyVisible = true;
}

/**
 * 重置表单控件到默认值
 */
function resetFormControls() {
  document.getElementById('channelForm').reset();
  document.getElementById('channelEnabled').checked = true;
  document.querySelector('input[name="channelType"][value="anthropic"]').checked = true;
  document.querySelector('input[name="keyStrategy"][value="sequential"]').checked = true;

  const modelFilterInput = document.getElementById('modelFilterInput');
  if (modelFilterInput) modelFilterInput.value = '';

  document.getElementById('inlineEyeIcon').style.display = 'none';
  document.getElementById('inlineEyeOffIcon').style.display = 'block';
}

/**
 * 渲染所有表格
 */
function renderAllTables() {
  renderRedirectTable();
  renderInlineURLTable();
  renderInlineKeyTable();
}

/**
 * 显示模态框
 */
function showModal() {
  resetChannelFormDirty();
  window.openModal('channelModal', { initialFocus: '#channelName' });
}

/**
 * 通用错误处理
 */
function handleError(context, error, fallbackMsg) {
  console.error(context, error);
  const msg = error?.message || fallbackMsg;
  if (window.showError) {
    window.showError(msg);
  } else {
    alert(msg);
  }
}

/**
 * 处理API Keys数据，转换为内部格式
 */
function processApiKeys(apiKeys) {
  const now = Date.now();
  currentChannelKeyCooldowns = apiKeys.map((apiKey, index) => {
    const cooldownUntilMs = (apiKey.cooldown_until || 0) * 1000;
    const remainingMs = Math.max(0, cooldownUntilMs - now);
    return {
      key_index: index,
      cooldown_remaining_ms: remainingMs
    };
  });

  inlineKeyTableData = apiKeys.map(k => k.api_key || k);
  if (inlineKeyTableData.length === 0) {
    inlineKeyTableData = [''];
    currentChannelKeyCooldowns = [];
  }
}

/**
 * 加载渠道数据到表单
 */
async function loadChannelData(channel) {
  document.getElementById('modalTitle').textContent = window.t('channels.editChannel');
  document.getElementById('channelName').value = channel.name;
  setInlineURLTableData(channel.url);

  let apiKeys = [];
  try {
    apiKeys = (await fetchDataWithAuth(`/admin/channels/${channel.id}/keys`)) || [];
  } catch (e) {
    console.error('Failed to fetch API Keys', e);
  }
  processApiKeys(apiKeys);

  inlineKeyVisible = true;
  document.getElementById('inlineEyeIcon').style.display = 'none';
  document.getElementById('inlineEyeOffIcon').style.display = 'block';
  renderInlineKeyTable();
}

/**
 * 设置模态框为编辑模式
 */
async function setupModalForEdit(channel) {
  const channelType = channel.channel_type || 'anthropic';
  await window.ChannelTypeManager.renderChannelTypeRadios('channelTypeRadios', channelType);

  // 更新默认端点提示（事件委托已在初始化时设置）
  updateDefaultEndpointHint();

  const keyStrategy = channel.key_strategy || 'sequential';
  const strategyRadio = document.querySelector(`input[name="keyStrategy"][value="${keyStrategy}"]`);
  if (strategyRadio) {
    strategyRadio.checked = true;
  }

  // 使用formFields循环设置表单值
  FORM_FIELDS.forEach(field => {
    const el = document.getElementById(field.id);
    if (!el) return;

    if (field.isCheckbox) {
      el.checked = channel[field.key];
    } else {
      el.value = channel[field.key] || '';
    }
  });

  // 加载模型配置（支持多目标模型重定向）
  redirectTableData = normalizeModelMappings(channel.models || []);
  selectedModelIndices.clear();
  currentModelFilter = '';
  const modelFilterInput = document.getElementById('modelFilterInput');
  if (modelFilterInput) modelFilterInput.value = '';
  renderRedirectTable();
}

function showAddModal() {
  resetModalState();
  resetFormControls();
  document.getElementById('modalTitle').textContent = window.t('channels.addChannel');
  renderAllTables();
  // 更新默认端点提示（事件委托已在初始化时设置）
  updateDefaultEndpointHint();
  showModal();
}

async function editChannel(id) {
  const channel = channels.find(c => c.id === id);
  if (!channel) return;

  editingChannelId = id;
  currentChannelKeyCooldowns = [];

  await loadChannelData(channel);
  await setupModalForEdit(channel);
  renderInlineURLTable();

  resetChannelFormDirty();
  window.openModal('channelModal', { initialFocus: '#channelName' });
}

function closeChannelModal() {
  if (channelFormDirty && !confirm(window.t('channels.unsavedChanges'))) {
    return;
  }
  window.closeModal('channelModal');
  editingChannelId = null;
  resetChannelFormDirty();
}

/**
 * 验证表单数据
 */
function validateFormData(formData) {
  if (!formData.name || !formData.url || !formData.api_key || formData.models.length === 0) {
    if (window.showError) window.showError(window.t('channels.fillAllRequired'));
    return false;
  }
  return true;
}

function syncRedirectTableInputsToState() {
  const tbody = document.getElementById('redirectTableBody');
  if (!tbody) return;

  tbody.querySelectorAll('.redirect-from-input').forEach((input) => {
    const index = parseInt(input.dataset.index);
    if (!Number.isInteger(index) || !redirectTableData[index]) return;
    redirectTableData[index].model = input.value.trim();
  });

  tbody.querySelectorAll('.target-model-input').forEach((input) => {
    const modelIndex = parseInt(input.dataset.modelIndex);
    const targetIndex = parseInt(input.dataset.targetIndex);
    const model = redirectTableData[modelIndex];
    if (!Number.isInteger(modelIndex) || !Number.isInteger(targetIndex) || !model || !Array.isArray(model.targets) || !model.targets[targetIndex]) {
      return;
    }
    model.targets[targetIndex].target_model = input.value.trim();
  });

  tbody.querySelectorAll('.target-weight-input').forEach((input) => {
    const modelIndex = parseInt(input.dataset.modelIndex);
    const targetIndex = parseInt(input.dataset.targetIndex);
    const model = redirectTableData[modelIndex];
    if (!Number.isInteger(modelIndex) || !Number.isInteger(targetIndex) || !model || !Array.isArray(model.targets) || !model.targets[targetIndex]) {
      return;
    }
    model.targets[targetIndex].weight = parseInt(input.value) || 1;
  });
}

/**
 * 检查并处理重复模型
 */
function checkDuplicateModels(models) {
  const seenModels = new Set();
  const duplicateModels = [];
  for (const entry of models) {
    const modelKey = entry.model.toLowerCase();
    if (seenModels.has(modelKey)) {
      duplicateModels.push(entry.model);
      continue;
    }
    seenModels.add(modelKey);
  }

  if (duplicateModels.length > 0) {
    const uniqueDuplicates = [...new Set(duplicateModels)];
    const msg = window.t('channels.duplicateModelsNotAllowed', { models: uniqueDuplicates.join(', ') });
    if (window.showError) {
      window.showError(msg);
    } else {
      alert(msg);
    }
    return true;
  }
  return false;
}

/**
 * 构建模型配置（支持多目标模型重定向）
 * 将前端数据结构转换为后端 API 格式
 */
function buildModelsConfig() {
  syncRedirectTableInputsToState();
  return redirectTableData
    .filter(r => r.model && r.model.trim())
    .map(r => {
      const model = r.model.trim();
      // 如果有多目标配置，使用新的格式
      if (r.targets && Array.isArray(r.targets) && r.targets.length > 0) {
        const validTargets = r.targets.filter(t => t.target_model && t.target_model.trim());
        if (validTargets.length === 1) {
          // 单目标：使用传统格式（向后兼容）
          return {
            model: model,
            redirect_model: validTargets[0].target_model.trim()
          };
        } else if (validTargets.length > 1) {
          // 多目标：使用新格式
          return {
            model: model,
            targets: validTargets.map(t => ({
              target_model: t.target_model.trim(),
              weight: parseInt(t.weight) || 1
            }))
          };
        }
      }
      // 默认：使用传统格式（向后兼容）
      return {
        model: model,
        redirect_model: (r.redirect_model || '').trim()
      };
    });
}

/**
 * 规范化模型映射数据（向后兼容）
 * 将后端返回的数据统一转换为前端多目标格式
 * @param {Array} models - 后端返回的模型配置数组
 * @returns {Array} 规范化后的前端数据格式
 */
function normalizeModelMappings(models) {
  if (!Array.isArray(models)) return [];

  return models.map(m => {
    const model = m.model || '';

    // 如果已经有多目标配置，直接使用
    if (m.targets && Array.isArray(m.targets) && m.targets.length > 0) {
      return {
        model: model,
        targets: m.targets.map(t => ({
          target_model: t.target_model || '',
          weight: parseInt(t.weight) || 1
        })),
        expanded: false // 默认折叠
      };
    }

    // 向后兼容：将旧的 redirect_model 转换为单目标格式
    const redirectModel = m.redirect_model || '';
    if (redirectModel && redirectModel !== model) {
      return {
        model: model,
        targets: [{
          target_model: redirectModel,
          weight: 1
        }],
        expanded: false
      };
    }

    // 无重定向：空目标列表
    return {
      model: model,
      targets: redirectModel ? [{
        target_model: redirectModel,
        weight: 1
      }] : [],
      expanded: false
    };
  });
}

/**
 * 构建表单数据
 */
function buildFormData(validURLs, validKeys, models) {
  const channelType = document.querySelector('input[name="channelType"]:checked')?.value || 'anthropic';
  const keyStrategy = document.querySelector('input[name="keyStrategy"]:checked')?.value || 'sequential';

  return {
    name: document.getElementById('channelName').value.trim(),
    url: validURLs.join('\n'),
    api_key: validKeys.join(','),
    channel_type: channelType,
    key_strategy: keyStrategy,
    priority: parseInt(document.getElementById('channelPriority').value) || 0,
    daily_cost_limit: parseFloat(document.getElementById('channelDailyCostLimit').value) || 0,
    custom_user_agent: document.getElementById('channelCustomUserAgent').value.trim(),
    custom_endpoint: document.getElementById('channelCustomEndpoint').value.trim(),
    models: models,
    enabled: document.getElementById('channelEnabled').checked
  };
}

async function saveChannel(event) {
  event.preventDefault();

  const validURLs = getValidInlineURLs();
  if (validURLs.length === 0) {
    alert(window.t('channels.fillApiUrlFirst'));
    return;
  }

  const validKeys = inlineKeyTableData.filter(k => k && k.trim());
  if (validKeys.length === 0) {
    alert(window.t('channels.atLeastOneKey'));
    return;
  }

  document.getElementById('channelUrl').value = validURLs.join('\n');
  document.getElementById('channelApiKey').value = validKeys.join(',');

  const models = buildModelsConfig();
  if (checkDuplicateModels(models)) return;

  const formData = buildFormData(validURLs, validKeys, models);
  if (!validateFormData(formData)) return;

  try {
    const resp = editingChannelId
      ? await fetchAPIWithAuth(`/admin/channels/${editingChannelId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        })
      : await fetchAPIWithAuth('/admin/channels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });

    if (!resp.success) throw new Error(resp.error || window.t('channels.msg.saveFailed'));

    const isNewChannel = !editingChannelId;
    const newChannelType = formData.channel_type;

    resetChannelFormDirty(); // 保存成功，重置dirty状态（避免closeModal弹确认框）
    closeChannelModal();
    clearChannelsCache();

    // 新增渠道时，如果类型与当前筛选器不匹配，切换到新渠道的类型
    if (isNewChannel && filters.channelType !== 'all' && filters.channelType !== newChannelType) {
      filters.channelType = newChannelType;
      const typeFilter = document.getElementById('channelTypeFilter');
      if (typeFilter) typeFilter.value = newChannelType;
      if (typeof saveChannelsFilters === 'function') saveChannelsFilters();
    }

    await loadChannels(filters.channelType);
    if (window.showSuccess) window.showSuccess(isNewChannel ? window.t('channels.channelAdded') : window.t('channels.channelUpdated'));
  } catch (e) {
    handleError('Save channel failed', e, window.t('channels.saveFailed', { error: e.message }));
  }
}

function deleteChannel(id, name) {
  deletingChannelId = id;
  document.getElementById('deleteChannelName').textContent = name;
  window.openModal('deleteModal');
}

function closeDeleteModal() {
  window.closeModal('deleteModal');
  deletingChannelId = null;
}

async function confirmDelete() {
  if (!deletingChannelId) return;

  try {
    const resp = await fetchAPIWithAuth(`/admin/channels/${deletingChannelId}`, {
      method: 'DELETE'
    });

    if (!resp.success) throw new Error(resp.error || window.t('common.failed'));

    closeDeleteModal();
    clearChannelsCache();
    await loadChannels(filters.channelType);
    if (window.showSuccess) window.showSuccess(window.t('channels.channelDeleted'));
  } catch (e) {
    console.error('Delete channel failed', e);
    if (window.showError) window.showError(window.t('channels.saveFailed', { error: e.message }));
  }
}

async function toggleChannel(id, enabled) {
  try {
    const resp = await fetchAPIWithAuth(`/admin/channels/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });
    if (!resp.success) throw new Error(resp.error || window.t('common.failed'));
    clearChannelsCache();
    await loadChannels(filters.channelType);
    if (window.showSuccess) window.showSuccess(enabled ? window.t('channels.channelEnabled') : window.t('channels.channelDisabled'));
  } catch (e) {
    console.error('Toggle failed', e);
    if (window.showError) window.showError(window.t('common.failed'));
  }
}

function syncSelectedChannelsWithLoadedChannels() {
  const loadedIDs = new Set((channels || [])
    .map(ch => normalizeSelectedChannelID(ch.id))
    .filter(Boolean));
  let changed = false;
  selectedChannelIds.forEach((id) => {
    if (!loadedIDs.has(id)) {
      selectedChannelIds.delete(id);
      changed = true;
    }
  });
  if (changed) {
    updateBatchChannelSelectionUI();
  }
}

function getSelectedChannelIDs() {
  return Array.from(selectedChannelIds)
    .map(id => Number(id))
    .filter(id => Number.isFinite(id) && id > 0);
}

function getVisibleChannelsForSelection() {
  return Array.isArray(filteredChannels) ? filteredChannels : (channels || []);
}

function renderBatchSummary(selectedCount) {
  const marker = '__count_marker__';
  const raw = String(window.t('channels.batchSelectedCount', { count: marker }));
  const text = raw.includes(marker)
    ? raw.replace(marker, '')
    : String(window.t('channels.batchSelectedCount', { count: selectedCount }));
  const compact = text.replace(/\s+/g, ' ').trim();
  if (/[\u4e00-\u9fff]/.test(compact)) {
    return compact.replace(/\s+/g, '');
  }
  return compact;
}

function updateBatchChannelSelectionUI() {
  const selectedCount = getSelectedChannelIDs().length;
  const hasAnySelection = selectedCount > 0;
  const visibleChannels = getVisibleChannelsForSelection();
  const visibleCount = visibleChannels.length;
  let visibleSelectedCount = 0;
  visibleChannels.forEach((ch) => {
    if (selectedChannelIds.has(normalizeSelectedChannelID(ch.id))) {
      visibleSelectedCount++;
    }
  });

  const floatingMenu = document.getElementById('batchFloatingMenu');
  if (floatingMenu) {
    const visible = selectedCount > 0;
    floatingMenu.classList.toggle('is-visible', visible);
    floatingMenu.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  const summary = document.getElementById('selectedChannelsSummary');
  if (summary) {
    summary.textContent = renderBatchSummary(selectedCount);
  }

  const countBadge = document.getElementById('selectedChannelsCountBadge');
  if (countBadge) {
    countBadge.textContent = String(selectedCount);
  }

  const closeBtn = document.getElementById('batchFloatingMenuCloseBtn');
  if (closeBtn) closeBtn.disabled = selectedCount === 0;

  const selectionToggle = document.getElementById('visibleSelectionToggle');
  const selectionCheckbox = document.getElementById('visibleSelectionCheckbox');
  const selectionText = document.getElementById('visibleSelectionToggleText');
  const selectionLabel = window.t(hasAnySelection ? 'channels.batchInvertVisible' : 'channels.batchSelectVisible');

  if (selectionText) {
    selectionText.textContent = selectionLabel;
  }
  if (selectionToggle) {
    selectionToggle.classList.toggle('is-disabled', visibleCount === 0);
    selectionToggle.title = selectionLabel;
  }
  if (selectionCheckbox) {
    selectionCheckbox.disabled = visibleCount === 0;
    selectionCheckbox.checked = visibleCount > 0 && visibleSelectedCount === visibleCount;
    selectionCheckbox.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < visibleCount;
  }

  const actionBtnIDs = [
    'batchEnableChannelsBtn',
    'batchDisableChannelsBtn',
    'batchRefreshMergeBtn',
    'batchRefreshReplaceBtn'
  ];
  actionBtnIDs.forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = selectedCount === 0;
  });
}

function selectAllVisibleChannels() {
  const visibleChannels = getVisibleChannelsForSelection();

  if (visibleChannels.length === 0) {
    return;
  }

  visibleChannels.forEach((ch) => {
    const channelID = normalizeSelectedChannelID(ch.id);
    if (channelID) {
      selectedChannelIds.add(channelID);
    }
  });
  filterChannels();
}

function toggleVisibleChannelsSelection() {
  if (getSelectedChannelIDs().length === 0) {
    selectAllVisibleChannels();
    return;
  }
  invertVisibleChannelsSelection();
}

function invertVisibleChannelsSelection() {
  const visibleChannels = getVisibleChannelsForSelection();

  if (visibleChannels.length === 0) {
    return;
  }

  visibleChannels.forEach((ch) => {
    const channelID = normalizeSelectedChannelID(ch.id);
    if (!channelID) return;
    if (selectedChannelIds.has(channelID)) {
      selectedChannelIds.delete(channelID);
    } else {
      selectedChannelIds.add(channelID);
    }
  });
  filterChannels();
}

function clearSelectedChannels() {
  if (selectedChannelIds.size === 0) return;
  selectedChannelIds.clear();
  filterChannels();
}

async function batchSetSelectedChannelsEnabled(enabled) {
  const channelIDs = getSelectedChannelIDs();
  if (channelIDs.length === 0) {
    if (window.showWarning) window.showWarning(window.t('channels.batchNoSelection'));
    return;
  }

  try {
    const resp = await fetchAPIWithAuth('/admin/channels/batch-enabled', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel_ids: channelIDs, enabled })
    });
    if (!resp.success) throw new Error(resp.error || window.t('common.failed'));

    const data = resp.data || {};
    selectedChannelIds.clear();
    clearChannelsCache();
    await loadChannels(filters.channelType);

    if (window.showSuccess) {
      window.showSuccess(window.t('channels.batchEnabledSummary', {
        action: enabled ? window.t('common.enable') : window.t('common.disable'),
        updated: data.updated || 0,
        unchanged: data.unchanged || 0,
        notFound: data.not_found_count || 0
      }));
    }
  } catch (e) {
    console.error('Batch set enabled failed', e);
    if (window.showError) window.showError(window.t('channels.batchOperationFailed', { error: e.message }));
  }
}

async function batchRefreshSelectedChannels(mode) {
  const channelIDs = getSelectedChannelIDs();
  if (channelIDs.length === 0) {
    if (window.showWarning) window.showWarning(window.t('channels.batchNoSelection'));
    return;
  }

  if (mode === 'replace' && !confirm(window.t('channels.batchRefreshReplaceConfirm', { count: channelIDs.length }))) {
    return;
  }

  // 禁用批量操作按钮
  const actionBtnIDs = ['batchRefreshMergeBtn', 'batchRefreshReplaceBtn', 'batchEnableChannelsBtn', 'batchDisableChannelsBtn'];
  actionBtnIDs.forEach(id => { const btn = document.getElementById(id); if (btn) btn.disabled = true; });

  const total = channelIDs.length;
  const modeLabel = mode === 'replace' ? window.t('channels.batchModeReplace') : window.t('channels.batchModeMerge');

  // 创建持久化进度通知
  const progressEl = document.createElement('div');
  progressEl.style.cssText = [
    'background: var(--glass-bg)', 'backdrop-filter: blur(16px)',
    'border: 1px solid var(--info-300)', 'border-radius: var(--radius-lg)',
    'padding: var(--space-4) var(--space-6)', 'color: var(--neutral-900)',
    'font-weight: var(--font-medium)', 'max-width: 420px',
    'box-shadow: 0 10px 25px rgba(0,0,0,0.12)', 'pointer-events: auto',
    'opacity: 0', 'transform: translateX(20px)',
    'transition: all var(--duration-normal) var(--timing-function)'
  ].join(';');

  const titleSpan = document.createElement('div');
  titleSpan.style.marginBottom = 'var(--space-2)';
  titleSpan.textContent = window.t('channels.batchRefreshProgress', { current: 0, total, mode: modeLabel });
  progressEl.appendChild(titleSpan);

  const barOuter = document.createElement('div');
  barOuter.style.cssText = 'height:4px;background:var(--neutral-200);border-radius:2px;overflow:hidden;margin-bottom:var(--space-2)';
  const barInner = document.createElement('div');
  barInner.style.cssText = 'height:100%;width:0%;background:var(--primary-500);border-radius:2px;transition:width 0.3s ease';
  barOuter.appendChild(barInner);
  progressEl.appendChild(barOuter);

  const detailSpan = document.createElement('div');
  detailSpan.style.cssText = 'font-size:0.85em;color:var(--neutral-600)';
  progressEl.appendChild(detailSpan);

  let host = document.getElementById('notify-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'notify-host';
    host.style.cssText = 'position:fixed;top:var(--space-6);right:var(--space-6);display:flex;flex-direction:column;gap:var(--space-2);z-index:9999;pointer-events:none';
    document.body.appendChild(host);
  }
  host.appendChild(progressEl);
  requestAnimationFrame(() => { progressEl.style.opacity = '1'; progressEl.style.transform = 'translateX(0)'; });

  let updated = 0, unchanged = 0, failed = 0;
  const failedItems = [];

  for (let i = 0; i < channelIDs.length; i++) {
    const channelID = channelIDs[i];
    const info = channels.find(c => c.id === channelID);
    const name = info ? info.name : `#${channelID}`;

    titleSpan.textContent = window.t('channels.batchRefreshProgress', { current: i, total, mode: modeLabel });
    detailSpan.textContent = window.t('channels.batchRefreshCurrent', { name });
    barInner.style.width = `${(i / total * 100).toFixed(0)}%`;

    try {
      const resp = await fetchAPIWithAuth('/admin/channels/models/refresh-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_ids: [channelID], mode })
      });

      if (!resp.success) throw new Error(resp.error || window.t('common.failed'));

      const item = ((resp.data || {}).results || [])[0] || {};
      if (item.status === 'updated') {
        updated++;
      } else if (item.status === 'unchanged') {
        unchanged++;
      } else {
        failed++;
        failedItems.push({ name, error: item.error || window.t('common.failed') });
      }
    } catch (e) {
      failed++;
      failedItems.push({ name, error: e.message });
    }

    detailSpan.textContent = window.t('channels.batchRefreshCounts', { updated, unchanged, failed });
  }

  // 完成：更新进度条到100%
  barInner.style.width = '100%';
  titleSpan.textContent = window.t('channels.batchRefreshSummary', { mode: modeLabel, updated, unchanged, failed });

  // 构建可复制的纯文本摘要
  let copyText = titleSpan.textContent;

  // 显示失败详情
  if (failedItems.length > 0) {
    progressEl.style.borderColor = 'var(--error-300)';
    const failDetail = document.createElement('div');
    failDetail.style.cssText = 'font-size:0.82em;color:var(--error-600);margin-top:var(--space-2);max-height:200px;overflow-y:auto;white-space:pre-wrap';
    const failText = failedItems.map(f => `${f.name}: ${f.error}`).join('\n');
    failDetail.textContent = failText;
    progressEl.appendChild(failDetail);
    copyText += '\n' + failText;
  } else {
    progressEl.style.borderColor = 'var(--success-400)';
  }

  detailSpan.textContent = '';

  // 关闭动画辅助函数
  function dismissProgress() {
    progressEl.style.opacity = '0';
    progressEl.style.transform = 'translateX(20px)';
    setTimeout(() => { if (progressEl.parentNode) progressEl.parentNode.removeChild(progressEl); }, 320);
  }

  // 操作按钮栏：复制 + 关闭
  const actionBar = document.createElement('div');
  actionBar.style.cssText = 'display:flex;justify-content:flex-end;gap:var(--space-2);margin-top:var(--space-3)';

  if (failedItems.length > 0) {
    const copyBtn = document.createElement('button');
    copyBtn.textContent = window.t('channels.batchRefreshCopy');
    copyBtn.style.cssText = 'padding:2px 10px;font-size:0.82em;border:1px solid var(--neutral-300);border-radius:var(--radius-md);background:var(--neutral-50);color:var(--neutral-700);cursor:pointer';
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(copyText).then(() => {
        copyBtn.textContent = window.t('channels.batchRefreshCopied');
        setTimeout(() => { copyBtn.textContent = window.t('channels.batchRefreshCopy'); }, 1500);
      });
    };
    actionBar.appendChild(copyBtn);
  }

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'padding:2px 8px;font-size:0.9em;border:1px solid var(--neutral-300);border-radius:var(--radius-md);background:var(--neutral-50);color:var(--neutral-700);cursor:pointer;font-weight:bold';
  closeBtn.onclick = dismissProgress;
  actionBar.appendChild(closeBtn);

  progressEl.appendChild(actionBar);

  // 无失败时10秒自动关闭，有失败则保持直到手动关闭
  if (failedItems.length === 0) {
    setTimeout(dismissProgress, 10000);
  }

  selectedChannelIds.clear();
  clearChannelsCache();
  await loadChannels(filters.channelType);
  updateBatchChannelSelectionUI();
}

function batchEnableSelectedChannels() {
  return batchSetSelectedChannelsEnabled(true);
}

function batchDisableSelectedChannels() {
  return batchSetSelectedChannelsEnabled(false);
}

function batchRefreshSelectedChannelsMerge() {
  return batchRefreshSelectedChannels('merge');
}

function batchRefreshSelectedChannelsReplace() {
  return batchRefreshSelectedChannels('replace');
}

/**
 * 设置表单字段值（复制模式）
 */
function setFormValuesForCopy(channel, copiedName) {
  document.getElementById('modalTitle').textContent = window.t('channels.copyChannel');
  document.getElementById('channelName').value = copiedName;
  document.getElementById('channelPriority').value = channel.priority;
  document.getElementById('channelDailyCostLimit').value = channel.daily_cost_limit || 0;
  document.getElementById('channelCustomUserAgent').value = channel.custom_user_agent || '';
  document.getElementById('channelCustomEndpoint').value = channel.custom_endpoint || '';
  document.getElementById('channelEnabled').checked = true;

  const channelType = channel.channel_type || 'anthropic';
  const radioButton = document.querySelector(`input[name="channelType"][value="${channelType}"]`);
  if (radioButton) radioButton.checked = true;

  const keyStrategy = channel.key_strategy || 'sequential';
  const strategyRadio = document.querySelector(`input[name="keyStrategy"][value="${keyStrategy}"]`);
  if (strategyRadio) strategyRadio.checked = true;
}

async function copyChannel(id, name) {
  const channel = channels.find(c => c.id === id);
  if (!channel) return;

  const copiedName = generateCopyName(name);

  editingChannelId = null;
  currentChannelKeyCooldowns = [];

  setFormValuesForCopy(channel, copiedName);
  setInlineURLTableData(channel.url);

  let apiKeys = [];
  try {
    apiKeys = (await fetchDataWithAuth(`/admin/channels/${id}/keys`)) || [];
  } catch (e) {
    console.error('Failed to fetch API Keys', e);
  }

  inlineKeyTableData = apiKeys.map(k => k.api_key || k);
  if (inlineKeyTableData.length === 0) {
    inlineKeyTableData = [''];
  }

  inlineKeyVisible = true;
  document.getElementById('inlineEyeIcon').style.display = 'none';
  document.getElementById('inlineEyeOffIcon').style.display = 'block';
  renderInlineKeyTable();

  // 加载模型配置（支持多目标模型重定向）
  redirectTableData = normalizeModelMappings(channel.models || []);
  selectedModelIndices.clear();
  currentModelFilter = '';
  const modelFilterInput = document.getElementById('modelFilterInput');
  if (modelFilterInput) modelFilterInput.value = '';
  renderRedirectTable();

  resetChannelFormDirty();
  window.openModal('channelModal', { initialFocus: '#channelName' });
}

function generateCopyName(originalName) {
  const suffix = window.t('channels.copySuffix');
  // 匹配带有 " - 复制" 或 " - Copy" 后缀的名称
  const copyPattern = new RegExp(`^(.+?)(?:\\s*-\\s*${suffix}(?:\\s*(\\d+))?)?$`);
  const match = originalName.match(copyPattern);

  if (!match) {
    return originalName + ' - ' + suffix;
  }

  const baseName = match[1];
  const copyNumber = match[2] ? parseInt(match[2]) + 1 : 1;

  const proposedName = copyNumber === 1 ? `${baseName} - ${suffix}` : `${baseName} - ${suffix} ${copyNumber}`;

  const existingNames = channels.map(c => c.name.toLowerCase());
  if (existingNames.includes(proposedName.toLowerCase())) {
    return generateCopyName(proposedName);
  }

  return proposedName;
}

// 拆分模型映射，支持 model:redirect / model->redirect / model
function splitModelMapping(entry) {
  const arrowIndex = entry.indexOf('->');
  if (arrowIndex >= 0) {
    return [entry.slice(0, arrowIndex), entry.slice(arrowIndex + 2)];
  }

  const colonIndex = entry.indexOf(':');
  if (colonIndex >= 0) {
    return [entry.slice(0, colonIndex), entry.slice(colonIndex + 1)];
  }

  return [entry, ''];
}

// 解析模型输入，支持逗号和换行分隔
// 支持格式：model 或 model:redirect 或 model->redirect
// 返回 [{model, redirect_model}] 数组
function parseModels(input) {
  const entries = input
    .split(/[,\n]/)
    .map(m => m.trim())
    .filter(m => m);

  const seen = new Set();
  const result = [];

  for (const entry of entries) {
    const [modelRaw, redirectRaw] = splitModelMapping(entry);
    const model = modelRaw.trim();
    if (!model) continue;

    const redirect = redirectRaw.trim() || model;
    const modelKey = model.toLowerCase();

    if (!seen.has(modelKey)) {
      seen.add(modelKey);
      result.push({ model, redirect_model: redirect });
    }
  }

  return result;
}

function addRedirectRow() {
  openModelImportModal();
}

function openModelImportModal() {
  document.getElementById('modelImportTextarea').value = '';
  document.getElementById('modelImportPreviewContent').style.display = 'none';
  window.openModal('modelImportModal', { initialFocus: '#modelImportTextarea' });
  setTimeout(() => document.getElementById('modelImportTextarea').focus(), 100);
}

function closeModelImportModal() {
  window.closeModal('modelImportModal');
}

function setupModelImportPreview() {
  const textarea = document.getElementById('modelImportTextarea');
  if (!textarea) return;

  textarea.addEventListener('input', () => {
    const input = textarea.value.trim();
    const previewContent = document.getElementById('modelImportPreviewContent');
    const countSpan = document.getElementById('modelImportCount');

    if (input) {
      const models = parseModels(input);
      if (models.length > 0) {
        countSpan.textContent = models.length;
        previewContent.style.display = 'block';
      } else {
        previewContent.style.display = 'none';
      }
    } else {
      previewContent.style.display = 'none';
    }
  });
}

function confirmModelImport() {
  const textarea = document.getElementById('modelImportTextarea');
  const input = textarea.value.trim();

  if (!input) {
    window.showNotification(window.t('channels.enterModelName'), 'warning');
    return;
  }

  const newModels = parseModels(input);
  if (newModels.length === 0) {
    window.showNotification(window.t('channels.noValidModelParsed'), 'warning');
    return;
  }

  // 获取现有模型名称用于去重（忽略大小写）
  const existingModels = new Set(
    redirectTableData
      .map(r => (r.model || '').trim().toLowerCase())
      .filter(Boolean)
  );
  let addedCount = 0;

  newModels.forEach(entry => {
    const modelKey = entry.model.toLowerCase();
    if (!existingModels.has(modelKey)) {
      // 使用新的多目标数据结构
      redirectTableData.push({
        model: entry.model,
        targets: entry.redirect_model ? [{
          target_model: entry.redirect_model,
          weight: 1
        }] : [],
        expanded: false
      });
      existingModels.add(modelKey);
      addedCount++;
    }
  });

  renderRedirectTable();
  closeModelImportModal();
  if (addedCount > 0) markChannelFormDirty();

  if (addedCount > 0) {
    const duplicateCount = newModels.length - addedCount;
    const msg = duplicateCount > 0
      ? window.t('channels.modelAddedWithDuplicates', { added: addedCount, duplicates: duplicateCount })
      : window.t('channels.modelAddedSuccess', { added: addedCount });
    window.showNotification(msg, 'success');
  } else {
    window.showNotification(window.t('channels.allModelsExist'), 'info');
  }
}

function deleteRedirectRow(index) {
  redirectTableData.splice(index, 1);
  // 更新选中状态：删除该索引，并调整后续索引
  const newSelectedIndices = new Set();
  selectedModelIndices.forEach(i => {
    if (i < index) {
      newSelectedIndices.add(i);
    } else if (i > index) {
      newSelectedIndices.add(i - 1);
    }
  });
  selectedModelIndices.clear();
  newSelectedIndices.forEach(i => selectedModelIndices.add(i));
  renderRedirectTable();
  markChannelFormDirty();
}

function updateRedirectRow(index, field, value) {
  if (redirectTableData[index]) {
    const nextValue = value.trim();
    if (redirectTableData[index][field] === nextValue) return;

    redirectTableData[index][field] = nextValue;

    // 当模型名称变化时，更新重定向目标的 placeholder
    if (field === 'model') {
      const tbody = document.getElementById('redirectTableBody');
      const row = tbody?.children[index];
      if (row) {
        const toInput = row.querySelector('.redirect-to-input');
        if (toInput) {
          toInput.placeholder = nextValue || window.t('channels.leaveEmptyNoRedirect');
        }
      }
    }

    markChannelFormDirty();
  }
}

/**
 * 使用模板引擎创建重定向行元素（支持多目标模型重定向）
 * @param {Object} redirect - 重定向数据 {model, targets: [{target_model, weight}], expanded}
 * @param {number} index - 索引
 * @returns {HTMLElement|null} 表格行元素
 */
function createRedirectRow(redirect, index) {
  const modelName = redirect.model || '';
  if (!Array.isArray(redirect.targets) || redirect.targets.length === 0) {
    redirect.targets = [{ target_model: '', weight: 1 }];
  }
  const targets = redirect.targets;
  const targetModelPlaceholder = window.t('channels.targetModelPlaceholder');
  const targetWeightLabel = window.t('channels.targetWeight');

  const row = document.createElement('tr');
  row.style.borderBottom = '1px solid var(--neutral-200)';
  row.dataset.index = index;
  row.dataset.type = 'main-row';

  row.innerHTML = `
    <td class="redirect-row-index-cell">
      <div class="redirect-row-index-wrap">
        <input type="checkbox" class="model-checkbox" data-index="${index}"
          onchange="toggleModelSelection(${index}, this.checked)" style="width: 16px; height: 16px;">
        <span class="redirect-row-index-text">${index + 1}</span>
      </div>
    </td>
    <td class="redirect-row-model-cell">
      <div class="model-source-cell">
        <input type="text" class="redirect-from-input model-source-input" data-index="${index}" value="${escapeHtml(modelName)}"
          placeholder="claude-sonnet-4-6"
          >
        <button type="button" class="lowercase-btn model-source-action" data-index="${index}"
          data-i18n-title="channels.toLowercase" title="转为小写">
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1.5 10.5L3.5 4H5L7 10.5M2.5 8.5H6M8.5 10.5V7.5C8.5 6.5 9.5 6 10.5 6C11.5 6 12.5 6.5 12.5 7.5V10.5M8.5 8.5H12.5"
              stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
    </td>
    <td class="redirect-row-target-cell">
      <div class="model-target-cell">
        ${targets.map((target, targetIndex) => `
          <div class="model-target-row">
            <input type="text" class="target-model-input model-target-input" data-model-index="${index}" data-target-index="${targetIndex}"
              value="${escapeHtml(target.target_model || '')}"
              placeholder="${escapeHtml(targetModelPlaceholder)}">
            <div class="model-target-weight-wrap">
              <span class="model-target-weight-label">${targetWeightLabel}</span>
              <input type="number" class="target-weight-input model-target-weight-input" data-model-index="${index}" data-target-index="${targetIndex}"
                value="${parseInt(target.weight) || 1}" min="1">
            </div>
            ${targetIndex === targets.length - 1 ? `
              <button type="button" class="add-target-btn model-target-add model-target-inline-add" data-index="${index}"
                data-i18n-title="channels.addTarget" title="添加目标">
                +
              </button>
            ` : '<span class="model-target-inline-spacer" aria-hidden="true"></span>'}
            <button type="button" class="target-delete-btn model-target-delete" data-model-index="${index}" data-target-index="${targetIndex}"
              data-i18n-title="channels.deleteThisTarget" title="删除此目标">
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5.5 2.5V1.5C5.5 1.22386 5.72386 1 6 1H8C8.27614 1 8.5 1.22386 8.5 1.5V2.5M2 3.5H12M3 3.5V11.5C3 12.0523 3.44772 12.5 4 12.5H10C10.5523 12.5 11 12.0523 11 11.5V3.5M5.5 6.5V9.5M8.5 6.5V9.5"
                  stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </div>
        `).join('')}
      </div>
    </td>
  `;

  const checkbox = row.querySelector('.model-checkbox');
  if (checkbox) {
    checkbox.checked = selectedModelIndices.has(index);
  }
  return row;
}

/**
 * HTML 转义辅助函数
 * @param {string} text - 需要转义的文本
 * @returns {string} 转义后的文本
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 初始化重定向表格事件委托 (支持多目标模型重定向)
 */
function initRedirectTableEventDelegation() {
  const tbody = document.getElementById('redirectTableBody');
  if (!tbody || tbody.dataset.delegated) return;

  tbody.dataset.delegated = 'true';

  tbody.addEventListener('input', (e) => {
    const fromInput = e.target.closest('.redirect-from-input');
    if (fromInput) {
      const index = parseInt(fromInput.dataset.index);
      updateRedirectRow(index, 'model', fromInput.value);
      return;
    }

    const targetModelInput = e.target.closest('.target-model-input');
    if (targetModelInput) {
      const modelIndex = parseInt(targetModelInput.dataset.modelIndex);
      const targetIndex = parseInt(targetModelInput.dataset.targetIndex);
      updateTargetRow(modelIndex, targetIndex, 'target_model', targetModelInput.value);
    }
  });

  // 处理输入框变更
  tbody.addEventListener('change', (e) => {
    // 模型名称输入
    const fromInput = e.target.closest('.redirect-from-input');
    if (fromInput) {
      const index = parseInt(fromInput.dataset.index);
      updateRedirectRow(index, 'model', fromInput.value);
      return;
    }

    // 目标模型名称输入
    const targetModelInput = e.target.closest('.target-model-input');
    if (targetModelInput) {
      const modelIndex = parseInt(targetModelInput.dataset.modelIndex);
      const targetIndex = parseInt(targetModelInput.dataset.targetIndex);
      updateTargetRow(modelIndex, targetIndex, 'target_model', targetModelInput.value);
      return;
    }

    // 目标权重输入
    const targetWeightInput = e.target.closest('.target-weight-input');
    if (targetWeightInput) {
      const modelIndex = parseInt(targetWeightInput.dataset.modelIndex);
      const targetIndex = parseInt(targetWeightInput.dataset.targetIndex);
      updateTargetRow(modelIndex, targetIndex, 'weight', targetWeightInput.value);
      return;
    }
  });

  // 处理按钮点击
  tbody.addEventListener('click', (e) => {
    syncRedirectTableInputsToState();

    // 删除模型按钮
    const deleteBtn = e.target.closest('.redirect-delete-btn');
    if (deleteBtn) {
      const index = parseInt(deleteBtn.dataset.index);
      deleteRedirectRow(index);
      return;
    }

    // 转小写按钮
    const lowercaseBtn = e.target.closest('.lowercase-btn');
    if (lowercaseBtn) {
      const index = parseInt(lowercaseBtn.dataset.index);
      const row = lowercaseBtn.closest('tr');
      const fromInput = row?.querySelector('.redirect-from-input');
      if (fromInput && fromInput.value) {
        const lowercased = fromInput.value.toLowerCase();
        fromInput.value = lowercased;
        updateRedirectRow(index, 'model', lowercased);
      }
      return;
    }

    // 添加目标按钮
    const addTargetBtn = e.target.closest('.add-target-btn');
    if (addTargetBtn) {
      const index = parseInt(addTargetBtn.dataset.index);
      addTargetToModel(index);
      return;
    }

    // 删除目标按钮
    const deleteTargetBtn = e.target.closest('.target-delete-btn');
    if (deleteTargetBtn) {
      const modelIndex = parseInt(deleteTargetBtn.dataset.modelIndex);
      const targetIndex = parseInt(deleteTargetBtn.dataset.targetIndex);
      deleteTargetFromModel(modelIndex, targetIndex);
      return;
    }

  });

  // 处理按钮悬停样式
  tbody.addEventListener('mouseover', (e) => {
    const deleteBtn = e.target.closest('.redirect-delete-btn');
    if (deleteBtn) {
      deleteBtn.style.background = 'var(--error-50)';
      deleteBtn.style.borderColor = 'var(--error-500)';
      return;
    }

    const lowercaseBtn = e.target.closest('.lowercase-btn');
    if (lowercaseBtn) {
      lowercaseBtn.style.background = 'var(--primary-50)';
      lowercaseBtn.style.borderColor = 'var(--primary-500)';
      lowercaseBtn.style.color = 'var(--primary-600)';
      return;
    }

  });

  tbody.addEventListener('mouseout', (e) => {
    const deleteBtn = e.target.closest('.redirect-delete-btn');
    if (deleteBtn) {
      deleteBtn.style.background = 'white';
      deleteBtn.style.borderColor = 'var(--error-300)';
      return;
    }

    const lowercaseBtn = e.target.closest('.lowercase-btn');
    if (lowercaseBtn) {
      lowercaseBtn.style.background = 'white';
      lowercaseBtn.style.borderColor = 'var(--neutral-300)';
      lowercaseBtn.style.color = 'var(--neutral-500)';
      return;
    }

  });
}

// ==================== 多目标模型重定向管理函数 ====================

/**
 * 为模型添加新目标
 * @param {number} index - 模型索引
 */
function addTargetToModel(index) {
  if (!redirectTableData[index]) return;

  if (!redirectTableData[index].targets) {
    redirectTableData[index].targets = [];
  }

  // 添加新目标（默认权重为1）
  redirectTableData[index].targets.push({
    target_model: '',
    weight: 1
  });

  renderRedirectTable();
  markChannelFormDirty();
}

/**
 * 从模型中删除目标
 * @param {number} modelIndex - 模型索引
 * @param {number} targetIndex - 目标索引
 */
function deleteTargetFromModel(modelIndex, targetIndex) {
  if (!redirectTableData[modelIndex] || !redirectTableData[modelIndex].targets) return;

  if (redirectTableData[modelIndex].targets.length <= 1) {
    deleteRedirectRow(modelIndex);
    return;
  }

  redirectTableData[modelIndex].targets.splice(targetIndex, 1);

  renderRedirectTable();
  markChannelFormDirty();
}

/**
 * 更新目标行数据
 * @param {number} modelIndex - 模型索引
 * @param {number} targetIndex - 目标索引
 * @param {string} field - 字段名 ('target_model' 或 'weight')
 * @param {string} value - 新值
 */
function updateTargetRow(modelIndex, targetIndex, field, value) {
  if (!redirectTableData[modelIndex] || !redirectTableData[modelIndex].targets) return;

  const target = redirectTableData[modelIndex].targets[targetIndex];
  if (!target) return;

  if (field === 'target_model') {
    target.target_model = value.trim();
  } else if (field === 'weight') {
    target.weight = parseInt(value) || 1;
    markChannelFormDirty();
    renderRedirectTable();
    return;
  }

  markChannelFormDirty();
}

/**
 * 处理目标冷却按钮点击
 * @param {number} modelIndex - 模型索引
 * @param {number} targetIndex - 目标索引
 */
async function handleTargetCooldown(modelIndex, targetIndex) {
  if (!editingChannelId) {
    if (window.showError) window.showError(window.t('channels.saveChannelFirst'));
    return;
  }

  const modelData = redirectTableData[modelIndex];
  if (!modelData || !modelData.targets || !modelData.targets[targetIndex]) return;

  const target = modelData.targets[targetIndex];
  const modelName = modelData.model;
  const targetModelName = target.target_model;

  if (!targetModelName) {
    if (window.showError) window.showError(window.t('channels.targetModelRequired'));
    return;
  }

  // 显示冷却设置对话框
  const duration = prompt(window.t('channels.cooldownDurationPrompt'), '120000');
  if (duration === null) return; // 用户取消

  const durationMs = parseInt(duration);
  if (!durationMs || durationMs < 1000) {
    if (window.showError) window.showError(window.t('channels.invalidCooldownDuration'));
    return;
  }

  try {
    const resp = await fetchAPIWithAuth(
      `/admin/channels/${editingChannelId}/model-mappings/${encodeURIComponent(modelName)}/cooldown`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_model: targetModelName,
          duration_ms: durationMs
        })
      }
    );

    if (!resp.success) {
      throw new Error(resp.error || window.t('channels.cooldownFailed'));
    }

    if (window.showSuccess) {
      window.showSuccess(window.t('channels.cooldownSetSuccess', { model: targetModelName }));
    }
  } catch (e) {
    handleError('Set target cooldown failed', e, window.t('channels.cooldownFailed'));
  }
}

/**
 * 获取筛选后的模型索引列表（支持多目标模型重定向）
 */
function getVisibleModelIndices() {
  if (!currentModelFilter) {
    return redirectTableData.map((_, index) => index);
  }
  const keyword = currentModelFilter.toLowerCase();
  return redirectTableData
    .map((item, index) => {
      const model = (item.model || '').toLowerCase();
      // 检查模型名称是否匹配
      if (model.includes(keyword)) {
        return index;
      }
      // 检查所有目标模型是否匹配
      if (item.targets && Array.isArray(item.targets)) {
        for (const target of item.targets) {
          const targetModel = (target.target_model || '').toLowerCase();
          if (targetModel.includes(keyword)) {
            return index;
          }
        }
      }
      // 向后兼容：检查旧的 redirect_model
      const redirect = (item.redirect_model || '').toLowerCase();
      if (redirect.includes(keyword)) {
        return index;
      }
      return null;
    })
    .filter(index => index !== null);
}

/**
 * 按关键字筛选模型
 */
function filterModelsByKeyword(keyword) {
  currentModelFilter = (keyword || '').trim();
  renderRedirectTable();
}

function renderRedirectTable() {
  const tbody = document.getElementById('redirectTableBody');
  const countSpan = document.getElementById('redirectCount');

  // 计数所有有效模型（只要有模型名称就算）
  const validCount = redirectTableData.filter(r => r.model && r.model.trim()).length;
  countSpan.textContent = validCount;

  // 初始化事件委托（仅一次）
  initRedirectTableEventDelegation();

  if (redirectTableData.length === 0) {
    const emptyRow = TemplateEngine.render('tpl-redirect-empty', {
      message: window.t('channels.noModelConfig')
    });
    if (emptyRow) {
      tbody.innerHTML = '';
      tbody.appendChild(emptyRow);
    } else {
      // 降级：模板不存在时使用简单HTML
      tbody.innerHTML = `<tr><td colspan="3" style="padding: 20px; text-align: center; color: var(--neutral-500);">${window.t('channels.noModelConfig')}</td></tr>`;
    }
    return;
  }

  // 获取筛选后的索引
  const visibleIndices = getVisibleModelIndices();

  if (visibleIndices.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="padding: 20px; text-align: center; color: var(--neutral-500);">${window.t('channels.noMatchingModels')}</td></tr>`;
    return;
  }

  // 使用DocumentFragment优化批量DOM操作
  const fragment = document.createDocumentFragment();
  visibleIndices.forEach(index => {
    const result = createRedirectRow(redirectTableData[index], index);
    if (result) {
      // createRedirectRow 可能返回单个元素或元素数组
      if (Array.isArray(result)) {
        result.forEach(row => {
          if (row) fragment.appendChild(row);
        });
      } else {
        fragment.appendChild(result);
      }
    }
  });

  tbody.innerHTML = '';
  tbody.appendChild(fragment);

  // 更新全选复选框和批量删除按钮状态
  updateSelectAllModelsCheckbox();
  updateModelBatchDeleteButton();

  // Translate dynamically rendered elements
  if (window.i18n && window.i18n.translatePage) {
    window.i18n.translatePage();
  }
}

// ===== 模型多选删除相关函数 =====

/**
 * 切换单个模型的选中状态
 */
function toggleModelSelection(index, checked) {
  if (checked) {
    selectedModelIndices.add(index);
  } else {
    selectedModelIndices.delete(index);
  }
  updateModelBatchDeleteButton();
  updateSelectAllModelsCheckbox();
}

/**
 * 全选/取消全选模型（仅操作当前可见的模型）
 */
function toggleSelectAllModels(checked) {
  const visibleIndices = getVisibleModelIndices();

  if (checked) {
    visibleIndices.forEach(index => selectedModelIndices.add(index));
  } else {
    visibleIndices.forEach(index => selectedModelIndices.delete(index));
  }

  updateModelBatchDeleteButton();
  renderRedirectTable();
}

/**
 * 更新批量删除按钮状态
 */
function updateModelBatchDeleteButton() {
  const deleteBtn = document.getElementById('batchDeleteModelsBtn');
  const lowercaseBtn = document.getElementById('batchLowercaseModelsBtn');
  const count = selectedModelIndices.size;

  // 更新删除按钮
  if (deleteBtn) {
    const textSpan = deleteBtn.querySelector('span');
    if (count > 0) {
      deleteBtn.disabled = false;
      if (textSpan) textSpan.textContent = window.t('channels.deleteSelectedCount', { count });
      deleteBtn.style.cursor = 'pointer';
      deleteBtn.style.opacity = '1';
      deleteBtn.style.background = 'linear-gradient(135deg, #fef2f2 0%, #fecaca 100%)';
      deleteBtn.style.borderColor = '#fca5a5';
      deleteBtn.style.color = '#dc2626';
    } else {
      deleteBtn.disabled = true;
      if (textSpan) textSpan.textContent = window.t('channels.deleteSelected');
      deleteBtn.style.cursor = '';
      deleteBtn.style.opacity = '0.5';
      deleteBtn.style.background = '';
      deleteBtn.style.borderColor = '';
      deleteBtn.style.color = '';
    }
  }

  // 更新转小写按钮
  if (lowercaseBtn) {
    const textSpan = lowercaseBtn.querySelector('span');
    if (count > 0) {
      lowercaseBtn.disabled = false;
      if (textSpan) textSpan.textContent = window.t('channels.lowercaseSelectedCount', { count });
      lowercaseBtn.style.cursor = 'pointer';
      lowercaseBtn.style.opacity = '1';
      lowercaseBtn.style.background = 'linear-gradient(135deg, #eef7ff 0%, #dcedff 100%)';
      lowercaseBtn.style.borderColor = '#bfdcff';
      lowercaseBtn.style.color = '#0071E3';
    } else {
      lowercaseBtn.disabled = true;
      if (textSpan) textSpan.textContent = window.t('channels.lowercaseSelected');
      lowercaseBtn.style.cursor = '';
      lowercaseBtn.style.opacity = '0.5';
      lowercaseBtn.style.background = '';
      lowercaseBtn.style.borderColor = '';
      lowercaseBtn.style.color = '';
    }
  }
}

/**
 * 批量转换选中模型为小写
 */
function batchLowercaseSelectedModels() {
  const count = selectedModelIndices.size;
  if (count === 0) return;

  let changedCount = 0;

  // 转换选中的模型为小写
  selectedModelIndices.forEach(index => {
    if (redirectTableData[index]) {
      const current = redirectTableData[index].model || '';
      const lowercased = current.toLowerCase();
      if (current !== lowercased) {
        redirectTableData[index].model = lowercased;
        changedCount++;
      }
    }
  });

  // 清除选择并刷新表格
  selectedModelIndices.clear();
  updateModelBatchDeleteButton();
  renderRedirectTable();
  if (changedCount > 0) markChannelFormDirty();
}

/**
 * 更新全选复选框状态（基于当前可见的模型）
 */
function updateSelectAllModelsCheckbox() {
  const checkbox = document.getElementById('selectAllModels');
  if (!checkbox) return;

  const visibleIndices = getVisibleModelIndices();
  const visibleCount = visibleIndices.length;
  const selectedVisibleCount = visibleIndices.filter(i => selectedModelIndices.has(i)).length;

  if (visibleCount === 0) {
    checkbox.checked = false;
    checkbox.indeterminate = false;
  } else if (selectedVisibleCount === visibleCount) {
    checkbox.checked = true;
    checkbox.indeterminate = false;
  } else if (selectedVisibleCount > 0) {
    checkbox.checked = false;
    checkbox.indeterminate = true;
  } else {
    checkbox.checked = false;
    checkbox.indeterminate = false;
  }
}

/**
 * 批量删除选中的模型
 */
function batchDeleteSelectedModels() {
  const count = selectedModelIndices.size;
  if (count === 0) return;

  if (!confirm(window.t('channels.confirmBatchDeleteModels', { count }))) {
    return;
  }

  const tableContainer = document.querySelector('#redirectTableBody').closest('.inline-table-container');
  const scrollTop = tableContainer ? tableContainer.scrollTop : 0;

  // 从大到小排序，确保删除时索引不会错位
  const indicesToDelete = Array.from(selectedModelIndices).sort((a, b) => b - a);

  indicesToDelete.forEach(index => {
    redirectTableData.splice(index, 1);
  });

  selectedModelIndices.clear();
  updateModelBatchDeleteButton();

  renderRedirectTable();
  markChannelFormDirty();

  setTimeout(() => {
    if (tableContainer) {
      tableContainer.scrollTop = Math.min(scrollTop, tableContainer.scrollHeight - tableContainer.clientHeight);
    }
  }, 50);
}

async function fetchModelsFromAPI() {
  const channelUrl = getValidInlineURLs()[0] || '';
  const channelType = document.querySelector('input[name="channelType"]:checked')?.value || 'anthropic';
  const firstValidKey = inlineKeyTableData
    .map(key => (key || '').trim())
    .filter(Boolean)[0];

  if (!channelUrl) {
    if (window.showError) {
      window.showError(window.t('channels.fillApiUrlFirst'));
    } else {
      alert(window.t('channels.fillApiUrlFirst'));
    }
    return;
  }

  if (!firstValidKey) {
    if (window.showError) {
      window.showError(window.t('channels.addAtLeastOneKey'));
    } else {
      alert(window.t('channels.addAtLeastOneKey'));
    }
    return;
  }

  const endpoint = '/admin/channels/models/fetch';
  const fetchOptions = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel_type: channelType,
      url: channelUrl,
      api_key: firstValidKey
    })
  };

  try {
    const response = await fetchAPIWithAuth(endpoint, fetchOptions);
    if (!response.success) throw new Error(response.error || window.t('channels.fetchModelsFailed', { error: '' }));
    const data = response.data || {};

    if (!data.models || data.models.length === 0) {
      throw new Error(window.t('channels.noModelsFromApi'));
    }

    // 获取现有模型名称集合
    const existingModels = new Set(
      redirectTableData
        .map(r => (r.model || '').trim().toLowerCase())
        .filter(Boolean)
    );

    // 添加新模型（不重复）- data.models 现在是 ModelEntry 数组
    let addedCount = 0;
    for (const entry of data.models) {
      const modelName = typeof entry === 'string' ? entry : entry.model;
      const modelKey = (modelName || '').trim().toLowerCase();
      if (modelName && !existingModels.has(modelKey)) {
        // 使用返回的 redirect_model，如果没有则使用 model
        const redirectModel = (typeof entry === 'object' && entry.redirect_model) ? entry.redirect_model : modelName;
        // 使用新的多目标数据结构
        redirectTableData.push({
          model: modelName,
          targets: redirectModel && redirectModel !== modelName ? [{
            target_model: redirectModel,
            weight: 1
          }] : [],
          expanded: false
        });
        existingModels.add(modelKey);
        addedCount++;
      }
    }

    renderRedirectTable();
    if (addedCount > 0) markChannelFormDirty();

    const source = data.source === 'api' ? window.t('channels.fetchModelsSource.api') : window.t('channels.fetchModelsSource.predefined');
    if (window.showSuccess) {
      window.showSuccess(window.t('channels.fetchModelsSuccess', { added: addedCount, source, total: data.models.length }));
    } else {
      alert(window.t('channels.fetchModelsSuccess', { added: addedCount, source, total: data.models.length }));
    }

  } catch (error) {
    console.error('Fetch models failed', error);

    if (window.showError) {
      window.showError(window.t('channels.fetchModelsFailed', { error: error.message }));
    } else {
      alert(window.t('channels.fetchModelsFailed', { error: error.message }));
    }
  }
}

// 常用模型配置
const COMMON_MODELS = {
  anthropic: [
    'claude-sonnet-4-5-20250929',
    'claude-haiku-4-5-20251001',
    'claude-opus-4-6',
    'claude-sonnet-4-6',
  ],
  codex: [
    'gpt-5.1-codex-mini',
    'gpt-5.2',
    'gpt-5.2-codex',
    'gpt-5.3-codex',
    'gpt-5.4'
  ],
  gemini: [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.5-flash-lite',
    'gemini-3-flash-preview',
    'gemini-3-pro-preview'
  ]
};

function addCommonModels() {
  const channelType = document.querySelector('input[name="channelType"]:checked')?.value || 'anthropic';
  const commonModels = COMMON_MODELS[channelType];

  if (!commonModels || commonModels.length === 0) {
    if (window.showWarning) {
      window.showWarning(window.t('channels.noPresetModels', { type: channelType }));
    } else {
      alert(window.t('channels.noPresetModels', { type: channelType }));
    }
    return;
  }

  // 获取现有模型名称集合
  const existingModels = new Set(
    redirectTableData
      .map(r => (r.model || '').trim().toLowerCase())
      .filter(Boolean)
  );

  // 添加常用模型（不重复）
  let addedCount = 0;
  for (const modelName of commonModels) {
    const modelKey = modelName.toLowerCase();
    if (!existingModels.has(modelKey)) {
      // 使用新的多目标数据结构
      redirectTableData.push({
        model: modelName,
        targets: [], // 常用模型默认无重定向
        expanded: false
      });
      existingModels.add(modelKey);
      addedCount++;
    }
  }

  renderRedirectTable();
  if (addedCount > 0) markChannelFormDirty();

  if (window.showSuccess) {
    window.showSuccess(window.t('channels.addedCommonModels', { count: addedCount }));
  }
}
