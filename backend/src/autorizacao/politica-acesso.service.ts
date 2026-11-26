import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { Usuario } from '../usuarios/usuario.entity.js';
import { Contrato } from '../contratos/contrato.entity.js';

import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import { PermissaoContrato } from './permissao-contrato.entity.js';
import type { Politica } from './politica.decorator.js';
import { politicaOperacional, uuidValido } from './politicas-operacionais.js';
import { ACAO_PERMISSAO, permissoesEfetivas } from './permissoes-granulares.js';
import type { UsuarioAutenticado } from './usuario-autenticado.js';

@Injectable()
export class PoliticaAcessoService {
  constructor(
    @InjectRepository(PermissaoContrato)
    private readonly vinculos: Repository<PermissaoContrato>,
    @InjectRepository(Contrato) private readonly contratos: Repository<Contrato>,
  ) {}

  /** A indicação como responsável concede SOMENTE leitura, enquanto durar a atribuição.
   * Nunca cria um vínculo de escrita persistente e não contorna ACL granular. */
  private async responsavelPodeLer(contratoId: string, usuarioId: string): Promise<boolean> {
    const contrato = await this.contratos.findOne({
      where: { id: contratoId, responsavelInternoId: usuarioId },
      select: { id: true },
    });
    return Boolean(contrato);
  }

  private async disponivelParaOperacao(contratoId: string, acao: string): Promise<boolean> {
    // TypeORM mantém manager em Repository reais. Em produção a consulta é sempre
    // feita ao banco, não a parâmetros da requisição ou filtros de frontend.
    const encontrado = await this.contratos.findOne({
      where: { id: contratoId }, select: { id: true, arquivadoEm: true, status: true, conclusaoSolicitadaEm: true },
    });
    return Boolean(encontrado && !encontrado.arquivadoEm && !encontrado.conclusaoSolicitadaEm && encontrado.status !== 'CONCLUIDO' && (encontrado.status !== 'CONCLUIDO_PARCIALMENTE' || ['metas-marco:editar','metas-marco:solicitar','metas-marco:vincular','metas-marco:decidir','evidencias:criaresperada','evidencias:editaresperada','evidencias:anexar','evidencias:verificar','evidencias:reabrir','evidencias:arquivaresperada','evidencias:reativaresperada','ocorrencias:vincular-evidencia','ocorrencias:solicitar-conclusao','ocorrencias:concluir','ocorrencias:reabrir','entregaveis:solicitar-conclusao','entregaveis:concluir','etapas:solicitar-conclusao','etapas:concluir','documentos:anexar','contratos:solicitar-conclusao'].includes(acao)) && encontrado.status !== 'FINALIZADO' && encontrado.status !== 'ENCERRADO' && encontrado.status !== 'CANCELADO' && encontrado.status !== 'SUSPENSO');
  }

  /** Para mutações que envolvem múltiplos contratos: a ACL não pode mudar entre
   * a decisão e o COMMIT. Usa a mesma ordenação autor/vínculo da administração. */
  async permitidoNaTransacao(manager: EntityManager, usuario: UsuarioAutenticado, politica: Politica, contratoId: string): Promise<boolean> {
    const atual = await manager.getRepository(Usuario).findOne({where:{id:usuario.id},lock:{mode:'pessimistic_read'}});
    if (!atual?.ativo || atual.bloqueioSessoesId || atual.supertokensUserId !== usuario.supertokensUserId || atual.perfil !== usuario.perfil) return false;
    const vinculos = manager.getRepository(PermissaoContrato);
    if (atual.perfil !== PerfilUsuario.ADMINISTRADOR)
      await vinculos.findOne({where:{usuarioId:usuario.id,contratoId},lock:{mode:'pessimistic_read'}});
    return new PoliticaAcessoService(vinculos, manager.getRepository(Contrato)).permitido(usuario,politica,contratoId);
  }

