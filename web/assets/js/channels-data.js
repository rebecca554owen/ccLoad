// 处理加载的渠道数据
function processLoadedChannels(data, type) {
  channelsCache[type] = data || [];
  channels = channelsCache[type];
  if (typeof syncSelectedChannelsWithLoadedChannels === 'function') {
    syncSelectedChannelsWithLoadedChannels();
  }
  updateModelOptions();
  filterChannels();
}

async function loadChannels(type = 'all') {
  try {
    if (channelsCache[type]) {
      processLoadedChannels(channelsCache[type], type);
      return;
    }

    const url = type === 'all' ? '/admin/channels' : `/admin/channels?type=${encodeURIComponent(type)}`;
    const data = await fetchDataWithAuth(url);
    processLoadedChannels(data, type);
  } catch (e) {
    console.error('Failed to load channels', e);
    if (window.showError) window.showError(window.t('channels.loadChannelsFailed'));
  }
}

async function loadChannelStatsRange() {
  try {
    const setting = await fetchDataWithAuth('/admin/settings/channel_stats_range');
    if (setting && setting.value) {
      channelStatsRange = setting.value;
    }
  } catch (e) {
    console.error('Failed to load stats range setting', e);
  }
}

async function loadChannelStats(range = channelStatsRange) {
  try {
    const params = new URLSearchParams({ range, limit: '500', offset: '0' });
    const data = await fetchDataWithAuth(`/admin/stats?${params.toString()}`);
    channelStatsById = aggregateChannelStats((data && data.stats) || [], data && data.channel_health);
    filterChannels();
  } catch (err) {
    console.error('Failed to load channel stats', err);
  }
}

const STATS_FIELDS = [
  'total_input_tokens',
  'total_output_tokens',
  'total_cache_read_input_tokens',
  'total_cache_creation_input_tokens',
  'total_cost'
];

function aggregateStatsEntry(stats, entry) {
  const success = toSafeNumber(entry.success);
  const error = toSafeNumber(entry.error);
  const total = toSafeNumber(entry.total);

  stats.success += success;
  stats.error += error;
  stats.total += total;

  const weight = success || total || 0;
  const avgFirstByte = Number(entry.avg_first_byte_time_seconds);
  if (Number.isFinite(avgFirstByte) && avgFirstByte > 0 && weight > 0) {
    stats._firstByteWeightedSum += avgFirstByte * weight;
    stats._firstByteWeight += weight;
  }

  const avgDuration = Number(entry.avg_duration_seconds);
  if (Number.isFinite(avgDuration) && avgDuration > 0 && weight > 0) {
    stats._durationWeightedSum += avgDuration * weight;
    stats._durationWeight += weight;
  }

  for (const field of STATS_FIELDS) {
    const key = field.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    stats[key] += toSafeNumber(entry[field]);
  }
}

function finalizeStats(stats, healthTimeline = null) {
  if (stats._firstByteWeight > 0) {
    stats.avgFirstByteTimeSeconds = stats._firstByteWeightedSum / stats._firstByteWeight;
  }
  if (stats._durationWeight > 0) {
    stats.avgDurationSeconds = stats._durationWeightedSum / stats._durationWeight;
  }
  if (healthTimeline) {
    stats.healthTimeline = healthTimeline;
  }
  delete stats._firstByteWeightedSum;
  delete stats._firstByteWeight;
  delete stats._durationWeightedSum;
  delete stats._durationWeight;
}

function aggregateChannelStats(statsEntries = [], channelHealth = null) {
  const result = {};

  for (const entry of statsEntries) {
    const channelId = Number(entry.channel_id || entry.channelID);
    if (!Number.isFinite(channelId) || channelId <= 0) continue;

    if (!result[channelId]) {
      result[channelId] = {
        success: 0,
        error: 0,
        total: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCacheReadInputTokens: 0,
        totalCacheCreationInputTokens: 0,
        totalCost: 0,
        _firstByteWeightedSum: 0,
        _firstByteWeight: 0,
        _durationWeightedSum: 0,
        _durationWeight: 0
      };
    }

    aggregateStatsEntry(result[channelId], entry);
  }

  for (const id of Object.keys(result)) {
    finalizeStats(result[id], channelHealth && channelHealth[id] ? channelHealth[id] : null);
  }

  return result;
}

function toSafeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

// 加载默认测试内容（从系统设置）
async function loadDefaultTestContent() {
  try {
    const setting = await fetchDataWithAuth('/admin/settings/channel_test_content');
    if (setting && setting.value) {
      defaultTestContent = setting.value;
    }
  } catch (e) {
    console.warn('Failed to load default test content, using built-in default', e);
  }
}
