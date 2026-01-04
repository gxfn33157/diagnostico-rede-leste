import axios from 'axios';
import type { ProbeResult } from '@shared/schema';

const GLOBALPING_API = 'https://api.globalping.io';

export class GlobalpingService {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GLOBALPING_API_TOKEN || '';
  }

  async executeDiagnostico(dominio: string, escopo: string, limite: number) {
    try {
      const locations = this.getLocations(escopo, limite);
      let allResults: ProbeResult[] = [];
      const seenAsns = new Set<string>();
      const seenIps = new Set<string>();
      
      for (let i = 0; i < locations.length; i++) {
        const countryCode = locations[i];
        try {
          // Solicita 10 probes para ter candidatos suficientes para diversificar
          const dnsResults = await this.executeMeasurement(dominio, 'dns', countryCode, i * 100, 10);
          if (dnsResults) {
            for (const res of dnsResults) {
              if (!seenAsns.has(res.asn) && !seenIps.has(res.ip)) {
                allResults.push(res);
                seenAsns.add(res.asn);
                seenIps.add(res.ip);
                if (allResults.length >= limite) break;
              }
            }
          }
        } catch (error) {
          console.error(`[GlobalPing] DNS failed for ${countryCode}`);
        }
        if (allResults.length >= limite) break;
      }

      if (allResults.length < limite) {
        for (let i = 0; i < locations.length; i++) {
          const countryCode = locations[i];
          try {
            const pingResults = await this.executeMeasurement(dominio, 'ping', countryCode, 1000 + i * 100, 10);
            if (pingResults) {
              for (const res of pingResults) {
                if (!seenAsns.has(res.asn) && !seenIps.has(res.ip)) {
                  allResults.push(res);
                  seenAsns.add(res.asn);
                  seenIps.add(res.ip);
                  if (allResults.length >= limite) break;
                }
              }
            }
          } catch (error) {
            console.error(`[GlobalPing] Ping failed for ${countryCode}`);
          }
          if (allResults.length >= limite) break;
        }
      }
      
      if (allResults.length === 0) throw new Error("Sem dados reais obtidos.");
      return { resumo: `Sucesso: ${allResults.length} medições diversificadas`, resultados: allResults, totalProbes: allResults.length };
    } catch (error) { throw error; }
  }

  private async executeMeasurement(target: string, type: 'dns' | 'ping', countryCode: string, probeId: number, limit: number): Promise<ProbeResult[] | null> {
    try {
      const createResponse = await axios.post(`${GLOBALPING_API}/v1/measurements`, 
        { type, target, locations: [{ country: countryCode }], limit },
        { headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }, timeout: 15000 }
      );
      const measurementId = createResponse.data?.id;
      if (!measurementId) return null;

      let fullResponse = null;
      for (let r = 0; r < 20; r++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const getResponse = await axios.get(`${GLOBALPING_API}/v1/measurements/${measurementId}`);
        if (getResponse.data?.status === 'completed' || getResponse.data?.status === 'finished') {
          fullResponse = getResponse.data;
          break;
        }
      }
      if (!fullResponse) return null;
      return type === 'dns' ? this.parseDNSResults(fullResponse, countryCode, probeId) : this.parsePingResults(fullResponse, target, countryCode, probeId);
    } catch (error) { return null; }
  }

  private parseDNSResults(response: any, countryCode: string, probeId: number): ProbeResult[] {
    const results: ProbeResult[] = [];
    (response?.results || []).forEach((resObj: any, i: number) => {
      const result = resObj.result;
      const probe = resObj.probe || {};
      const ip = result?.answers?.[0]?.data || result?.answers?.[0]?.address;
      if (ip) {
        results.push({
          probe_id: probeId + i, region: countryCode, ip, 
          asn: `AS${probe.asn || 'Unknown'}`, isp: probe.network || 'ISP Desconhecido',
          acessibilidade: 'Acessível', latencia: `${Math.round(result.timeTaken || 0)}ms`,
          velocidade: 'Normal', perda_pacotes: '0%', jitter: '0ms', status: 'OK'
        });
      }
    });
    return results;
  }

  private parsePingResults(response: any, target: string, countryCode: string, probeId: number): ProbeResult[] {
    const results: ProbeResult[] = [];
    (response?.results || []).forEach((resObj: any, i: number) => {
      const result = resObj.result;
      const probe = resObj.probe || {};
      const stats = result?.stats || (result?.rawOutput ? this.parsePingOutput(result.rawOutput) : null);
      if (stats && stats.loss < 100) {
        results.push({
          probe_id: probeId + i, region: countryCode, ip: stats.resolvedAddress || 'N/A',
          asn: `AS${probe.asn || 'Unknown'}`, isp: probe.network || 'ISP Desconhecido',
          acessibilidade: 'Acessível', latencia: `${Math.round(stats.avg)}ms`,
          velocidade: stats.avg < 50 ? 'Rápida' : 'Normal', perda_pacotes: `${stats.loss}%`,
          jitter: `${Math.round(stats.jitter || 0)}ms`, status: 'OK'
        });
      }
    });
    return results;
  }

  private parsePingOutput(raw: string) {
    const avg = raw.match(/avg[=/\s]+(\d+\.?\d*)/);
    const loss = raw.match(/(\d+)%\s+packet loss/);
    const resolved = raw.match(/\((\d+\.\d+\.\d+\.\d+)\)/);
    return { avg: avg ? parseFloat(avg[1]) : 0, loss: loss ? parseInt(loss[1]) : 0, jitter: 0, resolvedAddress: resolved ? resolved[1] : undefined };
  }

  private getLocations(escopo: string, limite: number) {
    const locs: any = { GLOBAL: ['US', 'DE', 'JP', 'BR', 'AU', 'SG'], BR: ['BR'] };
    return locs[escopo] || locs.GLOBAL;
  }
}
