import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { AutorizacaoModule } from '../autorizacao/autorizacao.module.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { Ocorrencia } from './ocorrencia.entity.js';
import { ReplanejamentoService } from './replanejamento.service.js';
import { OcorrenciasService } from './ocorrencias.service.js';
import { OcorrenciasController } from './ocorrencias.controller.js';
import { ConfiguracaoOcorrencias } from './configuracao-ocorrencias.entity.js';
import { ConfiguracaoOcorrenciasController } from './configuracao-ocorrencias.controller.js';
import { ConfiguracaoOcorrenciasService } from './configuracao-ocorrencias.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ocorrencia, Entregavel, Contrato, ConfiguracaoOcorrencias]),
    AuditoriaModule,
    AutorizacaoModule,
  ],
  controllers: [OcorrenciasController, ConfiguracaoOcorrenciasController],
  providers: [OcorrenciasService, ReplanejamentoService, ConfiguracaoOcorrenciasService],
  exports: [OcorrenciasService],
})
export class OcorrenciasModule {}
