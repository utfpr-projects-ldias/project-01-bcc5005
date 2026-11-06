import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { ArmazenamentoModule } from '../armazenamento/armazenamento.module.js';
import { ExclusaoContratoService } from './exclusao-contrato.service.js';
import { Contrato } from './contrato.entity.js';
import { ContratosController } from './contratos.controller.js';
import { ContratosService } from './contratos.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Contrato]),
    AuditoriaModule,
    ArmazenamentoModule,
  ],
  controllers: [ContratosController],
  providers: [ContratosService, ExclusaoContratoService],
  exports: [ContratosService],
})
export class ContratosModule {}