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
      
      // Execute DNS measurements
      for (let i = 0; i < locations.length; i++) {
        const countryCode = locations[i];
        try {
          const dnsResult = await this.executeMeasurement(dominio, 'dns', countryCode, i);
          if (dnsResult) {
            allResults.push(dnsResult);
          }
        } catch (error) {
          console.error(`[GlobalPing] DNS measurement failed for ${countryCode}:`, error);
        }
      }

      // Execute Ping measurements
      for (let i = 0; i < locations.length; i++) {
        const countryCode = locations[i];
        try {
          const pingResult = await this.executeMeasurement(dominio, 'ping', countryCode, i + 100);
          if (pingResult) {
            allResults.push(pingResult);
          }
        } catch (error) {
          console.error(`[GlobalPing] Ping measurement failed for ${countryCode}:`, error);
        }
      }
      
      if (allResults.length === 0) {
        throw new Error(`Não foi possível obter dados reais do domínio ${dominio}. Verifique se ele existe ou tente novamente.`);
      }

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

  private async executeMeasurement(target: string, type: 'dns' | 'ping', countryCode: string, probeId: number): Promise<ProbeResult | null> {
    const payload = {
      type,
      target,
      locations: [{ country: countryCode }],
    };

    console.log(`[GlobalPing ${type.toUpperCase()}] Enviando para ${countryCode}:`, JSON.stringify(payload));

    try {
      // Step 1: Send measurement request (returns 202 Accepted)
      const createResponse = await axios.post(
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

      console.log(`[GlobalPing ${type.toUpperCase()}] Status ${createResponse.status} de ${countryCode}`);

      // Extract measurement ID from response
      const measurementId = createResponse.data?.id;
      if (!measurementId) {
        console.error(`[GlobalPing ${type.toUpperCase()}] No measurement ID returned for ${countryCode}`);
        return null;
      }

      console.log(`[GlobalPing ${type.toUpperCase()}] Measurement ID: ${measurementId}`);

      // Step 2: Poll for results (wait up to 10 seconds)
      const maxRetries = 30;
      let retries = 0;
      let fullResponse = null;

      while (retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms between polls
        
        try {
          const getResponse = await axios.get(
            `${GLOBALPING_API}/v1/measurements/${measurementId}`,
            {
              headers: {
                'Authorization': `Bearer ${this.apiKey}`,
              },
              timeout: 10000,
            }
          );

          console.log(`[GlobalPing ${type.toUpperCase()}] Poll attempt ${retries + 1}: status=${getResponse.data?.status}`);

          if (getResponse.data?.status === 'completed' || getResponse.data?.status === 'finished') {
            fullResponse = getResponse.data;
            console.log(`[GlobalPing ${type.toUpperCase()}] Got result for ${countryCode}:`, JSON.stringify(fullResponse).substring(0, 400));
            break;
          }
        } catch (pollError) {
          console.error(`[GlobalPing ${type.toUpperCase()}] Poll error:`, pollError);
        }

        retries++;
      }

      if (!fullResponse) {
        console.error(`[GlobalPing ${type.toUpperCase()}] No result after ${maxRetries} retries for ${countryCode}`);
        return null;
      }

      // Step 3: Parse result based on type
      if (type === 'dns') {
        return this.parseDNSResult(fullResponse, countryCode, probeId);
      } else {
        return this.parsePingResult(fullResponse, target, countryCode, probeId);
      }

    } catch (error: any) {
      console.error(`[GlobalPing ${type.toUpperCase()}] Error for ${countryCode}:`,
        error.response?.status,
        JSON.stringify(error.response?.data || error.message)
      );
      return null;
    }
  }

  private parseDNSResult(response: any, countryCode: string, probeId: number): ProbeResult | null {
    try {
      // Extract first result from the array
      const resultObj = response?.results?.[0];
      if (!resultObj) {
        console.log(`[GlobalPing DNS] No results array for ${countryCode}`);
        return null;
      }

      const result = resultObj.result;
      const probe = resultObj.probe || {};

      if (!result) {
        console.log(`[GlobalPing DNS] No result field in results[0] for ${countryCode}`);
        return null;
      }

      // Extract DNS answers
      const answers = result?.answers || [];
      if (answers.length === 0) {
        console.log(`[GlobalPing DNS] No answers in result for ${countryCode}`);
        return null;
      }

      const answer = answers[0];

      return {
        probe_id: probeId,
        region: countryCode,
        ip: answer.data || 'N/A',
        asn: `AS${probe.asn || '15169'}`,
        isp: probe.network || `ISP ${countryCode}`,
        reverse_dns: answer.data || 'N/A',
        latencia: result?.timeTaken ? `${Math.round(result.timeTaken)}ms` : '0ms',
        status: 'OK',
      };
    } catch (error) {
      console.error(`[GlobalPing DNS] Parse error for ${countryCode}:`, error);
      return null;
    }
  }

  private parsePingResult(response: any, target: string, countryCode: string, probeId: number): ProbeResult | null {
    try {
      // Extract first result from the array
      const resultObj = response?.results?.[0];
      if (!resultObj) {
        console.log(`[GlobalPing Ping] No results array for ${countryCode}`);
        return null;
      }

      const result = resultObj.result;
      const probe = resultObj.probe || {};

      if (!result) {
        console.log(`[GlobalPing Ping] No result field in results[0] for ${countryCode}`);
        return null;
      }

      // Try to parse stats first, otherwise extract from rawOutput
      let stats = result?.stats;
      
      if (!stats && result?.rawOutput) {
        // Parse ping raw output to extract latency and packet loss
        stats = this.parsePingOutput(result.rawOutput);
      }

      if (!stats) {
        console.log(`[GlobalPing Ping] No stats data for ${countryCode}`);
        return null;
      }

      const avgLatency = stats.avg || 0;

      return {
        probe_id: probeId,
        region: countryCode,
        ip: stats.resolvedAddress || result?.resolvedAddress || 'N/A',
        asn: `AS${probe.asn || '15169'}`,
        isp: probe.network || `ISP ${countryCode}`,
        reverse_dns: target,
        latencia: `${Math.round(avgLatency)}ms`,
        velocidade: avgLatency < 30 ? 'Rápida' : avgLatency < 60 ? 'Normal' : 'Lenta',
        perda_pacotes: `${stats.loss || 0}%`,
        status: avgLatency > 0 ? 'OK' : 'ERRO',
      };
    } catch (error) {
      console.error(`[GlobalPing Ping] Parse error for ${countryCode}:`, error);
      return null;
    }
  }

  private parsePingOutput(rawOutput: string): { avg: number; loss: number; resolvedAddress?: string } | null {
    try {
      // Example: "PING google.com (172.217.12.46) 56(84) bytes of data.
      // 64 bytes from 172.217.12.46: icmp_seq=1 ttl=119 time=8.77 ms
      // --- google.com statistics ---
      // 4 packets transmitted, 4 received, 0% packet loss, time 3005ms
      // rtt min/avg/max/stddev = 8.77/9.55/10.28/0.63 ms"

      const resolvedMatch = rawOutput.match(/\((\d+\.\d+\.\d+\.\d+)\)/);
      const resolvedAddress = resolvedMatch ? resolvedMatch[1] : undefined;

      const lossMatch = rawOutput.match(/(\d+)%\s+packet loss/);
      const loss = lossMatch ? parseInt(lossMatch[1]) : 0;

      const avgMatch = rawOutput.match(/avg[=/\s]+(\d+\.?\d*)/);
      const avg = avgMatch ? parseFloat(avgMatch[1]) : 0;

      return {
        avg,
        loss,
        resolvedAddress,
      };
    } catch (error) {
      console.error('[GlobalPing] Parse ping output error:', error);
      return null;
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
}
