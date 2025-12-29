import axios from 'axios';
import type { ProbeResult } from '@shared/schema';

const GLOBALPING_API = 'https://api.globalping.io';

export class GlobalpingService {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GLOBALPING_API_TOKEN || '';
    console.log('[GlobalPing] API Token:', this.apiKey ? 'OK' : 'NÃO CONFIGURADO');
  }

  // =====================================================
  // EXECUÇÃO PRINCIPAL
  // =====================================================
  async executeDiagnostico(dominio: string, escopo: string, limite: number) {
    if (!this.isValidDomain(dominio)) {
      throw new Error(`Domínio inválido: ${dominio}`);
    }

    const locations = this.getLocations(escopo, limite);
    let resultados: ProbeResult[] = [];

    for (let i = 0; i < locations.length; i++) {
      const country = locations[i];

      const dnsResults = await this.executeMeasurement(
        dominio,
        'dns',
        country,
        i * 100
      );
      resultados.push(...dnsResults);

      const pingResults = await this.executeMeasurement(
        dominio,
        'ping',
        country,
        i * 100 + 50
      );
      resultados.push(...pingResults);
    }

    if (resultados.length === 0) {
      throw new Error('Nenhuma medição válida retornada.');
    }

    return {
      resumo: this.gerarResumo(resultados),
      resultados,
      totalProbes: resultados.length,
    };
  }

  // =====================================================
  // CHAMADA À API GLOBALPING (FORMA CORRETA)
  // =====================================================
  private async executeMeasurement(
    target: string,
    type: 'dns' | 'ping',
    country: string,
    baseProbeId: number
  ): Promise<ProbeResult[]> {
    try {
      const create = await axios.post(
        `${GLOBALPING_API}/v1/measurements`,
        {
          type,
          target,
          locations: [
            {
              country,
              limit: 3 // 🔥 força diversidade real de ISP / ASN
            }
          ]
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      const measurementId = create.data?.id;
      if (!measurementId) return [];

      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 500));

        const poll = await axios.get(
          `${GLOBALPING_API}/v1/measurements/${measurementId}`,
          {
            headers: { Authorization: `Bearer ${this.apiKey}` }
          }
        );

        if (poll.data?.status === 'finished' || poll.data?.status === 'completed') {
          return type === 'dns'
            ? this.parseDNS(poll.data, country, baseProbeId)
            : this.parsePing(poll.data, country, baseProbeId);
        }
      }

      return [];
    } catch (error) {
      console.error('[GlobalPing] Erro de medição:', error);
      return [];
    }
  }

  // =====================================================
  // PARSE DNS (ACESSIBILIDADE)
  // =====================================================
  private parseDNS(data: any, country: string, baseId: number): ProbeResult[] {
    return (data.results || [])
      .map((r: any, index: number) => {
        const ip = r.result?.answers?.[0]?.data;
        if (!ip) return null;

        return {
          probe_id: baseId + index,
          region: country,
          ip,
          asn: `AS${r.probe?.asn || 'N/A'}`,
          isp: r.probe?.network || 'ISP desconhecido',
          acessibilidade: 'Resolvido',
          latencia: '0ms',
          jitter: '0ms',
          velocidade: 'Normal',
          perda_pacotes: '0%',
          status: 'OK'
        };
      })
      .filter(Boolean);
  }

  // =====================================================
  // PARSE PING + JITTER REAL
  // =====================================================
  private parsePing(data: any, country: string, baseId: number): ProbeResult[] {
    return (data.results || [])
      .map((r: any, index: number) => {
        const stats = r.result?.stats;
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
          probe_id: baseId + index,
          region: country,
          ip: stats.resolvedAddress || 'N/A',
          asn: `AS${r.probe?.asn || 'N/A'}`,
          isp: r.probe?.network || 'ISP desconhecido',
          acessibilidade,
          latencia: `${avg}ms`,
          jitter: `${jitter}ms`,
          velocidade,
          perda_pacotes: `${stats.loss}%`,
          status
        };
      })
      .filter(Boolean);
  }

  // =====================================================
  // RESUMO AUTOMÁTICO PARA O SITE
  // =====================================================
  private gerarResumo(resultados: ProbeResult[]): string {
    const porPais: Record<string, ProbeResult[]> = {};

    resultados.forEach(r => {
      if (!porPais[r.region]) porPais[r.region] = [];
      porPais[r.region].push(r);
    });

    const mensagens: string[] = [];

    for (const pais in porPais) {
      const probes = porPais[pais].filter(p => p.status !== 'OK');

      if (probes.length === 0) continue;

      const isps = [...new Set(probes.map(p => p.isp))];

      if (probes.some(p => p.status === 'ERRO')) {
        mensagens.push(`🚨 ${pais}: Falha crítica (${isps.join(', ')})`);
      } else {
        mensagens.push(`⚠️ ${pais}: Instabilidade (${isps.join(', ')})`);
      }
    }

    if (mensagens.length === 0) {
      return '✅ Conectividade normal em todas as regiões testadas.';
    }

    return mensagens.join(' | ');
  }

  // =====================================================
  // UTIL
  // =====================================================
  private isValidDomain(domain: string): boolean {
    return /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/.test(domain);
  }

  private getLocations(scope: string, limit: number): string[] {
    const map: Record<string, string[]> = {
      GLOBAL: ['BR', 'US', 'DE', 'JP', 'SG', 'GB'],
      BR: ['BR']
    };

    return (map[scope] || map.GLOBAL).slice(0, limit);
  }
}
