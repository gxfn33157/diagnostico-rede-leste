// ripe.js temporário para testes
async function executarDiagnostico(dominio) {
  // Retorna JSON fake para teste
  return {
    dominio,
    data: new Date().toLocaleString("pt-BR"),
    totalProbes: 3,
    resumo: "Acesso normal em todas as redes testadas (teste temporário).",
    resultados: [
      { probe_id: 1, pais: "BR", latencia: "10ms", status: "OK" },
      { probe_id: 2, pais: "BR", latencia: "15ms", status: "OK" },
      { probe_id: 3, pais: "BR", latencia: "20ms", status: "OK" }
    ]
  };
}

module.exports = { executarDiagnostico };
