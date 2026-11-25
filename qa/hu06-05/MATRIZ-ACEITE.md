# HU06-05 — Matriz de aceite e rastreabilidade

**Enunciado da sub-issue:** `4 sprint-04/sub-issues/HU06-05-INTEGRACAO-UNIR-BACKEND-FRONTEND-E-VALIDAR-FLUXO-REAL.md`.

A HU06-05 não é uma nova HU07 e não deve marcar como concluído requisito sem prova. O PRD (versão 1.0, Etapa 1, RF-05; RF-39–42; RB-14,18–20; RNF-01,02,05,09,10; §§5.6,7,8.2,9,13.6) exige ordenação, autorização real, auditoria, consistência e UX; o Anexo I reserva funcionalidades externas/financeiras para a Fase 2.

## Estado R37: aceite funcional automatizado

A central `./testes-all` cria dois contratos sintéticos e executa HU06-05 em
Chromium real com cinco perfis, API, PostgreSQL, reinício, foco via Tab e duas
larguras. `consolidar_gate.py --automatico` é obrigatório no roteiro; reprova
se não houver comprovação. Não atribuir automaticamente aprovação ao PR,
à estética subjetiva ou à expiração natural de sessão apenas porque o logout
devolveu HTTP 401. Não existe gate manual adicional de aprovação funcional.

| Critério HU06-05 | Evidência exigida pelo gate automático | Resultado esperado |
|---|---|---|
| Cadastro e edição de etapas | Chromium + API com administrador e gestor autorizado; conferência de IDs persistidos | `APROVADO` com provas |
| Ordenação e atualização de navegador | Resultado após PATCH, GET e recarga de página | Sequência preservada |
| Persistência após reinício | Reinício do backend, comparação com PostgreSQL direto | Dados preservados |
| Sessões SuperTokens | Cinco perfis com login real pelo navegador e logout seguido de HTTP 401 | Permissões e encerramento corretos |
| Leitura e isolamento por contrato | Gestor somente leitura, colaborador, sem vínculo e consulta cruzada | Negação de escrita ou acesso indevido |
| Responsividade e teclado | Chromium em 390px e 1280px, navegação por Tab/foco | Controles acessíveis |
| Esquema e auditoria | Suites HU06-01/02/04 e verificação PostgreSQL independente | Integridade e auditabilidade |

Todos os itens objetivos acima são executados pela central. Não é necessário
preencher `registro-visual.json` nem coletar UUIDs para executar `./testes-all`.

### Limites de evidência

- Os E2E da HU06-02/04 testam HTTP/PostgreSQL real, **mas simulam a identidade da sessão**. Este validador HU06-05 usa a sessão SuperTokens gerada pelo login na interface real.
- O validador escreve Etapas *permanentes* identificadas `H605-...` somente com `--escrita --confirmar-persistencia`; não contém rota para remoção (RB-14).
- O QA automatizado não substitui inspeção visual humana nem comprova expiração temporal natural do token.
- Os relatórios JSON são gerados na máquina do usuário (incluem IDs de contrato/Etapas, sem senhas/cookies/tokens). Revisar antes de anexar ao PR.
- Nenhum requisito de entregáveis, financiamento, portal externo ou aceite do fiscal é antecipado.
- **O aceite funcional HU06 é automático** e reprova se faltar qualquer prova obrigatória. Revisão/merge do PR seguem o fluxo do repositório, não um gate manual de testes.
