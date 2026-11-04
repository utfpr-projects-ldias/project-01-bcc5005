# TEC08-03 — Área de documentos reais no detalhe contratual

**Base:** branch `tec-08`, commit `d8c27f2` (TEC08-01/02). **Sprint:** 04.
**Rastreabilidade:** PRD RF-04, RF-39/40/41, RB-14/20, RNF-01/02/03/08/09/10/11,
PRD §§5.6, 7.1/7.6, 9/9.2; issue-pai TEC08 e sub-issue TEC08-03.

## Integração existente reaproveitada

- `DocumentosController`/`DocumentosService`: GET paginado, POST multipart, GET metadados
  e download, guard de contrato, auditoria e storage privado da TEC08-01.
- `ProvedorConsultas`/`RepositorioConsultas`: cache privado por usuário, invalidado após POST;
  nenhum documento ou cookie persistido em localStorage.
- `useMeuPerfil`, `useAcessoContrato`, componentes de detalhe e tokens Tailwind existentes.
- `qa/tec08-02` + `qa/hu07-06`: login real, pré-voo, fixtures, SQL e ACL.

## Regras de UX e segurança

1. Seção `#documentos-contratuais` aparece apenas dentro do detalhe autorizado.
2. Upload visível só para ADMIN ou GESTOR com `podeEditar`. API permanece autoridade;
   ocultar controles NÃO substitui o guard NestJS.
3. Catálogo técnico provisório: `CONTRATO_PRINCIPAL`, `ADITIVO`, `ANEXO`, `OUTRO`.
   Principal aceita somente PDF. Formatos/tamanho são validações auxiliares;
   a API verifica o conteúdo. **PQ-11 pendente de aprovação.**
4. O contrato é criado integralmente ANTES de eventual upload. O redirecionamento
   `?anexarDocumento=principal` abre um modal no contrato já existente somente se o PDF principal estiver ausente.
   Falhas de upload preservam seleção/categoria/descrição; não disparam segundo POST de contrato.
5. Categoria/página e texto de busca local são gravados em sessionStorage **por UUID**,
   sem conteúdo documental. A busca por nome incide **somente nos 20 registros da página
   corrente**, explicitamente rotulada — não sugere busca global inexistente na API.
6. Download obtém `Blob` da API autenticada e gera URL temporária somente no browser;
   não faz link direto a storageKey/pasta ou URL fixa de arquivo.
7. Estados: carregando, sem documento principal, lista vazia, sem resultados locais,
   erro com retentativa, upload pendente/erro preservado, download indisponível e sucesso.
   Progresso de upload é **indeterminado**: não inventamos percentual sem telemetria real.
8. Documentos contratuais NÃO são evidências operacionais HU10. Não se adicionou
   exclusão ou arquivamento sem endpoint/política documental no backend.

## Gates

- Frontend Jest direcionado e suíte completa, ESLint, build Next.
- QA real: `qa/tec08-03/VALIDAR-INTEGRACAO-REAL.sh --verificar` e
  `--executar --confirmar-persistencia` (cria dados sintéticos persistentes DEV).
- TEC08-04/05: outros testes de storage, segurança, integridade, recriação e
  encerramento da issue-pai. Não declarar conformidade WCAG integral sem inspeção
  visual/navegação real em vários viewports.

## Ajuste de UX integrado (v6)

- O formulário de documentos é apresentado em **modal sobreposto**, usando o mesmo
  `ModalEtapa` do fluxo de etapas, com contexto/rotulagem específicos de documentos.
  O conteúdo da página não é deslocado com `scrollIntoView` e o modal é renderizado
  em portal no `document.body`, isolado de transições/reflow do painel.
- O modal mantém bloqueio de rolagem, compensação da largura da scrollbar, foco
  contido, `Escape`, clique fora e retorno de foco. Um estado temporário do histórico
  permite usar **Voltar** do navegador/mouse para fechar só o modal, como nas etapas.
- A criação do contrato permanece independente do PDF. O redirecionamento pós-cadastro
  abre o modal se ainda não existir documento principal. Após envio bem-sucedido,
  o modal fecha, o cache é invalidado e o arquivo aparece na lista. Ao recarregar
  depois de enviar o PDF, o parâmetro na URL não deve reabrir o formulário.
- Documentos do contrato (PDF principal, aditivos, anexos administrativos) não são
  evidências operacionais. Relatórios, imagens e links usados para comprovar
  atividades/entregáveis pertencem ao módulo de evidências (RF-19 a RF-25), cujo
  checklist de planejamento é distinto do upload efetivo.
- Os testes verificam abertura no primeiro clique, fechamento por ESC/clique fora,
  ausência de scroll forçado após seleção e comportamento pós-cadastro.


### Ajuste de estabilidade v7

- A região de resultados conserva sua altura anterior enquanto uma categoria é consultada, sem exibir documentos da categoria anterior.
- O seletor visual de arquivo usa textos em português e preserva o `input[type=file]` para acesso por teclado, leitores de tela e automação.
- A proteção de sessão global conserva a geometria das páginas durante revalidação e evita verificações duplicadas ao voltar rapidamente a uma aba; autenticação e proteção dos dados permanecem obrigatórias.
- Os documentos PDF criados pelo QA pertencem apenas aos contratos sintéticos daquele teste: o aviso de PDF ausente em outro contrato não é um erro de sincronização.
- O redesenho do detalhe de entregáveis permanece em uma entrega específica de UI/UX, sem alterar HU07 nesta sub-issue.
