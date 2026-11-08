import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
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

  private async disponivelParaOperacao(contratoId: string): Promise<boolean> {
    // TypeORM mantém manager em Repository reais. Em produção a consulta é sempre
    // feita ao banco, não a parâmetros da requisição ou filtros de frontend.
    const encontrado = await this.contratos.findOne({
      where: { id: contratoId }, select: { id: true, arquivadoEm: true, status: true },
    });
    return Boolean(encontrado && !encontrado.arquivadoEm && encontrado.status !== 'CONCLUIDO' && encontrado.status !== 'ENCERRADO' && encontrado.status !== 'CANCELADO' && encontrado.status !== 'SUSPENSO');
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
      if (operacao.classe !== 'leitura' && !await this.disponivelParaOperacao(contratoId)) return false;
      if (admin) return true;
      if (usuario.perfil !== PerfilUsuario.GESTOR && usuario.perfil !== PerfilUsuario.COLABORADOR) return false;
      const vinculo = await this.vinculos.findOneBy({ usuarioId: usuario.id, contratoId });
      if (!vinculo) return operacao.classe === 'leitura' && await this.responsavelPodeLer(contratoId, usuario.id);
      const granular = ACAO_PERMISSAO[politica.acao];
      if (granular) {
        const efetivas = permissoesEfetivas(usuario.perfil, vinculo.podeEditar, vinculo.permissoesDetalhadas);
        return efetivas[granular];
      }
      // PQ-04: ações de planejamento sem delegação específica continuam restritas.
      return operacao.classe !== 'planejamento' || (usuario.perfil === PerfilUsuario.GESTOR && Boolean(vinculo.podeEditar));
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
      case 'contratos:editar': {
        if (!uuidValido(contratoId)) return false;
        if (politica.acao === 'contratos:editar' && !await this.disponivelParaOperacao(contratoId)) return false;
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
