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
      
      // Execute DNS measurements (3 probes per location for ISP/ASN diversity)
      for (let i = 0; i < locations.length; i++) {
        const countryCode = locations[i];
        for (let probe = 0; probe < 3; probe++) {
          try {
            const dnsResult = await this.executeMeasurement(dominio, 'dns', countryCode, i * 100 + probe);
            if (dnsResult) {
              allResults.push(dnsResult);
            }
          } catch (error) {
            console.error(`[GlobalPing] DNS measurement failed for ${countryCode} (probe ${probe}):`, error);
          }
        }
      }

      // Execute Ping measurements (3 probes per location for ISP/ASN diversity)
      for (let i = 0; i < locations.length; i++) {
        const countryCode = locations[i];
        for (let probe = 0; probe < 3; probe++) {
          try {
            const pingResult = await this.executeMeasurement(dominio, 'ping', countryCode, 1000 + i * 100 + probe);
            if (pingResult) {
              allResults.push(pingResult);
            }
          } catch (error) {
            console.error(`[GlobalPing] Ping measurement failed for ${countryCode} (probe ${probe}):`, error);
          }
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

    console.log(`[GlobalPing ${type.toUpperCase()}] Enviando para ${countryCode} (probe ${probeId}):`, JSON.stringify(payload));

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

      // Step 3: Parse results based on type (handle multiple probes)
      if (type === 'dns') {
        // For DNS, process all results to get different IPs from different ISPs
        const results = this.parseDNSResults(fullResponse, countryCode, probeId);
        return results.length > 0 ? results[0] : null; // Return first, but could return multiple
      } else {
        // For Ping, process all results to get different latencies from different ISPs
        const results = this.parsePingResults(fullResponse, target, countryCode, probeId);
        return results.length > 0 ? results[0] : null; // Return first, but could return multiple
      }

    } catch (error: any) {
      console.error(`[GlobalPing ${type.toUpperCase()}] Error for ${countryCode}:`,
        error.response?.status,
        JSON.stringify(error.response?.data || error.message)
      );
      return null;
    }
  }

  private parseDNSResults(response: any, countryCode: string, probeId: number): ProbeResult[] {
    try {
      const results: ProbeResult[] = [];
      const seenIps = new Set<string>(); // Track IPs to avoid duplicates
      
      const resultsArray = response?.results || [];
      console.log(`[GlobalPing DNS] Processing ${resultsArray.length} results for ${countryCode}`);

      for (let i = 0; i < resultsArray.length; i++) {
        const resultObj = resultsArray[i];
        const result = resultObj.result;
        const probe = resultObj.probe || {};

        if (!result || result.error) {
          console.log(`[GlobalPing DNS] Skipping result ${i}: no result or error`);
          continue;
        }

        // Extract DNS answers
        const answers = result?.answers || [];
        if (answers.length === 0) continue;

        const answer = answers[0];
        let ipAddress = answer.data || answer.address || '';
        
        // Validate IP format
        const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
        const ipv6Regex = /^([a-f0-9]{0,4}:){2,7}[a-f0-9]{0,4}$/i;

        if (!ipAddress || (!ipv4Regex.test(ipAddress) && !ipv6Regex.test(ipAddress))) {
          console.log(`[GlobalPing DNS] Invalid IP for probe ${i}: ${ipAddress}`);
          continue;
        }

        // Skip if IP already seen
        if (seenIps.has(ipAddress)) {
          console.log(`[GlobalPing DNS] Duplicate IP for ${countryCode}: ${ipAddress}`);
          continue;
        }

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

        console.log(`[GlobalPing DNS] Added result ${i} from ${probe.network} (AS${probe.asn}): ${ipAddress}`);
      }

      return results;
    } catch (error) {
      console.error(`[GlobalPing DNS] Parse error for ${countryCode}:`, error);
      return [];
    }
  }

  private parsePingResults(response: any, target: string, countryCode: string, probeId: number): ProbeResult[] {
    try {
      const results: ProbeResult[] = [];
      const seenIps = new Set<string>(); // Track IPs to avoid duplicates
      
      const resultsArray = response?.results || [];
      console.log(`[GlobalPing Ping] Processing ${resultsArray.length} results for ${countryCode}`);

      for (let i = 0; i < resultsArray.length; i++) {
        const resultObj = resultsArray[i];
        const result = resultObj.result;
        const probe = resultObj.probe || {};

        if (!result) {
          console.log(`[GlobalPing Ping] Skipping result ${i}: no result field`);
          continue;
        }

        // Try to parse stats first, otherwise extract from rawOutput
        let stats = result?.stats;
        
        if (!stats && result?.rawOutput) {
          stats = this.parsePingOutput(result.rawOutput);
        }

        if (!stats) {
          console.log(`[GlobalPing Ping] Skipping result ${i}: no stats data`);
          continue;
        }

        const avgLatency = stats.avg || 0;
        const loss = stats.loss || 0;
        const resolvedIp = stats.resolvedAddress || result?.resolvedAddress || 'N/A';
        const jitter = stats.jitter || 0;

        // Reject if ping failed (0 latency, 100% loss, or error status)
        if (avgLatency <= 0 || loss === 100) {
          console.log(`[GlobalPing Ping] Rejected failed ping for result ${i}: latency=${avgLatency}ms, loss=${loss}%`);
          continue;
        }

        // Skip if IP already seen
        if (seenIps.has(resolvedIp)) {
          console.log(`[GlobalPing Ping] Duplicate IP for ${countryCode}: ${resolvedIp}`);
          continue;
        }

        seenIps.add(resolvedIp);

        // Determine status and acessibilidade based on latency and loss
        let statusCode: 'OK' | 'AVISO' | 'ERRO' = 'OK';
        let acessibilidade = 'Acessível';
        
        if (avgLatency > 200 || loss > 5) {
          statusCode = 'AVISO';
          acessibilidade = 'Tempo lento';
        }
        if (loss > 10) {
          statusCode = 'AVISO';
          acessibilidade = 'Conexão instável';
        }
        if (avgLatency > 500 || loss > 20) {
          statusCode = 'ERRO';
          acessibilidade = 'Inacessível - Problema de conectividade';
        }

        // High jitter impacts voice quality
        if (jitter > 50) {
          if (statusCode === 'OK') statusCode = 'AVISO';
          acessibilidade = 'Qualidade de áudio ruim (jitter alto)';
        }

        // Determine velocidade
        let velocidade: 'Rápida' | 'Normal' | 'Lenta' = 'Normal';
        if (avgLatency < 30) velocidade = 'Rápida';
        if (avgLatency > 100) velocidade = 'Lenta';

        results.push({
          probe_id: probeId + i,
          region: countryCode,
          ip: resolvedIp,
          asn: `AS${probe.asn || '15169'}`,
          isp: probe.network || `ISP Desconhecido`,
          acessibilidade: acessibilidade,
          latencia: `${Math.round(avgLatency)}ms`,
          velocidade: velocidade,
          perda_pacotes: `${loss}%`,
          jitter: `${Math.round(jitter)}ms`,
          status: statusCode,
        });

        console.log(`[GlobalPing Ping] Added result ${i} from ${probe.network} (AS${probe.asn}): ${resolvedIp}, latency=${avgLatency}ms, jitter=${jitter}ms`);
      }

      return results;
    } catch (error) {
      console.error(`[GlobalPing Ping] Parse error for ${countryCode}:`, error);
      return [];
    }
  }

  private parsePingOutput(rawOutput: string): { avg: number; loss: number; jitter: number; resolvedAddress?: string } | null {
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

      // Extract jitter (stddev) - important for VoIP quality
      const stddevMatch = rawOutput.match(/stddev[=/\s]+(\d+\.?\d*)/);
      const jitter = stddevMatch ? parseFloat(stddevMatch[1]) : 0;

      return {
        avg,
        loss,
        jitter,
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
