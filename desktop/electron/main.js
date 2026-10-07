// Noctis Studio Desktop — ponto de entrada.
//   --noctis-ia <pedido> <resposta>: modo sem janela usado pelo MCP com o app fechado.
//   qualquer outro caso: o app normal (janela, bandeja, API local para IAs).
if (process.argv.includes('--noctis-ia')) require('./servicos/ia/sem-janela').rodar(process.argv);
else require('./app-principal');
