import type { Express } from "express";
import { createServer, type Server } from "http";
import cors from "cors";
import { storage } from "./storage";
import { RipeAtlasService } from "./services/ripeService";
import { GlobalpingService } from "./services/globalpingService";
import { z } from "zod";
import PDFDocument from "pdfkit";

const diagnosticoRequestSchema = z.object({
  dominio: z.string().min(1, "Domínio é obrigatório"),
  escopo: z.enum(["GLOBAL", "BR", "AWS", "AZURE"]),
  limite: z.number().min(1).max(1000),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.use(cors());
  
  const ripeService = new RipeAtlasService();
  const globalpingService = new GlobalpingService();

  // POST /api/diagnosticar
  app.post("/api/diagnosticar", async (req, res) => {
    try {
      const { dominio, escopo, limite } = diagnosticoRequestSchema.parse(req.body);
      const [gpResult, ripeResult] = await Promise.all([
        globalpingService.executeDiagnostico(dominio, escopo, Math.ceil(limite / 2)).catch(() => null),
        ripeService.executeDiagnostico(dominio, escopo, Math.ceil(limite / 2)).catch(() => null)
      ]);

      if (!gpResult && !ripeResult) throw new Error("Falha total no diagnóstico.");

      const allResults = [...(gpResult?.resultados || []), ...(ripeResult?.resultados || [])];
      const saved = await storage.saveDiagnostico({
        dominio, escopo, limite, totalProbes: allResults.length,
        resumo: `Diagnóstico Híbrido: ${allResults.length} medições.`,
        resultados: allResults as any
      });

      res.json({ ...saved, data: saved.data.toLocaleString("pt-BR") });
    } catch (error: any) {
      res.status(500).json({ erro: error.message });
    }
  });

  // POST /api/pdf
  app.post("/api/pdf", async (req, res) => {
    try {
      const { dominio, data, resumo, resultados } = req.body;
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename=diagnostico.pdf`);
      doc.pipe(res);

      doc.rect(50, 50, 495, 80).stroke();
      doc.fontSize(22).font("Helvetica-Bold").text("DIAGNÓSTICO DE REDE", 70, 70);
      doc.fontSize(10).font("Helvetica").text("Leste Telecom - Relatório Técnico", 70, 100);

      doc.moveDown(4);
      doc.fontSize(12).font("Helvetica-Bold").text("RESUMO EXECUTIVO");
      doc.fontSize(9).font("Helvetica").text(resumo || "Concluído.");

      doc.moveDown(2);
      doc.fontSize(12).font("Helvetica-Bold").text("DETALHAMENTO");
      resultados.slice(0, 35).forEach((r: any, i: number) => {
        doc.fontSize(8).text(`${i+1}. [${r.region}] ${r.isp} -> IP: ${r.ip} | ${r.latencia}`, { indent: 10 });
      });

      doc.end();
    } catch (error) {
      res.status(500).send("Erro PDF");
    }
  });

  app.get("/api/diagnosticos", async (req, res) => {
    const list = await storage.listDiagnosticos(10);
    res.json(list.map(d => ({ ...d, data: d.data.toLocaleString("pt-BR") })));
  });

  return httpServer;
}
