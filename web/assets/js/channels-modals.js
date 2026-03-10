const DEFAULT_ENDPOINTS = {
  anthropic: '/v1/messages',
  codex: '/v1/responses',
  openai: '/v1/chat/completions',
  gemini: '/v1beta/models/gemini-pro:generateContent'
};

function setChannelModalTitle(i18nKey) {
  const titleEl = document.getElementById('modalTitle');
  if (!titleEl) return;

  titleEl.setAttribute('data-i18n', i18nKey);
  titleEl.textContent = window.t(i18nKey);
}

async function resolveEditableChannel(id) {
  const cachedChannel = Array.isArray(channels) ? channels.find(c => c.id === id) : null;
  if (cachedChannel) {
    return cachedChannel;
  }

  try {
    return await fetchDataWithAuth(`/admin/channels/${id}`);
  } catch (error) {
    console.error('Failed to fetch channel', error);
    return null;
  }
}

function normalizeRedirectTargets(targets, redirectModel, modelName) {
  const seen = new Set();
  const normalized = [];

  if (Array.isArray(targets)) {
    targets.forEach((target) => {
      const targetModel = (target?.target_model || target?.targetModel || '').trim();
      if (!targetModel) return;
      const key = targetModel.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      normalized.push({
        target_model: targetModel,
        weight: Number.isFinite(Number(target?.weight)) && Number(target.weight) > 0 ? Number(target.weight) : 1
      });
    });
  }

  const redirect = (redirectModel || '').trim();
  const model = (modelName || '').trim();
  if (normalized.length === 0 && redirect && redirect !== model) {
    normalized.push({ target_model: redirect, weight: 1 });
  }

  return normalized;
}

function normalizeEditorTargets(targets, redirectModel, modelName) {
  const normalized = [];

  if (Array.isArray(targets)) {
    targets.forEach((target) => {
      normalized.push({
        target_model: (target?.target_model || target?.targetModel || '').trim(),
        weight: Number.isFinite(Number(target?.weight)) && Number(target.weight) > 0 ? Number(target.weight) : 1
      });
    });
  }

  if (normalized.length === 0) {
    const redirect = (redirectModel || '').trim();
    const model = (modelName || '').trim();
    if (redirect && redirect !== model) {
      normalized.push({ target_model: redirect, weight: 1 });
    }
  }

  return normalized;
}

function getPrimaryRedirectModel(targets, modelName) {
  if (!Array.isArray(targets) || targets.length !== 1) return '';
  const target = (targets[0]?.target_model || '').trim();
  const model = (modelName || '').trim();
  if (!target || target === model) return '';
  return target;
}

function normalizeRedirectEditorRow(entry) {
  const model = (entry?.model || '').trim();
  const targets = normalizeEditorTargets(entry?.targets, entry?.redirect_model, model);
  return {
    model,
    redirect_model: getPrimaryRedirectModel(normalizeRedirectTargets(targets, entry?.redirect_model, model), model),
    targets
  };
}

function formatTargetsForInput(targets) {
  if (!Array.isArray(targets) || targets.length === 0) return '';
  return targets.map((target) => {
    const targetModel = (target?.target_model || '').trim();
    const weight = Number(target?.weight) > 0 ? Number(target.weight) : 1;
    return weight > 1 ? `${targetModel} * ${weight}` : targetModel;
  }).join('\n');
}

