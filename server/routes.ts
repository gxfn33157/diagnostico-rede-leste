// ... imports ...
  app.post("/api/diagnosticar", async (req, res) => {
    try {
      const { dominio, escopo, limite } = diagnosticoRequestSchema.parse(req.body);

      // Executa GlobalPing e RIPE Atlas em paralelo para máxima diversidade
      const [gpResult, ripeResult] = await Promise.all([
        globalpingService.executeDiagnostico(dominio, escopo, Math.ceil(limite / 2)).catch(() => null),
        ripeService.executeDiagnostico(dominio, escopo, Math.ceil(limite / 2)).catch(() => null)
      ]);

      if (!gpResult && !ripeResult) {
        throw new Error("Não foi possível obter dados reais. Verifique o domínio.");
      }

      const allResults = [...(gpResult?.resultados || []), ...(ripeResult?.resultados || [])];
      
      const saved = await storage.saveDiagnostico({
        dominio, escopo, limite,
        resumo: `Diagnóstico Híbrido: ${allResults.length} probes de ISPs diversos.`,
        resultados: allResults as any,
        totalProbes: allResults.length,
      });

      res.json(saved);
    } catch (error: any) {
      res.status(500).json({ erro: "Erro no diagnóstico", detalhes: error.message });
    }
  });
// ... resto do código ...
