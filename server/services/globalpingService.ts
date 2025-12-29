import axios from 'axios';
import type { ProbeResult } from '@shared/schema';

const GLOBALPING_API = 'https://api.globalping.io';
const PROBES_POR_PAIS = 3;

export class GlobalpingService {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GLOBALPING_API_TOKEN || '';
    console.log('[GlobalPing] API Token:', this.apiKey ? 'OK' : 'NÃO CONFIGURADO');
  }

  async executeDiagnostico(dominio: string, escopo: string, limite: number) {
    if (!this.isValidDomain(dominio)) {
      throw new Error(`Domínio inválido: ${dominio}`);
    }

    const locations = this.getLocations(escopo, limite);
    let resultados: ProbeResult[] = [];

    for (let i = 0; i < locations.length; i++) {
      const country = locations[i];

      for (let p = 0; p < PROBES_POR_PAIS; p++) {
        const baseId = i * 10 + p;

        const dns = await this.executeMeasurement(dominio, 'dns', country, baseId);
        if (dns) resultados.push(dns);

        const ping = await this.executeMeasurement(dominio, 'ping', country, baseId + 100);
        if (ping) resultados.push(ping);
      }
    }

    if (resultados.length === 0) {
      throw new Error('Nenhuma medição válida retornada.');
    }

    const resumo = this.gerarResumo(resultados);

    return {
      resumo,
      resultados,
      totalProbes: resultados.length,
    };
  }

  // =========================
  // MEDIÇÃO
  // =========================

  private async executeMeasurement(
    target: string,
    type: 'dns' | 'ping',
    country: string,
    probeId: number
  ): Promise<ProbeResult | null> {
    try {
      const create = await axios.post(
        `${GLOBALPING_API}/v1/measurements`,
        {
          type,
          target,
          locations: [{ country }],
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        }
      );

      const measurementId = create.data?.id;
      if (!measurementId) return null;

      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 500));

        const poll = await axios.get(
          `${GLOBALPING_API}/v1/measurements/${measurementId}`,
          {
            headers: { Authorization: `Bearer ${this.apiKey}` },
          }
        );

        if (poll.data?.status === 'finished' || poll.data?.status === 'completed') {
          return type === 'dns'
            ? this.parseDNS(poll.data, country, probeId)
            : this.parsePing(poll.data, country, probeId);
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  // =========================
  // PARSE DNS
  // =========================

  private parseDNS(data: any, country: string, probeId: number): ProbeResult | null {
    const r = data?.results?.[0];
    if (!r?.result?.answers?.length) return null;

    const ip = r.result.answers[0].data;
    const probe = r.probe || {};

    return {
      probe_id: probeId,
      region: country,
      ip,
      asn: `AS${probe.asn || 'N/A'}`,
      isp: probe.network || 'ISP desconhecido',
      acessibilidade: 'Acessível',
      latencia: '0ms',
      jitter: '0ms',
      velocidade: 'Normal',
      perda_pacotes: '0%',
      status: 'OK',
    };
  }

  // =========================
  // PARSE PING + JITTER
  // =========================

  private parsePing(data: any, country: string, probeId: number): ProbeResult | null {
    const r = data?.results?.[0];
    if (!r?.result) return null;

    const stats = r.result.stats;
    if (!stats || stats.loss === 100) return null;

    const avg = Math.round(stats.avg || 0);
    const min = Math.round(stats.min || avg);
    const max = Math.round(stats.max || avg);
    const jitter = Math.abs(max - min);

    let status: 'OK' | 'AVISO' | 'ERRO' = 'OK';
    let acessibilidade = 'Acessível';

    if (avg > 200 || stats.loss > 5) {
      status = 'AVISO';
      acessibilidade = 'Instabilidade detectada';
    }
    if (avg > 500 || stats.loss > 20) {
      status = 'ERRO';
      acessibilidade = 'Inacessível';
    }

    let velocidade: 'Rápida' | 'Normal' | 'Lenta' = 'Normal';
    if (avg < 30) velocidade = 'Rápida';
    if (avg > 100) velocidade = 'Lenta';

    return {
      probe_id: probeId,
      region: country,
      ip: stats.resolvedAddress || 'N/A',
      asn: `AS${r.probe?.asn || 'N/A'}`,
      isp: r.probe?.network || 'ISP desconhecido',
      acessibilidade,
      latencia: `${avg}ms`,
      jitter: `${jitter}ms`,
      velocidade,
      perda_pacotes: `${stats.loss}%`,
      status,
    };
  }

  // =========================
  // RESUMO AUTOMÁTICO
  // =========================

  private gerarResumo(resultados: ProbeResult[]): string {
    const porPais: Record<string, ProbeResult[]> = {};

    resultados.forEach(r => {
      if (!porPais[r.region]) porPais[r.region] = [];
      porPais[r.region].push(r);
    });

    const alertas: string[] = [];

    for (const pais in porPais) {
      const probes = porPais[pais];
      const erros = probes.filter(p => p.status === 'ERRO');
      const avisos = probes.filter(p => p.status === 'AVISO');

      const ispsAfetados = new Set(
        [...erros, ...avisos].map(p => p.isp)
      );

      if (erros.length > 0) {
        alertas.push(
          `🚨 ${pais}: Falha crítica detectada (${[...ispsAfetados].join(', ')})`
        );
      } else if (avisos.length > 0) {
        alertas.push(
          `⚠️ ${pais}: Instabilidade em alguns provedores (${[...ispsAfetados].join(', ')})`
        );
      }
    }

    if (alertas.length === 0) {
      return '✅ Nenhuma instabilidade detectada. Conectividade normal em todas as regiões testadas.';
    }

    return alertas.join(' | ');
  }

  // =========================
  // UTIL
  // =========================

  private isValidDomain(domain: string): boolean {
    return /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/.test(domain);
  }

  private getLocations(scope: string, limit: number): string[] {
    const map: Record<string, string[]> = {
      GLOBAL: ['US', 'BR', 'DE', 'JP', 'SG', 'GB', 'CA', 'AU'],
      BR: ['BR', 'BR', 'BR', 'BR', 'BR'],
    };

    return (map[scope] || map.GLOBAL).slice(0, limit);
  }
}
