import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { TipoEntregavel } from '../entregaveis/tipo-entregavel.enum.js';
import { PermissaoContrato } from '../autorizacao/permissao-contrato.entity.js';
import { permissoesEfetivas } from '../autorizacao/permissoes-granulares.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { Ocorrencia } from './ocorrencia.entity.js';
import type { ConfigurarOcorrenciasDto } from './dto/configurar-ocorrencias.dto.js';
import { ConfiguracaoOcorrencias } from './configuracao-ocorrencias.entity.js';

const civil = (s: string | null | undefined): boolean => {
  if (!s) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

@Injectable()
export class ConfiguracaoOcorrenciasService {
  constructor(private readonly ds: DataSource, private readonly auditoria: AuditoriaService) {}

  async consultar(contratoId: string, entregavelId: string) {
    const e = await this.ds.getRepository(Entregavel).findOneBy({ id: entregavelId, contratoId });
    if (!e) throw new NotFoundException('Entregável não encontrado neste contrato');
    const atual = await this.ds.getRepository(ConfiguracaoOcorrencias).findOneBy({ entregavelId, contratoId });
    return { ...(atual ?? {}), entregavelId, contratoId, modoVisualizacao: e.tipo === TipoEntregavel.RECORRENTE ? 'CALENDARIO' as const : 'LISTA' as const, tipoOperacional: e.tipo, quantidadePrevista: e.quantidadePrevista,
      unidadeMedida: e.unidadeMedida, periodicidade: e.periodicidade, inicioPrevisto: e.tipo === TipoEntregavel.RECORRENTE ? (e.agendaInicioFuturo ?? atual?.inicioPrevisto ?? e.inicioPrevisto) : e.inicioPrevisto,
      terminoPrevisto: e.tipo === TipoEntregavel.RECORRENTE ? (atual?.terminoPrevisto ?? e.terminoPrevisto) : e.terminoPrevisto, atualizadoEm: atual?.atualizadoEm ?? null };
  }

  async atualizar(contratoId: string, entregavelId: string, dto: ConfigurarOcorrenciasDto, ator: UsuarioAutenticado) {
    // Formato é derivado da regra contratual, não editável por preferência.
    // Replanejamento da recorrência é realizado na operação transacional própria.
    if (dto.modoVisualizacao !== (dto.tipoOperacional === TipoEntregavel.RECORRENTE ? 'CALENDARIO' : 'LISTA'))
      throw new BadRequestException('A visualização é definida automaticamente pelo tipo do entregável');
    return this.ds.transaction(async m => {
      const c = await m.findOne(Contrato, { where: { id: contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!c || c.arquivadoEm || !['PLANEJAMENTO', 'EM_EXECUCAO'].includes(c.status)) throw new ConflictException('Reabra ou retome o contrato antes de configurar ocorrências');
      if (ator.perfil !== 'ADMINISTRADOR') {
        const v = await m.findOneBy(PermissaoContrato, { contratoId, usuarioId: ator.id });
        const p = permissoesEfetivas(ator.perfil, Boolean(v?.podeEditar), v?.permissoesDetalhadas);
        if (!v || !p.editarEntregaveis || (dto.tipoOperacional === TipoEntregavel.RECORRENTE && !p.configurarAgendaOcorrencias))
          throw new ForbiddenException('A configuração de ocorrências exige permissão para editar o entregável e, em recorrências, sua agenda');
      }
      const e = await m.findOne(Entregavel, { where: { id: entregavelId, contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!e) throw new NotFoundException('Entregável não encontrado neste contrato');
      if (e.arquivadoEm || ['CONCLUIDO','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao ?? '')) throw new ConflictException('Reabra o entregável antes de configurar ocorrências');
      if (dto.tipoOperacional !== e.tipo ||
          (dto.quantidadePrevista ?? null) !== (e.quantidadePrevista ?? null) ||
          (dto.unidadeMedida ?? null) !== (e.unidadeMedida ?? null) ||
          (dto.periodicidade ?? null) !== (e.periodicidade ?? null) ||
          (dto.inicioPrevisto ?? null) !== (e.inicioPrevisto ?? null) ||
          (dto.terminoPrevisto ?? null) !== (e.terminoPrevisto ?? null)) {
        throw new ConflictException('O planejamento pertence ao entregável. Edite-o na seção Planejamento; o tipo não pode ser alterado após o cadastro.');
      }
      const anterior = await m.findOneBy(ConfiguracaoOcorrencias, { entregavelId, contratoId });
      const modoVisualizacao: ConfiguracaoOcorrencias['modoVisualizacao'] =
        e.tipo === TipoEntregavel.RECORRENTE ? 'CALENDARIO' : 'LISTA';
      if (anterior?.modoVisualizacao === modoVisualizacao) return anterior;
      const novo = {
        entregavelId, contratoId, modoVisualizacao,
        tipoOperacional: e.tipo, quantidadePrevista: e.quantidadePrevista,
        unidadeMedida: e.unidadeMedida, periodicidade: e.periodicidade,
        inicioPrevisto: e.inicioPrevisto, terminoPrevisto: e.terminoPrevisto,
      };
      // O modo lista/calendário não modifica a execução nem períodos históricos.
      const salva = await m.save(ConfiguracaoOcorrencias,
        m.create(ConfiguracaoOcorrencias, { ...novo, atualizadoEm: new Date() }));
      await this.auditoria.registrarNaTransacao(m, ator, {
        acao: AcaoAuditoria.ENTREGAVEL_EDITADO, entidadeTipo: 'ENTREGAVEL', entidadeId: entregavelId,
        dadosAnteriores: { modoVisualizacao: anterior?.modoVisualizacao ?? 'LISTA' },
        dadosPosteriores: { modoVisualizacao },
      });
      return salva;
    });
  }
}
