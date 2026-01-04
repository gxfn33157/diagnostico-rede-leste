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

      let allResults: ProbeResult[] = [];
      
      for (let i = 0; i < locations.length; i++) {
        const countryCode = locations[i];
        for (let probe = 0; probe < 3; probe++) {
          try {
            const dnsResult = await this.executeMeasurement(dominio, 'dns', countryCode, i * 100 + probe);
            if (dnsResult) {
              allResults.push(dnsResult);
            }
          } catch (error) {
            console.error(`[GlobalPing] DNS measurement failed for ${countryCode}:`, error);
          }
        }
      }

      for (let i = 0; i < locations.length; i++) {
        const countryCode = locations[i];
        for (let probe = 0; probe < 3; probe++) {
          try {
            const pingResult = await this.executeMeasurement(dominio, 'ping', countryCode, 1000 + i * 100 + probe);
            if (pingResult) {
              allResults.push(pingResult);
            }
          } catch (error) {
            console.error(`[GlobalPing] Ping measurement failed for ${countryCode}:`, error);
          }
        }
      }
      
      if (allResults.length === 0) {
        throw new Error(`Não foi possível obter dados reais do domínio ${dominio}.`);
      }

      return {
        resumo: `Diagnóstico completado com ${allResults.length} medições de ${locations.length} locais`,
        resultados: allResults,
        totalProbes: allResults.length,
      };
    } catch (error) {
      console.error('[GlobalPing] Erro:', error);
      throw error;
    }
  }

  private async executeMeasurement(target: string, type: 'dns' | 'ping', countryCode: string, probeId: number): Promise<ProbeResult | null> {
    const payload = { type, target, locations: [{ country: countryCode }] };
    try {
      const createResponse = await axios.post(`${GLOBALPING_API}/v1/measurements`, payload, {
        headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        timeout: 15000,
      });

      const measurementId = createResponse.data?.id;
      if (!measurementId) return null;

      const maxRetries = 30;
      let retries = 0;
      let fullResponse = null;

      while (retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const getResponse = await axios.get(`${GLOBALPING_API}/v1/measurements/${measurementId}`, {
          headers: { 'Authorization': `Bearer ${this.apiKey}` },
          timeout: 10000,
        });

        if (getResponse.data?.status === 'completed' || getResponse.data?.status === 'finished') {
          fullResponse = getResponse.data;
          break;
        }
        retries++;
      }

      if (!fullResponse) return null;

      if (type === 'dns') {
        const results = this.parseDNSResults(fullResponse, countryCode, probeId);
        return results.length > 0 ? results[0] : null;
      } else {
        const results = this.parsePingResults(fullResponse, target, countryCode, probeId);
        return results.length > 0 ? results[0] : null;
      }
    } catch (error) {
      return null;
    }
  }

  private parseDNSResults(response: any, countryCode: string, probeId: number): ProbeResult[] {
    try {
      const results: ProbeResult[] = [];
      const seenIps = new Set<string>();
      const resultsArray = response?.results || [];

      for (let i = 0; i < resultsArray.length; i++) {
        const resultObj = resultsArray[i];
        const result = resultObj.result;
        const probe = resultObj.probe || {};

        if (!result || result.error || !result.answers?.[0]) continue;

        const answer = result.answers[0];
        let ipAddress = answer.data || answer.address || '';
        
        if (!ipAddress || seenIps.has(ipAddress)) continue;
        seenIps.add(ipAddress);

        results.push({
          probe_id: probeId + i,
          region: countryCode,
          ip: ipAddress,
          asn: `AS${probe.asn || '15169'}`,
          isp: probe.network || `ISP Desconhecido`,
          acessibilidade: 'Acessível',
          latencia: result?.timeTaken ? `${Math.round(result.timeTaken)}ms` : '0ms',
          velocidade: 'Normal' as const,
          perda_pacotes: '0%',
          jitter: '0ms',
          status: 'OK' as const,
        });
      }
      return results;
    } catch (error) {
      return [];
    }
  }

  private parsePingResults(response: any, target: string, countryCode: string, probeId: number): ProbeResult[] {
    try {
      const results: ProbeResult[] = [];
      const seenIps = new Set<string>();
      const resultsArray = response?.results || [];

      for (let i = 0; i < resultsArray.length; i++) {
        const resultObj = resultsArray[i];
        const result = resultObj.result;
        const probe = resultObj.probe || {};

        if (!result) continue;

        let stats = result?.stats || (result.rawOutput ? this.parsePingOutput(result.rawOutput) : null);
        if (!stats || stats.avg <= 0 || stats.loss === 100) continue;

        const resolvedIp = stats.resolvedAddress || result?.resolvedAddress || 'N/A';
        if (seenIps.has(resolvedIp)) continue;
        seenIps.add(resolvedIp);

        results.push({
          probe_id: probeId + i,
          region: countryCode,
          ip: resolvedIp,
          asn: `AS${probe.asn || '15169'}`,
          isp: probe.network || `ISP Desconhecido`,
          acessibilidade: stats.avg > 200 ? 'Tempo lento' : 'Acessível',
          latencia: `${Math.round(stats.avg)}ms`,
          velocidade: stats.avg < 30 ? 'Rápida' : (stats.avg > 100 ? 'Lenta' : 'Normal'),
          perda_pacotes: `${stats.loss}%`,
          jitter: `${Math.round(stats.jitter || 0)}ms`,
          status: stats.avg > 500 ? 'ERRO' : (stats.avg > 200 ? 'AVISO' : 'OK'),
        });
      }
      return results;
    } catch (error) {
      return [];
    }
  }

  private parsePingOutput(rawOutput: string) {
    const resolvedMatch = rawOutput.match(/\((\d+\.\d+\.\d+\.\d+)\)/);
    const lossMatch = rawOutput.match(/(\d+)%\s+packet loss/);
    const avgMatch = rawOutput.match(/avg[=/\s]+(\d+\.?\d*)/);
    const stddevMatch = rawOutput.match(/stddev[=/\s]+(\d+\.?\d*)/);

    return {
      avg: avgMatch ? parseFloat(avgMatch[1]) : 0,
      loss: lossMatch ? parseInt(lossMatch[1]) : 0,
      jitter: stddevMatch ? parseFloat(stddevMatch[1]) : 0,
      resolvedAddress: resolvedMatch ? resolvedMatch[1] : undefined,
    };
  }

  private isValidDomain(dominio: string): boolean {
    return /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(dominio);
  }

  private getLocations(escopo: string, limite: number): string[] {
    const locations: { [key: string]: string[] } = {
      GLOBAL: ['US', 'DE', 'JP', 'BR', 'AU', 'SG', 'IN', 'CA', 'MX', 'GB'],
      BR: ['BR', 'BR', 'BR', 'BR', 'BR', 'BR', 'BR', 'BR', 'BR', 'BR'],
      AWS: ['US', 'DE', 'JP', 'BR', 'CA', 'US', 'DE', 'IN'],
      AZURE: ['US', 'DE', 'JP', 'BR', 'CA', 'GB', 'FR', 'DE'],
    };
    return (locations[escopo] || locations.GLOBAL).slice(0, limite);
  }
}
