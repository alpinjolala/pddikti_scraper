(() => {
  const TARGET_PRODI_URL =
    'https://pddikti.kemdiktisaintek.go.id/detail-prodi/XffXbf8Kkno5_unBlLWu9hnHeDB9vlw2KWTdzYuzWl69fYliOrtGEzaMuiw03Wo7-ACYxg==';

  const els = {
    statusBadge: document.getElementById('statusBadge'),
    wrongPageCard: document.getElementById('wrongPageCard'),
    openTargetBtn: document.getElementById('openTargetBtn'),
    mainPanel: document.getElementById('mainPanel'),
    prodiTitle: document.getElementById('prodiTitle'),
    prodiSub: document.getElementById('prodiSub'),
    refreshBtn: document.getElementById('refreshBtn'),
    tabsBox: document.getElementById('tabsBox'),
    tabsList: document.getElementById('tabsList'),
    tableSelect: document.getElementById('tableSelect'),
    autoPaginateCheck: document.getElementById('autoPaginateCheck'),
    delayInput: document.getElementById('delayInput'),
    scrapeDomBtn: document.getElementById('scrapeDomBtn'),
    stopScrapeBtn: document.getElementById('stopScrapeBtn'),
    progressBar: document.getElementById('progressBar'),
    apiCountBadge: document.getElementById('apiCountBadge'),
    apiAvailableBox: document.getElementById('apiAvailableBox'),
    apiEmptyHint: document.getElementById('apiEmptyHint'),
    apiSelect: document.getElementById('apiSelect'),
    useApiBtn: document.getElementById('useApiBtn'),
    resultSection: document.getElementById('resultSection'),
    clearResultBtn: document.getElementById('clearResultBtn'),
    statRows: document.getElementById('statRows'),
    statCols: document.getElementById('statCols'),
    statPages: document.getElementById('statPages'),
    resultSourceMeta: document.getElementById('resultSourceMeta'),
    exportCsvBtn: document.getElementById('exportCsvBtn'),
    exportJsonBtn: document.getElementById('exportJsonBtn'),
    copyTsvBtn: document.getElementById('copyTsvBtn'),
    copyFeedback: document.getElementById('copyFeedback'),
    previewTable: document.getElementById('previewTable'),
    errorBox: document.getElementById('errorBox')
  };

  let activeTabId = null;
  let currentResult = null;

  function showError(msg) {
    if (!msg) {
      els.errorBox.classList.add('hidden');
      els.errorBox.textContent = '';
      return;
    }
    els.errorBox.textContent = msg;
    els.errorBox.classList.remove('hidden');
  }

  function setScrapeRunning(running, message = '') {
    els.scrapeDomBtn.disabled = running;
    els.useApiBtn.disabled = running;
    els.stopScrapeBtn.classList.toggle('hidden', !running);

    if (message) {
      els.progressBar.textContent = message;
      els.progressBar.classList.remove('hidden');
    } else if (!running) {
      els.progressBar.classList.add('hidden');
    }
  }

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab || null;
  }

  async function sendToTab(tabId, message) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch {
      // Tab mungkin sudah terbuka sebelum ekstensi dimuat; suntikkan content.js lalu coba ulang
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['src/content.js']
      });
      return await chrome.tabs.sendMessage(tabId, message);
    }
  }

  function renderTabs(tabs) {
    if (!tabs || tabs.length === 0) {
      els.tabsBox.classList.add('hidden');
      return;
    }

    const { escapeHtml } = window.PddiktiExport;
    els.tabsList.innerHTML = tabs
      .map((t) => {
        const classes = ['tab-chip'];
        if (t.selected) classes.push('active');
        if (t.isDosenTab) classes.push('dosen-hint');
        return `<button class="${classes.join(' ')}" data-tab-idx="${t.index}">${escapeHtml(t.text)}</button>`;
      })
      .join('');

    els.tabsBox.classList.remove('hidden');
    els.tabsList.querySelectorAll('.tab-chip').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.getAttribute('data-tab-idx'));
        showError('');
        try {
          await sendToTab(activeTabId, { type: 'CLICK_TAB', tabIndex: idx });
          setTimeout(() => inspectActivePage(), 550);
        } catch (err) {
          showError(`Gagal membuka tab: ${err.message || err}`);
        }
      });
    });
  }

  function renderTables(tables) {
    const { escapeHtml } = window.PddiktiExport;
    if (!tables || tables.length === 0) {
      els.tableSelect.innerHTML = '<option value="">Tidak ada tabel terlihat di halaman</option>';
      els.scrapeDomBtn.disabled = true;
      return;
    }

    // Urutkan indeks berdasarkan skor tertinggi untuk default pilihan
    let bestIdx = 0;
    let bestScore = -1;
    tables.forEach((t) => {
      if (t.score > bestScore) {
        bestScore = t.score;
        bestIdx = t.index;
      }
    });

    els.tableSelect.innerHTML = tables
      .map((t) => {
        const tag = t.score >= 6 ? ' [Rekomendasi Dosen]' : '';
        const label = `${t.label}${tag} (${t.rowCount} baris, ${t.columns.length} kolom)`;
        const selected = t.index === bestIdx ? 'selected' : '';
        return `<option value="${t.index}" ${selected}>${escapeHtml(label)}</option>`;
      })
      .join('');
    els.scrapeDomBtn.disabled = false;
  }

  function renderApiDatasets(datasets) {
    const { escapeHtml } = window.PddiktiExport;
    const count = datasets ? datasets.length : 0;
    els.apiCountBadge.textContent = `${count} dataset`;

    if (count === 0) {
      els.apiAvailableBox.classList.add('hidden');
      els.apiEmptyHint.classList.remove('hidden');
      return;
    }

    els.apiSelect.innerHTML = datasets
      .map((d) => {
        const label = `${d.shortUrl} (${d.rowCount} baris, ${d.columns.length} field)`;
        return `<option value="${escapeHtml(d.id)}">${escapeHtml(label)}</option>`;
      })
      .join('');

    els.apiAvailableBox.classList.remove('hidden');
    els.apiEmptyHint.classList.add('hidden');
  }

  function renderResult(result) {
    currentResult = result;
    if (!result || !Array.isArray(result.rows) || result.rows.length === 0) {
      els.resultSection.classList.add('hidden');
      return;
    }

    const { escapeHtml } = window.PddiktiExport;
    const columns = result.columns || [];
    const rows = result.rows || [];

    els.statRows.textContent = String(rows.length);
    els.statCols.textContent = String(columns.length);
    els.statPages.textContent = String(result.pagesScraped || 1);

    const prodiName = result.prodiMeta?.title || 'Detail Prodi';
    els.resultSourceMeta.textContent = `Sumber: ${result.sourceLabel} • ${prodiName}`;

    const previewRows = rows.slice(0, 20);
    const thead = `<thead><tr>${columns
      .map((c) => `<th title="${escapeHtml(c)}">${escapeHtml(c)}</th>`)
      .join('')}</tr></thead>`;
    const tbody = `<tbody>${previewRows
      .map(
        (r) =>
          `<tr>${columns
            .map((c) => {
              const val = r[c] ?? '';
              return `<td title="${escapeHtml(val)}">${escapeHtml(val)}</td>`;
            })
            .join('')}</tr>`
      )
      .join('')}</tbody>`;

    els.previewTable.innerHTML = thead + tbody;
    els.resultSection.classList.remove('hidden');
  }

  async function inspectActivePage() {
    if (!activeTabId) return;
    showError('');
    try {
      const res = await sendToTab(activeTabId, { type: 'INSPECT_PAGE' });
      if (!res || !res.ok) {
        showError(res?.error || 'Gagal memeriksa halaman.');
        return;
      }

      const { meta, tables, tabs, apiDatasets, scrapeStatus } = res;
      els.prodiTitle.textContent = meta.title || 'Halaman PDDIKTI';
      const subParts = [meta.jenjang, meta.institution, meta.akreditasi ? `Akreditasi: ${meta.akreditasi}` : ''].filter(Boolean);
      els.prodiSub.textContent =
        subParts.join(' • ') ||
        (meta.isDetailProdi ? 'Halaman Detail Program Studi' : 'Buka halaman detail-prodi untuk hasil optimal');

      if (meta.isDetailProdi) {
        els.statusBadge.textContent = 'Detail Prodi';
        els.statusBadge.className = 'badge badge-ok';
      } else {
        els.statusBadge.textContent = 'PDDIKTI';
        els.statusBadge.className = 'badge badge-warn';
      }

      renderTabs(tabs);
      renderTables(tables);
      renderApiDatasets(apiDatasets);

      if (scrapeStatus?.running) {
        setScrapeRunning(true, scrapeStatus.message);
      } else if (scrapeStatus?.message && scrapeStatus.message !== 'Siap') {
        setScrapeRunning(false, scrapeStatus.message);
        els.progressBar.classList.remove('hidden');
      } else {
        setScrapeRunning(false);
      }
    } catch (err) {
      showError(`Tidak dapat terhubung ke halaman: ${err.message || err}`);
    }
  }

  async function loadStoredResult() {
    try {
      const data = await chrome.storage.local.get('pddikti_last_result');
      if (data?.pddikti_last_result) {
        renderResult(data.pddikti_last_result);
      }
    } catch {
      // Abaikan jika storage kosong
    }
  }

  function buildExportFilename(ext) {
    const { sanitizeFilenamePart } = window.PddiktiExport;
    const base = sanitizeFilenamePart(currentResult?.prodiMeta?.title || 'pddikti_prodi');
    const stamp = new Date().toISOString().slice(0, 10);
    return `dosen_${base}_${stamp}.${ext}`;
  }

  // Event listeners
  els.openTargetBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: TARGET_PRODI_URL });
  });

  els.refreshBtn.addEventListener('click', () => inspectActivePage());

  els.scrapeDomBtn.addEventListener('click', async () => {
    showError('');
    const tableIndex = Number(els.tableSelect.value);
    if (Number.isNaN(tableIndex)) {
      showError('Pilih tabel terlebih dahulu.');
      return;
    }

    setScrapeRunning(true, 'Memulai pengambilan data...');
    try {
      const res = await sendToTab(activeTabId, {
        type: 'START_DOM_SCRAPE',
        options: {
          tableIndex,
          autoPaginate: els.autoPaginateCheck.checked,
          delayMs: Number(els.delayInput.value) || 650
        }
      });

      if (!res?.ok) {
        setScrapeRunning(false);
        showError(res?.error || 'Gagal mengambil data tabel.');
        return;
      }

      setScrapeRunning(false, `Berhasil mengambil ${res.result.rows.length} baris.`);
      els.progressBar.classList.remove('hidden');
      renderResult(res.result);
    } catch (err) {
      setScrapeRunning(false);
      showError(`Terjadi kesalahan: ${err.message || err}`);
    }
  });

  els.stopScrapeBtn.addEventListener('click', async () => {
    if (!activeTabId) return;
    await sendToTab(activeTabId, { type: 'STOP_SCRAPE' }).catch(() => {});
  });

  els.useApiBtn.addEventListener('click', async () => {
    showError('');
    const datasetId = els.apiSelect.value;
    try {
      const res = await sendToTab(activeTabId, {
        type: 'USE_API_DATASET',
        datasetId
      });
      if (!res?.ok) {
        showError(res?.error || 'Gagal membaca dataset API.');
        return;
      }
      renderResult(res.result);
    } catch (err) {
      showError(`Gagal menggunakan dataset API: ${err.message || err}`);
    }
  });

  els.exportCsvBtn.addEventListener('click', () => {
    if (!currentResult) return;
    const { rowsToCsv, triggerDownload } = window.PddiktiExport;
    const csv = rowsToCsv(currentResult.rows, currentResult.columns);
    triggerDownload(csv, buildExportFilename('csv'), 'text/csv;charset=utf-8;');
  });

  els.exportJsonBtn.addEventListener('click', () => {
    if (!currentResult) return;
    const { triggerDownload } = window.PddiktiExport;
    const payload = {
      prodiMeta: currentResult.prodiMeta,
      sourceType: currentResult.sourceType,
      sourceLabel: currentResult.sourceLabel,
      scrapedAt: currentResult.scrapedAt,
      totalRows: currentResult.rows.length,
      data: currentResult.rows
    };
    triggerDownload(
      JSON.stringify(payload, null, 2),
      buildExportFilename('json'),
      'application/json;charset=utf-8;'
    );
  });

  els.copyTsvBtn.addEventListener('click', async () => {
    if (!currentResult) return;
    const { rowsToTsv } = window.PddiktiExport;
    const tsv = rowsToTsv(currentResult.rows, currentResult.columns);
    try {
      await navigator.clipboard.writeText(tsv);
      els.copyFeedback.textContent = 'Data disalin! Bisa langsung di-paste (Ctrl+V) ke Excel/Google Sheets.';
      els.copyFeedback.classList.remove('hidden');
      setTimeout(() => els.copyFeedback.classList.add('hidden'), 3000);
    } catch (err) {
      showError(`Gagal menyalin ke clipboard: ${err.message || err}`);
    }
  });

  els.clearResultBtn.addEventListener('click', async () => {
    await chrome.storage.local.remove('pddikti_last_result');
    renderResult(null);
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'SCRAPE_PROGRESS' && message.status) {
      setScrapeRunning(message.status.running, message.status.message);
      if (!message.status.running) {
        loadStoredResult();
      }
    }
  });

  async function init() {
    const tab = await getActiveTab();
    if (!tab || !tab.url || !tab.url.startsWith('https://pddikti.kemdiktisaintek.go.id')) {
      els.statusBadge.textContent = 'Bukan PDDIKTI';
      els.statusBadge.className = 'badge badge-warn';
      els.wrongPageCard.classList.remove('hidden');
      els.mainPanel.classList.add('hidden');
      return;
    }

    activeTabId = tab.id;
    els.wrongPageCard.classList.add('hidden');
    els.mainPanel.classList.remove('hidden');

    await loadStoredResult();
    await inspectActivePage();
  }

  init();
})();

