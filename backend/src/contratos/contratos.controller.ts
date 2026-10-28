import {
  Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Req,
  UsePipes, ValidationPipe,
} from '@nestjs/common';

import { ExigirPolitica } from '../autorizacao/politica.decorator.js';
import type { RequisicaoAutorizada } from '../autorizacao/usuario-autenticado.js';
import { ContratosService } from './contratos.service.js';
import { AtualizarContratoDto } from './dto/atualizar-contrato.dto.js';
import { CriarContratoDto } from './dto/criar-contrato.dto.js';

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
 * Não há DELETE: exclusão física proibida pela issue (RB-14). Arquivamento
 * fica para HU posterior; `status = CANCELADO` cobre o caso de negócio.
 */
@Controller('contratos')
export class ContratosController {
  constructor(private readonly contratos: ContratosService) {}

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
}