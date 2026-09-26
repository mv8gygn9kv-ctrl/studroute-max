// Ссылки на официальные источники. Кнопка — это настоящая ссылка <a href>,
// поэтому она работает и в браузере, и в MAX, даже если MAX Bridge недоступен.

export function isSafeUrl(url) {
  return typeof url === 'string' && /^https:\/\/[^\s"'<>]+$/.test(url);
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Возвращает HTML ссылки-кнопки или пустую строку, если URL не https.
export function linkButtonHtml(url, label, className = 'btn btn-outline') {
  if (!isSafeUrl(url)) return '';
  return `<a class="${esc(className)}" href="${esc(url)}" target="_blank" rel="noopener noreferrer" data-url="${esc(url)}">${esc(label)}</a>`;
}

// Внутри MAX (есть initData) ссылка открывается через MAX Bridge; иначе — обычным переходом по ссылке.
export function shouldUseBridge(webApp) {
  return Boolean(webApp && webApp.initData && typeof webApp.openLink === 'function');
}
