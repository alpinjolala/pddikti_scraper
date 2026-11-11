(() => {
  if (window.__PDDIKTI_CONTENT_LOADED__) return;
  window.__PDDIKTI_CONTENT_LOADED__ = true;

  const NET_SOURCE = 'PDDIKTI_SCRAPER_NET';
  const MAX_API_CAPTURES = 50;

  const LECTURER_FIELD_KEYWORDS = [
    'nidn',
    'nuptk',
    'nip',
    'nidk',
    'nitk',
    'nama_dosen',
    'namadosen',
    'nama',
    'dosen',
    'tenaga pendidik',
    'jabatan',
    'fungsional',
    'pendidikan',
    'jenjang',
    'ikatan',
    'status',
    'homebase',
    'id_sdm',
    'id_dosen',
    'gelar',
    'bidang'
  ];

  const state = {
    currentUrl: window.location.href,
    apiCaptures: [],
    scrapeStatus: {
      running: false,
      stopRequested: false,
      page: 0,
      rowCount: 0,
      message: 'Siap'
    },
    lastResult: null
  };

  function resetForUrlChange() {
    if (state.currentUrl !== window.location.href) {
      state.currentUrl = window.location.href;
      state.apiCaptures = [];
      state.scrapeStatus = {
        running: false,
        stopRequested: false,
        page: 0,
        rowCount: 0,
        message: 'Siap'
      };
      state.lastResult = null;
    }
  }

  window.addEventListener('popstate', resetForUrlChange);

  // Hook pushState/replaceState di isolated world? Tidak perlu, cukup cek URL saat ada interaksi/event.
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== NET_SOURCE) return;

    resetForUrlChange();
    const payload = event.data.payload;
    if (!payload || payload.data === undefined) return;

    const existingIdx = state.apiCaptures.findIndex((c) => c.url === payload.url);
    if (existingIdx >= 0) {
      state.apiCaptures[existingIdx] = payload;
    } else {
      state.apiCaptures.push(payload);
      if (state.apiCaptures.length > MAX_API_CAPTURES) {
        state.apiCaptures.shift();
      }
    }
  });

  function normalizeText(value) {
    return String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isPlainObject(val) {
    return val !== null && typeof val === 'object' && !Array.isArray(val);
  }

  function flattenRecord(obj, prefix = '', out = {}) {
    if (!isPlainObject(obj)) return out;
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (isPlainObject(value)) {
        flattenRecord(value, fullKey, out);
      } else if (Array.isArray(value)) {
        if (value.every((v) => !isPlainObject(v) && !Array.isArray(v))) {
          out[fullKey] = value.join('; ');
        } else {
          out[fullKey] = JSON.stringify(value);
        }
      } else {
        out[fullKey] = value ?? '';
      }
    }
    return out;
  }

  function scoreLecturerKeys(keys) {
    const joined = keys.map((k) => k.toLowerCase()).join(' ');
    let score = 0;
    const strongKeys = ['nidn', 'nuptk', 'id_sdm', 'id_dosen', 'nama_dosen', 'jabatan_akademik', 'ikatan_kerja', 'pendidikan_tertinggi'];
    const mediumKeys = ['nama', 'pendidikan', 'jabatan', 'status', 'semester', 'homebase', 'nip', 'gelar'];

    for (const k of strongKeys) {
      if (joined.includes(k)) score += 4;
    }
    for (const k of mediumKeys) {
      if (joined.includes(k)) score += 1.5;
    }
    return score;
  }

  function extractLecturerArraysFromJson(root, path = '$', depth = 0, found = []) {
    if (depth > 5 || root == null) return found;

    if (Array.isArray(root)) {
      if (root.length > 0 && isPlainObject(root[0])) {
        const sampleKeys = Object.keys(root[0]);
        const score = scoreLecturerKeys(sampleKeys);
        if (score >= 3) {
          found.push({
            path,
            score,
            rows: root.map((item) => flattenRecord(item))
          });
        }
      }
      return found;
    }

    if (isPlainObject(root)) {
      for (const [key, val] of Object.entries(root)) {
        extractLecturerArraysFromJson(val, `${path}.${key}`, depth + 1, found);
      }
    }
    return found;
  }

  function extractProdiInfoFromCaptures() {
    for (const cap of state.apiCaptures) {
      const data = cap.data;
      const candidates = isPlainObject(data) ? [data, data.data, data.prodi] : [];
      for (const obj of candidates) {
        if (!isPlainObject(obj)) continue;
        if (obj.nama_prodi || obj.nama_pt || obj.kode_prodi) {
          return {
            namaProdi: obj.nama_prodi || '',
            namaPt: obj.nama_pt || '',
            jenjang: obj.jenjang || obj.nama_jenjang || '',
            kodeProdi: obj.kode_prodi || '',
            akreditasi: obj.akreditasi || ''
          };
        }
      }
    }
    return null;
  }

  function getApiDatasets() {
    const datasets = [];
    for (const cap of state.apiCaptures) {
      const matches = extractLecturerArraysFromJson(cap.data);
      for (const m of matches) {
        const columns = Array.from(
          m.rows.reduce((set, row) => {
            Object.keys(row).forEach((k) => set.add(k));
            return set;
          }, new Set())
        );
        let shortUrl = cap.url;
        try {
          const parsed = new URL(cap.url, window.location.origin);
          shortUrl = parsed.pathname + parsed.search;
        } catch {
          // gunakan apa adanya
        }
        datasets.push({
          id: `${cap.url}::${m.path}`,
          url: cap.url,
          shortUrl,
          path: m.path,
          score: m.score,
          rowCount: m.rows.length,
          columns,
          rows: m.rows
        });
      }
    }
    datasets.sort((a, b) => b.score - a.score || b.rowCount - a.rowCount);
    return datasets;
  }

  function isElementVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function findNearestLabel(el) {
    let cur = el;
    for (let depth = 0; depth < 6 && cur && cur !== document.body; depth++) {
      let prev = cur.previousElementSibling;
      while (prev) {
        if (/^H[1-6]$/.test(prev.tagName)) {
          const text = normalizeText(prev.innerText);
          if (text) return text;
        }
        const heading = prev.querySelector?.('h1, h2, h3, h4, h5, h6');
        if (heading) {
          const text = normalizeText(heading.innerText);
          if (text) return text;
        }
        prev = prev.previousElementSibling;
      }
      cur = cur.parentElement;
    }

    const activeTab = document.querySelector('[role="tab"][aria-selected="true"]');
    if (activeTab) {
      const text = normalizeText(activeTab.innerText);
      if (text) return `Tab: ${text}`;
    }
    return '';
  }

  function parseHtmlTable(tableEl) {
    const theadHeaders = Array.from(tableEl.querySelectorAll('thead th')).map((th) =>
      normalizeText(th.innerText)
    );

    let headers = theadHeaders.filter(Boolean);
    const allRows = Array.from(tableEl.querySelectorAll('tbody tr'));
    let dataTrs = allRows;

    if (headers.length === 0) {
      const firstTr = tableEl.querySelector('tr');
      if (firstTr) {
        const firstCells = Array.from(firstTr.querySelectorAll('th, td')).map((c) =>
          normalizeText(c.innerText)
        );
        if (firstCells.some(Boolean)) {
          headers = firstCells;
          if (dataTrs.length === 0) {
            dataTrs = Array.from(tableEl.querySelectorAll('tr')).slice(1);
          } else if (dataTrs[0] === firstTr) {
            dataTrs = dataTrs.slice(1);
          }
        }
      }
    }

    if (dataTrs.length === 0) {
      dataTrs = Array.from(tableEl.querySelectorAll('tr')).filter((tr) => !tr.closest('thead'));
    }

    // Pastikan nama kolom unik & tidak kosong
    const normalizedHeaders = [];
    const seenHeader = new Map();
    headers.forEach((h, i) => {
      const base = h || `Kolom ${i + 1}`;
      const count = seenHeader.get(base) || 0;
      seenHeader.set(base, count + 1);
      normalizedHeaders.push(count > 0 ? `${base} (${count + 1})` : base);
    });

    const rows = [];
    let hasDetailLinks = false;

    for (const tr of dataTrs) {
      if (!isElementVisible(tr)) continue;
      const cells = Array.from(tr.querySelectorAll('td, th'));
      if (cells.length === 0) continue;

      const textValues = cells.map((c) => normalizeText(c.innerText));
      // Lewati baris kosong atau baris pesan "Data tidak ditemukan"
      if (textValues.every((v) => !v)) continue;
      if (
        cells.length === 1 &&
        /tidak ada data|data kosong|no data|belum ada data/i.test(textValues[0])
      ) {
        continue;
      }

      const rowObj = {};
      const colCount = Math.max(normalizedHeaders.length, cells.length);
      let rowDetailUrl = '';

      for (let i = 0; i < colCount; i++) {
        const colName = normalizedHeaders[i] || `Kolom ${i + 1}`;
        const cell = cells[i];
        rowObj[colName] = cell ? normalizeText(cell.innerText) : '';
        if (cell) {
          const anchor = cell.querySelector('a[href]');
          if (anchor) {
            const href = anchor.getAttribute('href') || '';
            if (href && (href.includes('detail-dosen') || !rowDetailUrl)) {
              rowDetailUrl = anchor.href;
            }
          }
        }
      }

      if (rowDetailUrl) {
        hasDetailLinks = true;
        rowObj['Link Detail'] = rowDetailUrl;
      }
      rows.push(rowObj);
    }

    const columns = [...normalizedHeaders];
    if (hasDetailLinks && !columns.includes('Link Detail')) {
      columns.push('Link Detail');
    }

    return { columns, rows, hasDetailLinks };
  }

  function parseAriaTable(gridEl) {
    const headerCells = Array.from(
      gridEl.querySelectorAll('[role="columnheader"]')
    ).map((el) => normalizeText(el.innerText));

    const rowEls = Array.from(gridEl.querySelectorAll('[role="row"]')).filter((row) =>
      row.querySelector('[role="cell"], [role="gridcell"]')
    );

    const headers = headerCells.map((h, i) => h || `Kolom ${i + 1}`);
    const rows = [];
    let hasDetailLinks = false;

    for (const rowEl of rowEls) {
      if (!isElementVisible(rowEl)) continue;
      const cells = Array.from(rowEl.querySelectorAll('[role="cell"], [role="gridcell"]'));
      if (cells.length === 0) continue;

      const rowObj = {};
      let rowDetailUrl = '';
      cells.forEach((cell, i) => {
        const colName = headers[i] || `Kolom ${i + 1}`;
        rowObj[colName] = normalizeText(cell.innerText);
        const anchor = cell.querySelector('a[href]');
        if (anchor && anchor.href) {
          if (anchor.href.includes('detail-dosen') || !rowDetailUrl) {
            rowDetailUrl = anchor.href;
          }
        }
      });

      if (rowDetailUrl) {
        hasDetailLinks = true;
        rowObj['Link Detail'] = rowDetailUrl;
      }
      rows.push(rowObj);
    }

    const columns = [...headers];
    if (hasDetailLinks && !columns.includes('Link Detail')) {
      columns.push('Link Detail');
    }

    return { columns, rows, hasDetailLinks };
  }

  function scoreTableForDosen(label, columns) {
    const headerText = columns.join(' ').toLowerCase();
    const labelText = (label || '').toLowerCase();
    let score = 0;

    if (/dosen|tenaga pendidik|pengajar|homebase/.test(labelText)) score += 6;
    for (const kw of LECTURER_FIELD_KEYWORDS) {
      if (headerText.includes(kw)) score += 2;
    }
    if (/nidn|nuptk/.test(headerText)) score += 5;
    if (/nama/.test(headerText) && /pendidikan|jabatan|status|ikatan/.test(headerText)) {
      score += 4;
    }
    return score;
  }

  function discoverTables() {
    const entries = [];
    const htmlTables = Array.from(document.querySelectorAll('table')).filter(isElementVisible);

    htmlTables.forEach((el) => {
      const parsed = parseHtmlTable(el);
      const label = findNearestLabel(el);
      const score = scoreTableForDosen(label, parsed.columns);
      entries.push({
        type: 'html',
        element: el,
        label: label || `Tabel #${entries.length + 1}`,
        columns: parsed.columns,
        rows: parsed.rows,
        rowCount: parsed.rows.length,
        hasDetailLinks: parsed.hasDetailLinks,
        score
      });
    });

    if (entries.length === 0) {
      const ariaTables = Array.from(
        document.querySelectorAll('[role="table"], [role="grid"]')
      ).filter(isElementVisible);

      ariaTables.forEach((el) => {
        const parsed = parseAriaTable(el);
        const label = findNearestLabel(el);
        const score = scoreTableForDosen(label, parsed.columns);
        entries.push({
          type: 'aria',
          element: el,
          label: label || `Grid #${entries.length + 1}`,
          columns: parsed.columns,
          rows: parsed.rows,
          rowCount: parsed.rows.length,
          hasDetailLinks: parsed.hasDetailLinks,
          score
        });
      });
    }

    return entries;
  }

  function discoverTabs() {
    const candidates = Array.from(
      document.querySelectorAll('[role="tab"], nav button, nav a, [class*="tab"] button')
    ).filter(isElementVisible);

    const tabs = [];
    const seen = new Set();

    for (const el of candidates) {
      const text = normalizeText(el.innerText);
      if (!text || text.length > 50) continue;
      if (seen.has(text)) continue;

      const isRelevant =
        el.getAttribute('role') === 'tab' ||
        /dosen|tenaga pendidik|pengajar|homebase|mahasiswa|profil|akreditasi|rasio|kurikulum/i.test(
          text
        );
      if (!isRelevant) continue;

      seen.add(text);
      const selected =
        el.getAttribute('aria-selected') === 'true' ||
        /\b(active|selected|bg-primary|border-b-2)\b/i.test(el.className || '');

      tabs.push({
        index: tabs.length,
        text,
        selected,
        isDosenTab: /dosen|tenaga pendidik|pengajar|homebase/i.test(text),
        element: el
      });
    }
    return tabs;
  }

  function extractPageMeta() {
    const apiMeta = extractProdiInfoFromCaptures();
    const h1 = normalizeText(document.querySelector('h1')?.innerText);
    const h2 = normalizeText(document.querySelector('h2')?.innerText);
    const title = normalizeText(document.title);

    return {
      url: window.location.href,
      isDetailProdi: /\/detail-prodi\//i.test(window.location.pathname),
      title: apiMeta?.namaProdi || h1 || h2 || title,
      institution: apiMeta?.namaPt || '',
      jenjang: apiMeta?.jenjang || '',
      akreditasi: apiMeta?.akreditasi || ''
    };
  }

  function getTableRowSignature(tableEntry) {
    const rows = tableEntry.rows;
    if (!rows || rows.length === 0) return 'empty';
    const first = JSON.stringify(rows[0]);
    const last = JSON.stringify(rows[rows.length - 1]);
    return `${rows.length}|${first}|${last}`;
  }

  function isButtonDisabled(btn) {
    if (!btn) return true;
    if (btn.disabled) return true;
    if (btn.getAttribute('aria-disabled') === 'true') return true;
    const cls = String(btn.className || '').toLowerCase();
    if (cls.includes('disabled') || cls.includes('cursor-not-allowed')) return true;
    const style = window.getComputedStyle(btn);
    if (style.pointerEvents === 'none') return true;
    return false;
  }

  function findPaginationContainer(tableEl) {
    let cur = tableEl.parentElement;
    for (let depth = 0; depth < 5 && cur && cur !== document.body; depth++) {
      const buttons = Array.from(cur.querySelectorAll('button, a[role="button"], nav a')).filter(
        isElementVisible
      );
      const hasPaginationCue = buttons.some((b) => {
        const text = normalizeText(b.innerText);
        const label = normalizeText(b.getAttribute('aria-label') || b.getAttribute('title'));
        return (
          /^(next|prev|previous|berikutnya|sebelumnya|selanjutnya|›|»|‹|«|>|<)$/i.test(text) ||
          /next|prev|page|halaman|berikut|sebelum/i.test(label) ||
          /^\d+$/.test(text)
        );
      });
      if (hasPaginationCue && buttons.length >= 2) {
        return cur;
      }
      cur = cur.parentElement;
    }
    return null;
  }

  function findNextPageButton(paginationContainer, currentPageNum) {
    if (!paginationContainer) return null;
    const buttons = Array.from(
      paginationContainer.querySelectorAll('button, a[role="button"], a')
    ).filter(isElementVisible);

    // 1. Cari tombol eksplisit "Next" / "Berikutnya" / ">" / "›"
    for (const btn of buttons) {
      const text = normalizeText(btn.innerText);
      const aria = normalizeText(
        `${btn.getAttribute('aria-label') || ''} ${btn.getAttribute('title') || ''}`
      );
      if (
        /^(next|berikutnya|selanjutnya|>|›|»|->)$/i.test(text) ||
        /\b(next|berikutnya|selanjutnya|halaman berikutnya)\b/i.test(aria)
      ) {
        if (!isButtonDisabled(btn)) return btn;
        return null; // Tombol Next ditemukan tapi disabled -> sudah halaman terakhir
      }
    }

    // 2. Cari tombol bernomor currentPageNum + 1
    const nextNumberStr = String(currentPageNum + 1);
    const numberedBtn = buttons.find((b) => normalizeText(b.innerText) === nextNumberStr);
    if (numberedBtn && !isButtonDisabled(numberedBtn)) {
      return numberedBtn;
    }

    // 3. Fallback: tombol icon-only (mengandung SVG) paling kanan setelah tombol angka aktif
    const activeIndex = buttons.findIndex(
      (b) =>
        b.getAttribute('aria-current') === 'page' ||
        normalizeText(b.innerText) === String(currentPageNum)
    );
    if (activeIndex >= 0) {
      for (let i = buttons.length - 1; i > activeIndex; i--) {
        const b = buttons[i];
        const txt = normalizeText(b.innerText);
        if (!txt && b.querySelector('svg') && !isButtonDisabled(b)) {
          return b;
        }
      }
    }

    return null;
  }

  function buildRowDedupeKey(rowObj, columns) {
    const link = rowObj['Link Detail'];
    if (link) return `url:${link}`;

    const nidnCol = columns.find((c) => /^(nidn|nuptk|nip|nidk)$/i.test(c.trim()));
    const namaCol = columns.find((c) => /nama/i.test(c));
    if (nidnCol && rowObj[nidnCol] && rowObj[nidnCol] !== '-') {
      return `id:${rowObj[nidnCol]}|${namaCol ? rowObj[namaCol] : ''}`;
    }

    // Abaikan kolom nomor urut (# / No / No.) saat membuat kunci unik
    const valueParts = columns
      .filter((c) => !/^(no\.?|#|nomor)$/i.test(c.trim()))
      .map((c) => rowObj[c] ?? '');
    return `row:${valueParts.join('|')}`;
  }

  function waitForTableUpdate(tableEntry, prevSignature, timeoutMs = 8000) {
    return new Promise((resolve) => {
      const start = Date.now();
      let settled = false;
      let pollId = null;

      const finish = (changed) => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        if (pollId) clearInterval(pollId);
        resolve(changed);
      };

      const check = () => {
        const tables = discoverTables();
        const current = tables.find((t) => t.element === tableEntry.element) || tables[0];
        if (!current) return;
        const sig = getTableRowSignature(current);
        if (sig !== prevSignature && sig !== 'empty') {
          finish(true);
        } else if (Date.now() - start >= timeoutMs) {
          finish(false);
        }
      };

      const observer = new MutationObserver(() => check());
      observer.observe(tableEntry.element, {
        childList: true,
        subtree: true,
        characterData: true
      });
      pollId = setInterval(check, 200);
    });
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function notifyProgress() {
    try {
      chrome.runtime.sendMessage({
        type: 'SCRAPE_PROGRESS',
        status: { ...state.scrapeStatus }
      });
    } catch {
      // Popup mungkin sedang tertutup
    }
  }

  async function saveResultToStorage(result) {
    state.lastResult = result;
    try {
      await chrome.storage.local.set({
        pddikti_last_result: result
      });
    } catch {
      // Abaikan jika storage gagal
    }
  }

  async function scrapeDomTable(options = {}) {
    resetForUrlChange();
    if (state.scrapeStatus.running) {
      return { ok: false, error: 'Proses pengambilan data sedang berjalan.' };
    }

    const {
      tableIndex = 0,
      autoPaginate = true,
      delayMs = 650,
      maxPages = 150
    } = options;

    const initialTables = discoverTables();
    const target = initialTables[tableIndex];
    if (!target) {
      return { ok: false, error: 'Tabel tidak ditemukan di halaman saat ini.' };
    }

    state.scrapeStatus = {
      running: true,
      stopRequested: false,
      page: 1,
      rowCount: 0,
      message: 'Mengambil halaman 1...'
    };
    notifyProgress();

    const meta = extractPageMeta();
    const allRows = [];
    const seenKeys = new Set();
    let columns = [...target.columns];
    let currentPage = 1;
    let currentEntry = target;

    const appendRows = (entry) => {
      entry.columns.forEach((c) => {
        if (!columns.includes(c)) columns.push(c);
      });
      let added = 0;
      for (const row of entry.rows) {
        const key = buildRowDedupeKey(row, columns);
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          allRows.push(row);
          added++;
        }
      }
      return added;
    };

    appendRows(currentEntry);
    state.scrapeStatus.rowCount = allRows.length;
    notifyProgress();

    if (autoPaginate) {
      while (currentPage < maxPages && !state.scrapeStatus.stopRequested) {
        const paginationContainer = findPaginationContainer(currentEntry.element);
        const nextBtn = findNextPageButton(paginationContainer, currentPage);
        if (!nextBtn) break;

        const prevSig = getTableRowSignature(currentEntry);
        state.scrapeStatus.message = `Berpindah ke halaman ${currentPage + 1}...`;
        notifyProgress();

        nextBtn.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        nextBtn.click();

        const changed = await waitForTableUpdate(currentEntry, prevSig, 8000);
        if (!changed) break;

        await sleep(Math.max(200, Number(delayMs) || 650));

        const refreshedTables = discoverTables();
        const updated =
          refreshedTables.find((t) => t.element === currentEntry.element) ||
          refreshedTables[tableIndex];
        if (!updated) break;

        currentEntry = updated;
        currentPage++;
        const addedCount = appendRows(currentEntry);

        state.scrapeStatus.page = currentPage;
        state.scrapeStatus.rowCount = allRows.length;
        state.scrapeStatus.message = `Halaman ${currentPage} selesai (${allRows.length} baris)`;
        notifyProgress();

        if (addedCount === 0) {
          // Tidak ada baris baru -> kemungkinan kembali ke halaman awal atau akhir data
          break;
        }
      }
    }

    const result = {
      sourceType: 'dom',
      sourceLabel: currentEntry.label,
      prodiMeta: meta,
      scrapedAt: new Date().toISOString(),
      pagesScraped: currentPage,
      columns,
      rows: allRows
    };

    state.scrapeStatus.running = false;
    state.scrapeStatus.message = state.scrapeStatus.stopRequested
      ? `Dihentikan (${allRows.length} baris dari ${currentPage} halaman)`
      : `Selesai (${allRows.length} baris dari ${currentPage} halaman)`;
    await saveResultToStorage(result);
    notifyProgress();

    return { ok: true, result };
  }

  async function useApiDataset(datasetId) {
    resetForUrlChange();
    const datasets = getApiDatasets();
    const chosen = datasets.find((d) => d.id === datasetId) || datasets[0];
    if (!chosen) {
      return { ok: false, error: 'Belum ada data JSON API dosen yang tertangkap.' };
    }

    const result = {
      sourceType: 'api',
      sourceLabel: `API: ${chosen.shortUrl}`,
      prodiMeta: extractPageMeta(),
      scrapedAt: new Date().toISOString(),
      pagesScraped: 1,
      columns: chosen.columns,
      rows: chosen.rows
    };

    await saveResultToStorage(result);
    return { ok: true, result };
  }

  function clickTabByIndex(tabIndex) {
    const tabs = discoverTabs();
    const tab = tabs[tabIndex];
    if (!tab || !tab.element) {
      return { ok: false, error: 'Tab tidak ditemukan.' };
    }
    tab.element.scrollIntoView({ block: 'center', behavior: 'instant' });
    tab.element.click();
    return { ok: true, clicked: tab.text };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    resetForUrlChange();

    if (message.type === 'PING') {
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === 'INSPECT_PAGE') {
      const tables = discoverTables().map((t, index) => ({
        index,
        label: t.label,
        columns: t.columns,
        rowCount: t.rowCount,
        hasDetailLinks: t.hasDetailLinks,
        score: t.score
      }));
      const tabs = discoverTabs().map((t) => ({
        index: t.index,
        text: t.text,
        selected: t.selected,
        isDosenTab: t.isDosenTab
      }));
      const apiDatasets = getApiDatasets().map((d) => ({
        id: d.id,
        shortUrl: d.shortUrl,
        path: d.path,
        rowCount: d.rowCount,
        columns: d.columns,
        score: d.score
      }));

      sendResponse({
        ok: true,
        meta: extractPageMeta(),
        tables,
        tabs,
        apiDatasets,
        scrapeStatus: { ...state.scrapeStatus },
        apiCaptureCount: state.apiCaptures.length
      });
      return false;
    }

    if (message.type === 'CLICK_TAB') {
      sendResponse(clickTabByIndex(message.tabIndex));
      return false;
    }

    if (message.type === 'START_DOM_SCRAPE') {
      scrapeDomTable(message.options)
        .then((res) => sendResponse(res))
        .catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }

    if (message.type === 'STOP_SCRAPE') {
      state.scrapeStatus.stopRequested = true;
      state.scrapeStatus.message = 'Menghentikan...';
      notifyProgress();
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === 'USE_API_DATASET') {
      useApiDataset(message.datasetId)
        .then((res) => sendResponse(res))
        .catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }

    return false;
  });
})();

