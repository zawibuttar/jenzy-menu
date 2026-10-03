import { readFileSync, writeFileSync } from 'node:fs'
import QRCode from 'qrcode'

const site = JSON.parse(readFileSync('site.json', 'utf8'))

const parseCsv = (text) => {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i += 1
      } else if (char === '"') quoted = false
      else field += char
    } else if (char === '"') quoted = true
    else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += char
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''))
}

const escape = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const slug = (value) =>
  value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const money = (amount) => `Rs ${Number(amount).toLocaleString('en-US')}`

const SIZE_PATTERNS = [
  /^(.*) (Quarter|Half|Full)$/,
  /^(.*) (\d+ pcs)$/,
  /^(Cold Drink|Water) (.+)$/
]

const splitSize = (name) => {
  for (const pattern of SIZE_PATTERNS) {
    const match = pattern.exec(name)
    if (match) return { base: match[1], size: match[2] }
  }
  return { base: name, size: '' }
}

const [header, ...body] = parseCsv(readFileSync('menu.csv', 'utf8'))
const column = (name) => header.indexOf(name)
const categories = []
for (const cells of body) {
  const categoryName = cells[column('category')].trim()
  const name = cells[column('name')].trim()
  const price = Number(cells[column('price')])
  const description = (cells[column('description')] ?? '').trim()
  if (!categoryName || !name || !Number.isFinite(price)) continue
  let category = categories.find((entry) => entry.name === categoryName)
  if (!category) {
    category = { name: categoryName, id: slug(categoryName), items: [] }
    categories.push(category)
  }
  const { base, size } = splitSize(name)
  const last = category.items[category.items.length - 1]
  if (size && last && last.name === base && last.sizes.length) {
    last.sizes.push({ label: size, price })
    continue
  }
  category.items.push(
    size
      ? { name: base, description, sizes: [{ label: size, price }] }
      : { name, description, price, sizes: [] }
  )
}

const itemCount = categories.reduce((sum, category) => sum + category.items.length, 0)

const badge = (size) => `<svg width="${size}" height="${size}" viewBox="0 0 200 200" role="img" aria-label="${escape(site.name)} logo"><circle cx="100" cy="100" r="98" fill="#0d0d0b"/><circle cx="100" cy="100" r="92" fill="none" stroke="#f2b705" stroke-width="3"/><g fill="none" stroke="#f2b705" stroke-width="5" stroke-linejoin="round" transform="translate(74 22) scale(0.43)"><path d="M60 4c-9 0-16 5-19 12-3-1-6-2-9-2C21 14 12 22 12 33c0 9 6 16 14 18v20h68V51c8-2 14-9 14-18 0-11-9-19-20-19-3 0-6 1-9 2C76 9 69 4 60 4z"/><path d="M26 82h68"/></g><text x="100" y="128" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="72" fill="#f2b705">${escape(site.letters)}</text><text x="100" y="160" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="19" letter-spacing="5" fill="#f2b705">${escape(site.name)}</text></svg>`

const digits = (phone) => phone.replace(/\D/g, '')
const international = (phone) => `92${digits(phone).replace(/^0/, '')}`

const itemHtml = (item, deal) => {
  const search = escape(`${item.name} ${item.description}`.toLowerCase())
  if (deal) {
    const includes = item.description
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
    return `<li class="deal" data-search="${search}"><div class="deal-head"><h3>${escape(item.name)}</h3><span class="tag">${money(item.price)}</span></div><ul class="includes">${includes.map((part) => `<li>${escape(part)}</li>`).join('')}</ul></li>`
  }
  if (item.sizes.length)
    return `<li class="item" data-search="${search}"><h3>${escape(item.name)}</h3><ul class="sizes">${item.sizes
      .map(
        (size) =>
          `<li><span>${escape(size.label)}</span><span class="dots"></span><span class="price">${money(size.price)}</span></li>`
      )
      .join('')}</ul></li>`
  return `<li class="item" data-search="${search}"><div class="line"><h3>${escape(item.name)}</h3><span class="dots"></span><span class="price">${money(item.price)}</span></div></li>`
}

const sections = categories
  .map((category) => {
    const deal = category.name === 'Deals'
    return `<section id="${category.id}" class="category${deal ? ' deals' : ''}"><h2>${escape(category.name)}</h2><ul class="${deal ? 'deal-list' : 'items'}">${category.items.map((item) => itemHtml(item, deal)).join('')}</ul></section>`
  })
  .join('\n')

