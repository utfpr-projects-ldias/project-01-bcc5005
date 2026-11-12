# TEC07-AJUSTES-02-04 — Contrato técnico compartilhado v1.0

**Issue-pai:** TEC07-AJUSTES-02 · **Sub-issue:** 02-04 · **Sprint:** 04 · **Contrato:** `tec07.operacional.v1`.
**Status:** proposta implementada no patch; a efetivação da integração depende de PR/merge em `develop` e testes locais aprovados.

## 1. Escopo e fonte normativa

- PRD v1.0 — Etapa 1: RF-05, RF-39, RF-40, RF-41, RF-42; RB-14, RB-18, RB-19, RB-20; RNF-01, RNF-02, RNF-05, RNF-08 e RNF-11. O RF-42 (consulta de histórico) **não** é implementado aqui; consumidor TEC11/S06.
- PRD §11.3, PQ-03 e PQ-04: Gestor somente autorizado; Colaborador sem edição automática do planejamento. Gestor criar Contrato e quais campos do Entregável o Colaborador edita permanecem **pendentes** de decisão.
- Anexo I da Fase 2: portal do fiscal, aceite externo, financeiro, workflow, assinaturas e IA **não** pertencem à Etapa 1. Não criar acesso para o órgão público.
- Código vigente: `politicas-operacionais.ts`, `politica.decorator.ts`, `autorizacao.guard.ts`, `politica-acesso.service.ts`, `resolver-escopo-contrato.service.ts`, `auditoria.service.ts`.

O contrato v1 é **compartilhado**; as equipes HU06/HU07/HU08/HU09/TEC08/TEC09 mantêm a propriedade de seus DTOs, serviços e controllers. Os exemplos abaixo não são endpoints implantados.

## 2. Matriz de ações e responsabilidade

Cada ação abaixo já está no catálogo `POLITICAS_OPERACIONAIS` com **escopo e classe fechados**. `leitura` autoriza Gestor/Colaborador com vínculo, `operacional` autoriza com vínculo, `planejamento` exige Gestor com `podeEditar=true` ou Administrador. Administrador exige recurso existente para rotas por ID; não pode usar ID fictício. Curingas são inválidos.

| Dono da API | Ações da versão v1 | Operação e escopo |
|---|---|---|
| **HU06-02 — Etapas** | `etapas:listar`, `etapas:visualizar`, `etapas:criar`, `etapas:editar`, `etapas:reordenar` | lista/criação/reordenação: contrato; visualização/edição: Etapa persistida |
| **HU07 — Entregáveis** | `entregaveis:listar`, `entregaveis:visualizar`, `entregaveis:criar`, `entregaveis:editar` | criação/lista: contrato; detalhe/edição: Entregável persistido |
| **HU08 — Ocorrências** | `ocorrencias:listar`, `ocorrencias:visualizar`, `ocorrencias:gerar`, `ocorrencias:registrar` | lista/geração: contrato; detalhe/registro: Ocorrência persistida |
| **HU09 — Atividades** | `atividades:listar`, `atividades:visualizar`, `atividades:registrar` | lista/registro: contrato; detalhe: Atividade persistida |
| **TEC08 — Documentos** | `documentos:listar`, `documentos:visualizar`, `documentos:baixar`, `documentos:anexar` | lista/anexo: contrato; detalhe/download: Documento persistido |
| **TEC09 — Execução/avanço** | `execucao:atualizar` | Entregável persistido; planejamento até definição de PQ-04 |
| **TEC08/HU posteriores — Evidências** | `evidencias:listar`, `evidencias:visualizar`, `evidencias:anexar`, `evidencias:arquivar` | lista/anexo: contrato; detalhe/arquivamento: Evidência persistida |

**Atenção:** `AcaoAuditoria` já possui ações para ETAPA, ENTREGAVEL, OCORRENCIA, ATIVIDADE e DOCUMENTO. **Não possui tipo/evento EVIDENCIA nesta versão.** O dono de Evidências deve propor acréscimo explícito e teste ao catálogo antes de publicar sua API auditada. Não registrar evento com tipo falso nem mapear para DOCUMENTO.

## 3. Contrato do guard e dos parâmetros

1. Declarar `@ExigirPoliticaOperacional(acao, escopo)` em **cada método privado**, usando ação válida e sem política por classe genérica.
2. Rotas de lista/criação recebem `contratoId` **somente da rota**; `ResolverEscopoContratoService` confere existência real do contrato. A ACL verifica vínculo do usuário autenticado. O serviço deve consultar/alterar **apenas o contrato da rota**, com filtro SQL.
3. Rotas com ID de recurso recebem escopo `recurso`, com `parametro` igual ao nome real em `@Param`. A raiz vem da FK persistida; nunca aceitar `contratoId` do body/query.
4. Rotas aninhadas usam `parametroContratoPai` para comparar `contratoId` da URL com raiz real do recurso. Uma divergência deve retornar resposta uniforme sem dados de outro contrato.
5. O `AutorizacaoGuard` global consulta sessão SuperTokens, usuário provisionado/ativo e política. Uma rota interna sem política **é negada por padrão**.
6. Em listagens/contagens/agregados, aplicar escopo no banco **antes** de materializar entidades; ocultar botões no frontend não é autorização.
7. O guard valida escopo e acesso, mas **não substitui** validações de regras de negócio no serviço nem revisões transacionais para escrita em recursos filhos.

