// 常量定义
const MAX_ERROR_PREVIEW = 3;

/**
 * 通用文件下载函数
 * @param {Blob} blob - 文件Blob
 * @param {string} filename - 文件名
 */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 显示成功通知
 */
function notifySuccess(message) {
  if (window.showSuccess) window.showSuccess(message);
}

/**
 * 显示错误通知
 */
function notifyError(message) {
  if (window.showError) window.showError(message);
}

function setupImportExport() {
  const exportBtn = document.getElementById('exportCsvBtn');
  const importBtn = document.getElementById('importCsvBtn');
  const importInput = document.getElementById('importCsvInput');

  if (exportBtn) {
    exportBtn.addEventListener('click', () => exportChannelsCSV(exportBtn));
  }

  if (importBtn && importInput) {
    importBtn.addEventListener('click', () => {
      if (window.pauseBackgroundAnimation) window.pauseBackgroundAnimation();
      importInput.click();
    });

    importInput.addEventListener('change', (event) => {
      if (window.resumeBackgroundAnimation) window.resumeBackgroundAnimation();
      handleImportCSV(event, importBtn);
    });

    importInput.addEventListener('cancel', () => {
      if (window.resumeBackgroundAnimation) window.resumeBackgroundAnimation();
    });
  }
}

async function exportChannelsCSV(buttonEl) {
  try {
    if (buttonEl) buttonEl.disabled = true;
    const res = await fetchWithAuth('/admin/channels/export');
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(errorText || window.t('channels.import.exportHttpFailed', { status: res.status }));
    }

    const blob = await res.blob();
    downloadBlob(blob, `channels-${formatTimestampForFilename()}.csv`);

    notifySuccess(window.t('channels.msg.exportSuccess'));
  } catch (err) {
    console.error('Export CSV failed', err);
    notifyError(err.message || window.t('channels.msg.exportFailed'));
  } finally {
    if (buttonEl) buttonEl.disabled = false;
  }
}

async function handleImportCSV(event, importBtn) {
  const input = event.target;
  if (!input.files || input.files.length === 0) {
    return;
  }

  const file = input.files[0];
  const formData = new FormData();
  formData.append('file', file);

  if (importBtn) importBtn.disabled = true;

  try {
    const resp = await fetchAPIWithAuth('/admin/channels/import', {
      method: 'POST',
      body: formData
    });

    const summary = resp.data;
    if (!resp.success) {
      throw new Error(resp.error || window.t('channels.msg.importFailed'));
    }
    if (summary) {
      let msg = window.t('channels.import.summary', {
        created: summary.created || 0,
        updated: summary.updated || 0,
        skipped: summary.skipped || 0
      });

      notifySuccess(msg);

      if (summary.errors && summary.errors.length) {
        const preview = summary.errors.slice(0, MAX_ERROR_PREVIEW).join('；');
        const extra = summary.errors.length > MAX_ERROR_PREVIEW ? window.t('channels.import.moreErrors', { count: summary.errors.length }) : '';
        notifyError(window.t('channels.import.partialFailed', { preview, extra }));
      }
    } else {
      notifySuccess(window.t('channels.msg.importSuccess'));
    }

    clearChannelsCache();
    await loadChannels(filters.channelType);
  } catch (err) {
    console.error('Import CSV failed', err);
    notifyError(err.message || window.t('channels.msg.importFailed'));
  } finally {
    if (importBtn) importBtn.disabled = false;
    input.value = '';
  }
}