function parseTargetsInput(input) {
  const seen = new Set();
  return String(input || '')
    .split(/[\n,]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .map((item) => {
      const match = item.match(/^(.*?)\s*(?:[*xX@]\s*(\d+))?$/);
      const targetModel = (match?.[1] || item).trim();
      const weight = match?.[2] ? parseInt(match[2], 10) : 1;
      return {
        target_model: targetModel,
        weight: Number.isFinite(weight) && weight > 0 ? weight : 1
      };
    })
    .filter((item) => {
      const key = item.target_model.toLowerCase();
      if (!item.target_model || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function syncRedirectRow(row) {
  if (!row) return;
  row.targets = Array.isArray(row.targets)
    ? row.targets.map((target) => ({
        target_model: (target?.target_model || '').trim(),
        weight: Number.isFinite(Number(target?.weight)) && Number(target.weight) > 0 ? Number(target.weight) : 1
      }))
    : [];
  const validTargets = normalizeRedirectTargets(row.targets, row.redirect_model, row.model);
  row.redirect_model = getPrimaryRedirectModel(validTargets, row.model);
}

function renderRedirectTargetsPreview(container, targets) {
  if (!container) return;
  container.innerHTML = '';
  if (!Array.isArray(targets) || targets.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'redirect-targets-empty';
    empty.textContent = window.t('channels.leaveEmptyNoRedirect');
    container.appendChild(empty);
    return;
  }

  targets.forEach((target) => {
    const pill = document.createElement('span');
    pill.className = 'redirect-target-chip';
    const weight = Number(target.weight) > 0 ? Number(target.weight) : 1;
    pill.textContent = weight > 1 ? `${target.target_model} × ${weight}` : target.target_model;
    container.appendChild(pill);
  });
}

function updateDefaultEndpointHint() {
  const channelType = document.querySelector('input[name="channelType"]:checked')?.value || 'anthropic';
  const defaultEndpoint = DEFAULT_ENDPOINTS[channelType] || '';
  const input = document.getElementById('channelCustomEndpoint');
  if (input && defaultEndpoint) {
    input.placeholder = `例如 ${defaultEndpoint}，留空使用默认`;
  }
}

function handleChannelTypeChange(event) {
  if (event.target.name === 'channelType') {
    updateDefaultEndpointHint();
  }
}

function initChannelTypeDelegation() {
  const modal = document.getElementById('channelModal');
  if (modal && !modal.dataset.channelTypeDelegated) {
    modal.dataset.channelTypeDelegated = 'true';
    modal.addEventListener('change', handleChannelTypeChange);
  }
}

async function handleChannelSaveSuccess({ isNewChannel, newChannelType, savedChannelId, response }) {
  if (window.ChannelModalHooks && typeof window.ChannelModalHooks.afterSave === 'function') {
    await window.ChannelModalHooks.afterSave({
      isNewChannel,
      newChannelType,
      savedChannelId,
      response
    });
    return;
  }

  clearChannelsCache();

  const hasFilters = typeof filters !== 'undefined' && filters;
  const currentType = hasFilters ? filters.channelType : 'all';
  let nextType = currentType || 'all';

  // 新增渠道时，如果类型与当前筛选器不匹配，切换到新渠道的类型
  if (isNewChannel && hasFilters && currentType !== 'all' && currentType !== newChannelType) {
    filters.channelType = newChannelType;
    nextType = newChannelType;
    const typeFilter = document.getElementById('channelTypeFilter');
    if (typeFilter) typeFilter.value = newChannelType;
    if (typeof saveChannelsFilters === 'function') saveChannelsFilters();
  }

  if (typeof loadChannels === 'function') {
    await loadChannels(nextType);
  }
}

function showAddModal() {
  editingChannelId = null;
  currentChannelKeyCooldowns = [];

  setChannelModalTitle('channels.addChannel');
  document.getElementById('channelForm').reset();
  document.getElementById('channelEnabled').checked = true;
  document.querySelector('input[name="channelType"][value="anthropic"]').checked = true;
  document.querySelector('input[name="keyStrategy"][value="sequential"]').checked = true;
  initChannelTypeDelegation();
  updateDefaultEndpointHint();

  redirectTableData = [];
  selectedModelIndices.clear();
  currentModelFilter = '';
  const modelFilterInput = document.getElementById('modelFilterInput');
  if (modelFilterInput) modelFilterInput.value = '';
  renderRedirectTable();

  inlineURLTableData = [''];
  selectedURLIndices.clear();
  renderInlineURLTable();

  inlineKeyTableData = [''];
  inlineKeyVisible = true;
  document.getElementById('inlineEyeIcon').style.display = 'none';
  document.getElementById('inlineEyeOffIcon').style.display = 'block';
  renderInlineKeyTable();

  resetChannelFormDirty();
  document.getElementById('channelModal').classList.add('show');
}

async function editChannel(id) {
  const channel = await resolveEditableChannel(id);
  if (!channel) return;

  editingChannelId = id;

  setChannelModalTitle('channels.editChannel');
  document.getElementById('channelName').value = channel.name;
  setInlineURLTableData(channel.url);

  // 多URL时异步加载URL实时状态（延迟、冷却）
  const urlCount = getValidInlineURLs().length;
  if (urlCount > 1) {
    fetchURLStats(id);
  }

  let apiKeys = [];
  try {
    apiKeys = (await fetchDataWithAuth(`/admin/channels/${id}/keys`)) || [];
  } catch (e) {
    console.error('Failed to fetch API Keys', e);
  }

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

  inlineKeyVisible = true;
  document.getElementById('inlineEyeIcon').style.display = 'none';
  document.getElementById('inlineEyeOffIcon').style.display = 'block';
  renderInlineKeyTable();

  const channelType = channel.channel_type || 'anthropic';
  await window.ChannelTypeManager.renderChannelTypeRadios('channelTypeRadios', channelType);
  initChannelTypeDelegation();
  updateDefaultEndpointHint();
  const keyStrategy = channel.key_strategy || 'sequential';
  const strategyRadio = document.querySelector(`input[name="keyStrategy"][value="${keyStrategy}"]`);
  if (strategyRadio) {
    strategyRadio.checked = true;
  }
  document.getElementById('channelPriority').value = channel.priority;
  document.getElementById('channelDailyCostLimit').value = channel.daily_cost_limit || 0;
  document.getElementById('channelCustomUserAgent').value = channel.custom_user_agent || '';
  document.getElementById('channelCustomEndpoint').value = channel.custom_endpoint || '';
  document.getElementById('channelEnabled').checked = channel.enabled;

  // 加载模型配置（新格式：models是 {model, redirect_model} 数组）
  redirectTableData = (channel.models || []).map(normalizeRedirectEditorRow);
  selectedModelIndices.clear();
  currentModelFilter = '';
  const modelFilterInput = document.getElementById('modelFilterInput');
  if (modelFilterInput) modelFilterInput.value = '';
  renderRedirectTable();

  resetChannelFormDirty();
  document.getElementById('channelModal').classList.add('show');
}

function closeModal() {
  if (channelFormDirty && !confirm(window.t('channels.unsavedChanges'))) {
    return;
  }
  document.getElementById('channelModal').classList.remove('show');
  editingChannelId = null;
  resetChannelFormDirty();
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

  // 构建模型配置（新格式：models 数组）
  const models = redirectTableData
    .map(normalizeRedirectEditorRow)
    .filter(r => r.model && r.model.trim())
    .map(r => ({
      model: r.model.trim(),
      redirect_model: r.redirect_model,
      targets: r.targets
    }));
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
    return;
  }

  const channelType = document.querySelector('input[name="channelType"]:checked')?.value || 'anthropic';
  const keyStrategy = document.querySelector('input[name="keyStrategy"]:checked')?.value || 'sequential';

  const formData = {
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

  if (!formData.name || !formData.url || !formData.api_key || formData.models.length === 0) {
    if (window.showError) window.showError(window.t('channels.fillAllRequired'));
    return;
  }

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
    const savedChannelId = editingChannelId;

    resetChannelFormDirty(); // 保存成功，重置dirty状态（避免closeModal弹确认框）
    closeModal();
    await handleChannelSaveSuccess({ isNewChannel, newChannelType, savedChannelId, response: resp });
    if (window.showSuccess) window.showSuccess(isNewChannel ? window.t('channels.channelAdded') : window.t('channels.channelUpdated'));
  } catch (e) {
    console.error('Save channel failed', e);
    if (window.showError) window.showError(window.t('channels.saveFailed', { error: e.message }));
  }
}

function deleteChannel(id, name) {
  deletingChannelId = id;
  document.getElementById('deleteChannelName').textContent = name;
  document.getElementById('deleteModal').classList.add('show');
}

function closeDeleteModal() {
  document.getElementById('deleteModal').classList.remove('show');
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

async function copyChannel(id, name) {
  const channel = channels.find(c => c.id === id);
  if (!channel) return;

  const copiedName = generateCopyName(name);

  editingChannelId = null;
  currentChannelKeyCooldowns = [];
  setChannelModalTitle('channels.copyChannel');
  document.getElementById('channelName').value = copiedName;
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

  const channelType = channel.channel_type || 'anthropic';
  const radioButton = document.querySelector(`input[name="channelType"][value="${channelType}"]`);
  if (radioButton) {
    radioButton.checked = true;
  }
  const keyStrategy = channel.key_strategy || 'sequential';
  const strategyRadio = document.querySelector(`input[name="keyStrategy"][value="${keyStrategy}"]`);
  if (strategyRadio) {
    strategyRadio.checked = true;
  }
  document.getElementById('channelPriority').value = channel.priority;
  document.getElementById('channelDailyCostLimit').value = channel.daily_cost_limit || 0;
  document.getElementById('channelEnabled').checked = true;

  // 加载模型配置（新格式：models是 {model, redirect_model} 数组）
  redirectTableData = (channel.models || []).map(normalizeRedirectEditorRow);
  selectedModelIndices.clear();
  currentModelFilter = '';
  const modelFilterInput = document.getElementById('modelFilterInput');
  if (modelFilterInput) modelFilterInput.value = '';
  renderRedirectTable();

  resetChannelFormDirty();
  document.getElementById('channelModal').classList.add('show');
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
      const targets = redirect && redirect !== model ? [{ target_model: redirect, weight: 1 }] : [];
      result.push({ model, redirect_model: redirect !== model ? redirect : '', targets });
    }
  }

  return result;
}

function addRedirectRow() {
  redirectTableData.push({
    model: '',
    redirect_model: '',
    targets: [{
      target_model: '',
      weight: 1
    }]
  });
  renderRedirectTable();
  markChannelFormDirty();

  setTimeout(() => {
    const rows = document.querySelectorAll('#redirectTableBody .redirect-from-input');
    const input = rows[rows.length - 1];
    if (input) input.focus();
  }, 0);
}

function openModelImportModal() {
  document.getElementById('modelImportTextarea').value = '';
  document.getElementById('modelImportPreviewContent').style.display = 'none';
  document.getElementById('modelImportModal').classList.add('show');
  setTimeout(() => document.getElementById('modelImportTextarea').focus(), 100);
}

function closeModelImportModal() {
  document.getElementById('modelImportModal').classList.remove('show');
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
      redirectTableData.push(normalizeRedirectEditorRow(entry));
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
    if (field === 'model') {
      syncRedirectRow(redirectTableData[index]);
    }

    markChannelFormDirty();
  }
}

/**
 * 使用模板引擎创建重定向行元素
 * @param {Object} redirect - 重定向数据
 * @param {number} index - 索引
 * @returns {HTMLElement|null} 表格行元素
 */
function createRedirectRow(redirect, index) {
  const normalizedRedirect = normalizeRedirectEditorRow(redirect);
  const targets = normalizedRedirect.targets.length > 0
    ? normalizedRedirect.targets
    : [{ target_model: '', weight: 1 }];
  const targetsHtml = targets.map((target, targetIndex) => {
    const addTargetHtml = targetIndex === targets.length - 1
      ? `<button type="button" class="add-target-btn" data-index="${index}" data-i18n-title="channels.addTarget" title="${window.t('channels.addTarget')}" aria-label="${window.t('channels.addTarget')}">+</button>`
      : '<span class="model-target-inline-spacer" aria-hidden="true"></span>';
    const targetRow = TemplateEngine.render('tpl-redirect-target-row', {
      modelIndex: index,
      targetIndex: targetIndex,
      targetModel: target.target_model || '',
      targetPlaceholder: window.t('channels.leaveEmptyNoRedirect'),
      weight: Number(target.weight) > 0 ? Number(target.weight) : 1,
      addTargetHtml
    });
    return targetRow ? targetRow.outerHTML : '';
  }).join('');
  const rowData = {
    index: index,
    displayIndex: index + 1,
    from: normalizedRedirect.model,
    targetsHtml
  };

  const row = TemplateEngine.render('tpl-redirect-row', rowData);
  if (!row) {
    console.error('[Channels] Template tpl-redirect-row not found');
    return null;
  }

  // 设置复选框选中状态
  const checkbox = row.querySelector('.model-checkbox');
  if (checkbox) {
    checkbox.checked = selectedModelIndices.has(index);
  }

  return row;
}

/**
 * 初始化重定向表格事件委托 (替代inline onchange/onclick)
 */
function initRedirectTableEventDelegation() {
  const tbody = document.getElementById('redirectTableBody');
  if (!tbody || tbody.dataset.delegated) return;

  tbody.dataset.delegated = 'true';

  // 处理输入框变更
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
      return;
    }

    const targetWeightInput = e.target.closest('.target-weight-input');
    if (targetWeightInput) {
      const modelIndex = parseInt(targetWeightInput.dataset.modelIndex);
      const targetIndex = parseInt(targetWeightInput.dataset.targetIndex);
      updateTargetRow(modelIndex, targetIndex, 'weight', targetWeightInput.value);
    }
  });

  // 处理删除按钮和转小写按钮点击
  tbody.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.redirect-delete-btn');
    if (deleteBtn) {
      const index = parseInt(deleteBtn.dataset.index);
      deleteRedirectRow(index);
      return;
    }

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

    const addTargetBtn = e.target.closest('.add-target-btn');
    if (addTargetBtn) {
      const index = parseInt(addTargetBtn.dataset.index);
      addTargetToModel(index);
      return;
    }

    const deleteTargetBtn = e.target.closest('.target-delete-btn');
    if (deleteTargetBtn) {
      const modelIndex = parseInt(deleteTargetBtn.dataset.modelIndex);
      const targetIndex = parseInt(deleteTargetBtn.dataset.targetIndex);
      deleteTargetFromModel(modelIndex, targetIndex);
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
    }
  });
}

