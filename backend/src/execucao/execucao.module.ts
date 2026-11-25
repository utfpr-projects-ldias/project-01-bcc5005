import { LancamentosController } from './lancamentos.controller.js';
import { LancamentosService } from './lancamentos.service.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExecucaoLancamento } from './execucao-lancamento.entity.js';
import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { AutorizacaoModule } from '../autorizacao/autorizacao.module.js';
import { ExecucaoService } from './execucao.service.js';
import { ExecucaoController } from './execucao.controller.js';
@Module({ imports: [AuditoriaModule, AutorizacaoModule, TypeOrmModule.forFeature([ExecucaoLancamento])], providers: [ExecucaoService,LancamentosService], controllers: [ExecucaoController,LancamentosController], exports: [ExecucaoService] })
export class ExecucaoModule {}
