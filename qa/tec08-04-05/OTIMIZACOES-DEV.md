# TEC08-04/05 — Otimizações conservadoras do ambiente DEV

## Alterações aplicadas

- `backend/.dockerignore` e `frontend/.dockerignore`: impedem que `COPY . .` envie
  `node_modules`, saídas de build, arquivos temporários e `.env` para o build.
  `package-lock.json`, fontes, testes e configurações permanecem no contexto.
- `backend/package.json`: `npm run lint:fast` é **opcional**, para retorno rápido
  durante a implementação. `npm run lint` continua com `--type-aware` e deve
  ser usado no gate final `--full` (incluindo regras com informação de tipos).
- `.vscode/settings.json`: reduz indexação e busca em caches, sem desativar
  IntelliSense/TypeScript, Jest ou ESLint.
- `qa/tec08-03/validar_ui_real.py`: o filtro documental é localizado pelo ID
  real `#filtro-categoria-documento`, não por texto de interface desatualizado.

## Sobre node_modules duplicados

O Compose monta `./frontend:/app` e `./backend:/app` junto a volumes separados
em `/app/node_modules`. Como os contêineres usam `node:24-alpine` e o VS Code
roda no Linux Mint, há ambientes de resolução e binários nativos distintos.
**Não monte** `./frontend/node_modules:/app/node_modules` nem copie as
dependências do host para o Alpine. Manter dependências locais para o VS Code
é seguro, e a duplicação de disco não implica duplicação permanente de CPU.
Se quiser ter apenas a instalação dos contêineres, considere um fluxo com
VS Code Dev Containers e extensões executadas dentro do ambiente, mas isso
requer testar a configuração da equipe antes de migrar.

## Verificações sem alterar dados

```bash
docker compose config -q
docker compose ps
docker stats --no-stream
docker system df -v
du -sh frontend/node_modules backend/node_modules 2>/dev/null || true
docker compose exec -T backend npm run lint:fast
```

Não execute `docker compose down -v` para otimizar consumo; ele apaga dados.
Evite `docker system prune -a` sem conhecer o que será removido. Os volumes
anônimos de `node_modules` e `.next` podem acumular dados quando contêineres
são recriados; revisar `docker volume ls` é preferível a apagá-los às cegas.

## CPU/GPU

O `--full` roda Jest, lint e builds sequenciais; é normal haver picos de CPU
enquanto ele está em execução, mas **não** em repouso só porque os arquivos
de dependências existem. O `oxlint --type-aware` aciona `tsgolint`; use
`lint:fast` durante edição e o `lint` completo nos gates finais.
Next.js 16 separa, por padrão, saídas de desenvolvimento em `.next/dev` e
de produção em `.next`, evitando a colisão habitual entre `next dev` e `next build`.
As medições relatadas de RTX 3060 em P0 e ~58 W não atribuem causalidade ao
Docker; compare VS Code, Firefox e outros processos gráficos em testes isolados.

## Critério de aceite do filtro

Verificar em Chromium real: selecionar PRINCIPAL e ANEXO, persistência após
reload, manutenção de scroll e ausência de overlay global durante a troca.
Testes offline de QA não substituem essa execução real.
