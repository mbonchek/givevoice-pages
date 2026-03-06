#!/usr/bin/env node

/**
 * generate.js — GiveVoice Pages Static Site Generator
 *
 * Reads JSON voicing data from _data/ and generates static HTML pages.
 * No external dependencies. Run with: node generate.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, '_data');
const TEMPLATE_DIR = path.join(ROOT, '_template');

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function textToHtml(text) {
  if (!text) return '';
  return text
    .split('\n\n')
    .map(p => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('\n          ');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/** Compute relative path from a generated page back to the site root */
function relRoot(outputPath) {
  const rel = path.relative(path.dirname(outputPath), ROOT);
  return rel === '' ? '.' : rel;
}

// ---------------------------------------------------------------------------
// Tier ranking for deduplication
// ---------------------------------------------------------------------------

const TIER_RANK = { high: 3, med: 2, low: 1 };

function tierRank(tier) {
  return TIER_RANK[(tier || '').toLowerCase()] || 0;
}

// ---------------------------------------------------------------------------
// Read all JSON data
// ---------------------------------------------------------------------------

function readAllData() {
  const all = [];
  const seedTypes = fs.readdirSync(DATA_DIR).filter(d =>
    fs.statSync(path.join(DATA_DIR, d)).isDirectory()
  );

  for (const st of seedTypes) {
    const dir = path.join(DATA_DIR, st);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    for (const f of files) {
      try {
        const raw = fs.readFileSync(path.join(dir, f), 'utf-8');
        const data = JSON.parse(raw);
        data._filename = f;
        data._seedDir = st;
        all.push(data);
      } catch (e) {
        console.warn(`  Warning: could not parse ${st}/${f}: ${e.message}`);
      }
    }
  }
  return all;
}

// ---------------------------------------------------------------------------
// Deduplicate: for each unique output path, keep highest tier
// ---------------------------------------------------------------------------

function computeOutputPath(data) {
  const st = (data.seedType || data._seedDir).toLowerCase();
  const title = data.title || '';

  if (st === 'song') {
    const artist = data.artist || data.subtitle || '';
    const artistSlug = slugify(artist);
    const songSlug = slugify(title);
    return path.join('song', artistSlug, songSlug + '.html');
  }

  if (st === 'brand') {
    return path.join('brand', slugify(title) + '.html');
  }

  if (st === 'book') {
    // Future: book/{author-slug}/{title-slug}.html
    const author = data.author || '';
    return path.join('book', slugify(author), slugify(title) + '.html');
  }

  // Default: word
  return path.join('word', slugify(title) + '.html');
}

function deduplicateByPath(allData) {
  const byPath = {};

  for (const data of allData) {
    const outPath = computeOutputPath(data);
    data._outputPath = outPath;

    if (!byPath[outPath] || tierRank(data.tier) > tierRank(byPath[outPath].tier)) {
      byPath[outPath] = data;
    }
  }

  return Object.values(byPath);
}

// ---------------------------------------------------------------------------
// HTML Generation
// ---------------------------------------------------------------------------

function cssPath(outputPath) {
  const rel = relRoot(path.join(ROOT, outputPath));
  return rel;
}

function generateVoicingPage(data) {
  const st = (data.seedType || data._seedDir).toLowerCase();
  const title = capitalize(data.title || '');
  const essence = data.essence || '';
  const tier = (data.tier || '').toLowerCase();
  const voicedAt = formatDate(data.voicedAt);
  const imageUrl = data.imageUrl || '';
  const thumbnailUrl = data.thumbnailUrl || '';
  const displayImage = thumbnailUrl || imageUrl;
  const rel = cssPath(data._outputPath);

  // Determine available scales
  const scales = [];
  const voicing = data.voicing || {};
  if (voicing.sentence) scales.push('sentence');
  if (voicing.paragraph) scales.push('paragraph');
  if (voicing.page) scales.push('page');

  // Default to the longest available scale
  const defaultScale = scales[scales.length - 1] || 'page';

  // Build OG description
  const ogDescription = essence
    ? escapeHtml(essence)
    : voicing.sentence
      ? escapeHtml(voicing.sentence.slice(0, 200))
      : `A voicing of ${title}`;

  // Song-specific
  const isSong = st === 'song';
  const artist = data.artist || data.subtitle || '';
  const albumArt = data.albumArt || '';
  const previewUrl = data.previewUrl || '';

  // Brand-specific
  const isBrand = st === 'brand';
  const subtitle = data.subtitle || '';

  // Build page title for <title>
  const pageTitle = isSong
    ? `${title} by ${artist} — GiveVoice`
    : `${title} — GiveVoice`;

  // OG title
  const ogTitle = isSong ? `${title} by ${artist}` : title;

  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageTitle)}</title>

  <!-- OpenGraph -->
  <meta property="og:title" content="${escapeHtml(ogTitle)}">
  <meta property="og:description" content="${ogDescription}">
  <meta property="og:type" content="article">${imageUrl ? `
  <meta property="og:image" content="${escapeHtml(imageUrl)}">` : ''}
  <meta property="og:site_name" content="GiveVoice">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="${imageUrl ? 'summary_large_image' : 'summary'}">
  <meta name="twitter:title" content="${escapeHtml(ogTitle)}">
  <meta name="twitter:description" content="${ogDescription}">${imageUrl ? `
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}">` : ''}

  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant:ital,wght@0,300..700;1,300..700&family=JetBrains+Mono:wght@400;500&family=Work+Sans:ital,wght@0,300..600;1,300..600&display=swap" rel="stylesheet">

  <!-- Styles -->
  <link rel="stylesheet" href="${rel}/_template/base.css">
  <link rel="stylesheet" href="${rel}/_template/style.css">
  <link rel="stylesheet" href="${rel}/_template/pages.css">