const chips = categories
  .map((category) => `<a href="#${category.id}" data-chip="${category.id}">${escape(category.name)}</a>`)
  .join('')

const updated = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric'
}).format(new Date())

const favicon = `data:image/svg+xml,${encodeURIComponent(badge(64).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}`

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escape(site.name)} ${escape(site.suffix)} Menu</title>
<meta name="description" content="Menu and prices for ${escape(site.name)} ${escape(site.suffix)}, ${escape(site.address)}. Open ${escape(site.hoursLabel)}.">
<meta name="theme-color" content="#0d0d0b">
<meta property="og:title" content="${escape(site.name)} ${escape(site.suffix)} Menu">
<meta property="og:description" content="Burgers, BBQ, fish, shawarma, deals and more. Open ${escape(site.hoursLabel)}.">
<meta property="og:type" content="website">
<meta property="og:url" content="${escape(site.url)}">
<link rel="icon" href="${favicon}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Caveat+Brush&display=swap">
<style>
:root {
  --bg: #0d0d0b;
  --panel: #171714;
  --line: #2b2a24;
  --ink: #f6f3ea;
  --muted: #aaa598;
  --yellow: #ffd21f;
  --gold: #f2b705;
  --red: #d8312a;
  --display: 'Caveat Brush', 'Marker Felt', 'Comic Sans MS', cursive;
  --body: 'Barlow', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  color-scheme: dark;
}
* { box-sizing: border-box; }
html { scroll-padding-top: 118px; }
body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--body); font-size: 16px; line-height: 1.45; -webkit-text-size-adjust: 100%; }
a { color: inherit; }
.wrap { max-width: 720px; margin: 0 auto; padding-inline: 18px; }
.hero { padding-block: 26px 18px; display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; }
.hero h1 { margin: 4px 0 0; font-family: var(--display); font-weight: 400; font-size: 56px; line-height: 0.95; color: var(--yellow); letter-spacing: 1px; }
.hero h1 span { display: block; color: var(--ink); font-size: 34px; letter-spacing: 3px; text-transform: uppercase; }
.tagline { margin: 0; font-size: 12.5px; letter-spacing: 1.6px; text-transform: uppercase; color: var(--muted); }
.status { display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 999px; border: 1px solid var(--line); background: var(--panel); font-size: 14px; font-weight: 600; }
.status i { width: 9px; height: 9px; border-radius: 50%; background: var(--muted); }
.status.open i { background: #35c46a; box-shadow: 0 0 0 4px rgba(53, 196, 106, 0.18); }
.status.closed i { background: var(--red); }
.actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 4px; }
.btn { display: inline-flex; align-items: center; gap: 8px; min-height: 46px; padding: 0 18px; border-radius: 12px; font-weight: 700; font-size: 15px; text-decoration: none; border: 1px solid var(--line); background: var(--panel); }
.btn.primary { background: var(--yellow); border-color: var(--yellow); color: #14130f; }
.btn small { font-weight: 500; opacity: 0.8; }
.bar { position: sticky; top: 0; z-index: 5; background: var(--bg); border-block: 1px solid var(--line); padding-top: env(safe-area-inset-top, 0px); }
.search { padding-block: 10px 8px; }
.search input { width: 100%; height: 44px; border-radius: 12px; border: 1px solid var(--line); background: var(--panel); color: var(--ink); font: inherit; padding: 0 14px; outline: none; }
.search input::placeholder { color: var(--muted); }
.search input:focus-visible { border-color: var(--yellow); }
.chips { display: flex; gap: 8px; overflow-x: auto; overscroll-behavior-x: contain; padding-bottom: 10px; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.chips::-webkit-scrollbar { display: none; }
.chips a { flex: none; padding: 7px 14px; border-radius: 999px; border: 1px solid var(--line); background: var(--panel); font-size: 14px; font-weight: 600; text-decoration: none; white-space: nowrap; }
.chips a.active { background: var(--yellow); border-color: var(--yellow); color: #14130f; }
:focus-visible { outline: 2px solid var(--yellow); outline-offset: 2px; }
main { padding-block: 8px 28px; }
.category { padding-top: 26px; }
.category h2 { margin: 0 0 12px; display: inline-block; font-family: var(--display); font-weight: 400; font-size: 30px; line-height: 1; color: #14130f; background: var(--yellow); padding: 6px 16px 7px; border-radius: 6px 14px 8px 12px; transform: rotate(-1.2deg); }
.items, .deal-list, .sizes, .includes { list-style: none; margin: 0; padding: 0; }
.item { padding: 11px 0; border-bottom: 1px solid var(--line); }
.item h3, .deal h3 { margin: 0; font-size: 17px; font-weight: 600; }
.line, .sizes li { display: flex; align-items: baseline; gap: 8px; }
.dots { flex: 1; min-width: 14px; border-bottom: 2px dotted #4a483f; transform: translateY(-4px); }
.price { font-weight: 700; color: var(--yellow); font-variant-numeric: tabular-nums; white-space: nowrap; }
.sizes { margin-top: 6px; display: flex; flex-direction: column; gap: 4px; }
.sizes li { padding-left: 14px; color: var(--muted); font-size: 15.5px; }
.deal-list { display: grid; gap: 12px; }
@media (min-width: 620px) { .deal-list { grid-template-columns: 1fr 1fr; } }
.deal { border: 1.5px solid var(--gold); border-radius: 16px; background: var(--panel); padding: 14px 16px 15px; }
.deal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.deal h3 { font-family: var(--display); font-weight: 400; font-size: 25px; line-height: 1.05; color: var(--yellow); text-transform: uppercase; }
.tag { flex: none; background: var(--red); color: #fff; font-weight: 700; font-size: 16px; padding: 4px 11px 5px; border-radius: 5px 10px 6px 9px; transform: rotate(-2deg); font-variant-numeric: tabular-nums; white-space: nowrap; }
.includes { margin-top: 10px; display: flex; flex-direction: column; gap: 3px; font-size: 15px; }
.includes li { padding-left: 16px; position: relative; }
.includes li::before { content: ''; position: absolute; left: 2px; top: 0.58em; width: 6px; height: 6px; border-radius: 50%; background: var(--yellow); }
.empty { padding: 40px 0; text-align: center; color: var(--muted); }
footer { border-top: 1px solid var(--line); padding-block: 26px calc(34px + env(safe-area-inset-bottom, 0px)); color: var(--muted); font-size: 15px; }
footer .wrap { display: flex; flex-direction: column; gap: 14px; }
footer h2 { margin: 0; font-family: var(--display); font-weight: 400; font-size: 26px; color: var(--yellow); }
footer dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; }
footer dt { color: var(--ink); font-weight: 600; }
footer dd { margin: 0; }
footer a { color: var(--ink); font-weight: 600; text-decoration-color: var(--gold); text-underline-offset: 3px; }
.fine { font-size: 13px; }
[hidden] { display: none !important; }
</style>
</head>
<body>
<header class="hero wrap">
  ${badge(108)}
  <h1>${escape(site.name)}<span>${escape(site.suffix)}</span></h1>
  <p class="tagline">${escape(site.tagline)}</p>
  <span class="status" id="status"><i></i><span>Open ${escape(site.hoursLabel)}</span></span>
  <div class="actions">
    <a class="btn primary" href="https://wa.me/${international(site.whatsapp)}">WhatsApp <small>${escape(site.whatsapp)}</small></a>
    <a class="btn" href="tel:${digits(site.phone)}">Call <small>${escape(site.phone)}</small></a>
  </div>
</header>
<div class="bar">
  <div class="wrap">
    <div class="search"><label class="sr" for="q" hidden>Search the menu</label><input id="q" type="search" inputmode="search" autocomplete="off" placeholder="Search ${itemCount} items, e.g. zinger, tikka, fries"></div>
    <nav class="chips" aria-label="Menu sections">${chips}</nav>
  </div>
</div>
<main class="wrap">
${sections}
<p class="empty" id="empty" hidden>Nothing on the menu matches that. Try another word.</p>
</main>
<footer>
  <div class="wrap">
    <h2>Visit or order</h2>
    <dl>
      <dt>Address</dt><dd>${escape(site.address)}</dd>
      <dt>Hours</dt><dd>${escape(site.hoursLabel)}</dd>
      <dt>WhatsApp</dt><dd><a href="https://wa.me/${international(site.whatsapp)}">${escape(site.whatsapp)}</a></dd>
      <dt>Phone</dt><dd><a href="tel:${digits(site.phone)}">${escape(site.phone)}</a></dd>
    </dl>
    <p class="fine">Prices are in Pakistani rupees and may change. Menu updated ${escape(updated)}.</p>
  </div>
</footer>
<script>
(function () {
  var opensAt = ${Number(site.opensAt)}, closesAt = ${Number(site.closesAt)}, zone = ${JSON.stringify(site.timeZone)};
  var status = document.getElementById('status');
  try {
    var hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: zone }).format(new Date()));
    var open = opensAt < closesAt ? hour >= opensAt && hour < closesAt : hour >= opensAt || hour < closesAt;
    var clock = function (h) { return (h % 12 || 12) + (h < 12 ? ' am' : ' pm'); };
    status.classList.add(open ? 'open' : 'closed');
    status.lastElementChild.textContent = open ? 'Open now, until ' + clock(closesAt) : 'Closed now, opens ' + clock(opensAt);
  } catch (error) {}

  var chips = Array.prototype.slice.call(document.querySelectorAll('[data-chip]'));
  var sections = Array.prototype.slice.call(document.querySelectorAll('.category'));
  var rail = document.querySelector('.chips');
  var current = '';
  var setActive = function (id) {
    if (id === current) return;
    current = id;
    chips.forEach(function (chip) {
      var active = chip.getAttribute('data-chip') === id;
      chip.classList.toggle('active', active);
      if (active) rail.scrollLeft = chip.offsetLeft - (rail.clientWidth - chip.offsetWidth) / 2;
    });
  };
  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { if (entry.isIntersecting) setActive(entry.target.id); });
    }, { rootMargin: '-125px 0px -70% 0px' });
    sections.forEach(function (section) { observer.observe(section); });
  }

  var input = document.getElementById('q');
  var empty = document.getElementById('empty');
  input.addEventListener('input', function () {
    var words = input.value.toLowerCase().trim().split(/\\s+/).filter(Boolean);
    var any = false;
    sections.forEach(function (section) {
      var shown = 0;
      Array.prototype.forEach.call(section.querySelectorAll('[data-search]'), function (item) {
        var text = item.getAttribute('data-search');
        var match = words.every(function (word) { return text.indexOf(word) !== -1; });
        item.hidden = !match;
        if (match) shown += 1;
      });
      section.hidden = shown === 0;
      if (shown) any = true;
    });
    empty.hidden = any;
  });
})();
</script>
</body>
</html>
`

writeFileSync('index.html', page)

const qr = await QRCode.toString(site.url, {
  type: 'svg',
  errorCorrectionLevel: 'Q',
  margin: 2,
  color: { dark: '#000000', light: '#ffffff' }
})
writeFileSync('qr.svg', qr)

const card = `<div class="card">
  ${badge(92)}
  <div class="brand">${escape(site.name)}<span>${escape(site.suffix)}</span></div>
  <div class="scan">Scan for menu</div>
  <div class="code">${qr.replace(/<\?xml[^>]*\?>/, '')}</div>
  <div class="hint">Open your phone camera and point it here</div>
  <div class="meta">Open ${escape(site.hoursLabel)}<br>WhatsApp ${escape(site.whatsapp)} · ${escape(site.phone)}</div>
