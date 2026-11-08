import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { Etapa } from './etapa.entity.js';
import { EtapasController } from './etapas.controller.js';
import { EtapasService } from './etapas.service.js';
import { ExclusaoPlanejamentoModule } from '../entregaveis/exclusao-planejamento.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([Contrato, Etapa]), AuditoriaModule, ExclusaoPlanejamentoModule],
  controllers: [EtapasController],
  providers: [EtapasService],
})
export class EtapasModule {}
