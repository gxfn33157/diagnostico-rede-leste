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

  // POST /api/diagnosticar - Execute network diagnostic
  app.post("/api/diagnosticar", async (req, res) => {
    try {
      const validatedData = diagnosticoRequestSchema.parse(req.body);
      const { dominio, escopo, limite } = validatedData;

      console.log(`[API] Iniciando diagnóstico: ${dominio} (${escopo}, ${limite} probes)`);

      // Use GlobalPing if available, otherwise fallback to RIPE Atlas
      const resultado = process.env.GLOBALPING_API_TOKEN 
        ? await globalpingService.executeDiagnostico(dominio, escopo, limite)
        : await ripeService.executeDiagnostico(dominio, escopo, limite);

      // Save to storage
      const saved = await storage.saveDiagnostico({
        dominio,
        escopo,
        limite,
        resumo: resultado.resumo,
        resultados: resultado.resultados as any,
        totalProbes: resultado.totalProbes,
      });

      res.json({
        id: saved.id,
        dominio: saved.dominio,
        data: saved.data.toLocaleString("pt-BR"),
        totalProbes: saved.totalProbes,
        resumo: saved.resumo,
        resultados: saved.resultados,
      });
    } catch (error) {
      console.error("[API] Erro no diagnóstico:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          erro: "Dados inválidos",
          detalhes: error.errors,
        });
      }

      const mensagemErro = error instanceof Error ? error.message : String(error);
      const statusCode = mensagemErro.includes("inválido") ? 400 : 500;
      
      res.status(statusCode).json({
        erro: mensagemErro.includes("inválido") 
          ? "Domínio inválido" 
          : "Erro ao executar diagnóstico",
        detalhes: mensagemErro,
      });
    }
  });

  // POST /api/pdf - Generate PDF report
  app.post("/api/pdf", async (req, res) => {
    try {
      const { dominio, data, resumo, resultados } = req.body;

      if (!dominio || !resultados) {
        return res.status(400).json({ erro: "Dados incompletos para gerar PDF" });
      }

      const doc = new PDFDocument({ margin: 50, size: "A4" });
      
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename=diagnostico-${dominio.replace(/\./g, '-')}.pdf`);
      
      doc.pipe(res);

      // Professional Header with Border
      doc.rect(50, 50, 495, 80).stroke();
      doc.fontSize(24).font("Helvetica-Bold").text("DIAGNÓSTICO DE REDE", 70, 65, { align: "left" });
      doc.fontSize(14).font("Helvetica").text("Leste Telecom", 70, 95, { fill: "#0066cc" });
      doc.fontSize(10).font("Helvetica").text("Ferramenta de Análise de Conectividade Global", 70, 115, { fill: "#666" });

      doc.moveDown(6);

      // Info Box
      doc.fontSize(11).font("Helvetica-Bold").text("INFORMAÇÕES DO DIAGNÓSTICO", { underline: true });
      doc.fontSize(9).font("Helvetica");
      doc.text(`Domínio Analisado: ${dominio}`, { indent: 20 });
      doc.text(`Data/Hora: ${data || new Date().toLocaleString("pt-BR")}`, { indent: 20 });
      doc.text(`Total de Probes: ${resultados.length}`, { indent: 20 });
      doc.text(`Escopo: Global`, { indent: 20 });

      doc.moveDown();

      // Summary Box with Highlight
      doc.rect(50, doc.y, 495, 60).fill("#f0f8ff");
      doc.fill("#000");
      doc.fontSize(11).font("Helvetica-Bold").text("RESUMO EXECUTIVO", 60, doc.y + 10);
      doc.fontSize(9).font("Helvetica").text(resumo || "Análise de conectividade finalizada com sucesso.", 60, doc.y + 30, { width: 475 });

      doc.moveDown(5);

      // Detailed Results Header
      doc.fontSize(12).font("Helvetica-Bold").text("RESULTADOS DETALHADOS", { underline: true });
      doc.moveDown(0.5);

      // Table Header
      const tableTop = doc.y;
      const colWidths = { probe: 35, region: 80, ip: 100, latencia: 60, velocidade: 60, perda: 50, acessibilidade: 110 };
      
      doc.rect(50, tableTop, 495, 20).fill("#0066cc");
      doc.fill("#fff");
      doc.fontSize(8).font("Helvetica-Bold");
      
      let col = 50;
      doc.text("Probe", col, tableTop + 5);
      col += colWidths.probe;
      doc.text("Região", col, tableTop + 5);
      col += colWidths.region;
      doc.text("IP", col, tableTop + 5);
      col += colWidths.ip;
      doc.text("Latência", col, tableTop + 5);
      col += colWidths.latencia;
      doc.text("Velocidade", col, tableTop + 5);
      col += colWidths.velocidade;
      doc.text("Perda", col, tableTop + 5);

      // Table Rows
      doc.fill("#000");
      doc.fontSize(7).font("Helvetica");
      
      let rowY = tableTop + 25;
      resultados.slice(0, 30).forEach((r: any, idx: number) => {
        const bgColor = idx % 2 === 0 ? "#f9f9f9" : "#ffffff";
        doc.rect(50, rowY, 495, 15).fill(bgColor);
        doc.fill("#000");

        col = 55;
        doc.text(`#${r.probe_id}`, col, rowY + 3);
        col += colWidths.probe;
        doc.text(r.region.substring(0, 15), col, rowY + 3);
        col += colWidths.region;
        doc.text(r.ip, col, rowY + 3);
        col += colWidths.ip;
        doc.text(r.latencia, col, rowY + 3);
        col += colWidths.latencia;
        doc.text(r.velocidade, col, rowY + 3);
        col += colWidths.velocidade;
        doc.text(r.perda_pacotes || "N/A", col, rowY + 3);

        rowY += 15;

        if (rowY > 700) {
          doc.addPage();
          rowY = 50;
        }
      });

      if (resultados.length > 30) {
        doc.moveDown();
        doc.fontSize(8).fill("#666").text(`... e mais ${resultados.length - 30} resultados.`, { align: "center" });
      }

      // Footer
      doc.moveDown(2);
      doc.fontSize(8).fill("#999");
      doc.text("Documento gerado automaticamente pela Ferramenta de Diagnóstico Leste Telecom", 50, doc.page.height - 50, { align: "center" });
      doc.text("© 2025 Leste Telecom - Todos os direitos reservados", 50, doc.page.height - 35, { align: "center" });

      doc.end();
    } catch (error) {
      console.error("[API] Erro ao gerar PDF:", error);
      res.status(500).json({
        erro: "Erro ao gerar PDF",
        detalhes: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // GET /api/diagnosticos - List recent diagnostics
  app.get("/api/diagnosticos", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const diagnosticos = await storage.listDiagnosticos(limit);
      
      res.json(diagnosticos.map(d => ({
        id: d.id,
        dominio: d.dominio,
        escopo: d.escopo,
        data: d.data.toLocaleString("pt-BR"),
        totalProbes: d.totalProbes,
      })));
    } catch (error) {
      console.error("[API] Erro ao listar diagnósticos:", error);
      res.status(500).json({ erro: "Erro ao listar diagnósticos" });
    }
  });

  return httpServer;
}
