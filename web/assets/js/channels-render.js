// 渠道类型配置常量
const CHANNEL_TYPE_CONFIGS = {
  'anthropic': {
    text: 'Claude',
    color: '#0A84FF',
    bgColor: '#EAF4FF',
    borderColor: '#B9DBFF'
  },
  'codex': {
    text: 'Codex',
    color: '#059669',
    bgColor: '#d1fae5',
    borderColor: '#6ee7b7'
  },
  'openai': {
    text: 'OpenAI',
    color: '#10b981',
    bgColor: '#d1fae5',
    borderColor: '#6ee7b7'
  },
  'gemini': {
    text: 'Gemini',
    color: '#2C9ED1',
    bgColor: '#EAF8FF',
    borderColor: '#B9E9FF'
  }
};

/**
 * 获取成功率对应的颜色
 * @param {number} rate - 成功率数值
 * @returns {string} CSS颜色值
 */
function getSuccessRateColor(rate) {
  if (!Number.isFinite(rate)) return 'var(--neutral-600)';
  if (rate >= 95) return 'var(--success-600)';
  if (rate < 80) return 'var(--error-500)';
  return 'var(--warning-600)';
}

/**
 * 生成有效优先级显示HTML
 * @param {Object} channel - 渠道数据
 * @returns {string} HTML字符串
 */
function buildEffectivePriorityHtml(channel) {
  if (channel.effective_priority === null || channel.effective_priority === undefined) {
    return '';
  }

  const effPriority = channel.effective_priority.toFixed(1);
  const basePriority = channel.priority;
  const diff = channel.effective_priority - basePriority;

  // 成功率文本
  const successRateText = channel.success_rate !== undefined
    ? window.t('channels.stats.successRate', { rate: (channel.success_rate * 100).toFixed(1) + '%' })
    : '';

  // 如果有效优先级与基础优先级相同，显示绿色勾号
  if (Math.abs(diff) < 0.1) {
    const title = successRateText ? `${window.t('channels.stats.healthy')} | ${successRateText}` : window.t('channels.stats.healthy');
    return ` <span style="color: #16a34a; font-size: 0.8rem;" title="${title}">(✓${effPriority})</span>`;
  }

  // 有效优先级降低时显示红色
  const title = successRateText
    ? `${window.t('channels.stats.effectivePriority', { priority: effPriority })} | ${successRateText}`
    : window.t('channels.stats.effectivePriority', { priority: effPriority });

  return ` <span style="color: #dc2626; font-size: 0.8rem;" title="${title}">(↓${effPriority})</span>`;
}

function inlineCooldownBadge(c) {
  const ms = c.cooldown_remaining_ms || 0;
  if (!ms || ms <= 0) return '';
  const text = humanizeMS(ms);
  return ` <span style="color: #dc2626; font-size: 0.875rem; font-weight: 500; background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); padding: 2px 8px; border-radius: 4px; border: 1px solid #fca5a5;">${window.t('channels.cooldownBadge', { time: text })}</span>`;
}

