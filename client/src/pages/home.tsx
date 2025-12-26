import { useState, useEffect } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Terminal, Cpu, Globe, Zap, Code2, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import heroBg from "@assets/generated_images/abstract_digital_network_nodes_with_green_glowing_connections.png";

const Navbar = () => (
  <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-black/50 backdrop-blur-md">
    <div className="container mx-auto px-6 h-16 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-black font-bold font-mono">
          JS
        </div>
        <span className="text-xl font-bold font-display tracking-tight text-white">Node.js Online</span>
      </div>
      <div className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
        <a href="#features" className="hover:text-primary transition-colors">Recursos</a>
        <a href="#docs" className="hover:text-primary transition-colors">Documentação</a>
        <a href="#pricing" className="hover:text-primary transition-colors">Preços</a>
      </div>
      <div className="flex items-center gap-4">
        <Button variant="ghost" className="hidden sm:inline-flex hover:text-primary hover:bg-primary/10">Entrar</Button>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold">
          Começar Grátis
        </Button>
      </div>
    </div>
  </nav>
);

const CodeWindow = () => {
  const [lines, setLines] = useState([
    "npm install express",
    "added 57 packages in 2s",
    "node server.js",
    "Server running at http://localhost:3000",
    "Listening for connections..."
  ]);

  return (
    <div className="rounded-lg overflow-hidden border border-white/10 bg-[#0A0A0A] shadow-2xl font-mono text-sm">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-white/5">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <div className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>
        <div className="ml-4 text-xs text-muted-foreground">terminal — node</div>
      </div>
      <div className="p-4 space-y-1 h-[300px] overflow-hidden relative">
        {lines.map((line, i) => (
          <div key={i} className="text-green-400">
            <span className="text-muted-foreground mr-2">$</span>
            {line}
          </div>
        ))}
        <div className="animate-pulse w-2 h-4 bg-green-500 inline-block align-middle ml-1" />
        
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-transparent to-transparent pointer-events-none" />
      </div>
    </div>
  );
};

const FeatureCard = ({ icon: Icon, title, desc }: { icon: any, title: string, desc: string }) => (
  <Card className="bg-white/5 border-white/10 hover:border-primary/50 transition-colors group">
    <CardContent className="p-6">
      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
        <Icon className="w-6 h-6 text-primary" />
      </div>
      <h3 className="text-xl font-bold mb-2 text-white">{title}</h3>
      <p className="text-muted-foreground leading-relaxed">
        {desc}
      </p>
    </CardContent>
  </Card>
);

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden selection:bg-primary/30">
      <Navbar />
      
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 px-6">
        <div className="absolute inset-0 z-0 opacity-20 select-none pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
          <img 
            src={heroBg} 
            alt="Background" 
            className="w-full h-full object-cover object-center"
          />
        </div>
        
        <div className="container mx-auto relative z-10 grid lg:grid-cols-2 gap-12 items-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-6">
              <Zap className="w-4 h-4" />
              <span>v20.11.0 LTS Disponível</span>
            </div>
            
            <h1 className="text-5xl lg:text-7xl font-bold font-display leading-[1.1] mb-6 tracking-tight">
              Backend Serverless <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-600 text-glow">
                Instantâneo
              </span>
            </h1>
            
            <p className="text-lg text-muted-foreground mb-8 max-w-lg leading-relaxed">
              Implante APIs Node.js, microserviços e workers em segundos.
              Infraestrutura global, sem configuração de servidores.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 h-12 px-8 text-base">
                Iniciar Projeto <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
              <Button size="lg" variant="outline" className="border-white/20 hover:bg-white/5 h-12 px-8 text-base">
                Ver Documentação
              </Button>
            </div>
            
            <div className="mt-12 flex items-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                <span>Zero Config</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                <span>Auto-Scaling</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                <span>Global Edge</span>
              </div>
            </div>
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative"
          >
            <div className="absolute -inset-4 bg-primary/20 blur-3xl rounded-full opacity-30" />
            <CodeWindow />
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 bg-black/50 border-t border-white/5">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold font-display mb-4">Poderoso. Flexível. Global.</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Tudo o que você precisa para construir backends modernos sem a dor de cabeça da infraestrutura.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard 
              icon={Terminal}
              title="Ambiente Nativo"
              desc="Acesso completo ao runtime Node.js. Use qualquer pacote NPM, execute scripts e compile binários nativos."
            />
            <FeatureCard 
              icon={Globe}
              title="Deploy Global"
              desc="Seu código é replicado automaticamente em 35 regiões ao redor do mundo para latência mínima."
            />
            <FeatureCard 
              icon={Cpu}
              title="Alta Performance"
              desc="CPUs dedicadas e armazenamento NVMe garantem que suas aplicações rodem na velocidade máxima."
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-primary/5" />
        <div className="container mx-auto relative z-10 max-w-4xl text-center">
          <h2 className="text-4xl lg:text-5xl font-bold font-display mb-6">
            Pronto para codar?
          </h2>
          <p className="text-xl text-muted-foreground mb-10">
            Junte-se a milhares de desenvolvedores construindo o futuro da web.
          </p>
          <Button size="lg" className="h-14 px-10 text-lg bg-white text-black hover:bg-white/90 font-bold rounded-full">
            Criar Conta Gratuita
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-white/10 bg-black">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
               <div className="w-6 h-6 rounded bg-primary flex items-center justify-center text-black text-xs font-bold font-mono">
                JS
              </div>
              <span className="font-bold">Node.js Online</span>
            </div>
            <div className="text-sm text-muted-foreground">
              © 2024 Node.js Online Platform. Todos os direitos reservados.
            </div>
            <div className="flex gap-6">
              <a href="#" className="text-muted-foreground hover:text-white transition-colors">Twitter</a>
              <a href="#" className="text-muted-foreground hover:text-white transition-colors">GitHub</a>
              <a href="#" className="text-muted-foreground hover:text-white transition-colors">Discord</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}