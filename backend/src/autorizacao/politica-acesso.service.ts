import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import { PermissaoContrato } from './permissao-contrato.entity.js';
import type { Politica } from './politica.decorator.js';
import type { UsuarioAutenticado } from './usuario-autenticado.js';

@Injectable()
export class PoliticaAcessoService {
  constructor(
    @InjectRepository(PermissaoContrato)
    private readonly vinculos: Repository<PermissaoContrato>,
  ) {}

  async permitido(usuario: UsuarioAutenticado, politica: Politica, contratoId?: string): Promise<boolean> {
    const admin = usuario.perfil === PerfilUsuario.ADMINISTRADOR;
    switch (politica.acao) {
      case 'perfil:proprio':
        return true; // o guard já verificou usuário de domínio ativo
      case 'usuarios:administrar':
      case 'contratos:criar':
      case 'contratos:listar':
        // listagem ampla bloqueada para não-admin até existir filtragem na HU05-02;
        // PQ-03: Gestor NÃO cria contrato até confirmação do cliente.
        return admin;
      case 'contratos:visualizar':
      case 'contratos:editar': {
        if (!contratoId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(contratoId)) {
          return false;
        }
        if (admin) return true;
        if (politica.acao === 'contratos:editar' && usuario.perfil !== PerfilUsuario.GESTOR) {
          return false;
        }
        const vinculo = await this.vinculos.findOneBy({
          usuarioId: usuario.id,
          contratoId,
        });
        if (!vinculo) return false;
        return politica.acao === 'contratos:visualizar' || vinculo.podeEditar;
      }
      default:
        return false;
    }
  }
}
