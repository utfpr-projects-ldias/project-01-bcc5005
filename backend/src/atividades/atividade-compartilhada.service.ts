import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { PoliticaAcessoService } from '../autorizacao/politica-acesso.service.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { uuidValido } from '../autorizacao/politicas-operacionais.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { AtividadeEntity } from './atividade.entity.js';
import { AtividadeCompartilhada } from './atividade-compartilhada.entity.js';
import { AtividadesService } from './atividades.service.js';
import { contarAprovacoes } from './resumo-compartilhado.js';
import type { CreateAtividadeDto } from './dto/create-atividade.dto.js';
import { AprovarCompartilhadaDto, CriarAtividadeCompartilhadaDto } from './dto/atividade-compartilhada.dto.js';

const politica = (acao: 'atividades:registrar' | 'atividades:visualizar' | 'atividades:verificar' | 'atividades:editar') => ({
  acao,
  escopoOperacional: acao === 'atividades:registrar'
    ? { tipo: 'contrato' as const, parametro: 'contratoId' }
    : { tipo: 'recurso' as const, recurso: 'atividade' as const, parametro: 'id' },
});

@Injectable()
export class AtividadeCompartilhadaService {
  constructor(private readonly database: DataSource,
    private readonly acesso: PoliticaAcessoService,
    private readonly auditoria: AuditoriaService,
    private readonly atividades: AtividadesService) {}

  private async pode(ator: UsuarioAutenticado, acao: 'atividades:registrar' | 'atividades:visualizar' | 'atividades:verificar' | 'atividades:editar', contratoId: string) {
    return this.acesso.permitido(ator, politica(acao), contratoId);
  }

  /** Cadastro completo ou rollback completo: nunca salva parte dos contratos. */
  async criar(dto: CriarAtividadeCompartilhadaDto, ator: UsuarioAutenticado) {
    if (new Set(dto.vinculos.map(v => v.contratoId)).size !== dto.vinculos.length)
      throw new BadRequestException('Selecione cada contrato uma única vez');
    const vinculos = [...dto.vinculos].sort((a,b) => a.contratoId.localeCompare(b.contratoId));
    return this.database.transaction(async manager => {
      // Autorização em TODOS os contratos antes de criar qualquer atividade.
      for (const vinculo of vinculos) {
        if (!await this.pode(ator, 'atividades:registrar', vinculo.contratoId))
          throw new ForbiddenException('Sem autorização para registrar atividade em todos os contratos selecionados');
      }
      const grupoId = randomUUID();
      await manager.save(AtividadeCompartilhada, manager.create(AtividadeCompartilhada,
        { id: grupoId, criadoPor: ator.id }));
      const criadas: { contratoId: string; atividadeId: string }[] = [];
      for (const vinculo of vinculos) {
        const dados: CreateAtividadeDto = {
          contratoId: vinculo.contratoId, titulo: dto.titulo, dataHora: dto.dataHora,
          descricao: dto.descricao, tipo: dto.tipo, responsavel: dto.responsavel,
          observacoes: dto.observacoes, local: dto.local, duracao: dto.duracao,
          entregavelIds: vinculo.entregavelIds, ocorrenciaIds: vinculo.ocorrenciaIds ?? [],
          medicoes: vinculo.medicoes ?? [],
        };
        const criado = await this.atividades.criarNaTransacao(manager, vinculo.contratoId, dados, ator, grupoId);
        await this.auditoria.registrarNaTransacao(manager, ator, criado.evento);
        criadas.push({ contratoId: vinculo.contratoId, atividadeId: criado.resultado.id });
      }
      return { id: grupoId, total: criadas.length, atividades: criadas };
    });
  }

  /** Somente os contratos visíveis retornam identidade e detalhes. Total anônimo
   * permite exibir o contador solicitado (2/6) sem enumerar contratos protegidos. */
  async resumo(id: string, ator: UsuarioAutenticado) {
    if (!uuidValido(id)) throw new NotFoundException('Atividade compartilhada não encontrada');
    const repo = this.database.getRepository(AtividadeEntity);
    const registros = await repo.find({ where: { atividadeCompartilhadaId: id, excluidaEm: IsNull() },
      order: { contratoId: 'ASC' } });
    if (!registros.length) throw new NotFoundException('Atividade compartilhada não encontrada');
    const visiveis: typeof registros = [];
    for (const registro of registros) if (await this.pode(ator, 'atividades:visualizar', registro.contratoId))
      visiveis.push(registro);
    if (!visiveis.length) throw new NotFoundException('Atividade compartilhada não encontrada');
    const linhas = [];
    for (const registro of visiveis) linhas.push({
      contratoId: registro.contratoId, atividadeId: registro.id, status: registro.status,
      podeSolicitar: registro.status === 'REGISTRADA' &&
        await this.pode(ator, 'atividades:editar', registro.contratoId),
      podeAprovar: registro.status === 'PENDENTE_CONCLUSAO' &&
        await this.pode(ator, 'atividades:verificar', registro.contratoId),
    });
    return { id, ...contarAprovacoes(registros.map(r => r.status)), atividades: linhas };
  }

