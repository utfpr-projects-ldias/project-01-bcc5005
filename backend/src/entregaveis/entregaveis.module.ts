import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { AutorizacaoModule } from '../autorizacao/autorizacao.module.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import { EntregaveisController } from './entregaveis.controller.js';
import { EntregaveisService } from './entregaveis.service.js';
import { Entregavel } from './entregavel.entity.js';
import { EvidenciaEsperada } from './evidencia-esperada.entity.js';

/** HU07-02 — endpoints protegidos pelo guard global e regras no serviço. */
@Module({
  imports: [
    TypeOrmModule.forFeature([Contrato, Etapa, Usuario, Entregavel, EvidenciaEsperada]),
    AuditoriaModule, AutorizacaoModule,
  ],
  controllers: [EntregaveisController],
  providers: [EntregaveisService],
})
export class EntregaveisModule {}
