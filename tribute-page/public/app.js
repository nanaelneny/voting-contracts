async function fetchJSON(url) {
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error('Request failed');
  return res.json();
}

function formatLifespan(sunrise, sunset) {
  if (!sunrise && !sunset) return '';
  const start = sunrise ? new Date(sunrise) : null;
  const end = sunset ? new Date(sunset) : null;
  const startYear = start ? start.getFullYear() : '—';
  const endYear = end ? end.getFullYear() : '—';
  return `${startYear} — ${endYear}`;
}

function escapeHtml(str) {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderDeceased(config) {
  const heroImage = document.getElementById('heroImage');
  const nameEl = document.getElementById('deceasedName');
  const headlineEl = document.getElementById('headline');
  const lifespanEl = document.getElementById('lifespan');

  if (config.coverImage) {
    heroImage.style.backgroundImage = `url('${config.coverImage}')`;
  }
  nameEl.textContent = config.fullName || '—';
  headlineEl.textContent = config.headline || '';
  lifespanEl.textContent = formatLifespan(config.sunrise, config.sunset);

  const gallery = document.getElementById('gallery');
  gallery.innerHTML = '';
  (config.gallery || []).forEach((src) => {
    const img = document.createElement('img');
    img.src = src;
    img.alt = `${config.fullName} photo`;
    gallery.appendChild(img);
  });
}

function renderTributes(items) {
  const container = document.getElementById('tributes');
  const count = document.getElementById('tributeCount');
  container.innerHTML = '';
  count.textContent = items.length;
  items.forEach((t) => {
    const card = document.createElement('article');
    card.className = 'tribute';

    const header = document.createElement('div');
    header.className = 'tribute__header';

    const left = document.createElement('div');

    const name = document.createElement('div');
    name.className = 'tribute__name';
    name.textContent = t.name;

    const meta = document.createElement('div');
    meta.className = 'tribute__meta';
    const parts = [];
    if (t.title) parts.push(t.title);
    if (t.organization) parts.push(t.organization);
    meta.textContent = parts.join(' • ');

    left.appendChild(name);
    left.appendChild(meta);

    const right = document.createElement('div');
    right.className = 'tribute__meta';
    const date = new Date(t.created_at);
    right.textContent = date.toLocaleString();

    header.appendChild(left);
    header.appendChild(right);

    const message = document.createElement('div');
    message.className = 'tribute__message';
    message.textContent = t.message;

    card.appendChild(header);
    card.appendChild(message);

    container.appendChild(card);
  });
}

async function loadPage() {
  document.getElementById('year').textContent = new Date().getFullYear();
  try {
    const [config, tributes] = await Promise.all([
      fetchJSON('/api/deceased'),
      fetchJSON('/api/tributes')
    ]);
    renderDeceased(config);
    renderTributes(tributes.items || []);
  } catch (e) {
    console.error(e);
  }
}

async function submitTribute(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const btn = document.getElementById('submitBtn');
  const status = document.getElementById('formStatus');

  const name = form.name.value.trim();
  const title = form.title.value.trim();
  const organization = form.organization.value.trim();
  const message = form.message.value.trim();

  if (!name || !message) {
    status.textContent = 'Name and message are required.';
    return;
  }

  btn.disabled = true;
  status.textContent = 'Posting...';
  try {
    const res = await fetch('/api/tributes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, title, organization, message })
    });
    if (!res.ok) throw new Error('Failed');
    form.reset();
    status.textContent = 'Thank you for your tribute.';
    const tributes = await fetchJSON('/api/tributes');
    renderTributes(tributes.items || []);
  } catch (e) {
    status.textContent = 'Could not post tribute. Please try again.';
  } finally {
    btn.disabled = false;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  loadPage();
  document.getElementById('tributeForm').addEventListener('submit', submitTribute);
});
