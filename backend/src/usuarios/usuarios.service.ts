import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { PerfilUsuario } from './perfil-usuario.enum.js';
import { Usuario } from './usuario.entity.js';

/** Chamado exclusivamente por fluxos INTERNOS previamente autorizados. */
export type ProvisionarUsuario = {
  supertokensUserId: string;
  email: string;
  perfil: PerfilUsuario;
};

@Injectable()
export class UsuariosService {
  constructor(
    @InjectRepository(Usuario)
    private readonly usuarios: Repository<Usuario>,
  ) {}

  /** Nunca cria perfil implícito por login ou por sessão válida. */
  async buscarPorSupertokensId(id: string): Promise<Usuario | null> {
    return this.usuarios.findOneBy({ supertokensUserId: id });
  }

  /** Ausência, bloqueio ou conta legada: sem direitos no domínio. */
  async buscarAtivoPorSupertokensId(id: string): Promise<Usuario | null> {
    return this.usuarios.findOneBy({ supertokensUserId: id, ativo: true });
  }

  /**
   * Serviço de persistência, NÃO um endpoint. A TEC07-04 só poderá chamá-lo
   * depois do guard de ADMINISTRADOR da TEC07-02 e da criação da identidade
   * no SuperTokens. Uma sessão de login NUNCA deve invocar este método.
   */
  async criarProvisionado(dados: ProvisionarUsuario): Promise<Usuario> {
    const id = dados.supertokensUserId.trim();
    const email = dados.email.trim().toLowerCase();

    if (!id || id.length > 255 || !email || email.length > 320 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !Object.values(PerfilUsuario).includes(dados.perfil)) {
      throw new BadRequestException('Identidade, e-mail ou perfil inválido');
    }

    const anterior = await this.buscarPorSupertokensId(id);
    if (anterior) return this.validarRepeticao(anterior, email, dados.perfil);

    // ON CONFLICT DO NOTHING mantém a transação utilizável e é atômico.
    // Não se usa UPSERT/UPDATE: login e repetição nunca trocam permissões.
    await this.usuarios.createQueryBuilder()
      .insert()
      .into(Usuario)
      .values({ supertokensUserId: id, email, perfil: dados.perfil, ativo: true })
      .orIgnore()
      .execute();

    const criado = await this.buscarPorSupertokensId(id);
    if (!criado) throw new Error('Usuário não encontrado após inserção');
    return this.validarRepeticao(criado, email, dados.perfil);
  }

  private validarRepeticao(
    usuario: Usuario,
    email: string,
    perfil: PerfilUsuario,
  ): Usuario {
    if (usuario.email !== email || usuario.perfil !== perfil || !usuario.ativo) {
      throw new ConflictException('Identidade já provisionada com dados diferentes ou inativa');
    }
    return usuario;
  }

}
