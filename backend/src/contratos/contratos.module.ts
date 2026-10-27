import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { Contrato } from './contrato.entity.js';
import { ContratosController } from './contratos.controller.js';
import { ContratosService } from './contratos.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Contrato]),
    AuditoriaModule,
  ],
  controllers: [ContratosController],
  providers: [ContratosService],
  exports: [ContratosService],
})
export class ContratosModule {}