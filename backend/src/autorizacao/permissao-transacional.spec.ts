import { jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
import { Usuario } from '../usuarios/usuario.entity.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import { exigirPermissaoTransacional } from './permissao-transacional.js';

const ator = {id:'u', email:'qa@example.invalid', supertokensUserId:'st', perfil:PerfilUsuario.GESTOR};
function cenario(ativo=true, editar=true) {
  const usuario = {findOne:jest.fn(async () => ({...ator,ativo}))};
  const vinculo = {findOne:jest.fn(async () => ({podeEditar:false,permissoesDetalhadas:{editarEtapas:editar}}))};
  const m = {getRepository:jest.fn((tipo:unknown)=>tipo===Usuario?usuario:vinculo)};
  return {m,usuario,vinculo};
}
it('revalida e bloqueia identidade e vínculo dentro da transação', async()=>{
  const {m,usuario,vinculo}=cenario();
  await exigirPermissaoTransacional(m as never,'c',ator,'editarEtapas');
  expect(usuario.findOne).toHaveBeenCalledWith({where:{id:'u'},lock:{mode:'pessimistic_read'}});
  expect(vinculo.findOne).toHaveBeenCalledWith({where:{contratoId:'c',usuarioId:'u'},lock:{mode:'pessimistic_read'}});
});
it('revogação e desativação impedem a mutação',async()=>{
  await expect(exigirPermissaoTransacional(cenario(false).m as never,'c',ator,'editarEtapas')).rejects.toBeInstanceOf(ForbiddenException);
  await expect(exigirPermissaoTransacional(cenario(true,false).m as never,'c',ator,'editarEtapas')).rejects.toBeInstanceOf(ForbiddenException);
});
