import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { 
  Activity, 
  Globe, 
  Search, 
  Download,
  Network,
  Server,
  Settings2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

// Interface definitions matching the backend structure
interface ProbeResult {
  probe_id: number;
  region: string;
  ip: string;
  asn: string;
  isp: string;
  acessibilidade: string;
  latencia: string;
  velocidade: "Rápida" | "Normal" | "Lenta";
  perda_pacotes: string;
  certificado_ssl: string;
  status: "OK" | "AVISO" | "ERRO";
}

interface DiagnosticResult {
  dominio: string;
  data: string;
  totalProbes: number;
  resumo: string;
  resultados: ProbeResult[];
}

export default function Dashboard() {
  const [domain, setDomain] = useState("");
  const [scope, setScope] = useState("GLOBAL");
  const [limit, setLimit] = useState([50]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const { toast } = useToast();

  const handleDiagnose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domain) {
      toast({
        title: "Erro",
        description: "Por favor, informe um domínio.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/diagnosticar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dominio: domain,
          escopo: scope,
          limite: limit[0],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.erro || "Erro ao executar diagnóstico");
      }

      const data = await response.json();
      setResult(data);
      
      toast({
        title: "Diagnóstico Completo",
        description: `Análise finalizada com ${data.resultados.length} resultados.`,
      });
    } catch (error) {
      console.error("Erro no diagnóstico:", error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao executar diagnóstico",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!result) return;

    try {
      toast({
        title: "Gerando PDF...",
        description: "Processando relatório no servidor.",
      });

      const response = await fetch("/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      });

      if (!response.ok) {
        throw new Error("Falha ao gerar PDF");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `diagnostico-${result.dominio.replace(/\./g, '-')}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);

      toast({
        title: "Sucesso",
        description: "PDF baixado com sucesso.",
      });
    } catch (error) {
      console.error("Erro ao baixar PDF:", error);
      toast({
        title: "Erro",
        description: "Falha ao gerar o PDF.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6 md:p-12 font-sans selection:bg-primary/20">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Network className="w-6 h-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Diagnóstico de Rede</h1>
            </div>
            <p className="text-muted-foreground">Leste Telecom - Ferramenta de análise de conectividade global</p>
          </div>
          <div className="flex-shrink-0">
            <svg 
              viewBox="0 0 800 250" 
              className="h-14 w-auto"
              xmlns="http://www.w3.org/2000/svg"
            >
              <text 
                x="400" 
                y="180" 
                textAnchor="middle" 
                fill="#17a697" 
                fontSize="160" 
                fontWeight="bold" 
                fontFamily="Arial, sans-serif"
                letterSpacing="-5"
              >
                Leste
              </text>
            </svg>
          </div>
        </header>

        {/* Configuration & Search Section */}
        <Card className="border-white/10 bg-card/50 backdrop-blur-sm shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5" /> Configuração do Diagnóstico
            </CardTitle>
            <CardDescription>Defina o escopo geográfico e a intensidade da análise.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={handleDiagnose} className="space-y-6">
              
              <div className="grid md:grid-cols-12 gap-6">
                {/* Domain Input */}
                <div className="md:col-span-6 space-y-2">
                  <Label htmlFor="domain">Domínio Alvo</Label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input 
                      id="domain"
                      placeholder="ex: youtube.com" 
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                      className="pl-10 bg-black/20 border-white/10 font-mono"
                    />
                  </div>
                </div>

                {/* Scope Selector */}
                <div className="md:col-span-3 space-y-2">
                  <Label htmlFor="scope">Escopo</Label>
                  <Select value={scope} onValueChange={setScope}>
                    <SelectTrigger id="scope" className="bg-black/20 border-white/10">
                      <SelectValue placeholder="Selecione o escopo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GLOBAL">Global (Mundial)</SelectItem>
                      <SelectItem value="BR">Brasil (Nacional)</SelectItem>
                      <SelectItem value="AWS">AWS (Cloud)</SelectItem>
                      <SelectItem value="AZURE">Azure (Cloud)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Limit Slider */}
                <div className="md:col-span-3 space-y-2">
                  <div className="flex justify-between">
                    <Label htmlFor="limit">Limite de Probes</Label>
                    <span className="text-xs text-muted-foreground font-mono">{limit[0]}</span>
                  </div>
                  <Slider 
                    id="limit"
                    max={1000} 
                    min={10} 
                    step={10} 
                    value={limit} 
                    onValueChange={setLimit}
                    className="py-2"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Até 1000 probes simultâneas.
                  </p>
                </div>
              </div>

              <Button 
                type="submit" 
                size="lg" 
                disabled={loading}
                className="w-full md:w-auto min-w-[200px] h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
              >
                {loading ? (
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  >
                    <Activity className="w-5 h-5" />
                  </motion.div>
                ) : (
                  <>
                    <Search className="mr-2 w-4 h-4" /> Iniciar Diagnóstico
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Results Section */}
        <AnimatePresence>
          {result && !loading && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Alert Summary */}
              <Alert className="bg-emerald-500/10 border-emerald-500/20">
                <Activity className="h-4 w-4 text-emerald-400" />
                <AlertTitle className="text-emerald-400">Análise Concluída</AlertTitle>
                <AlertDescription className="text-emerald-400/80">
                  {result.resumo}
                </AlertDescription>
              </Alert>

              {/* Detailed Table */}
              <Card className="border-white/10 bg-card overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between border-b border-white/5 bg-white/[0.02]">
                  <div>
                    <CardTitle>Resultados Detalhados</CardTitle>
                    <CardDescription>
                      Mostrando {result.resultados.length} de {result.totalProbes} resultados recebidos.
                    </CardDescription>
                  </div>
                  <Button variant="outline" onClick={handleDownloadPDF} className="border-white/10 hover:bg-white/5 gap-2">
                    <Download className="w-4 h-4" /> Baixar PDF Oficial
                  </Button>
                </CardHeader>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/5 hover:bg-transparent text-xs uppercase tracking-wider">
                        <TableHead className="w-[60px]">Probe</TableHead>
                        <TableHead className="min-w-[140px]">Região</TableHead>
                        <TableHead className="min-w-[130px]">IP</TableHead>
                        <TableHead className="min-w-[100px]">ASN</TableHead>
                        <TableHead className="min-w-[140px]">ISP</TableHead>
                        <TableHead className="min-w-[160px]">Acessibilidade</TableHead>
                        <TableHead className="min-w-[90px]">Latência</TableHead>
                        <TableHead className="hidden md:table-cell min-w-[80px]">Velocidade</TableHead>
                        <TableHead className="hidden lg:table-cell min-w-[80px]">Perda</TableHead>
                        <TableHead className="hidden lg:table-cell min-w-[100px]">SSL</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.resultados.map((item) => (
                        <TableRow key={item.probe_id} className="border-white/5 hover:bg-white/[0.02] transition-colors group text-xs">
                          <TableCell className="font-mono text-muted-foreground text-[11px]">#{item.probe_id}</TableCell>
                          <TableCell className="font-medium text-white/90">
                            <div className="flex items-center gap-1">
                              <Globe className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                              <span className="truncate">{item.region}</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-[10px] text-blue-400">{item.ip}</TableCell>
                          <TableCell className="font-mono text-[10px] text-orange-300">{item.asn}</TableCell>
                          <TableCell className="text-[10px] text-white/70 truncate" title={item.isp}>{item.isp}</TableCell>
                          <TableCell className="text-white/85 font-medium text-[10px] truncate" title={item.acessibilidade}>
                            {item.acessibilidade}
                          </TableCell>
                          <TableCell className="font-mono text-blue-300 font-semibold">{item.latencia}</TableCell>
                          <TableCell className="hidden md:table-cell">
                            <Badge 
                              variant="outline" 
                              className={`text-[9px] border-opacity-30 ${
                                item.velocidade === "Rápida" 
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500" 
                                  : item.velocidade === "Normal"
                                  ? "bg-blue-500/10 text-blue-400 border-blue-500"
                                  : "bg-yellow-500/10 text-yellow-400 border-yellow-500"
                              }`}
                            >
                              {item.velocidade}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <Badge 
                              variant="outline" 
                              className={`text-[9px] border-opacity-30 ${
                                item.perda_pacotes === "0%" 
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500" 
                                  : item.perda_pacotes === "1-5%"
                                  ? "bg-yellow-500/10 text-yellow-400 border-yellow-500"
                                  : "bg-red-500/10 text-red-400 border-red-500"
                              }`}
                            >
                              {item.perda_pacotes}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <Badge 
                              variant="outline" 
                              className="text-[9px] border-opacity-30 bg-emerald-500/10 text-emerald-400 border-emerald-500"
                            >
                              {item.certificado_ssl}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge 
                              variant="outline" 
                              className={`text-[9px] border-opacity-20 ${
                                item.status === "OK" 
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500" 
                                  : item.status === "AVISO"
                                  ? "bg-yellow-500/10 text-yellow-400 border-yellow-500"
                                  : "bg-red-500/10 text-red-400 border-red-500"
                              }`}
                            >
                              {item.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
        
        {!result && !loading && (
          <div className="text-center py-24 opacity-20 select-none">
             <div className="flex justify-center mb-4">
                <Server className="w-20 h-20" />
             </div>
             <p className="text-lg">Configure o diagnóstico acima para iniciar.</p>
          </div>
        )}

      </div>
    </div>
  );
}