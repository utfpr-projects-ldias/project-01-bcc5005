"""Contrato do roteiro Marco (unitário, não substitui POSTs reais no DEV)."""
from __future__ import annotations
import importlib.util
from pathlib import Path
from unittest import TestCase, main, mock
from uuid import uuid4

ARQ=Path(__file__).with_name('validar_fluxo_real.py')
spec=importlib.util.spec_from_file_location('qa_integrado_marco',ARQ)
qa=importlib.util.module_from_spec(spec);spec.loader.exec_module(qa)


class MetaMarco(TestCase):
    def test_ciclo_positivo_negativo_reabertura_e_reaprovacao(self):
        atividade_id=str(uuid4());marco_id=str(uuid4());meta_a=str(uuid4());meta_b=str(uuid4());v_a=str(uuid4());v_b=str(uuid4())
        verificada=True;acoes=[];num_metas=0
        def api(_page,_url,rota,metodo='GET',dados=None,aceitos=(200,)):
            nonlocal verificada,num_metas
            acoes.append((metodo,rota,dados))
            if metodo=='GET' and rota.endswith('/candidatos'):return [{'id':atividade_id}]
            if metodo=='GET' and rota.endswith('/metas'):
                return {'metas':[{'id':meta_a,'pronto':verificada,'quantidadeAprovada':1 if verificada else 0},
                                {'id':meta_b,'pronto':False,'quantidadeAprovada':0}]}
            if metodo=='GET' and '/ocorrencias/' in rota:return {'quantidadeExecutada':'2.000'}
            if metodo=='POST' and rota.endswith('/entregaveis'):
                self.assertEqual(dados['tipo'],'MARCO');self.assertTrue(dados['criterioConclusao']);return {'id':marco_id}
            if metodo=='POST' and rota.endswith('/metas'):
                num_metas+=1;return {'id':meta_a if num_metas==1 else meta_b,'pronto':False,'quantidadeAprovada':0}
            if metodo=='POST' and rota.endswith('/vinculos'):
                self.assertEqual(dados,{'registroId':atividade_id});return {'vinculos':[{'id':v_a if num_metas==1 else v_b,'status':'PENDENTE'}]}
            if metodo=='POST' and rota.endswith('/aprovar'):
                return {'pronto':True,'quantidadeAprovada':1}
            if metodo=='POST' and rota.endswith('/rejeitar'):
                self.assertIn('justificativa',dados)
                return {'pronto':False,'quantidadeAprovada':0}
            if metodo=='POST' and rota.endswith('/reabrir'):
                verificada=False;return {'status':'REGISTRADA'}
            if metodo=='POST' and rota.endswith('/aprovar-conclusao'):
                verificada=True;return {'status':'VERIFICADA'}
            if metodo=='POST' and rota.endswith('/solicitar-conclusao'):
                return {'status':'PENDENTE_VERIFICACAO'}
            self.fail(f'Operação Marco inesperada: {metodo} {rota}')
        with mock.patch.object(qa,'exigir_api',side_effect=api), mock.patch.object(qa,'requisitar',return_value={'status':409}), mock.patch.object(qa,'reabrir_contexto_de_atividade'):
            saida=qa.testar_ciclo_marco_real(object(),'http://localhost:3001','/contratos/qa',
                str(uuid4()),str(uuid4()),str(uuid4()),str(uuid4()),str(uuid4()),atividade_id,'2026-11-23')
        self.assertTrue(saida['revogacaoPorReabertura'])
        self.assertTrue(saida['restauracaoPorAprovacao'])
        self.assertEqual(saida['aprovada'],1)
        self.assertEqual(saida['rejeitada'],0)
        self.assertTrue(any('vinculos/' in rota and rota.endswith('/rejeitar') for _,rota,_ in acoes))
        self.assertTrue(any(rota.endswith('/reabrir') for _,rota,_ in acoes))

if __name__=='__main__':main()