</head>
<body>
  <div class="page">
    <main class="page-main">
      <header class="voicing-header">
        <div class="voicing-seed-type">${escapeHtml(st)}</div>
${displayImage ? (imageUrl && thumbnailUrl ? `        <a href="${escapeHtml(imageUrl)}" target="_blank" rel="noopener"><img class="voicing-hero-image" src="${escapeHtml(thumbnailUrl)}" alt="${escapeHtml(title)}" loading="lazy"></a>` : `        <img class="voicing-hero-image" src="${escapeHtml(displayImage)}" alt="${escapeHtml(title)}" loading="lazy">`) : ''}
        <h1 class="voicing-title">${escapeHtml(title)}</h1>
${isBrand && subtitle ? `        <div class="voicing-subtitle">${escapeHtml(subtitle)}</div>` : ''}
${isSong ? generateSongMeta(data) : ''}
${essence ? `        <p class="voicing-essence">${escapeHtml(essence)}</p>` : ''}
      </header>

${scales.length > 1 ? generateScaleSwitcher(scales, defaultScale) : ''}
      <div class="voicing-body">
${scales.map(scale => `        <div class="voicing-scale${scale === defaultScale ? ' active' : ''}" data-scale="${scale}">
          <div class="voicing-text">
          ${textToHtml(voicing[scale])}
          </div>
        </div>`).join('\n')}
      </div>

${generateComponents(data)}
      <div class="share-actions">
        <button class="share-btn" onclick="copyLink()" id="copyLinkBtn">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 9.5a3.5 3.5 0 0 0 5 0l2-2a3.5 3.5 0 0 0-5-5l-1 1"/><path d="M9.5 6.5a3.5 3.5 0 0 0-5 0l-2 2a3.5 3.5 0 0 0 5 5l1-1"/></svg>
          Copy link
        </button>
        <a class="share-btn" href="https://wa.me/?text=${encodeURIComponent(ogTitle + ' — GiveVoice')}%20{URL}" id="whatsappBtn" target="_blank" rel="noopener noreferrer">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 0 0-6.1 10.4L1 15l3.7-.96A7 7 0 1 0 8 1Zm3.5 9.8c-.15.42-.87.8-1.2.85-.3.05-.7.07-1.12-.07a10.3 10.3 0 0 1-1.6-.58c-1.83-1.07-3.03-2.95-3.12-3.09-.1-.13-.77-1.02-.77-1.95s.49-1.38.66-1.57c.17-.19.38-.23.5-.23h.37c.12 0 .28-.04.44.34.16.38.55 1.35.6 1.45.05.1.09.22.02.35-.07.13-.1.22-.2.33-.1.12-.21.26-.3.35-.1.1-.2.2-.09.4.12.2.52.86 1.12 1.39.77.68 1.41.89 1.62 1 .2.1.32.08.44-.05.12-.13.5-.58.64-.78.13-.2.26-.17.44-.1.18.07 1.14.54 1.33.64.2.1.33.14.38.22.05.08.05.46-.1.88Z"/></svg>
          WhatsApp
        </a>
      </div>
    </main>

    <footer class="page-footer">
      <p class="footer-tagline">GiveVoice — Everything has a pattern. Every pattern has a voice.</p>
      <div class="footer-meta">
        <span class="footer-tier" data-tier="${escapeHtml(tier)}">${escapeHtml(tier || 'standard')}</span>
