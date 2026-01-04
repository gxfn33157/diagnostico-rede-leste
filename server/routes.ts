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
      const [gpR, ripeR] = await Promise.all([
        gp.executeDiagnostico(dominio, escopo, Math.ceil(limite/2)).catch(() => null),
        ripe.executeDiagnostico(dominio, escopo, Math.ceil(limite/2)).catch(() => null)
      ]);
      const allRes = [...(gpR?.resultados || []), ...(ripeR?.resultados || [])];
      if (allRes.length === 0) throw new Error("Domínio inexistente ou sem resposta.");

      const saved = await storage.saveDiagnostico({
        dominio, escopo, limite, totalProbes: allRes.length,
        resumo: `Diagnóstico Híbrido: ${allRes.length} medições de ISPs diversificados.`,
        resultados: allRes as any
      });
      res.json({ ...saved, data: saved.data.toLocaleString("pt-BR") });
    } catch (error: any) { res.status(500).json({ erro: error.message }); }
  });

  app.post("/api/pdf", async (req, res) => {
    try {
      const { dominio, data, resumo, resultados } = req.body;
      const doc = new PDFDocument({ margin: 50 });
      res.setHeader("Content-Type", "application/pdf");
      doc.pipe(res);
      doc.fontSize(22).font("Helvetica-Bold").text("RELATÓRIO DE DIAGNÓSTICO", { align: 'center' });
      doc.fontSize(10).text(`Domínio: ${dominio} | Data: ${data}`, { align: 'center' });
      doc.moveDown(2);
      doc.fontSize(12).font("Helvetica-Bold").text("RESUMO TÉCNICO");
      doc.fontSize(10).font("Helvetica").text(resumo || "Sucesso.");
      doc.moveDown();
      resultados.forEach((r: any, i: number) => {
        doc.fontSize(8).text(`${i+1}. [${r.region}] ${r.isp} (${r.asn}) -> IP: ${r.ip} | ${r.latencia}`, { indent: 10 });
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
