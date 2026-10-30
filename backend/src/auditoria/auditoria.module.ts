import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditoriaService } from './auditoria.service.js';
import { EventoAuditoria } from './evento-auditoria.entity.js';
import { Etapa } from '../etapas/etapa.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([EventoAuditoria, Etapa])],
  providers: [AuditoriaService],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
