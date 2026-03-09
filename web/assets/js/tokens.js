    const t = window.t;
    const API_BASE = '/admin';
    let allTokens = [];
    let isToday = true;      // 是否为本日（本日才显示最近一分钟）

    // 当前选中的时间范围(默认为本日)
    let currentTimeRange = 'today';

    // 模型限制相关状态（2026-01新增）
    let editAllowedModels = [];              // 编辑模态框中当前的模型限制列表
    let selectedAllowedModelIndices = new Set(); // 已选中的模型索引（批量删除用）
    let allChannels = [];                    // 渠道数据缓存
    let availableModelsCache = [];           // 可用模型缓存
    let selectedModelsForAdd = new Set();    // 模型选择对话框中已选的模型
    let currentVisibleModels = [];            // 当前可见的模型列表（用于全选功能）

    document.addEventListener('DOMContentLoaded', () => {
      // 初始化时间范围选择器
      window.initTimeRangeSelector((range) => {
        currentTimeRange = range;
        loadTokens();
      });

      // 加载令牌列表(默认显示本日统计)
      loadTokens();

      // 预加载渠道数据（用于模型选择）
      loadChannelsData();

      // 初始化事件委托
      initEventDelegation();

      document.getElementById('tokenExpiry').addEventListener('change', (e) => {
        document.getElementById('customExpiryContainer').style.display =
          e.target.value === 'custom' ? 'block' : 'none';
      });
      document.getElementById('editTokenExpiry').addEventListener('change', (e) => {
        document.getElementById('editCustomExpiryContainer').style.display =
          e.target.value === 'custom' ? 'block' : 'none';
      });

      // 监听语言切换事件，重新渲染令牌列表
      window.i18n.onLocaleChange(() => {
        renderTokens();
      });
    });

    /**
     * 初始化事件委托(统一处理表格内按钮点击)
     */
    function initEventDelegation() {
      const container = document.getElementById('tokens-container');
      if (!container) return;

      container.addEventListener('click', (e) => {
        const target = e.target;

        // 处理复制令牌按钮
        if (target.classList.contains('btn-copy-token')) {
          const tokenHash = target.dataset.token;
          if (tokenHash) copyTokenToClipboard(tokenHash);
          return;
        }

        // 处理编辑按钮
        if (target.classList.contains('btn-edit')) {
          const row = target.closest('tr');
          const tokenId = row ? parseInt(row.dataset.tokenId) : null;
          if (tokenId) editToken(tokenId);
          return;
        }

        // 处理删除按钮
        if (target.classList.contains('btn-delete')) {
          const row = target.closest('tr');
          const tokenId = row ? parseInt(row.dataset.tokenId) : null;
          if (tokenId) deleteToken(tokenId);
          return;
        }
      });
    }

    async function loadTokens() {
      try {
        // 根据currentTimeRange决定是否添加range参数
        let url = `${API_BASE}/auth-tokens`;
        if (currentTimeRange !== 'all') {
          url += `?range=${currentTimeRange}`;
        }

        const data = await fetchDataWithAuth(url);
        allTokens = (data && data.tokens) || [];
        isToday = !!(data && data.is_today);
        renderTokens();
      } catch (error) {
        
        console.error('Failed to load tokens:', error);
        window.showNotification(t('tokens.msg.loadFailed') + ': ' + error.message, 'error');
      }
    }

    function renderTokens() {
      const container = document.getElementById('tokens-container');
      const emptyState = document.getElementById('empty-state');

      if (allTokens.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        return;
      }

      emptyState.style.display = 'none';

      // 构建表格结构
      const table = document.createElement('table');
      
      table.innerHTML = `
        <thead>
          <tr>
            <th>${t('tokens.table.description')}</th>
            <th>${t('tokens.table.token')}</th>
            <th style="text-align: center;">${t('tokens.table.callCount')}</th>
            <th style="text-align: center;">${t('tokens.table.successRate')}</th>
            <th style="text-align: center;" title="${t('tokens.table.rpmTitle')}">${t('tokens.table.rpm')}</th>
            <th style="text-align: center;">${t('tokens.table.tokenUsage')}</th>
            <th style="text-align: center;">${t('tokens.table.totalCost')}</th>
            <th style="text-align: center;">${t('tokens.table.streamAvg')}</th>
            <th style="text-align: center;">${t('tokens.table.nonStreamAvg')}</th>
            <th>${t('tokens.table.lastUsed')}</th>
            <th style="width: 260px;">${t('tokens.table.actions')}</th>
          </tr>
        </thead>
      `;

      const tbody = document.createElement('tbody');

      // 使用模板引擎渲染行，降级处理
      if (typeof TemplateEngine !== 'undefined') {
        allTokens.forEach(token => {
          const row = createTokenRowWithTemplate(token);
          if (row) tbody.appendChild(row);
        });
      } else {
        // 降级：模板引擎不可用时使用原有方式
        console.warn('[Tokens] TemplateEngine not available, using fallback rendering');
        tbody.innerHTML = allTokens.map(token => createTokenRowFallback(token)).join('');
      }

      table.appendChild(tbody);
      container.innerHTML = '';
      container.appendChild(table);

      // 翻译动态渲染的内容中的 data-i18n 属性
      if (window.i18n.translatePage) {
        window.i18n.translatePage();
      }
    }

    // 格式化 Token 数量为 M 单位
    function formatTokenCount(count) {
      if (!count || count === 0) return '0M';
      const millions = count / 1000000;
      return millions.toFixed(2) + 'M';
    }

    /**
     * 计算过期时间（毫秒）
     */
    function calculateExpiryMs(expiryType) {
      if (expiryType === 'never' || !expiryType) return null;

      const days = parseInt(expiryType);
      if (isNaN(days)) return null;

      return Date.now() + days * 24 * 60 * 60 * 1000;
    }

    /**
     * 格式化日期为本地字符串
     */
    function formatLocaleDate(dateValue, fallback) {
      if (!dateValue) return fallback;
      const locale = window.i18n?.getLocale?.() || 'en';
      return new Date(dateValue).toLocaleString(locale);
    }

    /**
     * 获取掩码后的令牌
     */
    function getMaskedToken(token) {
      if (!token || token.length <= 8) return token || '';
      return token.substring(0, 4) + '****' + token.slice(-4);
    }

    /**
     * 构建令牌行的HTML片段数据
     */
    function buildTokenRowData(token) {
      const successCount = token.success_count || 0;
      const failureCount = token.failure_count || 0;
      const totalCount = successCount + failureCount;
      const successRate = totalCount > 0 ? ((successCount / totalCount) * 100).toFixed(1) : 0;

      return {
        id: token.id,
        description: token.description,
        token: token.token,
        maskedToken: getMaskedToken(token.token),
        status: getTokenStatus(token),
        createdAt: formatLocaleDate(token.created_at, ''),
        createdLabel: t('tokens.createdSuffix'),
        expiresAt: formatLocaleDate(token.expires_at, t('tokens.expiryNever')),
        lastUsed: formatLocaleDate(token.last_used_at, t('tokens.neverUsed')),
        callsHtml: buildCallsHtml(successCount, failureCount, totalCount),
        successRateHtml: buildSuccessRateHtml(successRate, totalCount),
        rpmHtml: buildRpmHtml(token),
        tokensHtml: buildTokensHtml(token),
        costHtml: buildCostHtml(token.total_cost_usd),
        streamAvgHtml: buildResponseTimeHtml(token.stream_avg_ttfb, token.stream_count),
        nonStreamAvgHtml: buildResponseTimeHtml(token.non_stream_avg_rt, token.non_stream_count)
      };
    }

    /**
     * 使用模板引擎渲染令牌行
     */
    function createTokenRowWithTemplate(token) {
      const data = buildTokenRowData(token);

      return TemplateEngine.render('tpl-token-row', {
        id: data.id,
        description: data.description,
        token: data.token,
        maskedToken: data.maskedToken,
        statusClass: data.status.class,
        createdAt: data.createdAt,
        createdLabel: data.createdLabel,
        expiresAt: data.expiresAt,
        callsHtml: data.callsHtml,
        rpmHtml: data.rpmHtml,
        successRateHtml: data.successRateHtml,
        tokensHtml: data.tokensHtml,
        costHtml: data.costHtml,
        streamAvgHtml: data.streamAvgHtml,
        nonStreamAvgHtml: data.nonStreamAvgHtml,
        lastUsed: data.lastUsed
      });
    }

    // 统计徽章样式常量
    const BADGE_STYLES = {
      success: 'background: var(--success-50); color: var(--success-700); border: 1px solid var(--success-200);',
      error: 'background: var(--error-50); color: var(--error-700); border: 1px solid var(--error-200);'
    };

    /**
     * 构建统计徽章HTML
     */
    function buildStatsBadge(type, icon, count, titleKey) {
      const style = BADGE_STYLES[type];
      const iconColor = type === 'success' ? 'var(--success-600)' : 'var(--error-600)';
      return `<span class="stats-badge" style="${style} font-weight: 600;" title="${t(titleKey)}">
        <span style="color: ${iconColor}; font-size: 14px; font-weight: 700;">${icon}</span> ${count.toLocaleString()}
      </span>`;
    }

    /**
     * 构建调用次数HTML
     */
    function buildCallsHtml(successCount, failureCount, totalCount) {
      if (totalCount === 0) {
        return '<span style="color: var(--neutral-500); font-size: 13px;">-</span>';
      }

      const badges = [
        buildStatsBadge('success', '✓', successCount, 'tokens.successCall')
      ];

      if (failureCount > 0) {
        badges.push(buildStatsBadge('error', '✗', failureCount, 'tokens.failedCall'));
      }

      return `<div style="display: flex; flex-direction: column; gap: 4px; align-items: center;">${badges.join('')}</div>`;
    }

    // RPM格式化配置
    const RPM_FORMAT_RULES = [
      { threshold: 1000, format: (v) => (v / 1000).toFixed(1) + 'K' },
      { threshold: 1, format: (v) => v.toFixed(1) },
      { threshold: 0.01, format: (v) => v.toFixed(2) }
    ];

    /**
     * 格式化RPM值
     */
    function formatRpmValue(rpm) {
      for (const rule of RPM_FORMAT_RULES) {
        if (rpm >= rule.threshold) return rule.format(rpm);
      }
      return '-';
    }

    /**
     * 构建RPM HTML（峰/均/近格式）
     */
    function buildRpmHtml(token) {
      const rpms = {
        peak: token.peak_rpm || 0,
        avg: token.avg_rpm || 0,
        recent: isToday ? (token.recent_rpm || 0) : null
      };

      // 如果都是0，返回空
      if (rpms.peak < 0.01 && rpms.avg < 0.01 && (!isToday || rpms.recent < 0.01)) {
        return '<span style="color: var(--neutral-500); font-size: 13px;">-</span>';
      }

      const parts = [formatRpmValue(rpms.peak), formatRpmValue(rpms.avg)];
      if (isToday) parts.push(formatRpmValue(rpms.recent));

      // 颜色：峰值决定整体颜色
      const color = getRpmColor(rpms.peak);

      return `<span style="color: ${color}; font-weight: 500;">${parts.join('/')}</span>`;
    }

    /**
     * RPM 颜色：低流量绿色，中等橙色，高流量红色
     */
    /**
     * 构建成功率HTML
     */
    function buildSuccessRateHtml(successRate, totalCount) {
      if (totalCount === 0) {
        return '<span style="color: var(--neutral-500); font-size: 13px;">-</span>';
      }

      let className = 'stats-badge';
      if (successRate >= 95) className += ' success-rate-high';
      else if (successRate >= 80) className += ' success-rate-medium';
      else className += ' success-rate-low';

      return `<span class="${className}">${successRate}%</span>`;
    }

    // Token徽章样式配置
    const TOKEN_BADGE_STYLES = {
      input: { bg: 'var(--primary-50)', color: 'var(--primary-700)', titleKey: 'tokens.inputTokens' },
      output: { bg: 'var(--secondary-50)', color: 'var(--secondary-700)', titleKey: 'tokens.outputTokens' },
      cacheRead: { bg: 'var(--success-50)', color: 'var(--success-700)', titleKey: 'tokens.cacheReadTokens' },
      cacheCreate: { bg: 'var(--warning-50)', color: 'var(--warning-700)', titleKey: 'tokens.cacheCreateTokens' }
    };

    /**
     * 构建Token徽章HTML
     */
    function buildTokenBadge(type, labelKey, value) {
      const style = TOKEN_BADGE_STYLES[type];
      return `<span class="stats-badge" style="background: ${style.bg}; color: ${style.color};" title="${t(style.titleKey)}">${t(labelKey)} ${formatTokenCount(value)}</span>`;
    }

    /**
     * 构建缓存徽章HTML数组
     */
    function buildCacheBadges(token) {
      const badges = [];
      if (token.cache_read_tokens_total > 0) {
        badges.push(buildTokenBadge('cacheRead', 'tokens.cacheRead', token.cache_read_tokens_total));
      }
      if (token.cache_creation_tokens_total > 0) {
        badges.push(buildTokenBadge('cacheCreate', 'tokens.cacheCreate', token.cache_creation_tokens_total));
      }
      return badges;
    }

    /**
     * 构建Token用量HTML
     */
    function buildTokensHtml(token) {
      const hasTokens = token.prompt_tokens_total > 0 ||
                        token.completion_tokens_total > 0 ||
                        token.cache_read_tokens_total > 0 ||
                        token.cache_creation_tokens_total > 0;

      if (!hasTokens) {
        return '<span style="color: var(--neutral-500); font-size: 13px;">-</span>';
      }

      // 输入/输出行
      const ioBadges = [
        buildTokenBadge('input', 'tokens.input', token.prompt_tokens_total || 0),
        buildTokenBadge('output', 'tokens.output', token.completion_tokens_total || 0)
      ];

      // 缓存行
      const cacheBadges = buildCacheBadges(token);

      const rows = [`<div style="display: inline-flex; gap: 4px; font-size: 12px;">${ioBadges.join('')}</div>`];
      if (cacheBadges.length > 0) {
        rows.push(`<div style="display: inline-flex; gap: 4px; font-size: 12px;">${cacheBadges.join('')}</div>`);
      }

      return `<div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">${rows.join('')}</div>`;
    }

    /**
     * 构建总费用HTML
     */
    function buildCostHtml(totalCostUsd) {
      if (!totalCostUsd || totalCostUsd <= 0) {
        return '<span style="color: var(--neutral-500); font-size: 13px;">-</span>';
      }

      return `
        <div style="display: flex; flex-direction: column; align-items: center; gap: 2px;">
          <span class="metric-value" style="color: var(--success-700); font-size: 15px; font-weight: 700;">
            $${totalCostUsd.toFixed(4)}
          </span>
        </div>
      `;
    }

    /**
     * 构建响应时间HTML
     */
    function buildResponseTimeHtml(time, count) {
      if (!count || count === 0) {
        return '<span style="color: var(--neutral-500); font-size: 13px;">-</span>';
      }

      const responseClass = getResponseClass(time);
      return `<span class="metric-value ${responseClass}">${time.toFixed(2)}s</span>`;
    }

    /**
     * 获取响应时间颜色等级
     */
    function getResponseClass(time) {
      const num = Number(time);
      if (!Number.isFinite(num) || num <= 0) return '';
      if (num < 3) return 'response-fast';
      if (num < 6) return 'response-medium';
      return 'response-slow';
    }

    /**
     * 降级：模板引擎不可用时的渲染方式
     */
    function createTokenRowFallback(token) {
      const data = buildTokenRowData(token);

      return `
        <tr data-token-id="${data.id}">
          <td style="font-weight: 500;">${escapeHtml(data.description)}</td>
          <td>
            <div><span class="token-display token-display-${data.status.class}">${escapeHtml(data.maskedToken)}</span></div>
            <div style="font-size: 12px; color: var(--neutral-500); margin-top: 4px;">${data.createdAt}${data.createdLabel} · ${data.expiresAt}</div>
          </td>
          <td style="text-align: center;">${data.callsHtml}</td>
          <td style="text-align: center;">${data.successRateHtml}</td>
          <td style="text-align: center;">${data.rpmHtml}</td>
          <td style="text-align: center;">${data.tokensHtml}</td>
          <td style="text-align: center;">${data.costHtml}</td>
          <td style="text-align: center;">${data.streamAvgHtml}</td>
          <td style="text-align: center;">${data.nonStreamAvgHtml}</td>
          <td style="color: var(--neutral-600);">${data.lastUsed}</td>
          <td style="white-space: nowrap;">
            <button class="btn-copy-token btn btn-secondary token-action-btn token-action-copy" style="padding: 4px 12px; font-size: 13px; margin-right: 4px;" data-token="${escapeHtml(data.token)}">${t('common.copy')}</button>
            <button class="btn btn-secondary btn-edit token-action-btn token-action-edit" style="padding: 4px 12px; font-size: 13px; margin-right: 4px;">${t('common.edit')}</button>
            <button class="btn btn-danger btn-delete" style="padding: 4px 12px; font-size: 13px;">${t('common.delete')}</button>
          </td>
        </tr>
      `;
    }

    function getTokenStatus(token) {
      
      if (token.is_expired) return { class: 'expired', text: t('tokens.status.expired') };
      if (!token.is_active) return { class: 'inactive', text: t('tokens.status.inactive') };
      return { class: 'active', text: t('tokens.status.active') };
    }

    function showCreateModal() {
      document.getElementById('tokenDescription').value = '';
      document.getElementById('customToken').value = '';
      document.getElementById('tokenExpiry').value = 'never';
      document.getElementById('tokenCostLimitUSD').value = 0;
      document.getElementById('tokenActive').checked = true;
      document.getElementById('customExpiryContainer').style.display = 'none';
      window.openModal('createModal', { initialFocus: '#tokenDescription' });
    }

    function closeCreateModal() {
      window.closeModal('createModal');
    }

    async function createToken() {

      const description = document.getElementById('tokenDescription').value.trim();
      if (!description) {
        window.showNotification(t('tokens.msg.enterDescription'), 'error');
        return;
      }

      // 获取自定义 token（可选）
      const customToken = document.getElementById('customToken').value.trim();

      const expiryType = document.getElementById('tokenExpiry').value;
      let expiresAt = null;
      if (expiryType === 'custom') {
        const customDate = document.getElementById('customExpiry').value;
        if (!customDate) {
          window.showNotification(t('tokens.msg.selectExpiry'), 'error');
          return;
        }
        expiresAt = new Date(customDate).getTime();
      } else {
        expiresAt = calculateExpiryMs(expiryType);
      }
      const isActive = document.getElementById('tokenActive').checked;
      const costLimitUSD = parseFloat(document.getElementById('tokenCostLimitUSD').value) || 0;
      if (costLimitUSD < 0) {
        window.showNotification(t('tokens.msg.costLimitNegative'), 'error');
        return;
      }
      try {
        const payload = {
          description,
          expires_at: expiresAt,
          is_active: isActive,
          cost_limit_usd: costLimitUSD
        };
        // 只有输入了自定义 token 才发送
        if (customToken) {
          payload.token = customToken;
        }

        const data = await fetchDataWithAuth(`${API_BASE}/auth-tokens`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        closeCreateModal();
        document.getElementById('newTokenValue').value = data.token;
        window.openModal('tokenResultModal', { initialFocus: '#newTokenValue' });
        loadTokens();
        window.showNotification(t('tokens.msg.createSuccess'), 'success');
      } catch (error) {
        console.error('Failed to create token:', error);
        window.showNotification(t('tokens.msg.createFailed') + ': ' + error.message, 'error');
      }
    }

    function copyToken() {
      const textarea = document.getElementById('newTokenValue');
      window.copyToClipboard(textarea.value).then(() => {
        window.showNotification(t('tokens.msg.copySuccess'), 'success');
      });
    }

    function copyTokenToClipboard(hash) {
      window.copyToClipboard(hash).then(() => {
        window.showNotification(t('tokens.msg.copySuccess'), 'success');
      });
    }

    function closeTokenResultModal() {
      window.closeModal('tokenResultModal');
      document.getElementById('newTokenValue').value = '';
    }

    function editToken(id) {
      const token = allTokens.find(t => t.id === id);
      if (!token) return;
      document.getElementById('editTokenId').value = id;
      document.getElementById('editTokenDescription').value = token.description;
      document.getElementById('editTokenValue').value = ''; // 清空 token 编辑字段
      document.getElementById('editTokenActive').checked = token.is_active;
      if (!token.expires_at) {
        document.getElementById('editTokenExpiry').value = 'never';
      } else {
        document.getElementById('editTokenExpiry').value = 'custom';
        document.getElementById('editCustomExpiryContainer').style.display = 'block';
        const date = new Date(token.expires_at);
        document.getElementById('editCustomExpiry').value = date.toISOString().slice(0, 16);
      }

      // 初始化费用限额状态（2026-01新增）
      const costLimitInput = document.getElementById('editCostLimitUSD');
      const costUsedDisplay = document.getElementById('editCostUsedDisplay');
      costLimitInput.value = token.cost_limit_usd || 0;

      // 显示已消耗费用
      const costUsed = token.cost_used_usd || 0;
      
      costUsedDisplay.textContent = costUsed > 0 ? `${t('tokens.costUsedPrefix')}: $${costUsed.toFixed(4)}` : '';

      // 初始化模型限制状态（2026-01新增）
      editAllowedModels = (token.allowed_models || []).slice();
      selectedAllowedModelIndices.clear();
      renderAllowedModelsTable();

      window.openModal('editModal', { initialFocus: '#editTokenDescription' });
    }

    function closeEditModal() {
      window.closeModal('editModal');
      // 清理模型限制状态
      editAllowedModels = [];
      selectedAllowedModelIndices.clear();
    }

    async function updateToken() {

      const id = document.getElementById('editTokenId').value;
      const description = document.getElementById('editTokenDescription').value.trim();
      const isActive = document.getElementById('editTokenActive').checked;
      const expiryType = document.getElementById('editTokenExpiry').value;
      const costLimitUSD = parseFloat(document.getElementById('editCostLimitUSD').value) || 0;

      // 获取新的 token 值（可选）
      const newToken = document.getElementById('editTokenValue').value.trim();

      let expiresAt = null;
      if (expiryType === 'custom') {
        const customDate = document.getElementById('editCustomExpiry').value;
        if (!customDate) {
          window.showNotification(t('tokens.msg.selectExpiry'), 'error');
          return;
        }
        expiresAt = new Date(customDate).getTime();
      } else {
        expiresAt = calculateExpiryMs(expiryType);
      }
      try {
        const payload = {
          description,
          is_active: isActive,
          expires_at: expiresAt,
          allowed_models: editAllowedModels,  // 2026-01新增：模型限制
          cost_limit_usd: costLimitUSD         // 2026-01新增：费用上限
        };
        // 只有输入了新 token 才发送
        if (newToken) {
          payload.token = newToken;
        }

        const data = await fetchDataWithAuth(`${API_BASE}/auth-tokens/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        closeEditModal();
        if (data.token) {
          document.getElementById('newTokenValue').value = data.token;
          window.openModal('tokenResultModal', { initialFocus: '#newTokenValue' });
          window.showNotification(t('tokens.msg.updateSuccess') + ' - ' + t('tokens.msg.regenerateSuccess'), 'success');
        } else {
          window.showNotification(t('tokens.msg.updateSuccess'), 'success');
        }
        loadTokens();
      } catch (error) {
        console.error('Failed to update token:', error);
        window.showNotification(t('tokens.msg.updateFailed') + ': ' + error.message, 'error');
      }
    }

    async function deleteToken(id) {
      
      if (!confirm(t('tokens.msg.deleteConfirm'))) return;
      try {
        await fetchDataWithAuth(`${API_BASE}/auth-tokens/${id}`, {
          method: 'DELETE'
        });
        loadTokens();
        window.showNotification(t('tokens.msg.deleteSuccess'), 'success');
      } catch (error) {
        console.error('Failed to delete token:', error);
        window.showNotification(t('tokens.msg.deleteFailed') + ': ' + error.message, 'error');
      }
    }

    // 初始化顶部导航栏
    document.addEventListener('DOMContentLoaded', () => {
      initTopbar('tokens');
      if (window.i18n) window.i18n.translatePage();
    });

    // ============================================================================
    // 模型限制功能（2026-01新增）
    // ============================================================================

    /**
     * 加载渠道数据（用于模型选择）
     */
    async function loadChannelsData() {
      try {
        const data = await fetchDataWithAuth(`${API_BASE}/channels`);
        // API 直接返回渠道数组
        allChannels = Array.isArray(data) ? data : (data && data.channels) || [];
        // 聚合可用模型
        availableModelsCache = getAvailableModels();
      } catch (error) {
        console.error('Failed to load channels data:', error);
      }
    }

    /**
     * 从渠道数据聚合所有模型（去重+排序）
     */
    function getAvailableModels() {
      const modelSet = new Set();
      allChannels.forEach(ch => {
        (ch.models || []).forEach(m => {
          if (m.model) modelSet.add(m.model);
        });
      });
      return Array.from(modelSet).sort();
    }

    /**
     * 渲染模型限制表格
     */
    function renderAllowedModelsTable() {
      const tbody = document.getElementById('allowedModelsTableBody');
      const countSpan = document.getElementById('editAllowedModelsCount');
      const batchDeleteBtn = document.getElementById('batchDeleteAllowedModelsBtn');
      const selectAllCheckbox = document.getElementById('selectAllAllowedModels');

      if (!tbody) return;

      // 更新计数
      if (countSpan) countSpan.textContent = editAllowedModels.length;

      // 更新批量删除按钮状态
      updateBatchDeleteBtn();

      // 更新全选复选框状态
      if (selectAllCheckbox) {
        selectAllCheckbox.checked = editAllowedModels.length > 0 &&
          selectedAllowedModelIndices.size === editAllowedModels.length;
      }

      if (editAllowedModels.length === 0) {
        
        tbody.innerHTML = `
          <tr>
            <td colspan="3" style="text-align: center; color: var(--neutral-500); padding: 16px;">
              ${t('tokens.noModelRestriction')}
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = editAllowedModels.map((model, index) => {
        
        return `
        <tr>
          <td style="text-align: center; padding: 8px;">
            <input type="checkbox" class="allowed-model-checkbox" data-index="${index}"
              ${selectedAllowedModelIndices.has(index) ? 'checked' : ''}
              onchange="toggleAllowedModelSelection(${index}, this.checked)">
          </td>
          <td style="padding: 8px; font-family: monospace; font-size: 13px;">${escapeHtml(model)}</td>
          <td style="text-align: center; padding: 8px;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="removeAllowedModel(${index})"
              style="padding: 2px 8px; font-size: 12px;">${t('common.delete')}</button>
          </td>
        </tr>
      `}).join('');
    }

    /**
     * 切换单个模型的选中状态
     */
    function toggleAllowedModelSelection(index, checked) {
      if (checked) {
        selectedAllowedModelIndices.add(index);
      } else {
        selectedAllowedModelIndices.delete(index);
      }
      updateBatchDeleteBtn();
      updateSelectAllCheckbox();
    }

    /**
     * 全选/取消全选模型
     */
    function toggleSelectAllAllowedModels(checked) {
      if (checked) {
        editAllowedModels.forEach((_, index) => selectedAllowedModelIndices.add(index));
      } else {
        selectedAllowedModelIndices.clear();
      }
      renderAllowedModelsTable();
    }

    /**
     * 更新批量删除按钮状态
     */
    function updateBatchDeleteBtn() {
      const btn = document.getElementById('batchDeleteAllowedModelsBtn');
      if (btn) {
        const hasSelection = selectedAllowedModelIndices.size > 0;
        btn.disabled = !hasSelection;
        btn.style.opacity = hasSelection ? '1' : '0.5';
      }
    }

    /**
     * 更新全选复选框状态
     */
    function updateSelectAllCheckbox() {
      const checkbox = document.getElementById('selectAllAllowedModels');
      if (checkbox) {
        checkbox.checked = editAllowedModels.length > 0 &&
          selectedAllowedModelIndices.size === editAllowedModels.length;
      }
    }

    /**
     * 删除单个模型
     */
    function removeAllowedModel(index) {
      editAllowedModels.splice(index, 1);
      // 重建选中索引（删除后索引会变化）
      const newIndices = new Set();
      selectedAllowedModelIndices.forEach(i => {
        if (i < index) newIndices.add(i);
        else if (i > index) newIndices.add(i - 1);
      });
      selectedAllowedModelIndices = newIndices;
      renderAllowedModelsTable();
    }

    /**
     * 批量删除选中的模型
     */
    function batchDeleteSelectedAllowedModels() {
      if (selectedAllowedModelIndices.size === 0) return;

      // 从大到小排序，避免删除时索引偏移问题
      const indices = Array.from(selectedAllowedModelIndices).sort((a, b) => b - a);
      indices.forEach(index => {
        editAllowedModels.splice(index, 1);
      });
      selectedAllowedModelIndices.clear();
      renderAllowedModelsTable();
    }

    /**
     * 显示模型选择对话框
     */
    function showModelSelectModal() {
      selectedModelsForAdd.clear();
      document.getElementById('modelSearchInput').value = '';
      renderAvailableModels('');
      window.openModal('modelSelectModal', { initialFocus: '#modelSearchInput' });
    }

    /**
     * 关闭模型选择对话框
     */
    function closeModelSelectModal() {
      window.closeModal('modelSelectModal');
      selectedModelsForAdd.clear();
    }

    /**
     * 搜索过滤可用模型
     */
    function filterAvailableModels(searchText) {
      renderAvailableModels(searchText);
    }

    /**
     * 渲染可用模型列表
     */
    function renderAvailableModels(searchText) {
      const container = document.getElementById('availableModelsContainer');
      const countSpan = document.getElementById('selectedModelsCount');
      const selectAllContainer = document.getElementById('selectAllContainer');
      const selectAllCheckbox = document.getElementById('selectAllModelsCheckbox');
      const visibleModelsCount = document.getElementById('visibleModelsCount');
      if (!container) return;

      // 过滤已添加的模型
      const existingModels = new Set(editAllowedModels.map(m => m.toLowerCase()));
      let models = availableModelsCache.filter(m => !existingModels.has(m.toLowerCase()));

      // 搜索过滤
      if (searchText) {
        const search = searchText.toLowerCase();
        models = models.filter(m => m.toLowerCase().includes(search));
      }

      // 保存当前可见模型列表（用于全选功能）
      currentVisibleModels = models;

      // 更新选中计数
      if (countSpan) countSpan.textContent = selectedModelsForAdd.size;

      
      if (models.length === 0) {
        const isEmptyCache = availableModelsCache.length === 0;
        const message = searchText
          ? t('tokens.noMatchingModel')
          : isEmptyCache
            ? t('tokens.channelNoModel')
            : t('tokens.allModelsAdded');
        container.innerHTML = `
          <div style="text-align: center; color: var(--neutral-500); padding: 24px;">
            ${message}
          </div>
        `;
        // 隐藏全选容器，恢复列表圆角
        if (selectAllContainer) selectAllContainer.style.display = 'none';
        container.style.borderRadius = '6px';
        return;
      }

      // 显示全选容器，调整列表圆角
      if (selectAllContainer) {
        selectAllContainer.style.display = 'block';
        container.style.borderRadius = '0 0 6px 6px';
      }

      // 更新全选复选框状态
      if (selectAllCheckbox) {
        const allSelected = models.every(m => selectedModelsForAdd.has(m));
        selectAllCheckbox.checked = allSelected;
        selectAllCheckbox.indeterminate = !allSelected && models.some(m => selectedModelsForAdd.has(m));
      }
      if (visibleModelsCount) {
        
        visibleModelsCount.textContent = t('tokens.visibleModelsCount', { count: models.length });
      }

      container.innerHTML = models.map(model => `
        <label class="model-option-item" data-model="${escapeHtml(model)}"
          style="display: flex; align-items: center; padding: 8px 12px; cursor: pointer; border-bottom: 1px solid var(--neutral-100);">
          <input type="checkbox" class="model-option-checkbox" data-model="${escapeHtml(model)}" style="margin-right: 8px;"
            ${selectedModelsForAdd.has(model) ? 'checked' : ''}>
          <span style="font-family: monospace; font-size: 13px;">${escapeHtml(model)}</span>
        </label>
      `).join('');

      // Event delegation: attach once on container
      if (!container.dataset.delegated) {
        container.addEventListener('change', (e) => {
          const checkbox = e.target.closest('.model-option-checkbox');
          if (checkbox) {
            toggleModelForAdd(checkbox.dataset.model || '', checkbox.checked);
          }
        });
        container.dataset.delegated = '1';
      }
    }

    /**
     * 切换待添加模型的选中状态
     */
    function toggleModelForAdd(model, checked) {
      if (checked) {
        selectedModelsForAdd.add(model);
      } else {
        selectedModelsForAdd.delete(model);
      }
      document.getElementById('selectedModelsCount').textContent = selectedModelsForAdd.size;
      updateSelectAllCheckboxState();
    }

    /**
     * 更新全选复选框状态
     */
    function updateSelectAllCheckboxState() {
      const selectAllCheckbox = document.getElementById('selectAllModelsCheckbox');
      if (!selectAllCheckbox || currentVisibleModels.length === 0) return;

      const allSelected = currentVisibleModels.every(m => selectedModelsForAdd.has(m));
      selectAllCheckbox.checked = allSelected;
      selectAllCheckbox.indeterminate = !allSelected && currentVisibleModels.some(m => selectedModelsForAdd.has(m));
    }

    /**
     * 全选/取消全选当前可见模型
     */
    function toggleSelectAllModels(checked) {
      currentVisibleModels.forEach(model => {
        if (checked) {
          selectedModelsForAdd.add(model);
        } else {
          selectedModelsForAdd.delete(model);
        }
      });
      document.getElementById('selectedModelsCount').textContent = selectedModelsForAdd.size;
      // 重新渲染以更新复选框状态
      const searchText = document.getElementById('modelSearchInput')?.value || '';
      renderAvailableModels(searchText);
    }

    /**
     * 确认添加选中的模型
     */
    function confirmModelSelection() {
      
      if (selectedModelsForAdd.size === 0) {
        window.showNotification(t('tokens.msg.selectAtLeastOne'), 'warning');
        return;
      }

      // 添加到模型限制列表
      selectedModelsForAdd.forEach(model => {
        if (!editAllowedModels.includes(model)) {
          editAllowedModels.push(model);
        }
      });

      // 排序
      editAllowedModels.sort();

      closeModelSelectModal();
      renderAllowedModelsTable();
      window.showNotification(t('tokens.msg.modelsAdded', { count: selectedModelsForAdd.size }), 'success');
    }

    // ==================== 模型手动输入 ====================

    /**
     * 解析模型输入，支持逗号和换行分隔
     */
    function parseModelInput(input) {
      return input
        .split(/[,\n]/)
        .map(m => m.trim())
        .filter(m => m);
    }

    /**
     * 显示模型导入对话框
     */
    function showModelImportModal() {
      document.getElementById('tokenModelImportTextarea').value = '';
      document.getElementById('tokenModelImportPreview').style.display = 'none';
      window.openModal('modelImportModal', { initialFocus: '#tokenModelImportTextarea' });
      setTimeout(() => document.getElementById('tokenModelImportTextarea').focus(), 100);
    }

    /**
     * 关闭模型导入对话框
     */
    function closeModelImportModal() {
      window.closeModal('modelImportModal');
    }

    /**
     * 更新模型导入预览
     */
    function updateModelImportPreview() {
      const textarea = document.getElementById('tokenModelImportTextarea');
      const preview = document.getElementById('tokenModelImportPreview');
      const countSpan = document.getElementById('tokenModelImportCount');
      const input = textarea.value.trim();

      if (!input) {
        preview.style.display = 'none';
        return;
      }

      const models = parseModelInput(input);
      // 去重并排除已存在的模型
      const existingModels = new Set(editAllowedModels.map(m => m.toLowerCase()));
      const newModels = [...new Set(models)].filter(m => !existingModels.has(m.toLowerCase()));

      if (newModels.length > 0) {
        countSpan.textContent = newModels.length;
        preview.style.display = 'block';
      } else {
        preview.style.display = 'none';
      }
    }

    /**
     * 确认模型导入
     */
    function confirmModelImport() {
      
      const textarea = document.getElementById('tokenModelImportTextarea');
      const input = textarea.value.trim();

      if (!input) {
        window.showNotification(t('tokens.msg.enterModelName'), 'warning');
        return;
      }

      const models = parseModelInput(input);
      if (models.length === 0) {
        window.showNotification(t('tokens.msg.noValidModel'), 'warning');
        return;
      }

      // 去重并排除已存在的模型
      const existingModels = new Set(editAllowedModels.map(m => m.toLowerCase()));
      const newModels = [...new Set(models)].filter(m => !existingModels.has(m.toLowerCase()));

      if (newModels.length === 0) {
        window.showNotification(t('tokens.msg.allModelsExist'), 'info');
        closeModelImportModal();
        return;
      }

      // 添加新模型
      newModels.forEach(model => editAllowedModels.push(model));
      editAllowedModels.sort();

      closeModelImportModal();
      renderAllowedModelsTable();

      const duplicateCount = models.length - newModels.length;
      const msg = duplicateCount > 0
        ? t('tokens.msg.importSuccessWithDuplicates', { added: newModels.length, duplicates: duplicateCount })
        : t('tokens.msg.importSuccess', { count: newModels.length });
      window.showNotification(msg, 'success');
    }
