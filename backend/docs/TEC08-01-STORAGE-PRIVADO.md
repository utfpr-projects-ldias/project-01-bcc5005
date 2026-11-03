# TEC08-01 — Política provisória, contrato de storage e operação segura

**Sprint 04 · issue-pai TEC08 · referência:** PRD RF-04, RB-14/20, RNF-01/02/03/05/08/11, PQ-11.
**Status desta entrega:** base de armazenamento (backend/infra), **sem upload HTTP, entidade documental, migration ou interface** — tarefas da TEC08-02/03/04/05.
**A aprovação do cliente para PQ-11 NÃO foi apresentada.** Estes limites são políticas técnicas provisórias de DEV, não requisitos comerciais homologados.

## 1. Estrutura de armazenamento

- Backend local: `ArmazenamentoLocal`, implementando `ArmazenamentoArquivos` (`backend/src/armazenamento`).
- Provider Nest `ARMAZENAMENTO_ARQUIVOS`, exportado por `ArmazenamentoModule`. O futuro `DocumentosModule` deve **importar** `ArmazenamentoModule`; deliberadamente não há rota HTTP ou módulo de documentos neste incremento.
- Dados em `/var/lib/contratos-arquivos` **dentro do backend**, com volume nomeado `arquivos_contratuais_data`, distinto do `postgres_data`.
- O volume é montado apenas no backend. Nenhum arquivo é colocado em `frontend/public`, `backend/public`, `.next` ou em diretórios servidos diretamente.
- Chave interna de 128 bits gerada no servidor (32 caracteres hex); bytes armazenados em `<diretorio>/<dois-primeiros-hex>/<chave>.bin`, nunca no caminho informado pelo usuário.
- Escrita em arquivo temporário `wx` (modo 0600), `fsync`, publicação por `link()` exclusivo, limpeza de temporário e `fsync` de diretório. Leitura abre com `O_NOFOLLOW`, valida arquivo regular. Operações de quota e escrita ficam serializadas **em uma instância**.

## 2. Catálogo restritivo e decisões PQ-11

| Regra provisória | Valor configurado | Homologado pelo cliente? |
|---|---|---|
| Tipos | `application/pdf` (`.pdf`), `image/png` (`.png`), `image/jpeg` (`.jpg`/`.jpeg`), `image/webp` (`.webp`), `text/plain` (`.txt`) | **Não** |
| Limite por arquivo | `16777216` bytes (16 MiB) | **Não** |
| Capacidade total do storage DEV | `1073741824` bytes (1 GiB) | **Não** |
| Cota por contrato | **Não definida nem implementada**; exige vínculo de domínio em TEC08-02 | **Não** |
| Retenção | **Indefinida**; não há exclusão automática por idade | **Não** |
| Vídeos e formatos Office | **Bloqueados provisoriamente** até decisão sobre MIME/risco/volume | **Não** |
| Backup e restauração | Operação manual conjunta com banco, mediante procedimento aprovado | **Não** |

Alterações de política por ambiente exigem decisão explícita e registro. Limites no `.env` **não podem** tornar políticas antigas aprovadas retroativamente. O código verifica extensão e MIME declarado **mais uma assinatura estrutural mínima** (PDF/PNG/JPEG/WEBP ou UTF-8 textual). **Isso não equivale a antivírus nem validação completa dos formatos**; caso o produto receba arquivos externos em produção, aplicar análise de conteúdo/antimalware e `Content-Disposition: attachment` no futuro endpoint, com `X-Content-Type-Options: nosniff`. O backend futuro não deve renderizar HTML/SVG arbitrário.

## 3. Contrato de integração (TEC08-02 e HU10)

```typescript
const pendente = await storage.salvar({
  nomeOriginal: 'documento.pdf',
  mimeDeclarado: 'application/pdf',
  conteudo: bytesValidos,
});
// pendente: { chave, nomeOriginal, mimeEfetivo, tamanho, sha256, tokenCompensacao }
try {
  // Na TEC08-02: primeiro autorizar contrato/usuário, depois persistir
  // documento + evento de auditoria na MESMA transação PostgreSQL.
  await salvarMetadadosEAuditoriaEmTransacao(pendente);
  storage.confirmarPersistencia(pendente); // SOMENTE após COMMIT bem-sucedido
} catch (erro) {
  // Se não houve commit, o token efêmero permite apagar apenas ESTE blob pendente.
  await storage.removerOrfao(pendente);
  throw erro;
}
```

O exemplo acima é **conceitual**, não código executável da aplicação atual. Na TEC08-02, erros ambíguos de commit exigem consultar o estado do PostgreSQL **antes de remover**. `removerOrfao` exige chave e token emitidos neste processo e ainda pendentes; após `confirmarPersistencia`, a remoção é bloqueada. Não há exclusão geral por chave e não se implementou arquivamento/exclusão de documentos ou evidências.

