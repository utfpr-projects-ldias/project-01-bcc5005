import { Body, Controller, Get, Param, Patch, Post, Req, UsePipes, ValidationPipe } from '@nestjs/common';
import { ExigirPoliticaOperacional } from '../autorizacao/politica.decorator.js';
import type { RequisicaoAutorizada } from '../autorizacao/usuario-autenticado.js';
import { CriarMetaMarcoDto, EditarMetaMarcoDto, VincularMetaMarcoDto, DecidirVinculoMetaMarcoDto } from './metas-marco.dto.js';
import { MetasMarcoService } from './metas-marco.service.js';
const escopo = { tipo: 'contrato' as const, parametro: 'contratoId' };
@Controller('contratos/:contratoId/entregaveis/:entregavelId/metas')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class MetasMarcoController {
  constructor(private readonly metas: MetasMarcoService) {}
  @Get() @ExigirPoliticaOperacional('metas-marco:listar', escopo)
  listar(@Param('contratoId') c: string, @Param('entregavelId') e: string, @Req() req: RequisicaoAutorizada) {
    return this.metas.listar(c, e, req.usuarioDominio!);
  }
  @Post() @ExigirPoliticaOperacional('metas-marco:criar', escopo)
  criar(@Param('contratoId') c: string, @Param('entregavelId') e: string, @Body() dto: CriarMetaMarcoDto, @Req() req: RequisicaoAutorizada) {
    return this.metas.criar(c, e, dto, req.usuarioDominio!);
  }
  @Patch(':metaId') @ExigirPoliticaOperacional('metas-marco:editar', escopo)
  editar(@Param('contratoId') c: string, @Param('entregavelId') e: string, @Param('metaId') id: string,
    @Body() dto: EditarMetaMarcoDto, @Req() req: RequisicaoAutorizada) {
    return this.metas.editar(c, e, id, dto, req.usuarioDominio!);
  }
  @Get(':metaId/candidatos') @ExigirPoliticaOperacional('metas-marco:listar', escopo)
  candidatos(@Param('contratoId') c: string, @Param('entregavelId') e: string, @Param('metaId') id: string, @Req() req: RequisicaoAutorizada) {
    return this.metas.candidatos(c, e, id, req.usuarioDominio!);
  }
  @Post(':metaId/vinculos') @ExigirPoliticaOperacional('metas-marco:vincular', escopo)
  vincular(@Param('contratoId') c: string, @Param('entregavelId') e: string, @Param('metaId') id: string,
    @Body() dto: VincularMetaMarcoDto, @Req() req: RequisicaoAutorizada) {
    return this.metas.vincular(c, e, id, dto.registroId, req.usuarioDominio!);
  }
  @Post(':metaId/vinculos/:vinculoId/aprovar') @ExigirPoliticaOperacional('metas-marco:decidir', escopo)
  aprovar(@Param('contratoId') c: string, @Param('entregavelId') e: string, @Param('metaId') id: string,
    @Param('vinculoId') vinculo: string, @Body() dto: DecidirVinculoMetaMarcoDto, @Req() req: RequisicaoAutorizada) {
    return this.metas.decidir(c, e, id, vinculo, true, dto.justificativa, req.usuarioDominio!);
  }
  @Post(':metaId/vinculos/:vinculoId/rejeitar') @ExigirPoliticaOperacional('metas-marco:decidir', escopo)
  rejeitar(@Param('contratoId') c: string, @Param('entregavelId') e: string, @Param('metaId') id: string,
    @Param('vinculoId') vinculo: string, @Body() dto: DecidirVinculoMetaMarcoDto, @Req() req: RequisicaoAutorizada) {
    return this.metas.decidir(c, e, id, vinculo, false, dto.justificativa, req.usuarioDominio!);
  }
}
