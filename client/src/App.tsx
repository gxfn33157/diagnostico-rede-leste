import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}

function Watermark() {
  return (
    <div className="fixed bottom-4 right-4 z-40 text-xs text-muted-foreground/50 hover:text-muted-foreground/70 transition-colors pointer-events-none select-none">
      <p className="font-light">Created by Geovanne Ferreira</p>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
        <Watermark />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