**Falha de processo/crash:** arquivos publicados antes do commit podem sobreviver sem metadado. Os tokens efêmeros não sobrevivem ao reinício. A TEC08-02 deverá fornecer procedimento de **reconciliação com o banco** para identificar órfãos, sem remoção automática por idade; nunca apagar um blob sem verificar todas as referências persistidas. Se metadado existir e blob faltar, retornar erro controlado e registrar incidente, sem expor caminho interno.

**Autorização:** o adaptador é infraestrutura **sem contexto de usuário/contrato**. Nunca injetá-lo em controller público diretamente. TEC08-02 deve validar sessão SuperTokens, usuário ativo, ação operacional e contrato raiz resolvido da entidade SQL persistida **antes de qualquer leitura**. `chave` e `tokenCompensacao` não devem ser serializados para frontend, logs ou auditoria; o hash do arquivo é distinto da chave.

**Limitações conhecidas:** a cota total usa inspeção das entradas sob a raiz e trava em memória; não suporta múltiplas réplicas compartilhando a mesma pasta, gravações fora do adaptador ou armazenamento remoto. Em produção multi-réplica será necessária coordenação distribuída, objeto storage privado com chaves opacas, quotas e reconciliação transacionais. `ARQUIVOS_DIRETORIO` precisa estar em volume persistente, nunca em filesystem efêmero de container. Há uma janela de consistência entre o storage e o PostgreSQL, pois não existe transação distribuída.

## 4. Aplicação no Docker com dados existentes

**Não recriar o banco. Não usar `docker compose down -v`. Não editar migrations antigas.**

```bash
cd "$HOME/Documents/projetos/project-01-bcc5005"
docker compose config -q
# Após aplicar a branch TEC08-01, o Compose acrescenta o volume dedicado ao backend:
docker compose up -d --no-deps backend
docker compose ps
# Testes reais de filesystem no backend (só esta suíte; não escreve no DB):
docker compose exec backend npm test -- --runInBand armazenamento-local.spec.ts
```

Alterações em `docker-compose.yml` podem fazer o Compose recriar **somente** o backend (com o volume `arquivos_contratuais_data` novo). Se forem criadas novas imagens devido a mudanças de dependência/Dockerfile no futuro, reconstruí-las de forma consciente; **esta entrega não altera dependências nem lockfiles**. Reiniciar backend temporariamente interrompe API; programar janela se houver usuários ativos.

**Evidência de durabilidade:** após o volume existir, testes de integração/QA podem salvar um blob de demonstração usando o adaptador e comparar SHA-256 antes e depois de recriar backend sem `-v`. Este procedimento deve ser feito em ambiente de teste, com dados não sensíveis, sem limpar volumes reais e sem assumir que `npm test` sozinho prova recriação.

## 5. Backup, recuperação e restauração

O PostgreSQL possui `postgres_data` e o storage possui `arquivos_contratuais_data`: é obrigatório manter **cópia coordenada de ambos**, de preferência interrompendo escrita da aplicação no período de snapshot (ou usando snapshot consistente por camadas). Backup apenas do banco não protege blobs, e backup apenas dos blobs não preserva metadados/autor/auditoria. Registrar identificação dos volumes, instante, versão de migrations, hashes dos arquivos, permissões, custódia e teste de recuperação.

Para recuperação, restaurar PostgreSQL e blobs **em um ambiente isolado**, validar integridade de referências e autorização e só então planejar retorno operacional; jamais sobrescrever o banco ou volumes ativos sem cópia verificável e autorização. O procedimento detalhado de backup/restauração para produção depende de infraestrutura, armazenamento, retenção, janelas RPO/RTO e SLA **ainda não definidos no PRD**. `docker compose down` mantém volumes; `down -v` os remove.

## 6. Definição de pronto da TEC08-01

- [x] Contrato tipado salvar/ler/existir/confirmar/remover órfão autorizado.
- [x] Storage local privado com chaves opacas, escrita segura e volume persistente definido no Compose.
- [x] Limites/formatos provisórios, checagem de assinatura, traversal e arquivo vazio.
- [x] Documentação de integração, compensação, backup/restore e riscos.
- [x] Testes automatizados de filesystem **versionados**.
- [ ] Testes Jest executados com sucesso no ambiente do usuário (evidência ainda não recebida).
- [ ] Prova de persistência após recriação do container, com blob real e bytes iguais (QA ainda pendente).
- [ ] Política PQ-11 validada pelo cliente (pendente; não bloqueia política de DEV provisória, mas bloqueia tratá-la como definitiva).

**Não marcar TEC08-01 formalmente concluída apenas pelo patch sem os dois testes de execução pendentes.** E, principalmente, **não marcar TEC08 principal concluída**: upload, metadados SQL, ACL por contrato, auditoria e UI ainda serão entregues nas sub-issues seguintes.
