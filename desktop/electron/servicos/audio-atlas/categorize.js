// Picks the sound-bank folder for an item. Pure function, no disk access.
// 1) An existing folder that really matches (whole-word keywords from title/tags/genre).
// 2) Otherwise a new, well-named concept folder (created on download).
// SFX live in top-level folders; music lives in "background music\<genre or mood>".
// To teach it a new concept, add a line to SFX or MUSIC below.

const SFX = {
  'Woosh': ['whoosh', 'swoosh', 'woosh', 'swish', 'swipe', 'whip', 'swing'],
  'hit & impact': ['impact', 'hit', 'punch', 'slam', 'thud', 'boom', 'braam', 'smash', 'stomp', 'bass drop'],
  'riser': ['riser', 'uplifter', 'build up', 'buildup', 'rising'],
  'transitions and risers': ['transition', 'sweep', 'reverse', 'swell', 'reverse cymbal'],
  'Typewrite': ['typewriter', 'typing', 'keyboard', 'keystroke'],
  'Paper': ['paper', 'page', 'book', 'newspaper', 'parchment', 'letter', 'envelope'],
  'Camera': ['camera', 'shutter', 'photo', 'polaroid', 'flash'],
  'laughs': ['laugh', 'laughter', 'giggle', 'chuckle'],
  'War': ['war', 'gun', 'gunshot', 'gunfire', 'rifle', 'pistol', 'explosion', 'battle', 'military', 'bomb', 'artillery', 'grenade', 'cannon'],
  'shouts and voices': ['scream', 'shout', 'voice', 'whisper', 'yell', 'gasp', 'breath', 'breathing', 'crowd', 'cheer', 'murmur'],
  'subwoofer': ['subwoofer', 'sub bass', 'sub drop', 'low frequency', 'rumble'],
  'Game Effects': ['game', 'arcade', '8 bit', '8bit', 'retro game', 'coin', 'power up', 'level up', 'pickup'],
  'Negative bleeps&bloops': ['error', 'fail', 'failure', 'wrong', 'negative', 'buzzer', 'denied', 'incorrect'],
  'Positive jingles': ['success', 'win', 'correct', 'jingle', 'achievement', 'reward', 'victory'],
  'drone': ['drone', 'dark ambient', 'ambience', 'ambient', 'atmosphere', 'soundscape', 'room tone'],
  'glitch': ['glitch', 'static', 'distortion', 'interference', 'digital noise', 'data', 'corrupted', 'bitcrush'],
  'heartbeat': ['heartbeat', 'heart beat', 'heart', 'pulse'],
  'bubbles & pops': ['bubble', 'pop', 'popping', 'cork', 'blub'],
  'clicks & ui': ['click', 'button', 'ui', 'interface', 'mouse', 'tap', 'switch', 'toggle', 'notification'],
  'doors': ['door', 'creak', 'knock', 'lock', 'latch', 'gate', 'hinge'],
  'footsteps': ['footstep', 'step', 'walking', 'running', 'stair'],
  'weather': ['rain', 'wind', 'thunder', 'storm', 'lightning', 'hail', 'blizzard'],
  'nature': ['forest', 'bird', 'river', 'ocean', 'wave', 'water', 'fire', 'crackling', 'insect', 'cricket', 'jungle'],
  'horror': ['horror', 'creepy', 'scary', 'ghost', 'monster', 'creature', 'growl', 'demon', 'evil', 'jumpscare', 'haunted', 'sinister'],
  'bells & chimes': ['bell', 'chime', 'gong', 'ding', 'church bell', 'tibetan bowl'],
  'clock & ticking': ['clock', 'tick', 'ticking', 'timer', 'countdown', 'stopwatch'],
  'mechanical': ['machine', 'gear', 'mechanism', 'mechanical', 'metal', 'servo', 'chain', 'lever'],
  'vehicles': ['car', 'train', 'plane', 'airplane', 'helicopter', 'truck', 'motorcycle', 'engine'],
  'glass & breaking': ['glass', 'shatter', 'break', 'breaking', 'crash', 'crack'],
  'magic & sci-fi': ['magic', 'spell', 'sparkle', 'sci fi', 'scifi', 'laser', 'teleport', 'futuristic', 'alien', 'spaceship', 'hologram'],
  'phone & tech': ['phone', 'ring', 'ringtone', 'dial', 'beep', 'radio', 'tv', 'television', 'computer', 'modem'],
  'animals': ['dog', 'cat', 'horse', 'wolf', 'howl', 'bark', 'crow', 'owl', 'raven', 'snake'],
};

