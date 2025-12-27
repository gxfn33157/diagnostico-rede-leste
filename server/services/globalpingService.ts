import axios from 'axios';
import type { ProbeResult } from '@shared/schema';

const GLOBALPING_API = 'https://api.globalping.io';

export class GlobalpingService {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GLOBALPING_API_TOKEN || '';
    console.log('[GlobalPing Service] API Token configured:', this.apiKey ? 'YES' : 'NO');
  }

  async executeDiagnostico(dominio: string, escopo: string, limite: number) {
    try {
      console.log(`[GlobalPing] Iniciando diagnóstico: ${dominio} (${escopo}, ${limite} locais)`);

      if (!this.isValidDomain(dominio)) {
        throw new Error(`Domínio inválido: ${dominio}`);
      }

      const locations = this.getLocations(escopo, limite);
      console.log(`[GlobalPing] Usando ${locations.length} locais`);

      let dnsResults = await this.executeDNS(dominio, locations);
      
      if (dnsResults.length === 0) {
        throw new Error(`Não foi possível obter dados reais do domínio ${dominio}. Verifique se ele existe ou tente novamente.`);
      }

      const pingResults = await this.executePing(dominio, locations);
      
      const allResults = [...dnsResults, ...pingResults];
      const resumo = `Diagnóstico completado com ${allResults.length} medições de ${locations.length} locais`;

      return {
        resumo,
        resultados: allResults,
        totalProbes: allResults.length,
      };
    } catch (error) {
      console.error('[GlobalPing] Erro:', error);
      throw error;
    }
  }

  private isValidDomain(dominio: string): boolean {
    const domainRegex = /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    return domainRegex.test(dominio);
  }

  private getLocations(escopo: string, limite: number): string[] {
    const locations: { [key: string]: string[] } = {
      GLOBAL: ['US', 'DE', 'JP', 'BR', 'AU', 'SG', 'IN', 'CA', 'MX', 'GB'],
      BR: ['BR', 'BR', 'BR', 'BR', 'BR', 'BR', 'BR', 'BR', 'BR', 'BR'],
      AWS: ['US', 'DE', 'JP', 'BR', 'CA', 'US', 'DE', 'IN'],
      AZURE: ['US', 'DE', 'JP', 'BR', 'CA', 'GB', 'FR', 'DE'],
    };

    const selected = locations[escopo] || locations.GLOBAL;
    return selected.slice(0, limite);
  }

  private async executeDNS(dominio: string, locations: string[]): Promise<ProbeResult[]> {
    const resultados: ProbeResult[] = [];

    for (let i = 0; i < locations.length; i++) {
      const countryCode = locations[i];
      try {
        const payload = {
          type: 'dns',
          target: dominio,
          locations: [{ country: countryCode }],
        };

        console.log(`[GlobalPing DNS] Enviando para ${countryCode}:`, JSON.stringify(payload));

        const response = await axios.post(
          `${GLOBALPING_API}/v1/measurements`,
          payload,
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 15000,
          }
        );

        console.log(`[GlobalPing DNS] Status ${response.status} de ${countryCode}`);

        const result = response.data.result;
        if (result?.answers?.[0]) {
          resultados.push({
            probe_id: i,
            region: countryCode,
            ip: result.answers[0].data || 'N/A',
            asn: 'AS15169',
            isp: `ISP ${countryCode}`,
            reverse_dns: result.answers[0].data || 'N/A',
            latencia: result.timeTaken ? `${Math.round(result.timeTaken)}ms` : '0ms',
            status: 'OK',
          });
        } else if (result?.error) {
          console.log(`[GlobalPing DNS] Erro em ${countryCode}: ${result.error}`);
        }
      } catch (error: any) {
        console.error(`[GlobalPing DNS] Erro em ${countryCode}:`, 
          error.response?.status, 
          JSON.stringify(error.response?.data || error.message)
        );
      }
    }

    return resultados;
  }

  private async executePing(target: string, locations: string[]): Promise<ProbeResult[]> {
    const resultados: ProbeResult[] = [];

    for (let i = 0; i < locations.length; i++) {
      const countryCode = locations[i];
      try {
        const payload = {
          type: 'ping',
          target: target,
          locations: [{ country: countryCode }],
        };

        console.log(`[GlobalPing Ping] Enviando para ${countryCode}:`, JSON.stringify(payload));

        const response = await axios.post(
          `${GLOBALPING_API}/v1/measurements`,
          payload,
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 15000,
          }
        );

        console.log(`[GlobalPing Ping] Status ${response.status} de ${countryCode}`);

        const result = response.data.result;
        if (result?.stats) {
          resultados.push({
            probe_id: i + 100,
            region: countryCode,
            ip: result.resolvedAddress || 'N/A',
            asn: 'AS15169',
            isp: `ISP ${countryCode}`,
            reverse_dns: target,
            latencia: `${Math.round(result.stats.avg || 0)}ms`,
            velocidade: result.stats.avg < 30 ? 'Rápida' : result.stats.avg < 60 ? 'Normal' : 'Lenta',
            perda_pacotes: `${result.stats.loss || 0}%`,
            status: result.stats.avg ? 'OK' : 'ERRO',
          });
        } else if (result?.error) {
          console.log(`[GlobalPing Ping] Erro em ${countryCode}: ${result.error}`);
        }
      } catch (error: any) {
        console.error(`[GlobalPing Ping] Erro em ${countryCode}:`, 
          error.response?.status, 
          JSON.stringify(error.response?.data || error.message)
        );
      }
    }

    return resultados;
  }
}
