(function () {
  'use strict';

  const KEY_STORAGE = 'qingying-diary-cloud-key-v1';
  const CACHE_STORAGE = 'qingying-diary-cloud-cache-v1';
  const API_URL = 'https://api.github.com/repos/PHIMOON25/qingying-diary/contents/state.enc.json?ref=data';
  const DATA_URL = 'https://raw.githubusercontent.com/PHIMOON25/qingying-diary/data/state.enc.json';

  function decodeBase64Url(value) {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
    return Uint8Array.from(binary, char => char.charCodeAt(0));
  }

  function readKey() {
    const match = /^#sync=([A-Za-z0-9_-]{43})$/.exec(location.hash);
    if (match) {
      try {
        localStorage.setItem(KEY_STORAGE, match[1]);
        history.replaceState(null, '', location.pathname + location.search);
      } catch (_) {
        return null;
      }
    }
    try {
      const value = localStorage.getItem(KEY_STORAGE);
      return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
    } catch (_) {
      return null;
    }
  }

  const keyText = readKey();

  function connect(value) {
    const candidate = String(value || '').trim();
    if (!/^[A-Za-z0-9_-]{43}$/.test(candidate)) return false;
    try {
      if (decodeBase64Url(candidate).length !== 32) return false;
      localStorage.setItem(KEY_STORAGE, candidate);
      return true;
    } catch (_) {
      return false;
    }
  }

  function cached() {
    if (!keyText) return null;
    try {
      return JSON.parse(localStorage.getItem(CACHE_STORAGE) || 'null');
    } catch (_) {
      return null;
    }
  }

  async function fetchEnvelope() {
    try {
      const response = await fetch(API_URL + '&nonce=' + Date.now(), {
        cache: 'no-store',
        headers: { Accept: 'application/vnd.github+json' }
      });
      if (response.ok) {
        const file = await response.json();
        const binary = atob(file.content.replace(/\s/g, ''));
        return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0))));
      }
    } catch (_) {}

    const response = await fetch(DATA_URL + '?nonce=' + Date.now(), {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error('cloud fetch failed: ' + response.status);
    return response.json();
  }

  async function sync() {
    if (!keyText) throw new Error('cloud key missing');
    const envelope = await fetchEnvelope();
    if (envelope.version !== 1 || envelope.alg !== 'AES-256-GCM' ||
        typeof envelope.iv !== 'string' || typeof envelope.ciphertext !== 'string') {
      throw new Error('cloud data format invalid');
    }
    const key = await crypto.subtle.importKey(
      'raw', decodeBase64Url(keyText), 'AES-GCM', false, ['decrypt']
    );
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: decodeBase64Url(envelope.iv) },
      key,
      decodeBase64Url(envelope.ciphertext)
    );
    const data = JSON.parse(new TextDecoder().decode(plaintext));
    try { localStorage.setItem(CACHE_STORAGE, JSON.stringify(data)); } catch (_) {}
    return { data, updatedAt: envelope.updatedAt || null };
  }

  window.QingyingCloud = { enabled: Boolean(keyText), cached, sync, connect };
})();
