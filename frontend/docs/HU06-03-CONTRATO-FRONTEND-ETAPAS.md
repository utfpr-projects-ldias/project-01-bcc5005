# HU06-03 — Contrato de integração Frontend de Etapas

## Uso real

- A tela principal é `/contratos/[id]`, que já compartilha cabeçalho e navegação com o layout interno. Não há sub-rota de detalhe de entregáveis nesta sub-issue.
- `PainelEtapas` é renderizado apenas depois de a API de Contratos retornar um contrato permitido; consultas de Etapas usam exclusivamente `/contratos/:contratoId/etapas`.
- ADMIN e Gestor com `podeEditar` podem criar/editar/reordenar. Colaborador pode consultar etapas de contratos vinculados, sem editar planejamento. O guard Nest **sempre** valida autorização por sessão e vínculo.
- Validação no navegador: nome não vazio (<=255), código opcional (<=50), datas civis reais, término >= início; status próprio de Etapa (PLANEJADA, EM_ANDAMENTO, CONCLUIDA). Somente o nome é obrigatório. O backend continua fonte da verdade.
- As mensagens de erro do cliente não mostram SQL, UUIDs de recursos alheios ou mensagens internas vindas da API. Formulário mantém os valores após erro de rede/validação.
- Reordenação acessível por teclado pelos botões Subir/Descer. O frontend envia `idsOrdemAtual` mais `idsOrdemNova`; após 409 solicita nova listagem, revertendo a ordem otimista. Ao falhar, reverte a posição local; nenhuma operação de exclusão é criada.
- Atualizar mostra `atualizando` mantendo a listagem atual enquanto a requisição ocorre, mas respostas 401/403/404 ocultam dados protegidos do cache.
- Cada etapa com `avisoVigencia=true` mostra aviso textual. Atualização do Contrato **não** muda datas das Etapas automaticamente. Não existe restrição de calendário adicional da UI.
- Retornos esperados: 200 GET/PATCH, 201 POST, 400 entrada, 401 sessão, 403 permissão, 404 recurso, 409 ordenação/conflito.

## Rastreabilidade

PRD v1.0 — RF-05, RF-39/40, RNF-02, RNF-09/10 e estados UX §5.6. O PRD deixa PQ-04 (permissão granular do Colaborador) em aberto; por segurança não é oferecida escrita de planejamento. Fase 2 (anexo): não contempla portal externo, finanças, assinatura, notificações ou IA.

## Limites e próximo gate

HU06-03 entrega interface e testes automatizados isolados. HU06-04 complementará a cobertura de UI e segurança. HU06-05 deverá realizar validação ponta a ponta com sessão SuperTokens real, banco PostgreSQL e pelo menos dois registros persistidos; nenhuma aprovação de ponta a ponta é declarada aqui.
