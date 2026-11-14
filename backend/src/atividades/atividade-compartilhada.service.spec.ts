import { ForbiddenException } from '@nestjs/common';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import type { DataSource } from 'typeorm';
import type { PoliticaAcessoService } from '../autorizacao/politica-acesso.service.js';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { AtividadesService } from './atividades.service.js';
import { AtividadeCompartilhadaService } from './atividade-compartilhada.service.js';
import { AtividadeCompartilhada, } from './atividade-compartilhada.entity.js';
import { AtividadeEntity } from './atividade.entity.js';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const grupoId = id(900);
const usuario = {id:id(100), supertokensUserId:'st-user', nome:'Teste', email:'teste@example.com', perfil:PerfilUsuario.GESTOR} as const;

describe('serviço de atividade compartilhada', () => {
  const construir = (permitidos: Set<string>, estados: string[]) => {
    const registros = estados.map((status, index) => ({ id:id(index+1), contratoId:id(index+101),
      atividadeCompartilhadaId:grupoId, status, excluidaEm:null }));
    const manager = {
      findOne: jest.fn(async (alvo: unknown) => alvo === AtividadeCompartilhada ? {id:grupoId} : null),
      find: jest.fn(async () => registros),
      create: jest.fn((_entidade:unknown, dados:unknown) => dados),
      save: jest.fn(async (_entidade:unknown, dados:unknown) => dados),
    };
    const database = {transaction:jest.fn(async (f:(m:typeof manager)=>Promise<unknown>) => f(manager)),
      getRepository:jest.fn(() => ({find:jest.fn(async()=>registros)}))};
    const acesso = {permitido:jest.fn(async (_ator:unknown, politica:{acao:string}, contratoId:string) =>
      politica.acao === 'atividades:visualizar' || permitidos.has(contratoId))};
    const atividades = { verificarNaTransacao:jest.fn(async (_m:unknown,cid:string) => {
      const r = registros.find(x=>x.contratoId===cid); if(r) r.status='VERIFICADA';
    }), solicitarNaTransacao:jest.fn(async (_m:unknown,cid:string) => {
      const r = registros.find(x=>x.contratoId===cid); if(r) r.status='PENDENTE_CONCLUSAO';
    }), criarNaTransacao:jest.fn(async (_m:unknown,cid:string,_dados?:unknown) => ({resultado:{id:cid},
      evento:{acao:'ATIVIDADE_CRIADA',entidadeTipo:'ATIVIDADE',entidadeId:cid}})) };
    const auditoria={registrarNaTransacao:jest.fn(async()=>undefined)};
    const service = new AtividadeCompartilhadaService(database as unknown as DataSource,
      acesso as unknown as PoliticaAcessoService,auditoria as unknown as AuditoriaService,
      atividades as unknown as AtividadesService);
    return {service,registros,atividades,database,auditoria};
  };

  it('aprova somente os 2 contratos autorizados de 6 e permanece idempotente', async () => {
    const autorizados=new Set([id(101),id(102)]);
    const {service,atividades}=construir(autorizados,Array(6).fill('PENDENTE_CONCLUSAO'));
    expect(await service.aprovar(grupoId,{},usuario)).toMatchObject({total:6,aprovadas:2,novasAprovacoes:2});
    expect(await service.aprovar(grupoId,{},usuario)).toMatchObject({total:6,aprovadas:2,novasAprovacoes:0});
    expect(atividades.verificarNaTransacao).toHaveBeenCalledTimes(2);
  });

  it('recusa seleção explícita de contrato sem permissão e não grava decisão', async () => {
    const {service,atividades}=construir(new Set([id(101)]),Array(6).fill('PENDENTE_CONCLUSAO'));
    await expect(service.aprovar(grupoId,{contratoIds:[id(101),id(103)]},usuario)).rejects.toBeInstanceOf(ForbiddenException);
    expect(atividades.verificarNaTransacao).not.toHaveBeenCalled();
  });

  it('solicita somente nos contratos em que o usuário pode editar', async () => {
    const {service,atividades}=construir(new Set([id(101),id(102)]),Array(6).fill('REGISTRADA'));
    expect(await service.solicitar(grupoId,{},usuario)).toMatchObject({total:6,pendentes:2,novasSolicitacoes:2});
    expect(atividades.solicitarNaTransacao).toHaveBeenCalledTimes(2);
  });

  it('cria medições independentes por contrato, sem copiar unidade ou quantidade do outro', async () => {
    const {service,atividades}=construir(new Set([id(101),id(102)]),[]);
    const feito=await service.criar({titulo:'Manutenção',dataHora:'2026-11-14T12:00:00.000Z',
      descricao:'Manutenções em duas unidades',tipo:'Manutenção',vinculos:[
        {contratoId:id(101),entregavelIds:[id(501)],ocorrenciaIds:[id(601)],
          medicoes:[{ocorrenciaId:id(601),quantidade:'5.000'}]},
        {contratoId:id(102),entregavelIds:[id(502)],ocorrenciaIds:[id(602)],
          medicoes:[{ocorrenciaId:id(602),quantidade:'9.000'}]},
      ]},usuario);
    expect(feito.total).toBe(2);
    const payloads=atividades.criarNaTransacao.mock.calls.map(chamada=>chamada[2] as {medicoes?: {ocorrenciaId:string;quantidade:string}[];entregavelIds:string[]});
    expect(payloads[0].medicoes).toEqual([{ocorrenciaId:id(601),quantidade:'5.000'}]);
    expect(payloads[1].medicoes).toEqual([{ocorrenciaId:id(602),quantidade:'9.000'}]);
    expect(payloads[0].entregavelIds).not.toEqual(payloads[1].entregavelIds);
  });

  it('rejeita cadastro multicontrato caso não tenha permissão em todos', async () => {
    const {service,atividades}=construir(new Set([id(101)]),[]);
    await expect(service.criar({titulo:'Vistoria',dataHora:'2026-11-14T12:00:00.000Z',descricao:'Visita técnica',tipo:'Inspeção',
      vinculos:[{contratoId:id(101),entregavelIds:[id(501)]},{contratoId:id(102),entregavelIds:[id(502)]}]},usuario))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(atividades.criarNaTransacao).not.toHaveBeenCalled();
  });
});
