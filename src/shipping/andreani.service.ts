import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

/**
 * Integración genérica contra la API Andreani.
 * Rutas exactas dependen del producto/contrato: ajuste ANDREANI_* en .env.
 */
@Injectable()
export class AndreaniService {
  private readonly logger = new Logger(AndreaniService.name);

  constructor(private readonly config: ConfigService) {}

  private client(): AxiosInstance {
    const baseURL = this.config.get<string>('ANDREANI_BASE_URL');
    const key = this.config.get<string>('ANDREANI_API_KEY');
    if (!baseURL?.trim()) {
      throw new ServiceUnavailableException('Andreani: falta ANDREANI_BASE_URL');
    }
    return axios.create({
      baseURL: baseURL.replace(/\/$/, ''),
      timeout: 20_000,
      headers: {
        ...(key ? { 'x-api-key': key } : {}),
        'Content-Type': 'application/json',
      },
      auth:
        this.config.get<string>('ANDREANI_USERNAME') && this.config.get<string>('ANDREANI_PASSWORD')
          ? {
              username: this.config.get<string>('ANDREANI_USERNAME')!,
              password: this.config.get<string>('ANDREANI_PASSWORD')!,
            }
          : undefined,
    });
  }

  isConfigured(): boolean {
    return Boolean(this.config.get('ANDREANI_BASE_URL')?.trim());
  }

  /**
   * Ejemplo: cotización estándar. Reemplazar `path` por el definido para su cuenta.
   */
  async quoteTariff(originZip: string, destinationZip: string, weightKg?: number) {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Andreani no configurado');
    }
    const path = this.config.get<string>('ANDREANI_QUOTE_PATH') ?? '/v1/tarifas/cotizar';
    try {
      const { data } = await this.client().post(path, {
        origen: { codigoPostal: originZip },
        destino: { codigoPostal: destinationZip },
        peso: weightKg ?? 1,
      });
      return data;
    } catch (e) {
      this.logger.warn('Fallo cotización Andreani', e instanceof Error ? e.message : e);
      throw new ServiceUnavailableException('No se pudo cotizar envío con Andreani');
    }
  }

  /**
   * Crear envío: normalmente requiere datos del destinatario y bultos según documentación oficial.
   */
  async createShipment(orderId: string, body: Record<string, unknown>) {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Andreani no configurado');
    }
    const path = this.config.get<string>('ANDREANI_CREATE_SHIPMENT_PATH') ?? '/v1/envios';
    try {
      const { data } = await this.client().post(path, {
        ordenExternaId: orderId,
        ...body,
      });
      return data;
    } catch (e) {
      this.logger.warn(`Fallo alta envío Andreani orden=${orderId}`, e instanceof Error ? e.message : e);
      throw new ServiceUnavailableException('No se pudo crear envío en Andreani');
    }
  }
}
