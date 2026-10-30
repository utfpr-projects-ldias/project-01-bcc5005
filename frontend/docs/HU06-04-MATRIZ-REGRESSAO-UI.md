# HU06-04 — Regressão da interface (testes React)

**Escopo:** complementação de testes sobre componentes **existentes** da HU06-03, sem alterar tela ou mecanismo de acesso.

| Caso | Evidência automatizada | Limite |
|---|---|---|
| Carregamento da lista | `painel-etapas.hu06-04.test.tsx`: texto de status e ausência de dados fictícios | `useEtapas` simulado |
| Vazio/ação para Gestor | Lista vazia + botão Novo | Hook simulado |
| Erro/retentativa | `role=alert`, ação Atualizar | Backend não acessado |
| Revogação/401 | Lista de registros protegidos suprimida | Dados simulados |
| Colaborador | Sem controles de criação/edição/ordem | Flag de permissão simulada; backend cobre autorização real |
| Reordenação | Botão nativo, foco, aria-label, limite primeiro/último, payload `idsOrdemAtual/idsOrdemNova` | A execução do comando é via click de botão; navegação completa por teclado só no QA manual |
| Conflito 409 | Mantém lista e solicita atualização | Hook simulado; banco real no E2E |
| Erro 500 | Retorno à sequência anterior e aviso | Hook simulado |
| Datas/aviso | `role=note` e status operacional independentes | Dados simulados |
| Formulário | Erro associado a campo, `aria-invalid`, submit nativo, feedback e preservação dos dados | Callback HTTP simulado |

**Exclusões intencionais:** nenhum drag-and-drop, nenhum entregável fictício, nenhuma navegação duplicada, nenhuma exibição de informações financeiras ou portal externo. Os testes frontend não provam a autenticação real; o gate do backend cobre as regras de permissão e a HU06-05 irá validar a jornada real.