### Exemplo HU06-02 — rotas de Etapas (somente contrato técnico)

```ts
// Dentro do controller proprietário da HU06-02, NÃO inserir aqui na infraestrutura.
@Get('/contratos/:contratoId/etapas')
@ExigirPoliticaOperacional('etapas:listar', {
  tipo: 'contrato', parametro: 'contratoId',
})
listar(@Param('contratoId') contratoId: string) {
  return this.etapas.listarNoContrato(contratoId); // SQL WHERE contrato_id = :contratoId
}

@Patch('/contratos/:contratoId/etapas/:etapaId')
@ExigirPoliticaOperacional('etapas:editar', {
  tipo: 'recurso', recurso: 'etapa', parametro: 'etapaId',
  parametroContratoPai: 'contratoId',
})
editar(@Param('etapaId') etapaId: string, @Body() dto: AtualizarEtapaDto) {
  return this.etapas.editarNaTransacao(etapaId, dto);
}
```

A etapa já tem `Etapa.contratoId` no PostgreSQL (HU06-01); sua resolução está registrada na infraestrutura. A HU06-02 ainda deve construir endpoints, DTOs, reordenação e regras de domínio.

### Exemplo TEC08-02 — Documento (somente contrato técnico)

```ts
// Ao existir a entidade Documento real, o módulo DONO a registra em onModuleInit.
this.escopos.registrarAdaptador('documento', async (id) => {
  const registro = await this.documentos.findOne({
    where: { id }, select: { contratoId: true },
  });
  return registro?.contratoId ?? null; // FK persistida, nunca body/query
});

this.auditoria.registrarResolvedorContexto('DOCUMENTO', async (manager, id) => {
  const registro = await manager.getRepository(Documento).findOne({
    where: { id }, select: { contratoId: true },
  });
  return registro?.contratoId ?? null; // Mesmo EntityManager de escrita
});

// No controller TEC08-02:
@Get('/contratos/:contratoId/documentos/:documentoId/arquivo')
@ExigirPoliticaOperacional('documentos:baixar', {
  tipo: 'recurso', recurso: 'documento', parametro: 'documentoId',
  parametroContratoPai: 'contratoId',
})
baixar(@Param('documentoId') documentoId: string) {
  return this.documentos.baixarArquivoAutorizado(documentoId);
}
```

**Não copiar o bloco como código de produção sem criar a entidade/migration de Documentos e o módulo de armazenamento.** A fixture automatizada em `tec07-ajustes-02-04-contratos-consumo.spec.ts` verifica as declarações, o ID filho, a divergência com a rota pai e a regra de acesso; ela **não** faz upload/download e não afirma que TEC08 foi entregue.

A HU07/HU08/HU09 devem registrar seus próprios adaptadores por entidade e consulta ao banco; para relações N:N validar **todos** os contratos dos vínculos escolhidos, inclusive no service/transaction, nunca autorizar um vínculo apenas porque outro é permitido.

## 4. Contrato de auditoria v1 — extensão nova em TEC07-AJUSTES-02-04

`AuditoriaService.registrarResolvedorContexto(tipo, fn)` permite que o módulo proprietário cadastre, **uma única vez no `onModuleInit`**, como obter `contrato_id` de ENTREGAVEL, OCORRENCIA, ATIVIDADE e DOCUMENTO.

- Assinatura `fn(manager: EntityManager, entidadeId: string): Promise<string | null>`; `manager` é o **mesmo** da escrita do evento. Não fazer consulta fora da transação para inferir a FK.
- O módulo retorna a **FK real** encontrada na entidade (UUID do contrato); retorna `null` se não houver entidade. Com adaptador registrado, `null`/UUID inválido faz a operação falhar, permitindo rollback.
- Um segundo registro para o mesmo tipo lança erro. Não é permitido substituir os resolvedores legados `CONTRATO`, `USUARIO` e `ETAPA`.
- Quando o módulo ainda não existe, preservar semântica da TEC07-AJUSTES-02-01: tipos operacionais sem adaptador podem continuar com `contrato_id = NULL` (compatibilidade); os **novos serviços de domínio** devem registrar seu adaptador antes de usar eventos em produção.
- Para `ETAPA`, o próprio `AuditoriaService` já consulta a FK persistida. Para `CONTRATO`, utiliza a identidade do contrato; para `USUARIO`, o contexto é `NULL`.
- Registrar eventos usando `executarComAuditoria(ator, async manager => ...)` ou `registrarNaTransacao(manager, ator, evento)` e **nunca escrever parte da mutação fora do manager**. Falha ao registrar evento deve abortar toda a transação SQL.

