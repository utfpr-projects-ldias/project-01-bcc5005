import { BadRequestException } from '@nestjs/common';
import { uuidValido } from '../autorizacao/politicas-operacionais.js';
export function idsVinculadosEnvio(valor?: string): string[] {
  if (valor === undefined) return [];
  if (typeof valor !== 'string' || valor.length > 3699) throw new BadRequestException('Lista de vínculos inválida.');
  const ids=valor.split(',').map(id=>id.trim().toLowerCase());
  if(ids.length>100 || ids.some(id=>!uuidValido(id)) || new Set(ids).size!==ids.length) throw new BadRequestException('Selecione até 100 vínculos válidos e distintos.');
  return ids;
}
