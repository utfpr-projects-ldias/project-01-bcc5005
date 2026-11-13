import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Req,
  UsePipes, ValidationPipe,
} from '@nestjs/common';

import { ExigirPolitica } from '../autorizacao/politica.decorator.js';
import { ExigirPoliticaOperacional } from '../autorizacao/politica.decorator.js';
import type { RequisicaoAutorizada } from '../autorizacao/usuario-autenticado.js';
import { ContratosService } from './contratos.service.js';
import { ExclusaoContratoService } from './exclusao-contrato.service.js';
import { AtualizarContratoDto } from './dto/atualizar-contrato.dto.js';
import { CriarContratoDto } from './dto/criar-contrato.dto.js';
import { BloquearOrdemEtapasDto } from './dto/bloquear-ordem-etapas.dto.js';
import { EncerrarContratoDto } from './dto/encerrar-contrato.dto.js';
import { CancelarContratoDto } from './dto/cancelar-contrato.dto.js';
import { JustificativaDecisaoDto } from './dto/justificativa-decisao.dto.js';

/**
 * API protegida de contratos — HU05-02.
 *
 * Fluxo de segurança (AutorizacaoGuard global, TEC07-02):
 *  1. Sem sessão SuperTokens válida → 401.
 *  2. Sessão sem usuário de domínio ativo → 403.
 *  3. `@ExigirPolitica` avalia a política:
 *     - `contratos:criar` → Administrador; `contratos:listar` → carteira filtrada por sessão.
 *     - `contratos:visualizar` / `contratos:editar` → Administrador OU vínculo
 *       explícito (`permissoes_contrato`); para editar, GESTOR + `pode_editar`.
 *  4. `visualizar`/`editar` exigem `id` **da rota** (nunca body/query). Negar
 *     vira 404, para não confirmar existência de contrato alheio (RF-02).
 *
 * Exclusão definitiva somente em contratos previamente arquivados, exclusiva do ADMIN.
 * Arquivamento lógico preserva histórico e não altera o status operacional.
 */
@Controller('contratos')
export class ContratosController {
  constructor(private readonly contratos: ContratosService, private readonly exclusao: ExclusaoContratoService) {}

  @Get()
  @ExigirPolitica('contratos:listar')
  listar(@Req() req: RequisicaoAutorizada) {
    return this.contratos.listar(req.usuarioDominio!);
  }

  @Post()
  @ExigirPolitica('contratos:criar')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  criar(@Body() dto: CriarContratoDto, @Req() req: RequisicaoAutorizada) {
    return this.contratos.criar(dto, req.usuarioDominio!);
  }

  @Get('pendentes-conclusao')
  @ExigirPolitica('contratos:listar')
  pendentesConclusao(@Req() req: RequisicaoAutorizada) {
    return this.contratos.pendentesConclusao(req.usuarioDominio!);
  }

  @Get(':id/historico')
  @ExigirPolitica('contratos:visualizar', 'id')
  historico(@Param('id') id: string, @Req() req: RequisicaoAutorizada) {
    return this.contratos.historico(id, req.usuarioDominio!);
  }

  @Get(':id')
  @ExigirPolitica('contratos:visualizar', 'id')
  detalhar(@Param('id') id: string) {
    return this.contratos.detalhar(id);
  }

  @Get(':id/acesso')
  @ExigirPolitica('contratos:visualizar', 'id')
  acesso(@Param('id') id: string, @Req() req: RequisicaoAutorizada) {
    return this.contratos.consultarAcesso(id, req.usuarioDominio!);
  }

  @Post(':id/impacto-vigencia')
  @ExigirPolitica('contratos:editar', 'id')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  impacto(@Param('id') id: string, @Body() dto: AtualizarContratoDto) { return this.contratos.consultarImpactoVigencia(id, dto); }

  @Patch(':id')
  @ExigirPolitica('contratos:editar', 'id')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  atualizar(
    @Param('id') id: string,
    @Body() dto: AtualizarContratoDto,
    @Req() req: RequisicaoAutorizada,
  ) {
    return this.contratos.atualizar(id, dto, req.usuarioDominio!);
  }
  @Patch(':id/ordem-etapas')
  @ExigirPoliticaOperacional('etapas:bloquear-ordem', { tipo: 'contrato', parametro: 'id' })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  alterarBloqueioOrdem(@Param('id') id: string, @Body() dto: BloquearOrdemEtapasDto, @Req() req: RequisicaoAutorizada) {
    return this.contratos.alterarBloqueioOrdem(id, dto.bloqueada, req.usuarioDominio!);
  }

  @Get(':id/elegibilidade-conclusao')
  @ExigirPolitica('contratos:visualizar', 'id')
  elegibilidadeConclusao(@Param('id') id: string) {
    return this.contratos.consultarElegibilidadeConclusao(id);
  }

