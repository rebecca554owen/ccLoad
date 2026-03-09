    // 统计数据管理
    let statsData = {
      total_requests: 0,
      success_requests: 0,
      error_requests: 0,
      active_channels: 0,
      active_models: 0,
      duration_seconds: 1,
      rpm_stats: null,
      is_today: true
    };

    // 当前选中的时间范围
    let currentTimeRange = 'today';

    const TYPE_CARD_CONFIGS = [
      {
        type: 'anthropic',
        title: 'Claude Code',
        iconBackground: 'linear-gradient(135deg, #CC9B7A, #D4A574)',
        iconSvg: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z"/></svg>',
        cacheCreate: true
      },
      {
        type: 'codex',
        title: 'Codex',
        iconBackground: 'linear-gradient(135deg, #10a37f, #0d8a6a)',
        iconSvg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/></svg>',
        cacheCreate: true
      },
      {
        type: 'openai',
        title: 'OpenAI',
        iconBackground: 'linear-gradient(135deg, #10a37f, #0d8a6a)',
        iconSvg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/></svg>',
        cacheCreate: false
      },
      {
        type: 'gemini',
        title: 'Google Gemini',
        iconBackground: 'linear-gradient(135deg, #4285f4 0%, #8ab4f8 50%, #ea4335 100%)',
        iconSvg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.5 6.5L20 10l-5.5 2.5L12 19l-2.5-6.5L4 10l6.5-1.5z"/></svg>',
        cacheCreate: false
      }
    ];

    function renderTypeStatsCards() {
      const grid = document.getElementById('typeStatsGrid');
      if (!grid || !window.TemplateEngine) return;

      const fragment = document.createDocumentFragment();
      TYPE_CARD_CONFIGS.forEach((config) => {
        const card = TemplateEngine.render('tpl-type-stat-card', {
          type: config.type,
          title: config.title,
          iconBackground: config.iconBackground,
          iconSvg: config.iconSvg,
          cacheCreateHtml: config.cacheCreate
            ? `<div class="token-item"><span class="token-label" data-i18n="common.cacheCreate">缓存创</span><span class="token-value token-cache" id="type-${config.type}-cache-create">0</span></div>`
            : ''
        });
        if (card) fragment.appendChild(card);
      });

      grid.innerHTML = '';
      grid.appendChild(fragment);
      if (window.i18n) window.i18n.translatePage();
    }

    // 加载统计数据
    async function loadStats() {
      try {
        // 添加加载状态
        document.querySelectorAll('.metric-number').forEach(el => {
          el.classList.add('animate-pulse');
        });

        let data;
        // 首次加载使用预取数据（与 JS 下载并行获取）
        if (window.__prefetch_summary) {
          const prefetched = await window.__prefetch_summary;
          window.__prefetch_summary = null;
          if (prefetched && prefetched.success) {
            data = prefetched.data;
          }
        }
        // 预取失败或后续轮询走正常路径
        if (!data) {
          data = await fetchData(`/public/summary?range=${currentTimeRange}`);
        }
        statsData = data || statsData;
        updateStatsDisplay();

      } catch (error) {
        console.error('Failed to load stats:', error);
        showError('无法加载统计数据');
      } finally {
        // 移除加载状态
        document.querySelectorAll('.metric-number').forEach(el => {
          el.classList.remove('animate-pulse');
        });
      }
    }

    // 更新统计显示
    function updateStatsDisplay() {
      const successRate = statsData.total_requests > 0
        ? ((statsData.success_requests / statsData.total_requests) * 100).toFixed(1)
        : '0.0';

      // 更新总体数字显示（成功/失败合并显示）
      document.getElementById('success-requests').textContent = formatNumber(statsData.success_requests || 0);
      document.getElementById('error-requests').textContent = formatNumber(statsData.error_requests || 0);
      document.getElementById('success-rate').textContent = successRate + '%';

      // 更新 RPM（使用峰值/平均/最近格式）
      const rpmStats = statsData.rpm_stats || null;
      const isToday = statsData.is_today !== false;
      updateGlobalRpmDisplay('total-rpm', rpmStats, isToday);

      // 更新按渠道类型统计
      if (statsData.by_type) {
        updateTypeStats('anthropic', statsData.by_type.anthropic);
        updateTypeStats('codex', statsData.by_type.codex);
        updateTypeStats('openai', statsData.by_type.openai);
        updateTypeStats('gemini', statsData.by_type.gemini);
      }
    }

    // 更新全局 RPM 显示（格式：数值 数值 数值）
    function updateGlobalRpmDisplay(elementId, stats, showRecent) {
      const el = document.getElementById(elementId);
      if (!el) return;

      if (!stats || (stats.peak_rpm < 0.01 && stats.avg_rpm < 0.01)) {
        el.innerHTML = '--';
        return;
      }

      const fmt = v => v >= 1000 ? (v / 1000).toFixed(1) + 'K' : v.toFixed(1);
      const parts = [];

      if (stats.peak_rpm >= 0.01) {
        parts.push(`<span style="color:${getRpmColor(stats.peak_rpm)}">${fmt(stats.peak_rpm)}</span>`);
      }
      if (stats.avg_rpm >= 0.01) {
        parts.push(`<span style="color:${getRpmColor(stats.avg_rpm)}">${fmt(stats.avg_rpm)}</span>`);
      }
      if (showRecent && stats.recent_rpm >= 0.01) {
        parts.push(`<span style="color:${getRpmColor(stats.recent_rpm)}">${fmt(stats.recent_rpm)}</span>`);
      }

      el.innerHTML = parts.length > 0 ? parts.join(' ') : '--';
    }

    // 更新单个渠道类型的统计
