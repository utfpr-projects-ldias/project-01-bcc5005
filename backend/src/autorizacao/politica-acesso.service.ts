import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import { PermissaoContrato } from './permissao-contrato.entity.js';
import type { Politica } from './politica.decorator.js';
import { politicaOperacional, uuidValido } from './politicas-operacionais.js';
import type { UsuarioAutenticado } from './usuario-autenticado.js';

@Injectable()
export class PoliticaAcessoService {
  constructor(
    @InjectRepository(PermissaoContrato)
    private readonly vinculos: Repository<PermissaoContrato>,
  ) {}

  async permitido(usuario: UsuarioAutenticado, politica: Politica, contratoId?: string): Promise<boolean> {
    const admin = usuario.perfil === PerfilUsuario.ADMINISTRADOR;
    const operacao = politicaOperacional(politica.acao);
    if (operacao) {
      // Falha fechada se alguém usar o decorator legado ou declarar escopo errado.
      const escopo = politica.escopoOperacional;
      if (!escopo || escopo.tipo !== operacao.escopo ||
        (escopo.tipo === 'recurso' && escopo.recurso !== operacao.recurso)) return false;
      if (!uuidValido(contratoId)) return false;
      if (admin) return true;
      if (usuario.perfil !== PerfilUsuario.GESTOR && usuario.perfil !== PerfilUsuario.COLABORADOR) return false;
      // PQ-04 pendente: Colaborador jamais recebe edição de planejamento implicitamente.
      if (operacao.classe === 'planejamento' && usuario.perfil !== PerfilUsuario.GESTOR) return false;
      const vinculo = await this.vinculos.findOneBy({ usuarioId: usuario.id, contratoId });
      if (!vinculo) return false;
      return operacao.classe !== 'planejamento' || Boolean(vinculo.podeEditar);
    }

    switch (politica.acao) {
      case 'perfil:proprio':
        return true; // guard verificou usuário ativo
      case 'usuarios:administrar':
      case 'contratos:criar':
        return admin; // PQ-03: gestor criar contrato permanece pendente
      case 'contratos:listar':
        return true; // listagem permanece filtrada no SQL do módulo Contratos
      case 'contratos:visualizar':
      case 'contratos:editar': {
        if (!uuidValido(contratoId)) return false;
        if (admin) return true;
        if (politica.acao === 'contratos:editar' && usuario.perfil !== PerfilUsuario.GESTOR) return false;
        const vinculo = await this.vinculos.findOneBy({ usuarioId: usuario.id, contratoId });
        if (!vinculo) return false;
        return politica.acao === 'contratos:visualizar' || vinculo.podeEditar;
      }
      default:
        return false;
    }
  }
}
