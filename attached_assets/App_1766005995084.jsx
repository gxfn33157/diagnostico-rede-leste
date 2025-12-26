import { useState } from "react";

function App() {
  const [dominio, setDominio] = useState("");
  const [res, setRes] = useState(null);
  const [erro, setErro] = useState("");

  async function executar() {
    setErro("");
    setRes(null);
    const r = await fetch(import.meta.env.VITE_API_URL + "/diagnosticar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dominio })
    });
    const j = await r.json();
    if (!r.ok) setErro(j.erro || "Erro desconhecido");
    else setRes(j);
  }

  async function baixarPDF() {
    const r = await fetch(import.meta.env.VITE_API_URL + "/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(res)
    });
    const blob = await r.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "diagnostico-leste-telecom.pdf";
    a.click();
  }

  return (
    <div style={{ padding: 20, fontFamily: "Arial" }}>
      <h2>Diagnóstico de Acesso – Leste Telecom</h2>
      <input
        placeholder="ex: www.exemplo.com.br"
        value={dominio}
        onChange={e => setDominio(e.target.value)}
      />
      <button onClick={executar} style={{ marginLeft: 10 }}>Executar</button>

      {erro && <p style={{ color: "red" }}>{erro}</p>}

      {res && (
        <div>
          <h3>Resumo</h3>
          <p>{res.resumo}</p>
          <button onClick={baixarPDF}>Baixar PDF</button>
          <pre style={{ marginTop: 10 }}>{JSON.stringify(res, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

export default App;