  async permitido(usuario: UsuarioAutenticado, politica: Politica, contratoId?: string): Promise<boolean> {
    const admin = usuario.perfil === PerfilUsuario.ADMINISTRADOR;
    const operacao = politicaOperacional(politica.acao);
    if (operacao) {
      // Falha fechada se alguém usar o decorator legado ou declarar escopo errado.
      const escopo = politica.escopoOperacional;
      if (!escopo || escopo.tipo !== operacao.escopo ||
        (escopo.tipo === 'recurso' && escopo.recurso !== operacao.recurso)) return false;
      if (!uuidValido(contratoId)) return false;
      // Toda mutação do catálogo exige chave granular declarada, inclusive para ADMIN.
      // Leitura mantém acesso por vínculo/responsabilidade sem exigir chave granular.
      const granular = ACAO_PERMISSAO[politica.acao];
      if (operacao.classe !== 'leitura' && !granular) return false;
      if (operacao.classe !== 'leitura' && !await this.disponivelParaOperacao(contratoId, politica.acao)) return false;
      if (admin) return true;
      if (usuario.perfil !== PerfilUsuario.GESTOR && usuario.perfil !== PerfilUsuario.COLABORADOR) return false;
      const vinculo = await this.vinculos.findOneBy({ usuarioId: usuario.id, contratoId });
      if (!vinculo) return operacao.classe === 'leitura' && await this.responsavelPodeLer(contratoId, usuario.id);
      if (operacao.classe === 'leitura') return true;
      // Após o fail-closed acima, a chave existe em todas as operações mutáveis.
      const efetivas = permissoesEfetivas(usuario.perfil, vinculo.podeEditar, vinculo.permissoesDetalhadas);
      return granular ? efetivas[granular] : false;
    }

    switch (politica.acao) {
      case 'perfil:proprio':
        return true; // guard verificou usuário ativo
      case 'usuarios:administrar':
      case 'contratos:criar':
        return admin; // PQ-03: gestor criar contrato permanece pendente
      case 'contratos:arquivar':
      case 'contratos:reativar':
      case 'contratos:excluir':
        return admin && uuidValido(contratoId);
      case 'contratos:listar':
        return true; // listagem permanece filtrada no SQL do módulo Contratos
      case 'contratos:concluir':
      case 'contratos:encerrar': {
        if (!uuidValido(contratoId)) return false;
        if (admin) return true;
        const vinculo = await this.vinculos.findOneBy({ usuarioId: usuario.id, contratoId });
        return Boolean(vinculo && permissoesEfetivas(usuario.perfil, vinculo.podeEditar,
          vinculo.permissoesDetalhadas)[politica.acao === 'contratos:encerrar' ? 'encerrarContrato' : 'concluirContrato']);
      }
      case 'contratos:cancelar':
      case 'contratos:reverter-cancelamento':
      case 'contratos:suspender':
      case 'contratos:retomar': {
        if (!uuidValido(contratoId)) return false;
        if (admin) return true;
        const vinculo = await this.vinculos.findOneBy({ usuarioId: usuario.id, contratoId });
        if (!vinculo) return false;
        const chave = politica.acao === 'contratos:cancelar' ? 'cancelarContrato'
          : politica.acao === 'contratos:reverter-cancelamento' ? 'reverterCancelamentoContrato'
          : politica.acao === 'contratos:suspender' ? 'suspenderContrato' : 'retomarContrato';
        return permissoesEfetivas(usuario.perfil, vinculo.podeEditar, vinculo.permissoesDetalhadas)[chave];
      }
      case 'contratos:reabrir': {
        if (!uuidValido(contratoId)) return false;
        if (admin) return true;
        const vinculo = await this.vinculos.findOneBy({ usuarioId: usuario.id, contratoId });
        return Boolean(vinculo && permissoesEfetivas(usuario.perfil, vinculo.podeEditar, vinculo.permissoesDetalhadas).reabrirContrato);
      }
      case 'contratos:visualizar':
      case 'contratos:solicitar-conclusao':
      case 'contratos:editar': {
        if (!uuidValido(contratoId)) return false;
        if (politica.acao !== 'contratos:visualizar' && !await this.disponivelParaOperacao(contratoId, politica.acao)) return false;
        if (admin) return true;
        const vinculo = await this.vinculos.findOneBy({ usuarioId: usuario.id, contratoId });
        if (!vinculo) return politica.acao === 'contratos:visualizar' && await this.responsavelPodeLer(contratoId, usuario.id);
        return politica.acao === 'contratos:visualizar' || (
          permissoesEfetivas(usuario.perfil, vinculo.podeEditar, vinculo.permissoesDetalhadas).editarContrato);
      }
      default:
        return false;
    }
  }
}
