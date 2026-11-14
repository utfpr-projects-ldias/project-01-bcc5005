import { Module } from '@nestjs/common';
import { AutorizacaoModule } from '../autorizacao/autorizacao.module.js';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { MetasMarcoController } from './metas-marco.controller.js';
import { MetasMarcoService } from './metas-marco.service.js';
@Module({ imports: [AutorizacaoModule, AuditoriaModule], controllers: [MetasMarcoController], providers: [MetasMarcoService] })
export class MetasMarcoModule {}
