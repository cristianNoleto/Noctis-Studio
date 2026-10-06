// PT/ES → EN audio glossary (from the PixabayAudioPro extension) + MyMemory fallback.
const GLOSSARY = {
    'passos': 'footsteps', 'passo': 'footstep',
    'passos na madeira': 'wood footsteps', 'passos na terra': 'dirt footsteps',
    'vento': 'wind', 'vento forte': 'strong wind storm', 'vento suave': 'breeze wind',
    'chuva': 'rain', 'chuva caindo': 'heavy rain', 'chuva com trovao': 'rain thunderstorm',
    'trovao': 'thunder', 'trovão': 'thunder', 'trovoada': 'thunderstorm', 'raio': 'lightning strike',
    'tiro': 'gunshot', 'tiros': 'gunshots gunfire', 'tiro de pistola': 'pistol gunshot',
    'tiro de rifle': 'rifle gunshot', 'tiro de sniper': 'sniper shot',
    'explosao': 'explosion', 'explosão': 'explosion', 'explosão épica': 'epic cinematic explosion',
    'batida': 'impact hit', 'impacto': 'impact slam', 'soco': 'punch impact', 'tapa': 'slap hit',
    'transicao': 'whoosh transition', 'transição': 'whoosh transition',
    'transicao rapida': 'fast whoosh swoosh', 'transição rápida': 'fast whoosh swoosh',
     
     'ruido': 'noise static', 'ruído': 'noise static',
    'espada': 'sword slash', 'facada': 'knife stab',
    'porta': 'door closing opening', 'porta abrindo': 'door open creak', 'porta fechando': 'door slam',
    'vidro quebrando': 'glass shatter', 'vidro': 'glass',
    'risada': 'laugh laughter', 'risada maligna': 'evil laugh', 'grito': 'scream shout',
    'susto': 'jumpscare scare', 'campainha': 'doorbell chime', 'alarme': 'alarm siren',
    'sirene': 'police siren', 'sirene de policia': 'police siren',
    'motor': 'engine rumble', 'carro': 'car drive by', 'aceleracao': 'car acceleration', 'aceleração': 'car acceleration',
    'freio': 'tire screech braking', 'aviao': 'airplane flyby', 'avião': 'airplane flyby',
    'helicoptero': 'helicopter rotor', 'helicóptero': 'helicopter rotor',
    'teclado': 'keyboard typing', 'clique': 'mouse click', 
    'notificacao': 'notification', 'notificação': 'notification message',
    'erro': 'error buzz alert', 'sucesso': 'success chime victory',
    'moeda': 'coin pickup', 'pulo': 'jump boing', 'fogo': 'fire crackling',
    'agua': 'water stream', 'água': 'water stream', 'oceano': 'ocean waves', 'mar': 'sea waves',
    'passaros': 'birds chirping', 'pássaros': 'birds chirping',
    'floresta': 'forest nature ambience', 
    // Music
    'musica': 'music', 'música': 'music',
    'cinematico': 'cinematic', 'cinemático': 'cinematic',
    'epico': 'epic', 'épico': 'epic', 'acao': 'action', 'ação': 'action',
     'terror': 'horror dark', 'medo': 'horror',
    'triste': 'sad emotional', 'feliz': 'happy upbeat', 'alegre': 'upbeat cheerful',
    'relaxante': 'relaxing ambient chill',  
     'violao': 'acoustic guitar', 'violão': 'acoustic guitar',
    'guitarra': 'electric guitar rock',  'ambiente': 'ambient',
    'corporativo': 'corporate upbeat',  'acustico': 'acoustic', 'acústico': 'acoustic',
    // Spanish audio terms
    'pasos': 'footsteps', 'paso': 'footstep',
    'pasos en madera': 'wood footsteps', 'pasos en tierra': 'dirt footsteps',
    'viento': 'wind', 'viento fuerte': 'strong wind storm',
    'lluvia': 'rain', 'lluvia fuerte': 'heavy rain', 'tormenta': 'thunderstorm',
    'trueno': 'thunder', 'relampago': 'lightning strike', 'relámpago': 'lightning strike',
    'disparo': 'gunshot', 'disparos': 'gunshots gunfire',
    'golpe': 'impact slam', 'puñetazo': 'punch impact', 'bofetada': 'slap hit',
    'transicion': 'whoosh transition', 'transición': 'whoosh transition',
    'espada': 'sword slash', 'puñalada': 'knife stab',
    'puerta': 'door closing opening', 'puerta abierta': 'door open creak', 'puerta cerrada': 'door slam',
    'vidrio roto': 'glass shatter',
    'risa': 'laugh laughter', 'risa malvada': 'evil laugh', 'grito': 'scream shout',
    'susto': 'jumpscare scare', 'timbre': 'doorbell chime', 'alarma': 'alarm siren',
    'sirena': 'police siren', 'motor': 'engine rumble', 'coche': 'car drive by',
    'frenazo': 'tire screech braking', 'avion': 'airplane flyby', 'avión': 'airplane flyby',
    'teclado': 'keyboard typing', 'clic': 'mouse click', 'notificacion': 'notification', 'notificación': 'notification',
    'moneda': 'coin pickup', 'salto': 'jump boing', 'fuego': 'fire crackling',
    'agua': 'water stream', 'olas': 'ocean waves', 'pajaros': 'birds chirping', 'pájaros': 'birds chirping',
    'bosque': 'forest nature ambience',
    'cinematografico': 'cinematic', 'cinematográfico': 'cinematic',
    'suspenso': 'suspense thriller', 'miedo': 'horror dark',
    'relajante': 'relaxing ambient chill', 'violonchelo': 'cello',
    'bolha': 'bubble', 'bolhas': 'bubbles', 'papel': 'paper', 'maquina de escrever': 'typewriter', 'máquina de escrever': 'typewriter',
    'batimento cardiaco': 'heartbeat', 'batimento cardíaco': 'heartbeat', 'coracao': 'heartbeat', 'coração': 'heartbeat',
    'misterio': 'mystery', 'mistério': 'mystery', 'tensao': 'tension', 'tensão': 'tension', 'documentario': 'documentary', 'documentário': 'documentary',
    'sombrio': 'dark ambient', 'escuro': 'dark', 'sino': 'bell', 'igreja': 'church', 'coral': 'choir',
};

const cache = new Map();

async function translate(raw) {
  const query = String(raw || '').trim();
  const lower = query.toLowerCase();
  if (!query) return { original: '', english: '', translated: false };
  if (GLOSSARY[lower]) return { original: query, english: GLOSSARY[lower], translated: true, source: 'glossary' };
  if (cache.has(lower)) return cache.get(lower);
  let result = { original: query, english: query, translated: false };
  try {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(query)}&langpair=autodetect|en`, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    const t = data && data.responseStatus === 200 && data.responseData && data.responseData.translatedText;
    const lang = String(data.responseData && data.responseData.detectedLanguage || '');
    // Only trust PT/ES detections; MyMemory sometimes "translates" English words into odd variants.
    if (t && /^(pt|es)/i.test(lang) && t.toLowerCase() !== lower) {
      result = { original: query, english: t.replace(/[()[\]]/g, '').trim(), translated: true, source: 'mymemory' };
    }
  } catch { /* offline or API down: search with the original term */ }
  cache.set(lower, result);
  return result;
}

module.exports = { translate };