</div>`

const cards = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escape(site.name)} ${escape(site.suffix)} table cards</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@500;600;700&family=Caveat+Brush&display=swap">
<style>
@page { size: A4 portrait; margin: 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; padding: 0; }
body { width: 210mm; height: 297mm; display: grid; grid-template-columns: 105mm 105mm; grid-template-rows: 148.5mm 148.5mm; font-family: 'Barlow', Arial, sans-serif; }
.card { background: #0d0d0b; color: #f6f3ea; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2.2mm; text-align: center; outline: 0.2mm dashed #8a8676; outline-offset: -0.1mm; padding: 6mm; }
.card svg { display: block; }
.brand { font-family: 'Caveat Brush', cursive; font-size: 11mm; line-height: 0.95; color: #ffd21f; }
.brand span { display: block; font-size: 6.4mm; letter-spacing: 0.8mm; color: #f6f3ea; text-transform: uppercase; }
.scan { margin-top: 1.5mm; font-family: 'Caveat Brush', cursive; font-size: 9.5mm; line-height: 1; color: #14130f; background: #ffd21f; padding: 1.2mm 5mm 1.6mm; border-radius: 1.5mm 3.5mm 2mm 3mm; transform: rotate(-1.5deg); }
.code { margin-top: 2mm; width: 50mm; height: 50mm; background: #fff; border-radius: 3mm; padding: 1.5mm; }
.code svg { width: 100%; height: 100%; }
.hint { font-size: 3.6mm; font-weight: 600; color: #f6f3ea; }
.meta { font-size: 3.2mm; line-height: 1.5; color: #aaa598; }
</style>
</head>
<body>
${card}
${card}
${card}
${card}
</body>
</html>
`
writeFileSync('cards.html', cards)

console.log(`Built index.html with ${itemCount} menu entries in ${categories.length} sections, qr.svg and cards.html for ${site.url}`)