  @Patch(':id/solicitar-conclusao')
  @ExigirPolitica('contratos:editar', 'id')
  solicitarConclusao(@Param('id') id: string, @Req() req: RequisicaoAutorizada) {
    return this.contratos.solicitarConclusao(id, req.usuarioDominio!);
  }

  @Patch(':id/concluir')
  @ExigirPolitica('contratos:concluir', 'id')
  concluir(@Param('id') id: string, @Req() req: RequisicaoAutorizada) {
    return this.contratos.concluir(id, req.usuarioDominio!);
  }

  @Patch(':id/finalizar')
  @ExigirPolitica('contratos:concluir', 'id')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  finalizar(@Param('id') id: string, @Body() dto: JustificativaDecisaoDto, @Req() req: RequisicaoAutorizada) {
    return this.contratos.finalizar(id, dto.motivo, req.usuarioDominio!);
  }

  /** Encerramento excepcional com pendências preservadas e justificativa auditável. */
  @Patch(':id/cancelar')
  @ExigirPolitica('contratos:cancelar', 'id')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  cancelar(@Param('id') id: string, @Body() dto: CancelarContratoDto, @Req() req: RequisicaoAutorizada) {
    return this.contratos.alterarCancelamento(id, true, req.usuarioDominio!, dto.motivo);
  }

  @Patch(':id/reverter-cancelamento')
  @ExigirPolitica('contratos:reverter-cancelamento', 'id')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  reverterCancelamento(@Param('id') id: string, @Body() dto: JustificativaDecisaoDto, @Req() req: RequisicaoAutorizada) {
    return this.contratos.alterarCancelamento(id, false, req.usuarioDominio!, dto.motivo);
  }

  /** Pausa administrativa: não muda datas, progresso, filhos nem arquivos. */
  @Patch(':id/suspender')
  @ExigirPolitica('contratos:suspender', 'id')
  suspender(@Param('id') id: string, @Req() req: RequisicaoAutorizada) {
    return this.contratos.alterarSuspensao(id, true, req.usuarioDominio!);
  }

  @Patch(':id/retomar')
  @ExigirPolitica('contratos:retomar', 'id')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  retomar(@Param('id') id: string, @Body() dto: JustificativaDecisaoDto, @Req() req: RequisicaoAutorizada) {
    return this.contratos.alterarSuspensao(id, false, req.usuarioDominio!, dto.motivo);
  }

  @Patch(':id/encerrar-antecipadamente')
  @ExigirPolitica('contratos:encerrar', 'id')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  encerrarAntecipadamente(@Param('id') id: string, @Body() dto: EncerrarContratoDto, @Req() req: RequisicaoAutorizada) {
    return this.contratos.encerrarAntecipadamente(id, dto.motivo, req.usuarioDominio!);
  }

  @Patch(':id/fechar-revisao')
  @ExigirPolitica('contratos:editar', 'id')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  fecharRevisao(@Param('id') id: string, @Body() dto: JustificativaDecisaoDto, @Req() req: RequisicaoAutorizada) {
    return this.contratos.fecharRevisao(id, req.usuarioDominio!, dto.motivo);
  }

  /** Decisão negativa de conclusão: exige o MESMO poder que aprovar. */
  @Patch(':id/devolver-revisao')
  @ExigirPolitica('contratos:concluir', 'id')
  devolverRevisao(@Param('id') id: string, @Req() req: RequisicaoAutorizada) {
    return this.contratos.devolverParaRevisao(id, req.usuarioDominio!);
  }

  @Patch(':id/reabrir')
  @ExigirPolitica('contratos:reabrir', 'id')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  reabrir(@Param('id') id: string, @Body() dto: JustificativaDecisaoDto, @Req() req: RequisicaoAutorizada) {
    return this.contratos.reabrir(id, req.usuarioDominio!, dto.motivo);
  }

  @Patch(':id/arquivar')
  @ExigirPolitica('contratos:arquivar', 'id')
  arquivar(@Param('id') id: string, @Req() req: RequisicaoAutorizada) {
    return this.contratos.alterarArquivamento(id, true, req.usuarioDominio!);
  }

  @Delete(':id')
  @ExigirPolitica('contratos:excluir', 'id')
  excluir(@Param('id') id: string, @Req() req: RequisicaoAutorizada) {
    return this.exclusao.excluir(id, req.usuarioDominio!);
  }

  @Patch(':id/reativar')
  @ExigirPolitica('contratos:reativar', 'id')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  reativar(@Param('id') id: string, @Body() dto: JustificativaDecisaoDto, @Req() req: RequisicaoAutorizada) {
    return this.contratos.alterarArquivamento(id, false, req.usuarioDominio!, dto.motivo);
  }

}