${voicedAt ? `        <span class="footer-date">Voiced ${escapeHtml(voicedAt)}</span>` : ''}
      </div>
    </footer>
  </div>

  <script>
    // Scale switcher
    document.querySelectorAll('.scale-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        var scale = this.getAttribute('data-scale');
        document.querySelectorAll('.scale-tab').forEach(function(t) {
          t.setAttribute('aria-selected', 'false');
        });
        this.setAttribute('aria-selected', 'true');
        document.querySelectorAll('.voicing-scale').forEach(function(s) {
          s.classList.remove('active');
        });
        var target = document.querySelector('.voicing-scale[data-scale="' + scale + '"]');
        if (target) target.classList.add('active');
      });
    });

    // Copy link
    function copyLink() {
      var btn = document.getElementById('copyLinkBtn');
      navigator.clipboard.writeText(window.location.href).then(function() {
        btn.classList.add('share-btn--copied');
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 4.5l-7 7L2.5 8"/></svg> Copied';
        setTimeout(function() {
          btn.classList.remove('share-btn--copied');
          btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 9.5a3.5 3.5 0 0 0 5 0l2-2a3.5 3.5 0 0 0-5-5l-1 1"/><path d="M9.5 6.5a3.5 3.5 0 0 0-5 0l-2 2a3.5 3.5 0 0 0 5 5l1-1"/></svg> Copy link';
        }, 2000);
      });
    }

    // WhatsApp: inject current URL
    var waBtn = document.getElementById('whatsappBtn');
    if (waBtn) {
      waBtn.href = waBtn.href.replace('{URL}', encodeURIComponent(window.location.href));
    }
  </script>
</body>
</html>`;
}

function generateSongMeta(data) {
  const artist = data.artist || '';
  const albumArt = data.albumArt || '';
  const previewUrl = data.previewUrl || '';
  const title = capitalize(data.title || '');

  let html = '        <div class="song-meta">\n';
  if (albumArt) {
    html += `          <img class="song-album-art" src="${escapeHtml(albumArt)}" alt="${escapeHtml(title)} album art" loading="lazy">\n`;
  }
  html += '          <div class="song-info">\n';
  if (artist) {
    html += `            <span class="song-artist">${escapeHtml(artist)}</span>\n`;
  }
  html += `            <span class="song-track">${escapeHtml(title)}</span>\n`;
  html += '          </div>\n';
  html += '        </div>\n';

  if (previewUrl) {
    html += '        <div class="song-preview">\n';
    html += `          <audio controls preload="none" src="${escapeHtml(previewUrl)}"></audio>\n`;
    html += '        </div>\n';
  }

  return html;
}

/** Parse a component value — may be plain text, JSON string, or markdown-fenced JSON */
function parseComponentText(raw) {
  if (!raw) return '';
  // Strip markdown code fences if present
  let str = raw.trim();
  if (str.startsWith('```')) {
    str = str.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
  }
  // Try to parse as JSON with sentence/paragraph/page
  try {
    const obj = JSON.parse(str);
    // Return the longest available scale
    return obj.page || obj.paragraph || obj.sentence || '';
  } catch (e) {
    // Plain text
    return str;
  }
}

function generateComponents(data) {
  const components = data.components;
  if (!components) return '';

  const layerOrder = ['usage', 'experience', 'culture', 'identity'];
  const layerLabels = {
    usage: 'Usage',
    experience: 'Experience',
    culture: 'Culture',
    identity: 'Identity'
  };

  const layers = layerOrder.filter(l => components[l]);
  if (layers.length === 0) return '';

  const items = layers.map(layer => {
    const text = parseComponentText(components[layer]);
    if (!text) return '';
    return `        <div class="component-layer">
          <button class="component-toggle" onclick="this.parentElement.classList.toggle('open')">
            <svg class="chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>
            ${layerLabels[layer]}
          </button>
          <div class="component-content">
            <div class="voicing-text">
            ${textToHtml(text)}
            </div>
          </div>
        </div>`;
  }).filter(Boolean).join('\n');

  if (!items) return '';

  return `      <section class="voicing-components">
        <h2 class="components-heading">Layers</h2>
${items}
      </section>`;
}

