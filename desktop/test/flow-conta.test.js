// Conferência de "quem está logado" no perfil da conta (Flow novo em flow.google.com).
const { test } = require('node:test');
const assert = require('node:assert');
const { lerConta, FLOW_URL } = require('../electron/servicos/creator/flow');

test('Flow mora em flow.google.com', () => assert.strictEqual(new URL(FLOW_URL).hostname, 'flow.google.com'));

test('lista de contas do Google (com prefixo anti-XSSI) vira { email, name }', () => {
  const txt = ")]}'\n[\"gaia.l.a.r\",[[\"gaia.l.a\",1,\"Cris\",\"cris@gmail.com\",\"https://foto\",1,1,0,null,1,\"123\"]]]";
  assert.deepStrictEqual(lerConta(txt), { email: 'cris@gmail.com', name: 'Cris' });
});

test('formato antigo { user } continua aceito; sem conta ou HTML → null', () => {
  assert.deepStrictEqual(lerConta('{"user":{"email":"a@b.com","name":"A"}}'), { email: 'a@b.com', name: 'A' });
  assert.strictEqual(lerConta('["gaia.l.a.r",[]]'), null);
  assert.strictEqual(lerConta('<html>Sign in</html>'), null);
  assert.strictEqual(lerConta(''), null);
});