function renderChannelStatsInline(stats, cache, channelType) {
  if (!stats) {
    return `<span class="channel-stat-badge" style="margin-left: 6px; color: var(--neutral-500);">${window.t('channels.stats.noStats')}</span>`;
  }

  const successRateText = cache?.successRateText || formatSuccessRate(stats.success, stats.total);
  const avgFirstByteText = cache?.avgFirstByteText || formatAvgFirstByte(stats.avgFirstByteTimeSeconds);
  const inputTokensText = cache?.inputTokensText || formatMetricNumber(stats.totalInputTokens);
  const outputTokensText = cache?.outputTokensText || formatMetricNumber(stats.totalOutputTokens);
  const cacheReadText = cache?.cacheReadText || formatMetricNumber(stats.totalCacheReadInputTokens);
  const cacheCreationText = cache?.cacheCreationText || formatMetricNumber(stats.totalCacheCreationInputTokens);
  const costDisplay = cache?.costDisplay || formatCostValue(stats.totalCost);

  const successRateColor = getSuccessRateColor(Number(successRateText.replace('%', '')));

  const callText = `${formatMetricNumber(stats.success)}/${formatMetricNumber(stats.error)}`;
  const rangeLabel = getStatsRangeLabel(channelStatsRange);

  // 统计徽章样式配置
  const badgeStyles = {
    default: 'color: var(--neutral-800);',
    success: 'color: var(--success-600); background: var(--success-50); border-color: var(--success-100);',
    primary: 'color: var(--primary-700); background: var(--primary-50); border-color: var(--primary-100);',
    warning: 'color: var(--warning-700); background: var(--warning-50); border-color: var(--warning-100);'
  };

  const createBadge = (style, label, value) =>
    `<span class="channel-stat-badge" style="${style}"><strong>${label}</strong> ${value}</span>`;

  const parts = [
    createBadge(badgeStyles.default, `${rangeLabel}${window.t('channels.stats.calls')}`, callText),
    createBadge(`color: ${successRateColor};`, window.t('channels.stats.rate'), successRateText),
    createBadge(badgeStyles.default, window.t('channels.stats.firstByte'), avgFirstByteText),
    createBadge(badgeStyles.default, 'In', inputTokensText),
    createBadge(badgeStyles.default, 'Out', outputTokensText)
  ];

  const supportsCaching = channelType === 'anthropic' || channelType === 'codex';
  if (supportsCaching) {
    parts.push(
      createBadge(badgeStyles.success, window.t('channels.stats.cacheRead'), cacheReadText),
      createBadge(badgeStyles.primary, window.t('channels.stats.cacheCreate'), cacheCreationText)
    );
  }

  parts.push(createBadge(badgeStyles.warning, window.t('channels.stats.cost'), costDisplay));

  return parts.join(' ');
}

/**
 * 获取渠道类型配置信息
 * @param {string} channelType - 渠道类型
 * @returns {Object} 类型配置
 */
function getChannelTypeConfig(channelType) {
  const type = (channelType || '').toLowerCase();
  return CHANNEL_TYPE_CONFIGS[type] || CHANNEL_TYPE_CONFIGS['anthropic'];
}

/**
 * 生成渠道类型徽章HTML
 * @param {string} channelType - 渠道类型
 * @returns {string} 徽章HTML
 */
function buildChannelTypeBadge(channelType) {
  const config = getChannelTypeConfig(channelType);
  return `<span style="background: ${config.bgColor}; color: ${config.color}; padding: 3px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; margin-left: 8px; border: 1.5px solid ${config.borderColor}; letter-spacing: 0.025em; text-transform: uppercase;">${config.text}</span>`;
}

/**
 * 使用模板引擎创建渠道卡片元素
 * @param {Object} channel - 渠道数据
 * @returns {HTMLElement|null} 卡片元素
 */
function createChannelCard(channel) {
  const isCooldown = channel.cooldown_remaining_ms > 0;
  const cardClasses = ['glass-card'];
  if (isCooldown) cardClasses.push('channel-card-cooldown');
  if (!channel.enabled) cardClasses.push('channel-disabled');

  const channelTypeRaw = (channel.channel_type || '').toLowerCase();
  const stats = channelStatsById[channel.id] || null;

  // 预计算统计数据
  const STATS_CACHE_FIELDS = [
    { key: 'successRateText', fn: () => formatSuccessRate(stats.success, stats.total) },
    { key: 'avgFirstByteText', fn: () => formatAvgFirstByte(stats.avgFirstByteTimeSeconds) },
    { key: 'inputTokensText', fn: () => formatMetricNumber(stats.totalInputTokens) },
    { key: 'outputTokensText', fn: () => formatMetricNumber(stats.totalOutputTokens) },
    { key: 'cacheReadText', fn: () => formatMetricNumber(stats.totalCacheReadInputTokens) },
    { key: 'cacheCreationText', fn: () => formatMetricNumber(stats.totalCacheCreationInputTokens) },
    { key: 'costDisplay', fn: () => formatCostValue(stats.totalCost) }
  ];

  const statsCache = stats ? Object.fromEntries(
    STATS_CACHE_FIELDS.map(({ key, fn }) => [key, fn()])
  ) : null;

  const statsHtml = stats && statsCache
    ? `<span class="channel-stats-inline">${renderChannelStatsInline(stats, statsCache, channelTypeRaw)}</span>`
    : '';

  // 新格式：models 是 {model, redirect_model} 对象数组
  const modelsText = Array.isArray(channel.models)
    ? channel.models.map(m => m.model || m).join(', ')
    : '';

  // 准备模板数据
  const cardData = {
    cardClasses: cardClasses.join(' '),
    id: channel.id,
    name: channel.name,
    typeBadge: buildChannelTypeBadge(channelTypeRaw),
    modelsText: modelsText,
    url: channel.url,
    priority: channel.priority,
    effectivePriorityHtml: buildEffectivePriorityHtml(channel),
    statusText: channel.enabled ? window.t('channels.statusEnabled') : window.t('channels.statusDisabled'),
    cooldownBadge: inlineCooldownBadge(channel),
    statsHtml: statsHtml,
    enabled: channel.enabled,
    toggleText: channel.enabled ? window.t('common.disable') : window.t('common.enable'),
    toggleTitle: channel.enabled ? window.t('channels.toggleDisable') : window.t('channels.toggleEnable')
  };

  // 使用模板引擎渲染
  const card = TemplateEngine.render('tpl-channel-card', cardData);
  return card;
}

