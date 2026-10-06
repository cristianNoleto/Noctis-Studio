// Turns Pixabay's page bootstrap JSON into our item shape.
// Isolated on purpose: if Pixabay changes its format, this is the only file to fix.
// Strategy: walk the whole JSON and pick every object that looks like an audio item
// (has an id and sources.src on cdn.pixabay.com) so moved/renamed containers don't break us.

function looksLikeAudio(o) {
  return o && typeof o === 'object' && o.id && o.sources && typeof o.sources.src === 'string' &&
    /cdn\.pixabay\.com\/.+\.mp3/i.test(o.sources.src);
}

function collect(node, out, seen) {
  if (!node || typeof node !== 'object') return;
  if (looksLikeAudio(node)) {
    if (!seen.has(node.id)) { seen.add(node.id); out.push(node); }
    return;
  }
  for (const v of Array.isArray(node) ? node : Object.values(node)) collect(v, out, seen);
}

function normalize(r, type) {
  const isSfx = r.mediaDescriptiveType === 'sound_effect' || /sound-effects/.test(r.href || '') || type === 'sfx';
  const tags = (r.tagList || []).map(t => (Array.isArray(t) ? t[0] : t)).filter(Boolean);
  for (const t of String(r.description || '').split(',')) {
    const s = t.trim();
    if (s && !tags.some(x => x.toLowerCase() === s.toLowerCase())) tags.push(s);
  }
  return {
    id: String(r.id),
    type: isSfx ? 'sfx' : 'music',
    title: (r.name || r.title || r.alt || `Pixabay ${r.id}`).trim(),
    author: (r.user && r.user.username) || '',
    duration: Number(r.duration) || 0,
    tags: tags.slice(0, 12),
    pageUrl: r.href ? new URL(r.href, 'https://pixabay.com').href : `https://pixabay.com/${isSfx ? 'sound-effects' : 'music'}/id-${r.id}/`,
    src: r.sources.src,
    waveformUrl: r.sources.waveformUrl || null,
    thumb: r.sources.thumbnailUrl || null,
    // Music's primaryTag links to /genre/…; SFX's is a generic category, so ignore it there.
    genre: Array.isArray(r.primaryTag) && /\/genre\//.test(r.primaryTag[1] || '') ? r.primaryTag[0] : '',
    contentId: !!r.hasYoutubeContentId, // registered in YouTube Content ID: may trigger a claim
    downloads: r.downloadCount || 0,
    likes: r.likeCount || 0,
  };
}

function parseBootstrap(json, type) {
  const raw = [];
  collect(json, raw, new Set());
  const page = (json && json.page) || {};
  return {
    items: raw.map(r => normalize(r, type)),
    page: page.page || 1,
    pages: page.pages || 1,
    total: page.total || raw.length,
  };
}

module.exports = { parseBootstrap };

// Self-check: node src/parser.js
if (require.main === module) {
  const assert = require('assert');
  const sample = { page: { page: 1, pages: 3, total: 41, results: [{
    id: 382724, mediaDescriptiveType: 'sound_effect', duration: 2, name: 'Simple Whoosh',
    href: '/sound-effects/film-special-effects-simple-whoosh-382724/', description: 'Whoosh Sound, Air Whoosh',
    tagList: [['Whoosh Sound', '/x']], user: { username: 'DRAGON-STUDIO' },
    sources: { src: 'https://cdn.pixabay.com/audio/2025/07/30/audio_b3087a581e.mp3', waveformUrl: '/sound-effects/382724/waveform.json' },
  }] }, other: { nested: [{ id: 1, sources: { src: 'https://example.com/x.mp3' } }] } };
  const r = parseBootstrap(sample, 'sfx');
  assert.strictEqual(r.items.length, 1);
  assert.deepStrictEqual(r.items[0].tags, ['Whoosh Sound', 'Air Whoosh']);
  assert.strictEqual(r.items[0].pageUrl, 'https://pixabay.com/sound-effects/film-special-effects-simple-whoosh-382724/');
  assert.strictEqual(r.items[0].type, 'sfx');
  assert.strictEqual(r.total, 41);
  console.log('parser ok');
}
