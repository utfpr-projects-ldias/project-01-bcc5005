# HU06-05 — Matriz de aceite e rastreabilidade

**Enunciado da sub-issue:** `4 sprint-04/sub-issues/HU06-05-INTEGRACAO-UNIR-BACKEND-FRONTEND-E-VALIDAR-FLUXO-REAL.md`.

A HU06-05 não é uma nova HU07 e não deve marcar como concluído requisito sem prova. O PRD (versão 1.0, Etapa 1, RF-05; RF-39–42; RB-14,18–20; RNF-01,02,05,09,10; §§5.6,7,8.2,9,13.6) exige ordenação, autorização real, auditoria, consistência e UX; o Anexo I reserva funcionalidades externas/financeiras para a Fase 2.

| Critério HU06-05 | Evidência automatizada real | Evidência manual necessária | Aceite |
|---|---|---|---|
| Contrato existente, criar 2 Etapas | `--escrita`; HTTP POST observado pelo browser, API GET + IDs persistidos | Selecionar contrato existente de QA, não criar contrato fictício no script | Pendente até execução |
| Alterar código, nome, status | `--escrita`; PATCH pela UI + GET confirma mudanças | Conferir textos no navegador | Pendente até execução |
| Ordenar | `--escrita`; PATCH real e troca de sequência no GET | Conferir visualmente A/B e acessibilidade dos botões | Pendente até execução |
| Atualizar navegador | `--escrita`; recarrega página, compara UI e IDs/ordem | Recarregar no navegador normal | Pendente até execução |
| Reiniciar backend sem perder dados | `--reiniciar-backend --validar-banco`; `docker compose restart backend` + PostgreSQL direto | Conferir containers e persistência na UI | Pendente até execução |
| Sessão real SuperTokens | Login manual no navegador Chromium isolado + `/usuarios/me` real e requisições `credentials: include`; sem mocks | Senha digitada apenas na página de login do sistema, nunca no relatório | Pendente até execução |
| Admin global | `--perfil administrador --escrita` | Conferir contrato autorizado e controles | Pendente até execução |
| Gestor com edição | `--perfil gestor-edicao --escrita` | Verificar vínculo e `podeEditar=true` no cadastro real | Pendente até execução |
| Gestor sem edição | `--perfil gestor-leitura`; UI sem escrita e POST negado | Verificar vínculo e `podeEditar=false` | Pendente até execução |
| Colaborador | `--perfil colaborador`; UI sem escrita e POST negado | Verificar vínculo real | Pendente até execução |
| Sem vínculo e ID cruzado | `--perfil sem-vinculo` e `--outro-contrato-id` em outra execução com acesso aos dois contratos | Verificar ambos os vínculos | Pendente até execução |
| Sessão encerrada | Logout real pela UI seguido de GET `/etapas` retornando 401 | Para *expiração natural* de token, realizar QA específico adicional com credenciais de QA; logout **não é prova de expiração temporal**. O gate exige `sessaoExpirada=true` no registro manual | Pendente até execução |
| Backend Nest + PostgreSQL real | GET direto ao PostgreSQL no container com `--validar-banco`, comparado à API e UI | Verificar migrations / `synchronize:false` via HU06-04 | Pendente até execução |
| Responsividade / teclado | `--largura 390` exercita a UI; `--largura 1280` exercita desktop | Testar Tab/Shift+Tab, foco, rótulos, não depender apenas de cor e mensagem 409 | Pendente até execução |
| HU07 — interface de contrato | UUID PK `etapas.id`, FK `etapas.contrato_id → contratos.id`, `(contrato_id, sequencia)` UNIQUE DEFERRABLE (HU06-01/04) | Revisar `backend/docs/HU06-02-CONTRATO-API-ETAPAS.md`; nenhuma entidade de HU07 criada | Confirmar na revisão |
| Auditoria | HU06-04 valida ator, snapshots e rollback em PostgreSQL | Conservar os logs anteriores + revisar eventos após QA real | Confirmar no PR |

### Limites de evidência

- Os E2E da HU06-02/04 testam HTTP/PostgreSQL real, **mas simulam a identidade da sessão**. Este validador HU06-05 usa a sessão SuperTokens gerada pelo login na interface real.
- O validador escreve Etapas *permanentes* identificadas `H605-...` somente com `--escrita --confirmar-persistencia`; não contém rota para remoção (RB-14).
- O QA automatizado não substitui inspeção visual humana nem comprova expiração temporal natural do token.
- Os relatórios JSON são gerados na máquina do usuário (incluem IDs de contrato/Etapas, sem senhas/cookies/tokens). Revisar antes de anexar ao PR.
- Nenhum requisito de entregáveis, financiamento, portal externo ou aceite do fiscal é antecipado.
- **HU06 só pode ser fechada após** todos os perfis verificados, QA real manual aprovado, evidências anexadas, revisão do PR e merge de HU06-05 em `develop`.