/**
 * 初始化渠道卡片事件委托 (替代inline onclick)
 */
function initChannelEventDelegation() {
  const container = document.getElementById('channels-container');
  if (!container || container.dataset.delegated) return;

  container.dataset.delegated = 'true';

  // 事件委托：处理渠道多选复选框
  container.addEventListener('change', (e) => {
    const checkbox = e.target.closest('.channel-select-checkbox');
    if (!checkbox) return;

    const channelId = normalizeSelectedChannelID(checkbox.dataset.channelId);
    if (!channelId) return;

    if (checkbox.checked) {
      selectedChannelIds.add(channelId);
    } else {
      selectedChannelIds.delete(channelId);
    }

    if (typeof updateBatchChannelSelectionUI === 'function') {
      updateBatchChannelSelectionUI();
    }
  });

  // 事件委托：处理所有渠道操作按钮
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.channel-action-btn');
    if (!btn) return;

    const action = btn.dataset.action;
    const channelId = parseInt(btn.dataset.channelId);
    const channelName = btn.dataset.channelName;
    const enabled = btn.dataset.enabled === 'true';

    const ACTION_HANDLERS = {
      'edit': () => editChannel(channelId),
      'test': () => testChannel(channelId, channelName),
      'toggle': () => toggleChannel(channelId, !enabled),
      'copy': () => copyChannel(channelId, channelName),
      'delete': () => deleteChannel(channelId, channelName)
    };

    const handler = ACTION_HANDLERS[action];
    if (handler) handler();
  });
}

function renderChannels(channelsToRender = channels) {
  const el = document.getElementById('channels-container');
  if (!channelsToRender || channelsToRender.length === 0) {
    el.innerHTML = `<div class="glass-card">${window.t('channels.noChannels')}</div>`;
    if (typeof updateBatchChannelSelectionUI === 'function') {
      updateBatchChannelSelectionUI();
    }
    return;
  }

  // 初始化事件委托（仅一次）
  initChannelEventDelegation();

  // 使用DocumentFragment优化批量DOM操作
  const fragment = document.createDocumentFragment();
  channelsToRender.forEach(channel => {
    const card = createChannelCard(channel);
    if (card) fragment.appendChild(card);
  });

  el.innerHTML = '';
  el.appendChild(fragment);

  // 模板渲染后设置 checkbox 选中态（HTML <template> 会小写化属性名，不能用模板变量做 boolean attribute）
  el.querySelectorAll('.channel-select-checkbox').forEach(cb => {
    cb.checked = selectedChannelIds.has(normalizeSelectedChannelID(cb.dataset.channelId));
  });

  // Translate dynamically rendered elements
  if (window.i18n && window.i18n.translatePage) {
    window.i18n.translatePage();
  }

  if (typeof updateBatchChannelSelectionUI === 'function') {
    updateBatchChannelSelectionUI();
  }
}