const MUSIC = {
  'suspense & tension': ['suspense', 'tension', 'thriller', 'tense', 'suspenseful', 'anxiety'],
  'dark & horror': ['horror', 'dark', 'creepy', 'sinister', 'scary', 'haunted', 'evil', 'gothic', 'occult'],
  'mystery': ['mystery', 'mysterious', 'enigmatic', 'investigation', 'detective', 'noir', 'secret', 'conspiracy'],
  'documentary': ['documentary', 'history', 'historical', 'educational', 'news', 'report'],
  'epic & cinematic': ['epic', 'cinematic', 'trailer', 'orchestral', 'heroic', 'battle', 'war', 'dramatic'],
  'ambient & drone': ['ambient', 'drone', 'atmospheric', 'soundscape', 'meditation', 'space'],
  'sad & emotional': ['sad', 'emotional', 'melancholy', 'melancholic', 'sorrow', 'nostalgic', 'tragic'],
  'upbeat & happy': ['happy', 'upbeat', 'uplifting', 'positive', 'fun', 'cheerful', 'motivational'],
  'chill & lofi': ['lofi', 'lo fi', 'chill', 'chillhop', 'jazz', 'relax', 'relaxing'],
  'electronic': ['electronic', 'synthwave', 'techno', 'edm', 'house', 'cyberpunk', 'synth'],
  'rock & metal': ['rock', 'metal', 'punk', 'grunge'],
  'hip hop & beats': ['hip hop', 'hiphop', 'trap', 'rap', 'boom bap'],
  'classical': ['classical', 'baroque', 'strings', 'violin', 'cello', 'symphony', 'piano solo'],
  'world & ethnic': ['ethnic', 'world', 'oriental', 'arabic', 'asian', 'celtic', 'tribal', 'egyptian', 'medieval', 'middle eastern'],
  'action': ['action', 'chase', 'intense', 'sport', 'adrenaline'],
};

// Words that say nothing about where a sound belongs.
const GENERIC = new Set(['audio', 'sound', 'effect', 'sfx', 'fx', 'music', 'song', 'track', 'short', 'long', 'and', 'the', 'of', 'free',
  'background', 'misc', 'other', 'new', 'loop', 'royalty', 'no', 'copyright', 'cinematic', 'film', 'special', 'video', 'youtube']);

const stem = w => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
const words = s => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(stem);

// Whole-word (or whole-phrase) match: "sub" never matches "subtle", "low" never matches "slow".
function hits(tokens, keyword) {
  const k = words(keyword);
  if (!k.length) return false;
  for (let i = 0; i + k.length <= tokens.length; i++) if (k.every((w, j) => tokens[i + j] === w)) return true;
  return false;
}

function score(fields, keywords) {
  let s = 0;
  for (const kw of keywords) for (const f of fields) if (hits(f.tokens, kw)) { s += f.weight; break; }
  return s;
}

const lc = s => s.toLowerCase();

