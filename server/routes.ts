import type { Express } from "express";
import { type Server } from "http";
import cors from "cors";
import { storage } from "./storage";
import { RipeAtlasService } from "./services/ripeService";
import { GlobalpingService } from "./services/globalpingService";
import PDFDocument from "pdfkit";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.use(cors());
  const ripe = new RipeAtlasService();
  const gp = new GlobalpingService();

  app.post("/api/diagnosticar", async (req, res) => {
    try {
      const { dominio, escopo, limite } = req.body;
      const [r1, r2] = await Promise.all([
        gp.executeDiagnostico(dominio, escopo, Math.ceil(limite/2)).catch(() => null),
        ripe.executeDiagnostico(dominio, escopo, Math.ceil(limite/2)).catch(() => null)
      ]);
      const results = [...(r1?.resultados || []), ...(r2?.resultados || [])];
      const saved = await storage.saveDiagnostico({
        dominio, escopo, limite, totalProbes: results.length,
        resumo: `Híbrido: ${results.length} probes únicos encontrados.`,
        resultados: results as any
      });
      res.json({ ...saved, data: saved.data.toLocaleString("pt-BR") });
    } catch (e: any) { res.status(500).json({ erro: e.message }); }
  });

  app.post("/api/pdf", async (req, res) => {
    try {
      const { dominio, data, resultados } = req.body;
      const doc = new PDFDocument({ margin: 50 });
      res.setHeader("Content-Type", "application/pdf");
      doc.pipe(res);
      doc.fontSize(20).text(`Diagnóstico: ${dominio}`, { align: 'center' });
      doc.moveDown();
      resultados.forEach((r: any, i: number) => {
        doc.fontSize(10).text(`${i+1}. [${r.region}] ${r.isp} (${r.asn}) -> IP: ${r.ip} | ${r.latencia}`);
      });
      doc.end();
    } catch (e) { res.status(500).send("Erro PDF"); }
  });

  app.get("/api/diagnosticos", async (req, res) => {
    const list = await storage.listDiagnosticos(10);
    res.json(list.map(d => ({ ...d, data: d.data.toLocaleString("pt-BR") })));
  });

  return httpServer;
}
