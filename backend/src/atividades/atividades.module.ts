import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutorizacaoModule } from '../autorizacao/autorizacao.module.js';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { AtividadeEntity } from './atividade.entity.js';
import { AtividadeCompartilhada } from './atividade-compartilhada.entity.js';
import { AtividadeCompartilhadaService } from './atividade-compartilhada.service.js';
import { AtividadeCompartilhadaController } from './atividade-compartilhada.controller.js';
import { AtividadesController } from './atividades.controller.js';
import { AtividadesService } from './atividades.service.js';
import { AtividadeComprovantesService } from './atividade-comprovantes.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([AtividadeEntity, AtividadeCompartilhada, Entregavel]), AutorizacaoModule, AuditoriaModule],
  providers: [AtividadesService, AtividadeComprovantesService, AtividadeCompartilhadaService],
  controllers: [AtividadesController, AtividadeCompartilhadaController],
})
export class AtividadesModule {}
