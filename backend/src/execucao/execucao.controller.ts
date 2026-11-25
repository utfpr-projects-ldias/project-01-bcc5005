import { Body, Controller, Get, Param, Patch, Post, Req, UsePipes, ValidationPipe } from '@nestjs/common';
import { ExigirPoliticaOperacional } from '../autorizacao/politica.decorator.js';
import type { RequisicaoAutorizada } from '../autorizacao/usuario-autenticado.js';
import { ExecucaoService } from './execucao.service.js';
import { AtualizarPesosDto } from './pesos.dto.js';
import { AtualizarPesoIndividualDto } from './peso-individual.dto.js';
import { AtualizarExecucaoDto } from './execucao.dto.js';
import { AtualizarModoCalculoDto } from './modo-calculo.dto.js';
@Controller('contratos/:contratoId')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class ExecucaoController {
  constructor(private readonly execucao: ExecucaoService) {}
  @Get('progresso')
  @ExigirPoliticaOperacional('execucao:visualizar', { tipo: 'contrato', parametro: 'contratoId' })
  consultar(@Param('contratoId') id: string) { return this.execucao.consultar(id); }
  /** Edição incremental de um único peso; exige a mesma ACL de configurar pesos. */
  @Patch('entregaveis/:entregavelId/peso')
  @ExigirPoliticaOperacional('pesos:atualizar', { tipo: 'contrato', parametro: 'contratoId' })
  pesoIndividual(@Param('contratoId') contratoId: string, @Param('entregavelId') entregavelId: string, @Body() dto: AtualizarPesoIndividualDto, @Req() req: RequisicaoAutorizada) {
    return this.execucao.atualizarPesoIndividual(contratoId, entregavelId, dto, req.usuarioDominio!);
  }
  @Patch('pesos')
  @ExigirPoliticaOperacional('pesos:atualizar', { tipo: 'contrato', parametro: 'contratoId' })
  pesos(@Param('contratoId') id: string, @Body() dto: AtualizarPesosDto, @Req() req: RequisicaoAutorizada) { return this.execucao.atualizarPesos(id,dto,req.usuarioDominio!); }
  @Patch('modo-calculo')
  @ExigirPoliticaOperacional('pesos:atualizar', { tipo: 'contrato', parametro: 'contratoId' })
  modo(@Param('contratoId') id: string, @Body() dto: AtualizarModoCalculoDto, @Req() req: RequisicaoAutorizada) {
    return this.execucao.atualizarModoCalculo(id, dto, req.usuarioDominio!);
  }
  /** Migração explícita de uma quantidade direta para registro por ocorrências, sem duplicar execução. */
  @Post('entregaveis/:entregavelId/execucao/usar-ocorrencias')
  @ExigirPoliticaOperacional('execucao:atualizar', { tipo: 'recurso', recurso: 'entregavel', parametro: 'entregavelId', parametroContratoPai: 'contratoId' })
  usarOcorrencias(@Param('contratoId') contratoId: string, @Param('entregavelId') id: string, @Req() req: RequisicaoAutorizada) {
    return this.execucao.usarOcorrencias(contratoId, id, req.usuarioDominio!);
  }
  @Patch('entregaveis/:entregavelId/execucao')
  @ExigirPoliticaOperacional('execucao:atualizar', { tipo: 'recurso', recurso: 'entregavel', parametro: 'entregavelId', parametroContratoPai: 'contratoId' })
  atualizar(@Param('contratoId') contratoId: string, @Param('entregavelId') id: string, @Body() dto: AtualizarExecucaoDto, @Req() req: RequisicaoAutorizada) {
    return this.execucao.atualizar(contratoId, id, dto, req.usuarioDominio!);
  }
}
