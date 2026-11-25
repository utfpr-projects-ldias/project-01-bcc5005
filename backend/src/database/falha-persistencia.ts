import { Logger } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

export function registrarFalhaPersistencia(contexto: string, erro: unknown): void {
  if (!(erro instanceof QueryFailedError)) return;
  const driver = (erro.driverError ?? {}) as { code?: string; constraint?: string };
  const codigo = /^[A-Z0-9]{5}$/.test(driver.code ?? '') ? driver.code : 'desconhecido';
  const restricao = /^[A-Za-z0-9_]{1,63}$/.test(driver.constraint ?? '') ? driver.constraint : 'não informada';
  new Logger(contexto).warn(`Falha PostgreSQL: SQLSTATE=${codigo}; restrição=${restricao}`);
}
