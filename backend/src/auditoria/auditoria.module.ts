import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditoriaService } from './auditoria.service.js';
import { EventoAuditoria } from './evento-auditoria.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([EventoAuditoria])],
  providers: [AuditoriaService],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
