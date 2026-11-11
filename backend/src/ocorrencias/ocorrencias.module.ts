import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { AutorizacaoModule } from '../autorizacao/autorizacao.module.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { Ocorrencia } from './ocorrencia.entity.js';
import { OcorrenciasService } from './ocorrencias.service.js';
import { OcorrenciasController } from './ocorrencias.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ocorrencia, Entregavel, Contrato]),
    AuditoriaModule,
    AutorizacaoModule,
  ],
  controllers: [OcorrenciasController],
  providers: [OcorrenciasService],
  exports: [OcorrenciasService],
})
export class OcorrenciasModule {}