  /** Solicitação em lote, atômica, limitada às permissões de edição por contrato. */
  async solicitar(id: string, dto: AprovarCompartilhadaDto, ator: UsuarioAutenticado) {
    if (!uuidValido(id)) throw new NotFoundException('Atividade compartilhada não encontrada');
    return this.database.transaction(async manager => {
      const grupo = await manager.findOne(AtividadeCompartilhada,
        { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!grupo) throw new NotFoundException('Atividade compartilhada não encontrada');
      const registros = await manager.find(AtividadeEntity, {
        where: { atividadeCompartilhadaId: id, excluidaEm: IsNull() }, order: { contratoId: 'ASC' },
      });
      if (!registros.length) throw new NotFoundException('Atividade compartilhada não encontrada');
      // Nunca informar se um grupo existe a alguém sem acesso a nenhum membro.
      const contratosVisiveis = await Promise.all(registros.map(r =>
        this.pode(ator, 'atividades:visualizar', r.contratoId)));
      if (!contratosVisiveis.some(Boolean)) throw new NotFoundException('Atividade compartilhada não encontrada');
      const selecionados = dto.contratoIds ? new Set(dto.contratoIds) : null;
      if (selecionados?.size && [...selecionados].some(cid => !registros.some(r => r.contratoId === cid)))
        throw new NotFoundException('Contrato não pertence à atividade compartilhada');
      const autorizados: AtividadeEntity[] = [];
      for (const registro of registros) {
        if (selecionados && !selecionados.has(registro.contratoId)) continue;
        if (!await this.pode(ator, 'atividades:editar', registro.contratoId)) {
          if (selecionados) throw new ForbiddenException('Sem permissão de solicitar em um dos contratos');
          continue;
        }
        if (registro.status === 'REGISTRADA') autorizados.push(registro);
        else if (selecionados && registro.status !== 'PENDENTE_CONCLUSAO' && registro.status !== 'VERIFICADA')
          throw new ConflictException('Uma das atividades não admite solicitação');
      }
      for (const registro of autorizados)
        await this.atividades.solicitarNaTransacao(manager, registro.contratoId, registro.id, ator);
      const atualizados = await manager.find(AtividadeEntity, {
        where: { atividadeCompartilhadaId: id, excluidaEm: IsNull() },
      });
      return { id, novasSolicitacoes: autorizados.length, ...contarAprovacoes(atualizados.map(r => r.status)) };
    });
  }

  /** Aprovação em lote atômica por contratos autorizados, sem reaprovação da mesma linha.
   * Sem contratoIds: considera todos os contratos permitidos; os demais ficam intactos.
   * Com seleção explícita: acesso insuficiente causa rollback total e 403. */
  async aprovar(id: string, dto: AprovarCompartilhadaDto, ator: UsuarioAutenticado) {
    if (!uuidValido(id)) throw new NotFoundException('Atividade compartilhada não encontrada');
    return this.database.transaction(async manager => {
      const grupo = await manager.findOne(AtividadeCompartilhada,
        { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!grupo) throw new NotFoundException('Atividade compartilhada não encontrada');
      const registros = await manager.find(AtividadeEntity, {
        where: { atividadeCompartilhadaId: id, excluidaEm: IsNull() }, order: { contratoId: 'ASC' },
      });
      if (!registros.length) throw new NotFoundException('Atividade compartilhada não encontrada');
      // Nunca informar se um grupo existe a alguém sem acesso a nenhum membro.
      const contratosVisiveis = await Promise.all(registros.map(r =>
        this.pode(ator, 'atividades:visualizar', r.contratoId)));
      if (!contratosVisiveis.some(Boolean)) throw new NotFoundException('Atividade compartilhada não encontrada');
      const selecionados = dto.contratoIds ? new Set(dto.contratoIds) : null;
      if (selecionados?.size && [...selecionados].some(cid => !registros.some(r => r.contratoId === cid)))
        throw new NotFoundException('Contrato não pertence à atividade compartilhada');
      const autorizados: AtividadeEntity[] = [];
      for (const r of registros) {
        if (selecionados && !selecionados.has(r.contratoId)) continue;
        const podeAprovar = await this.pode(ator, 'atividades:verificar', r.contratoId);
        if (!podeAprovar) {
          if (selecionados) throw new ForbiddenException('Sem permissão de verificar em um dos contratos solicitados');
          continue;
        }
        if (r.status === 'PENDENTE_CONCLUSAO') autorizados.push(r);
        else if (selecionados && r.status !== 'VERIFICADA')
          throw new ConflictException('Uma das atividades não está pendente de conclusão');
      }
      for (const registro of autorizados)
        await this.atividades.verificarNaTransacao(manager, registro.contratoId, registro.id, ator);
      const atualizados = await manager.find(AtividadeEntity, {
        where: { atividadeCompartilhadaId: id, excluidaEm: IsNull() },
      });
      return { id, novasAprovacoes: autorizados.length, ...contarAprovacoes(atualizados.map(r => r.status)) };
    });
  }
}
