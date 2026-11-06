import { Module } from '@nestjs/common';
import { ArmazenamentoModule } from '../armazenamento/armazenamento.module.js';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { ExclusaoPlanejamentoService } from './exclusao-planejamento.service.js';
@Module({
  imports: [ArmazenamentoModule, AuditoriaModule],
  providers: [ExclusaoPlanejamentoService],
  exports: [ExclusaoPlanejamentoService],
})
export class ExclusaoPlanejamentoModule {}
