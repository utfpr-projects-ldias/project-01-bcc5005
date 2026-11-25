import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutorizacaoModule } from '../autorizacao/autorizacao.module.js';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { MetaMarco, VinculoMetaMarco } from './meta-marco.entity.js';
import { MetasMarcoController } from './metas-marco.controller.js';
import { MetasMarcoService } from './metas-marco.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([MetaMarco, VinculoMetaMarco]),
    AutorizacaoModule,
    AuditoriaModule,
  ],
  controllers: [MetasMarcoController],
  providers: [MetasMarcoService],
})
export class MetasMarcoModule {}
