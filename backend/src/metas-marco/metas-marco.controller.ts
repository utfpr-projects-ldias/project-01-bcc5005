import { CriarLancamentoDto, CorrigirLancamentoDto, DecidirLancamentoDto } from '../execucao/lancamentos.dto.js';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UsePipes, ValidationPipe } from '@nestjs/common';
import { ExigirPoliticaOperacional } from '../autorizacao/politica.decorator.js';
import type { RequisicaoAutorizada } from '../autorizacao/usuario-autenticado.js';
import { CriarMetaMarcoDto, EditarMetaMarcoDto, VincularMetaMarcoDto, TransicaoMetaMarcoDto } from './metas-marco.dto.js';
import { MetasMarcoService } from './metas-marco.service.js';
import type { TipoRegistroMeta } from './meta-marco.entity.js';
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
  candidatos(@Param('contratoId') c:string,@Param('entregavelId') e:string,@Param('metaId') id:string,@Query('tipo') tipo:TipoRegistroMeta,@Req() req:RequisicaoAutorizada){return this.metas.candidatos(c,e,id,tipo,req.usuarioDominio!);}
  @Post(':metaId/manuais') @ExigirPoliticaOperacional('metas-marco:registrar-manual',escopo)
  registrarManual(@Param('contratoId') c:string,@Param('entregavelId') e:string,@Param('metaId') id:string,@Body() dto:CriarLancamentoDto,@Req() req:RequisicaoAutorizada){return this.metas.executarManual(c,e,id,'criar',req.usuarioDominio!,dto);}
  @Patch(':metaId/manuais/:lancamentoId') @ExigirPoliticaOperacional('metas-marco:corrigir-manual',escopo)
  corrigirManual(@Param('contratoId') c:string,@Param('entregavelId') e:string,@Param('metaId') id:string,@Param('lancamentoId') lid:string,@Body() dto:CorrigirLancamentoDto,@Req() req:RequisicaoAutorizada){return this.metas.executarManual(c,e,id,'corrigir',req.usuarioDominio!,dto,lid);}
  @Post(':metaId/manuais/:lancamentoId/decidir') @ExigirPoliticaOperacional('metas-marco:decidir-manual',escopo)
  decidirManual(@Param('contratoId') c:string,@Param('entregavelId') e:string,@Param('metaId') id:string,@Param('lancamentoId') lid:string,@Body() dto:DecidirLancamentoDto,@Req() req:RequisicaoAutorizada){return this.metas.executarManual(c,e,id,'decidir',req.usuarioDominio!,dto,lid);}
  @Post(':metaId/vinculos') @ExigirPoliticaOperacional('metas-marco:vincular', escopo)
  vincular(@Param('contratoId') c:string,@Param('entregavelId') e:string,@Param('metaId') id:string,@Body() dto:VincularMetaMarcoDto,@Req() req:RequisicaoAutorizada){return this.metas.vincular(c,e,id,dto.tipo,dto.registroId,req.usuarioDominio!);}
  @Delete(':metaId/vinculos/:vinculoId') @ExigirPoliticaOperacional('metas-marco:vincular', escopo)
  desvincular(@Param('contratoId') c:string,@Param('entregavelId') e:string,@Param('metaId') id:string,@Param('vinculoId') v:string,@Req() req:RequisicaoAutorizada){return this.metas.desvincular(c,e,id,v,req.usuarioDominio!);}
  @Post(':metaId/solicitacao') @ExigirPoliticaOperacional('metas-marco:solicitar', escopo)
  solicitar(@Param('contratoId') c:string,@Param('entregavelId') e:string,@Param('metaId') id:string,@Body() dto:TransicaoMetaMarcoDto,@Req() req:RequisicaoAutorizada){return this.metas.transicionar(c,e,id,dto.acao,dto.justificativa,req.usuarioDominio!);}
  @Post(':metaId/decisao') @ExigirPoliticaOperacional('metas-marco:decidir', escopo)
  decidir(@Param('contratoId') c:string,@Param('entregavelId') e:string,@Param('metaId') id:string,@Body() dto:TransicaoMetaMarcoDto,@Req() req:RequisicaoAutorizada){return this.metas.transicionar(c,e,id,dto.acao,dto.justificativa,req.usuarioDominio!);}
  @Post(':metaId/reabertura') @ExigirPoliticaOperacional('metas-marco:reabrir', escopo)
  reabrir(@Param('contratoId') c:string,@Param('entregavelId') e:string,@Param('metaId') id:string,@Body() dto:TransicaoMetaMarcoDto,@Req() req:RequisicaoAutorizada){return this.metas.transicionar(c,e,id,'reabrir',dto.justificativa,req.usuarioDominio!);}
  @Post(':metaId/arquivamento') @ExigirPoliticaOperacional('metas-marco:arquivar', escopo)
  arquivar(@Param('contratoId') c:string,@Param('entregavelId') e:string,@Param('metaId') id:string,@Body() dto:TransicaoMetaMarcoDto,@Req() req:RequisicaoAutorizada){return this.metas.transicionar(c,e,id,'arquivar',dto.justificativa,req.usuarioDominio!);}
  @Post(':metaId/reativacao') @ExigirPoliticaOperacional('metas-marco:reativar', escopo)
  reativar(@Param('contratoId') c:string,@Param('entregavelId') e:string,@Param('metaId') id:string,@Body() dto:TransicaoMetaMarcoDto,@Req() req:RequisicaoAutorizada){return this.metas.transicionar(c,e,id,'reativar',dto.justificativa,req.usuarioDominio!);}
}