/**
 * 获取筛选后的模型索引列表
 */
function getVisibleModelIndices() {
  if (!currentModelFilter) {
    return redirectTableData.map((_, index) => index);
  }
  const keyword = currentModelFilter.toLowerCase();
  return redirectTableData
    .map((item, index) => {
      const model = (item.model || '').toLowerCase();
      const targets = formatTargetsForInput(item.targets || []).toLowerCase();
      if (model.includes(keyword) || targets.includes(keyword)) {
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
    const row = createRedirectRow(redirectTableData[index], index);
    if (row) fragment.appendChild(row);
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

function addTargetToModel(index) {
  if (!redirectTableData[index]) return;
  if (!Array.isArray(redirectTableData[index].targets)) {
    redirectTableData[index].targets = [];
  }
  redirectTableData[index].targets.push({
    target_model: '',
    weight: 1
  });
  const newTargetIndex = redirectTableData[index].targets.length - 1;
  renderRedirectTable();
  markChannelFormDirty();
  setTimeout(() => {
    const input = document.querySelector(`.target-model-input[data-model-index="${index}"][data-target-index="${newTargetIndex}"]`);
    if (input) input.focus();
  }, 0);
}

function deleteTargetFromModel(modelIndex, targetIndex) {
  if (!redirectTableData[modelIndex] || !Array.isArray(redirectTableData[modelIndex].targets)) return;
  if (redirectTableData[modelIndex].targets.length <= 1) {
    deleteRedirectRow(modelIndex);
    return;
  }
  redirectTableData[modelIndex].targets.splice(targetIndex, 1);
  syncRedirectRow(redirectTableData[modelIndex]);
  renderRedirectTable();
  markChannelFormDirty();
}

function updateTargetRow(modelIndex, targetIndex, field, value) {
  if (!redirectTableData[modelIndex] || !Array.isArray(redirectTableData[modelIndex].targets)) return;
  const target = redirectTableData[modelIndex].targets[targetIndex];
  if (!target) return;

  if (field === 'target_model') {
    const nextValue = value.trim();
    if (target.target_model === nextValue) return;
    target.target_model = nextValue;
  } else if (field === 'weight') {
    const nextValue = parseInt(value, 10) || 1;
    if (target.weight === nextValue) return;
    target.weight = nextValue;
  }

  syncRedirectRow(redirectTableData[modelIndex]);
  markChannelFormDirty();
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
      lowercaseBtn.style.background = 'linear-gradient(135deg, #eff6ff 0%, #bfdbfe 100%)';
      lowercaseBtn.style.borderColor = '#93c5fd';
      lowercaseBtn.style.color = '#2563eb';
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
        const normalizedEntry = typeof entry === 'object'
          ? normalizeRedirectEditorRow(entry)
          : normalizeRedirectEditorRow({ model: modelName });
        redirectTableData.push(normalizedEntry);
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
      redirectTableData.push(normalizeRedirectEditorRow({ model: modelName }));
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