// existing: top-level folder names. musicSubs: subfolders of the music base folder.
function suggest(item, existing = [], musicSubs = []) {
  const isMusic = item.type === 'music';
  const fields = [
    { tokens: words(item.title), weight: 2 },
    { tokens: words((item.tags || []).join(' | ')), weight: 1 },
    { tokens: words(item.genre), weight: 3 },
  ];
  const sep = '\\';

  if (isMusic) {
    const base = existing.find(c => lc(c) === 'background music') || 'background music';
    const best = pick(fields, MUSIC, musicSubs);
    return best ? { name: base + sep + best.name, isNew: best.isNew || !existing.includes(base) } : { name: base, isNew: !existing.includes(base) };
  }

  const pool = existing.filter(c => lc(c) !== 'background music' && lc(c) !== 'short audio');
  const best = pick(fields, SFX, pool);
  if (best) return best;
  // Nothing recognisable: name a folder after the most specific tag rather than guessing wrong.
  const tag = (item.tags || []).map(t => words(t).filter(w => !GENERIC.has(w)).slice(0, 2).join(' ')).find(Boolean);
  if (tag) {
    const found = existing.find(c => lc(c) === tag);
    return { name: found || tag, isNew: !found };
  }
  const misc = existing.find(c => lc(c) === 'short audio') || 'short audio';
  return { name: misc, isNew: !existing.includes(misc) };
}

// Existing folders compete with concepts; an existing folder wins ties. A concept whose name
// matches an existing folder is that folder (so "Woosh" is reused, not recreated).
function pick(fields, concepts, existing) {
  const cands = [];
  const claimed = new Set();
  for (const [name, kws] of Object.entries(concepts)) {
    const ex = existing.find(c => lc(c) === lc(name));
    if (ex) claimed.add(ex);
    cands.push({ name: ex || name, isNew: !ex, s: score(fields, [...kws, name]) });
  }
  for (const ex of existing) {
    if (claimed.has(ex)) continue;
    const own = words(ex).filter(w => !GENERIC.has(w) && w.length > 2);
    if (own.length) cands.push({ name: ex, isNew: false, s: score(fields, own) });
  }
  cands.sort((a, b) => b.s - a.s || a.isNew - b.isNew);
  return cands[0] && cands[0].s > 0 ? { name: cands[0].name, isNew: cands[0].isNew } : null;
}

module.exports = { suggest };

// Self-check: node src/categorize.js
if (require.main === module) {
  const assert = require('assert');
  const ex = ['background music', 'Camera', 'drone', 'Game Effects', 'hit & impact', 'laughs', 'Paper', 'riser', 'short audio',
    'shouts and voices', 'subwoofer', 'transitions and risers', 'Typewrite', 'War', 'Woosh'];
  const s = (title, tags, type = 'sfx', genre) => suggest({ title, tags, type, genre }, ex, ['old stuff']);
  assert.deepStrictEqual(s('Epic Whoosh', ['Whoosh']), { name: 'Woosh', isNew: false });
  assert.deepStrictEqual(s('Typewriter keys', []), { name: 'Typewrite', isNew: false });
  assert.deepStrictEqual(s('Strange Creature Growl', ['monster']), { name: 'horror', isNew: true });
  assert.deepStrictEqual(s('Old Door Creak', ['Door']), { name: 'doors', isNew: true });
  assert.deepStrictEqual(s('Subtle slow pad', ['Subtle']).name, 'subtle'); // no false "sub"/"low" → subwoofer
  assert.deepStrictEqual(s('Bubble Pop 06', ['Bubble Pop']), { name: 'bubbles & pops', isNew: true });
  assert.deepStrictEqual(s('Kazoo', ['Kazoo', 'Sound Effect']), { name: 'kazoo', isNew: true });
  assert.deepStrictEqual(s('Sound Effect', ['Sound Effect']), { name: 'short audio', isNew: false });
  assert.deepStrictEqual(s('Suspense', ['Suspense Music'], 'music', 'Suspense'), { name: 'background music\\suspense & tension', isNew: true });
  assert.deepStrictEqual(s('Piano Memories', ['Sad', 'Emotional'], 'music', 'Beats'), { name: 'background music\\sad & emotional', isNew: true });
  assert.deepStrictEqual(s('Untitled', [], 'music'), { name: 'background music', isNew: false });
  assert.deepStrictEqual(s('Impact Hit', ['Cinematic Impact']), { name: 'hit & impact', isNew: false });
  console.log('categorize ok');
}