Exemplo de evento após a escrita persistida:

```ts
await this.auditoria.registrarNaTransacao(manager, req.usuarioDominio, {
  acao: AcaoAuditoria.DOCUMENTO_ANEXADO,
  entidadeTipo: 'DOCUMENTO',
  entidadeId: documentoSalvo.id,
  dadosAnteriores: null,
  dadosPosteriores: { nome: documentoSalvo.nome, tipo: documentoSalvo.tipo },
});
// NÃO incluir contratoId vindo do DTO: o resolvedor usa a FK real.
```

`AlteracaoAuditavel` aceita só: `acao`, `entidadeTipo`, `entidadeId`, `dadosAnteriores`, `dadosPosteriores`. O backend sanitiza `senha`, `password`, `token`, `cookie`, `session`, `hash`, `secret`, `apiKey` etc.; objetos simples, até 8 níveis e JSON serializado de até 16.384 caracteres por snapshot. Não colocar bytes de arquivos/links assinados/credenciais no snapshot. Auditoria registra identidade da sessão, não do corpo HTTP.

O contrato da coluna `eventos_auditoria.contrato_id` é **nullable e aditivo** (`1793600000000-ContextoAuditoriaOperacional`); histórico legado fica intacto. Este patch **não possui migration**. `RF-42`/TEC11 ainda deverá implementar a consulta de histórico autorizada.

## 5. DTO, persistência, erros e testes

**DTOs dos módulos:** usar `class-validator` e `class-transformer`, com `@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))` como já usa `ContratosController`. Não aceitar `usuarioId`, `perfil`, `podeEditar` nem `contratoId` do corpo para decidir acesso. UUID da rota inválido deve ser negado; datas civis ISO e restrições de negócio são responsabilidade da HU/TEC proprietária.

**Erros HTTP:** sem sessão → 401; usuário não provisionado/inativo ou rota interna sem política → 403; recurso inexistente, ID inválido, recurso de outra carteira ou divergência da rota aninhada → 404 uniforme nas novas ações operacionais; DTO inválido → 400; colisão de unicidade/estado de negócio → 409 quando aplicável; falha interna da transação → 5xx sem vazar dados. Não retornar números ou campos de outro contrato.

**PostgreSQL/TypeORM:** adotar migracões versionadas e aditivas, sem `synchronize`, preservar migrations anteriores, chaves FK e histórico. Não executar `down -v`, nem alterar permissão global durante teste. Usar banco isolado para E2E. Storage externo requer mecanismo real de compensação; transação SQL não desfaz upload físico.

**Testes obrigatórios do consumidor:** autorização HTTP com sessão real ou simulação identificada, revogação de vínculo, IDs cruzados, filtro SQL, 401/403/404/409, DTO inválido, evento sem segredo, rollback de escrita e auditoria e teste do endpoint real. Os testes desta infraestrutura **não** substituem HU06-04 ou TEC08-04.

## 6. Política de mudanças e PRs

1. Infra compartilhada (`politicas-operacionais.ts`, `politica.decorator.ts`, `autorizacao.guard.ts`, `politica-acesso.service.ts`, `resolver-escopo-contrato.service.ts`, `auditoria.service.ts`) é propriedade da **TEC07-AJUSTES-02**. Mudança de contrato exige issue/PR de evolução, revisão por donos consumidores e teste de regressão; nunca editar independentemente em duas branches de feature.
2. Cada módulo dono registra apenas **seu adaptador** e adiciona controllers/services/DTO/tests no próprio diretório. Para nova ação, propor expansão de catálogo e responsável, sem ação coringa.
3. Ordem de integração real: `02-01` → `02-02` → `02-03` → `02-04` em `develop` → HU06-02 / TEC08-02 e demais APIs. No GitHub do projeto as sub-issues estão sendo integradas por **PRs separados**; a redação antiga da issue-pai que sugeria um único PR não reflete esse fluxo.
4. Exigir evidência **Git** do merge (`git fetch`, `git log origin/develop`, hash de merge) antes de declarar gate final liberado. Um ZIP não demonstra merge.
5. Migrations e novas tabelas somente nas histórias proprietárias. `TEC07-AJUSTES-01` está concluída e **não** será reaberta.

## 7. Decisões pendentes e limites explícitos

- **PQ-03:** Gestor pode criar contratos? Não assumido; atualmente somente ADMIN.
- **PQ-04:** Colaborador altera planejamento/entregáveis? Não assumido; catálogo mantém operações de planejamento restritas.
- **PQ-14:** granularidade de leitura do histórico pelo Gestor, para RF-42/TEC11.
- Evidência (entidade auditável e múltiplos vínculos) e regras especiais de documentos/ocorrências devem ser detalhadas pela respectiva HU/TEC. Nunca autorizar cruzamento N:N por contrato de um único vínculo.
- Fase 2 não foi implementada nem antecipada: sem portal do fiscal público, financeiro, aceite externo, assinatura, automação avançada, IA ou integração governamental.