function updateTypeStats(type, data) {
  const elements = {
    card: document.getElementById(`type-${type}-card`),
    requests: document.getElementById(`type-${type}-requests`),
    success: document.getElementById(`type-${type}-success`),
    error: document.getElementById(`type-${type}-error`),
    rate: document.getElementById(`type-${type}-rate`),
    input: document.getElementById(`type-${type}-input`),
    output: document.getElementById(`type-${type}-output`),
    cost: document.getElementById(`type-${type}-cost`),
    cacheRead: document.getElementById(`type-${type}-cache-read`),
    cacheCreate: document.getElementById(`type-${type}-cache-create`)
  };

  if (!elements.requests || !elements.success || !elements.error || !elements.rate || !elements.input || !elements.output || !elements.cost || !elements.cacheRead) {
    return;
  }

  if (elements.card) elements.card.style.display = 'block';

  const totalRequests = data ? (data.total_requests || 0) : 0;
  const successRequests = data ? (data.success_requests || 0) : 0;
  const errorRequests = data ? (data.error_requests || 0) : 0;

      const successRate = totalRequests > 0
        ? ((successRequests / totalRequests) * 100).toFixed(1)
        : '0.0';

      // 更新基础统计（总请求、成功、失败、成功率）
  elements.requests.textContent = formatNumber(totalRequests);
  elements.success.textContent = formatNumber(successRequests);
  elements.error.textContent = formatNumber(errorRequests);
  elements.rate.textContent = successRate + '%';

      // 所有渠道类型的Token和成本统计
      const inputTokens = data ? (data.total_input_tokens || 0) : 0;
      const outputTokens = data ? (data.total_output_tokens || 0) : 0;
      const totalCost = data ? (data.total_cost || 0) : 0;

  elements.input.textContent = formatNumber(inputTokens);
  elements.output.textContent = formatNumber(outputTokens);
  elements.cost.textContent = formatCost(totalCost);

      // Claude和Codex类型的缓存统计（缓存读+缓存创建）
      if (type === 'anthropic' || type === 'codex') {
        const cacheReadTokens = data ? (data.total_cache_read_tokens || 0) : 0;
        const cacheCreateTokens = data ? (data.total_cache_creation_tokens || 0) : 0;
    elements.cacheRead.textContent = formatNumber(cacheReadTokens);
    if (elements.cacheCreate) {
      elements.cacheCreate.textContent = formatNumber(cacheCreateTokens);
    }
  }

  if (type === 'openai' || type === 'gemini') {
    const cacheReadTokens = data ? (data.total_cache_read_tokens || 0) : 0;
    elements.cacheRead.textContent = formatNumber(cacheReadTokens);
  }
}

    // 通知系统统一由 ui.js 提供（showSuccess/showError/showNotification）

    // 注销功能（已由 ui.js 的 onLogout 统一处理）

    // 轮询控制（性能优化：页面不可见时暂停）
    let statsInterval = null;

    function startStatsPolling() {
      if (statsInterval) return; // 防止重复启动
      statsInterval = setInterval(loadStats, 30000);
    }

    function stopStatsPolling() {
      if (statsInterval) {
        clearInterval(statsInterval);
        statsInterval = null;
      }
    }

    // 页面可见性监听（后台标签页暂停轮询，节省CPU）
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) {
        stopStatsPolling();
        console.log('[性能优化] 页面不可见，已暂停数据轮询');
      } else {
        loadStats(); // 页面重新可见时立即刷新一次
        startStatsPolling();
        console.log('[性能优化] 页面可见，已恢复数据轮询');
      }
    });

    // 页面初始化
    document.addEventListener('DOMContentLoaded', function() {
      if (window.i18n) window.i18n.translatePage();
      if (window.initTopbar) initTopbar('index');
      renderTypeStatsCards();

      // 初始化时间范围选择器
      window.initTimeRangeSelector((range) => {
        currentTimeRange = range;
        loadStats();
      });

      // 加载统计数据
      loadStats();

      // 设置自动刷新（每30秒，仅在页面可见时）
      startStatsPolling();

      // 添加页面动画
      document.querySelectorAll('.animate-slide-up').forEach((el, index) => {
        el.style.animationDelay = `${index * 0.1}s`;
      });
    });
