import axios from 'axios';
import type { ProbeResult } from '@shared/schema';

const RIPE_ATLAS_API = 'https://atlas.ripe.net/api/v2';

interface RipeAtlasProbe {
  id: number;
  address_v4?: string;
  country_code: string;
  asn_v4?: number;
  tags?: string[];
  geometry?: {
    coordinates: [number, number];
  };
}

interface RipeMeasurementResult {
  from: string;
  dst_addr?: string;
  min?: number;
  avg?: number;
  max?: number;
  error?: string;
}

export class RipeAtlasService {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.RIPE_ATLAS_API_KEY || '';
    console.log('[RIPE Service] API Key configured:', this.apiKey ? 'YES' : 'NO (usando mock)');
  }

  async selectProbes(escopo: string, limite: number): Promise<RipeAtlasProbe[]> {
    try {
      const params: any = {
        status: 'connected',
        limit: limite,
      };

      // Configure scope
      if (escopo === 'BR') {
        params.country_code = 'BR';
      } else if (escopo === 'AWS') {
        params.tags = 'aws';
      } else if (escopo === 'AZURE') {
        params.tags = 'azure';
      }
      // GLOBAL = no extra filters

      console.log('[RIPE] Buscando probes com params:', params);
      const response = await axios.get(`${RIPE_ATLAS_API}/probes/`, { 
        params,
        headers: this.apiKey ? { Authorization: `Key ${this.apiKey}` } : {}
      });
      console.log('[RIPE] Probes encontradas:', response.data.results?.length || 0);
      return response.data.results || [];
    } catch (error: any) {
      console.error('[RIPE] Erro ao buscar probes:', error.response?.status, error.message);
      return [];
    }
  }

  async createDNSMeasurement(domain: string, probeIds: number[]): Promise<number | null> {
    if (!this.apiKey) {
      console.warn('RIPE Atlas API Key não configurada');
      return null;
    }

    try {
      const response = await axios.post(
        `${RIPE_ATLAS_API}/measurements/`,
        {
          definitions: [
            {
              target: domain,
              type: 'dns',
              af: 4,
              query_class: 'IN',
              query_type: 'A',
              is_oneoff: true,
            },
          ],
          probes: [
            {
              requested: probeIds.length,
              type: 'probes',
              value: probeIds.join(','),
            },
          ],
        },
        {
          headers: {
            Authorization: `Key ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data.measurements?.[0] || null;
    } catch (error) {
      console.error('Erro ao criar medição DNS:', error);
      return null;
    }
  }

  async createPingMeasurement(target: string, probeIds: number[]): Promise<number | null> {
    if (!this.apiKey) {
      console.warn('RIPE Atlas API Key não configurada');
      return null;
    }

    try {
      const response = await axios.post(
        `${RIPE_ATLAS_API}/measurements/`,
        {
          definitions: [
            {
              target: target,
              type: 'ping',
              af: 4,
              packets: 3,
              is_oneoff: true,
            },
          ],
          probes: [
            {
              requested: probeIds.length,
              type: 'probes',
              value: probeIds.join(','),
            },
          ],
        },
        {
          headers: {
            Authorization: `Key ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data.measurements?.[0] || null;
    } catch (error) {
      console.error('Erro ao criar medição Ping:', error);
      return null;
    }
  }

  async getMeasurementResults(measurementId: number): Promise<RipeMeasurementResult[]> {
    try {
      const response = await axios.get(
        `${RIPE_ATLAS_API}/measurements/${measurementId}/results/`
      );
      return response.data || [];
    } catch (error) {
      console.error('Erro ao obter resultados:', error);
      return [];
    }
  }

  async waitForResults(measurementId: number, maxWaitSeconds: number = 60): Promise<RipeMeasurementResult[]> {
    const startTime = Date.now();
    const pollInterval = 3000; // 3 seconds

    while ((Date.now() - startTime) < maxWaitSeconds * 1000) {
      const results = await this.getMeasurementResults(measurementId);
      if (results.length > 0) {
        return results;
      }
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return [];
  }

  async resolveReverseDNS(ip: string): Promise<string> {
    try {
      const response = await axios.get(`https://dns.google/resolve?name=${ip}&type=PTR`);
      const answer = response.data?.Answer?.[0]?.data;
      return answer || 'N/A';
    } catch (error) {
      return 'N/A';
    }
  }

  async getASNInfo(asn: number): Promise<{ isp: string }> {
    try {
      const response = await axios.get(`https://stat.ripe.net/data/as-overview/data.json?resource=AS${asn}`);
      const holder = response.data?.data?.holder || 'Unknown ISP';
      return { isp: holder };
    } catch (error) {
      return { isp: 'Unknown ISP' };
    }
  }

  async executeDiagnostico(dominio: string, escopo: string, limite: number): Promise<{
    totalProbes: number;
    resumo: string;
    resultados: ProbeResult[];
  }> {
    // Get probes
    const probes = await this.selectProbes(escopo, limite);
    
    if (probes.length === 0) {
      return {
        totalProbes: 0,
        resumo: 'Nenhuma probe disponível para este escopo.',
        resultados: [],
      };
    }

    // If no API key, return mock data
    if (!this.apiKey) {
      return this.generateMockResults(dominio, escopo, probes);
    }

    // Create DNS measurement
    const probeIds = probes.map(p => p.id);
    const dnsId = await this.createDNSMeasurement(dominio, probeIds);
    
    if (!dnsId) {
      return this.generateMockResults(dominio, escopo, probes);
    }

    // Wait for DNS results
    const dnsResults = await this.waitForResults(dnsId);
    
    // Process results
    const resultados: ProbeResult[] = await Promise.all(
      dnsResults.slice(0, 50).map(async (result, index) => {
        const probe = probes.find(p => p.id.toString() === result.from) || probes[index];
        const ip = result.dst_addr || probe.address_v4 || '0.0.0.0';
        const asn = probe.asn_v4 || 0;
        
        const [reverseDns, asnInfo] = await Promise.all([
          this.resolveReverseDNS(ip),
          asn > 0 ? this.getASNInfo(asn) : Promise.resolve({ isp: 'Unknown' })
        ]);

        return {
          probe_id: probe.id,
          region: `${probe.country_code}`,
          ip: ip,
          asn: asn > 0 ? `AS${asn}` : 'N/A',
          isp: asnInfo.isp,
          reverse_dns: reverseDns,
          latencia: result.avg ? `${result.avg.toFixed(2)}ms` : 'N/A',
          status: result.error ? 'ERRO' : 'OK',
        };
      })
    );

    const okCount = resultados.filter(r => r.status === 'OK').length;
    
    return {
      totalProbes: probes.length,
      resumo: `Diagnóstico ${escopo} concluído. ${okCount}/${resultados.length} probes responderam com sucesso.`,
      resultados,
    };
  }

  private generateMockResults(dominio: string, escopo: string, probes: RipeAtlasProbe[]): {
    totalProbes: number;
    resumo: string;
    resultados: ProbeResult[];
  } {
    const sampleSize = Math.min(probes.length, 10);
    const resultados: ProbeResult[] = probes.slice(0, sampleSize).map(probe => ({
      probe_id: probe.id,
      region: `${probe.country_code}`,
      ip: probe.address_v4 || `192.0.2.${Math.floor(Math.random() * 255)}`,
      asn: probe.asn_v4 ? `AS${probe.asn_v4}` : 'N/A',
      isp: 'Sample ISP (Mock Data)',
      reverse_dns: `host-${probe.id}.example.net`,
      latencia: `${Math.floor(Math.random() * 200 + 10)}ms`,
      status: Math.random() > 0.1 ? 'OK' : 'ERRO',
    }));

    return {
      totalProbes: probes.length,
      resumo: `[MOCK] Diagnóstico simulado para ${dominio} (${escopo}). Configure RIPE_ATLAS_API_KEY para testes reais.`,
      resultados,
    };
  }
}
