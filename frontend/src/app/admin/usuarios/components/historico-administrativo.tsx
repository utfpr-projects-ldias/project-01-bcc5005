'use client';

import { useState } from 'react';
import { useConsulta } from '@/app/components/provedor-consultas';
import { consultarHistoricoAdministrativo } from '@/lib/admin-usuarios';

const rotulos: Record<string, string> = {
  USUARIO_CRIADO: 'Funcionário cadastrado', USUARIO_ATUALIZADO: 'Cadastro atualizado',
  USUARIO_PERFIL_ALTERADO: 'Perfil alterado', USUARIO_STATUS_ALTERADO: 'Situação alterada',
  USUARIO_EMAIL_ALTERADO: 'E-mail alterado', USUARIO_EMAIL_ALTERACAO_SOLICITADA: 'Alteração de e-mail solicitada',
  USUARIO_EMAIL_ALTERACAO_REJEITADA: 'Alteração de e-mail rejeitada',
  USUARIO_SENHA_REDEFINICAO_SOLICITADA: 'Alteração de senha solicitada', USUARIO_SENHA_REDEFINIDA: 'Senha alterada',
  USUARIO_SENHA_REVOGACAO_PENDENTE: 'Revogação de sessões pendente',
  USUARIO_CREDENCIAIS_REGULARIZADAS: 'Credenciais regularizadas',
  USUARIO_PERMISSAO_CONCEDIDA: 'Permissões contratuais atualizadas', USUARIO_PERMISSAO_REVOGADA: 'Vínculo contratual revogado',
};

export function HistoricoAdministrativo() {
  const [cursores, setCursores] = useState<(string | null)[]>([null]);
  const antes = cursores.at(-1) ?? null;
  const consulta = useConsulta(['admin', 'historico', antes], signal => consultarHistoricoAdministrativo(antes, signal));
  const dados = consulta.dados;
  return <section aria-label="Histórico administrativo" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-base font-semibold">Histórico administrativo</h3>
      <button type="button" disabled={consulta.carregando || consulta.atualizando} onClick={() => { void consulta.atualizar().catch(() => {}); }}
        className="rounded-lg border border-[color:var(--pi-admin-borda)] px-3 py-2 text-sm">Atualizar</button>
    </div>
    <p className="text-xs text-foreground/65">Registro de operações de usuários e permissões. Senhas, tokens e snapshots internos não são exibidos.</p>
    {consulta.carregando && <p role="status">Consultando histórico...</p>}
    {consulta.erro ? <p role="alert" className="text-error-text">Não foi possível consultar o histórico.</p> : dados && <>
      {dados.itens.length === 0 ? <p>Nenhum evento encontrado.</p> : <div className="overflow-x-auto rounded-lg border border-foreground/15">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-foreground/15"><th scope="col" className="p-3">Data</th><th scope="col" className="p-3">Operação</th><th scope="col" className="p-3">Usuário</th><th scope="col" className="p-3">Autor</th><th scope="col" className="p-3">Contrato</th></tr></thead>
          <tbody>{dados.itens.map(e => <tr key={e.id} className="border-b border-foreground/10">
            <td className="whitespace-nowrap p-3">{new Date(e.registradoEm).toLocaleString('pt-BR')}</td>
            <td className="p-3">{rotulos[e.acao] ?? e.acao}</td>
            <td className="p-3">{e.usuarioNome ?? 'Usuário não disponível'}</td>
            <td className="p-3">{e.autor}</td><td className="p-3">{e.codigoContrato ?? '—'}</td>
          </tr>)}</tbody>
        </table>
      </div>}
      <nav aria-label="Paginação do histórico" className="flex flex-wrap items-center gap-3 text-sm">
        <button type="button" className="rounded border border-foreground/20 px-3 py-2 disabled:opacity-50" disabled={cursores.length <= 1} onClick={() => setCursores(c => c.slice(0, -1))}>Anterior</button>
        <span>Página {cursores.length}</span>
        <button type="button" className="rounded border border-foreground/20 px-3 py-2 disabled:opacity-50" disabled={!dados.proximo} onClick={() => { if (dados.proximo) setCursores(c => [...c, dados.proximo]); }}>Próxima</button>
      </nav>
    </>}
  </section>;
}