function generateScaleSwitcher(scales, defaultScale) {
  const tabs = scales.map(s =>
    `        <button class="scale-tab" data-scale="${s}" role="tab" aria-selected="${s === defaultScale ? 'true' : 'false'}">${s}</button>`
  ).join('\n');

  return `      <nav class="scale-switcher" role="tablist" aria-label="Voicing scale">
${tabs}
      </nav>
`;
}

// ---------------------------------------------------------------------------
// Index page
// ---------------------------------------------------------------------------

function generateIndexPage(entries) {
  // Group by seed type
  const groups = {};
  const typeOrder = ['word', 'song', 'brand', 'book'];

  for (const entry of entries) {
    const st = (entry.seedType || entry._seedDir).toLowerCase();
    if (!groups[st]) groups[st] = [];
    groups[st].push(entry);
  }

  // Sort each group alphabetically
  for (const st of Object.keys(groups)) {
    groups[st].sort((a, b) => {
      const aTitle = (a.title || '').toLowerCase();
      const bTitle = (b.title || '').toLowerCase();
      return aTitle.localeCompare(bTitle);
    });
  }

  const orderedTypes = typeOrder.filter(t => groups[t]);

  const sections = orderedTypes.map(st => {
    const items = groups[st].map(entry => {
      const title = capitalize(entry.title || '');
      const href = entry._outputPath;
      const tier = (entry.tier || '').toLowerCase();
      const detail = st === 'song' ? (entry.artist || '') : '';

      return `          <li class="index-item">
            <a class="index-link" href="${escapeHtml(href)}">
              <span class="index-link-title">${escapeHtml(title)}</span>
${detail ? `              <span class="index-link-detail">${escapeHtml(detail)}</span>` : ''}
              <span class="index-link-tier" data-tier="${escapeHtml(tier)}">${escapeHtml(tier)}</span>
            </a>
          </li>`;
    }).join('\n');

    const label = st === 'word' ? 'Words'
      : st === 'song' ? 'Songs'
        : st === 'brand' ? 'Brands'
          : st === 'book' ? 'Books'
            : capitalize(st);

    return `      <section class="index-section">
        <h2 class="index-section-title">${label} <span style="font-weight:400;opacity:0.6">(${groups[st].length})</span></h2>
        <ul class="index-list">
${items}
        </ul>
      </section>`;
  }).join('\n\n');

  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GiveVoice — Voicing Directory</title>

  <meta property="og:title" content="GiveVoice — Voicing Directory">
  <meta property="og:description" content="Everything has a pattern. Every pattern has a voice.">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="GiveVoice">

  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="GiveVoice — Voicing Directory">
  <meta name="twitter:description" content="Everything has a pattern. Every pattern has a voice.">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant:ital,wght@0,300..700;1,300..700&family=JetBrains+Mono:wght@400;500&family=Work+Sans:ital,wght@0,300..600;1,300..600&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="_template/base.css">
  <link rel="stylesheet" href="_template/style.css">
  <link rel="stylesheet" href="_template/pages.css">
</head>
<body>
  <div class="page">
    <main class="page-main">
      <header class="index-header">
        <h1 class="index-title">GiveVoice</h1>
        <p class="index-subtitle">Everything has a pattern. Every pattern has a voice.</p>
      </header>

${sections}
    </main>

    <footer class="page-footer">
      <p class="footer-tagline">GiveVoice — Everything has a pattern. Every pattern has a voice.</p>
    </footer>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('GiveVoice Pages — Static Site Generator\n');

  // 1. Read all data
  console.log('Reading data from _data/ ...');
  const allData = readAllData();
  console.log(`  Found ${allData.length} JSON files\n`);

  // 2. Compute output paths and deduplicate
  console.log('Deduplicating by output path (keeping highest tier) ...');
  const entries = deduplicateByPath(allData);
  console.log(`  ${entries.length} unique voicings to generate\n`);

  // 3. Generate individual pages
  let generated = 0;
  for (const entry of entries) {
    const outPath = entry._outputPath;
    const fullPath = path.join(ROOT, outPath);
    mkdirp(path.dirname(fullPath));

    const html = generateVoicingPage(entry);
    fs.writeFileSync(fullPath, html, 'utf-8');
    generated++;
    console.log(`  ${outPath}`);
  }
  console.log(`\n  Generated ${generated} voicing pages\n`);

  // 4. Generate index
  console.log('Generating index.html ...');
  const indexHtml = generateIndexPage(entries);
  fs.writeFileSync(path.join(ROOT, 'index.html'), indexHtml, 'utf-8');
  console.log('  index.html\n');

  console.log('Done.');
}

main();
