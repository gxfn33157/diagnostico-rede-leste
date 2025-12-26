const PDFDocument = require("pdfkit");

function gerarPDF(dados, res) {
  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(res);

  doc.fontSize(18).text("Diagnóstico de Acesso – Leste Telecom", { align: "center" });
  doc.moveDown();

  doc.fontSize(10).text(`Domínio: ${dados.dominio || "-"}`);
  doc.text(`Data: ${dados.data || "-"}`);
  doc.text(`Total de redes testadas: ${dados.totalProbes || "-"}`);
  doc.moveDown();

  doc.fontSize(12).text("Resumo:");
  doc.fontSize(10).text(dados.resumo || "-");
  doc.moveDown();

  doc.fontSize(12).text("Resultados:");
  doc.moveDown(0.5);

  (dados.resultados || []).forEach(r => {
    doc.fontSize(9).text(
      `Probe ${r.probe_id} | País: ${r.pais} | Latência: ${r.latencia} | Status: ${r.status}`
    );
  });

  doc.moveDown();
  doc.fontSize(8).text(
    "Documento gerado automaticamente para diagnóstico técnico de conectividade.",
    { align: "center" }
  );

  doc.end();
}

module.exports = { gerarPDF };
