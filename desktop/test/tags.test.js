const { test } = require('node:test');
const assert = require('node:assert');
const { lerPedidos } = require('../electron/servicos/creator/tags');

test('linha sem tag usa o padrão da tela', () => {
  const [p] = lerPedidos('um gato no espaço', { kind: 'image', aspect: '9:16', model: 'nano_2', outputs: 2 })
  assert.strictEqual(p.kind, 'image')
  assert.strictEqual(p.prompt, 'um gato no espaço')
  assert.deepStrictEqual(p.params, { provider: 'flow', aspect: '9:16', outputs: 2, model: 'nano_2' })
})

test('tags no começo, várias e em qualquer ordem', () => {
  const [p] = lerPedidos('[16:9] [i] [nano_lite] [4k] Digital illustration [Maria] walks', {}, ['Maria'])
  assert.strictEqual(p.kind, 'image')
  assert.strictEqual(p.params.aspect, '16:9')
  assert.strictEqual(p.params.model, 'nano_lite')
  assert.strictEqual(p.params.upscale, '4k')
  assert.strictEqual(p.prompt, 'Digital illustration [Maria] walks')
  assert.deepStrictEqual(p.characters, ['Maria'])
})

test('vídeo: qualidade, duração, voz e modo por personagem', () => {
  const [p] = lerPedidos('[v] [relaxed] [6s] [voice:charon] [João] acena', {}, ['João'])
  assert.strictEqual(p.kind, 'video')
  assert.strictEqual(p.params.quality, 'relaxed')
  assert.strictEqual(p.params.duration, 6)
  assert.strictEqual(p.params.voice, 'charon')
  assert.strictEqual(p.params.mode, 'elements')
})

test('[iv] anima a imagem com o mesmo prompt', () => {
  const [p] = lerPedidos('[iv] [9:16] castelo na neblina')
  assert.strictEqual(p.kind, 'image')
  assert.strictEqual(p.animate.prompt, 'castelo na neblina')
  assert.strictEqual(p.animate.params.aspect, '9:16')
})

test('par [i] X [v] Y na mesma linha', () => {
  const [p] = lerPedidos('[i] [16:9] porta antiga de madeira [v] [8s] a porta se abre devagar')
  assert.strictEqual(p.kind, 'image')
  assert.strictEqual(p.prompt, 'porta antiga de madeira')
  assert.strictEqual(p.animate.prompt, 'a porta se abre devagar')
  assert.strictEqual(p.animate.params.duration, 8)
})

test('auto-animar com prompts de animação por ordem', () => {
  const ps = lerPedidos('imagem um\nimagem dois\nimagem três', { kind: 'image', autoAnimate: true, animatePrompts: ['anima um', '', 'anima três'] })
  assert.deepStrictEqual(ps.map((p) => p.animate.prompt), ['anima um', 'imagem dois', 'anima três'])
})

test('colchete desconhecido no começo não é tag (fica no prompt)', () => {
  const [p] = lerPedidos('[Close-up] rosto iluminado')
  assert.strictEqual(p.prompt, '[Close-up] rosto iluminado')
})

test('linhas vazias são ignoradas e cada linha vira um pedido', () => {
  assert.strictEqual(lerPedidos('a\n\n  \nb\n').length, 2)
})

test('bloco JSON dp', () => {
  const [p] = lerPedidos('{"dp":{"type":"video","quality":"quality","aspect":"9:16","duration":4}} um carro na chuva')
  assert.strictEqual(p.kind, 'video')
  assert.strictEqual(p.params.quality, 'quality')
  assert.strictEqual(p.params.aspect, '9:16')
  assert.strictEqual(p.params.duration, 4)
  assert.strictEqual(p.prompt, 'um carro na chuva')
})

test('grok: [quality] é modo do grok, resolução de vídeo', () => {
  const [p] = lerPedidos('[grok] [v] [quality] [720p] [10s] dragão voando')
  assert.strictEqual(p.params.provider, 'grok')
  assert.strictEqual(p.params.grokMode, 'quality')
  assert.strictEqual(p.params.grokResolution, '720p')
  assert.strictEqual(p.params.duration, 10)
})
