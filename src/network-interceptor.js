(() => {
  if (window.__PDDIKTI_NET_HOOKED__) return;
  window.__PDDIKTI_NET_HOOKED__ = true;

  const MESSAGE_SOURCE = 'PDDIKTI_SCRAPER_NET';

  function isRelevantUrl(url) {
    if (!url || typeof url !== 'string') return false;
    if (/\.(js|css|png|jpg|jpeg|gif|svg|webp|woff2?|ttf|ico)(\?|$)/i.test(url)) {
      return false;
    }
    return (
      url.includes('kemdiktisaintek.go.id') ||
      url.includes('/api/') ||
      url.startsWith('/')
    );
  }

  function emitCapture(url, method, status, data) {
    try {
      window.postMessage(
        {
          source: MESSAGE_SOURCE,
          payload: {
            url: String(url),
            method: String(method || 'GET').toUpperCase(),
            status: Number(status || 0),
            timestamp: Date.now(),
            data
          }
        },
        window.location.origin
      );
    } catch {
      // Abaikan jika postMessage gagal karena objek tidak dapat diserialisasi
    }
  }

  // Hook window.fetch
  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);
      try {
        const req = args[0];
        const url = typeof req === 'string' ? req : req?.url || '';
        const method =
          (typeof req === 'object' && req?.method) || args[1]?.method || 'GET';

        if (isRelevantUrl(url) && response && response.ok) {
          const contentType = response.headers?.get('content-type') || '';
          if (contentType.includes('json') || contentType === '') {
            const cloned = response.clone();
            cloned
              .text()
              .then((text) => {
                if (!text) return;
                const trimmed = text.trim();
                if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return;
                const parsed = JSON.parse(trimmed);
                emitCapture(url, method, response.status, parsed);
              })
              .catch(() => {});
          }
        }
      } catch {
        // Jangan pernah mengganggu fetch asli halaman
      }
      return response;
    };
  }

  // Hook XMLHttpRequest
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__pddiktiMeta = { method, url };
    return origOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', function () {
      try {
        const meta = this.__pddiktiMeta;
        if (!meta || !isRelevantUrl(meta.url)) return;
        if (this.status < 200 || this.status >= 300) return;

        if (this.responseType === 'json' && this.response != null) {
          emitCapture(meta.url, meta.method, this.status, this.response);
          return;
        }
        if (this.responseType === '' || this.responseType === 'text') {
          const trimmed = (this.responseText || '').trim();
          if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return;
          const parsed = JSON.parse(trimmed);
          emitCapture(meta.url, meta.method, this.status, parsed);
        }
      } catch {
        // Abaikan error parsing
      }
    });
    return origSend.apply(this, args);
  };
})();

