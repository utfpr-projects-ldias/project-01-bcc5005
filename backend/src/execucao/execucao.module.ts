import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { AutorizacaoModule } from '../autorizacao/autorizacao.module.js';
import { ExecucaoService } from './execucao.service.js';
import { ExecucaoController } from './execucao.controller.js';
@Module({ imports: [AuditoriaModule, AutorizacaoModule], providers: [ExecucaoService], controllers: [ExecucaoController] })
export class ExecucaoModule {}
