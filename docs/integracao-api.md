# Integração com a API REO

O app consome a API REST do projeto (repo `cptm-reo-api`). Não há mais modo local: sem login não há uso. O leitor RFID fala só com o app; a API recebe apenas o código da tag.

## Configuração da URL

A URL base vem de `EXPO_PUBLIC_API_URL` (veja `.env.example`).

- Sem a variável, o app usa a API na Azure: `https://reo-api.ambitiousbeach-eac3bf23.brazilsouth.azurecontainerapps.io`.
- `http://` só é aceito em desenvolvimento (`__DEV__`); fora dele o app recusa a URL.
- Para testar contra a API local num aparelho, use o IP do PC: `EXPO_PUBLIC_API_URL=http://<ip-do-pc>:4000` (API iniciada com `--host 0.0.0.0`).
- A variável é lida na hora do bundle; reinicie o Metro (`npx expo start -c`) depois de alterá-la.

## Papéis

| Papel | O que vê e faz |
| --- | --- |
| `operador` | Consulta, cadastra dormente, movimenta e registra ocorrência. Não inspeciona. |
| `tecnico`, `especialista` | Tudo do operador, mais inspeção. |
| `admin` | Tudo acima. |
| `supervisor` | Só consulta: não aparecem os botões de registro. |

A autorização real é da API; o app só esconde botões.

## Fila offline

- Movimentação, inspeção e ocorrência sempre são gravadas na fila do aparelho primeiro e depois enviadas por `POST /sincronizacao/replicar`. O cadastro de dormente é online direto.
- Cada item tem um `client_uuid` (UUID v4) gerado uma vez; reenviar o mesmo item não duplica (a API responde `duplicate` e o item sai da fila).
- Sem rede, o item fica **aguardando envio** e continua na fila mesmo se o app for fechado. A fila é por usuário e sobrevive a logout.
- Item **rejeitado** pela API (ex.: dormente descartado, tag inexistente) fica na tela Fila com código e motivo, e só pode ser descartado.
- Se o refresh token vencer com o aparelho offline, o app pede novo login, mas a fila do usuário permanece.
- Tags vindas do leitor em modo teclado são normalizadas (`trim().toUpperCase()`) antes de buscar, navegar ou enfileirar.

## Testes automatizados

```bash
npm test            # unitários (tests/*.test.cjs), sem rede
npm run typecheck
npm run test:api    # integração contra a API local
```

`npm run test:api` carrega os módulos reais de `data/` (cliente, sessão, fila, sync, cache, formulários), com `AsyncStorage` e `SecureStore` em memória e `fetch` real contra a API. Cobre: login e catálogos, cadastro idempotente, busca por tag normalizada, transferência pela fila, offline e reenvio sem duplicar, rejeição `sleeper_not_found` e `restore` offline/online.

Pré-requisitos: API local no ar (`docker compose up -d db`, `uv run alembic upgrade head`, `uv run python -m app.scripts.seed`, `uv run uvicorn app.main:app --port 4000`). Variáveis opcionais:

- `REO_API_URL` (padrão `http://127.0.0.1:4000`); hosts que não sejam localhost/127.0.0.1/[::1] são recusados a menos que `REO_API_ALLOW_REMOTE=1`
- `REO_LOGIN` e `REO_PASSWORD` (senão lê `SEED_ADMIN_REGISTRATION` e `SEED_ADMIN_PASSWORD` do `.env` da API)
- `REO_API_ENV_FILE` (padrão `../cptm-reo-api/.env`)

Se a API estiver fora do ar ou sem credenciais, o teste é pulado com a mensagem do motivo. Cada execução usa tags `IT-<timestamp>-...` e deixa um dormente de teste na base local.

## Roteiro manual em aparelho Android (pendente)

O teste de integração não cobre o aparelho. Conferir num Android real:

- [ ] Login com matrícula e senha; reabrir o app mantém a sessão.
- [ ] Campo de tag recebendo leitura de um leitor em modo teclado (com espaço/`Enter` no fim e minúsculas) abre o mesmo dormente.
- [ ] Faixa de offline aparece com o modo avião e some ao voltar a rede.
- [ ] Fluxo de campo completo: cadastrar dormente, transferência online (aparece no histórico e no site), modo avião com inspeção e ocorrência ficando "aguardando envio", desligar o modo avião e ver sumirem da fila e aparecerem no site.
- [ ] Retirada de dormente descartado volta rejeitada na Fila com o motivo; descartar remove.
- [ ] Fechar o app com item pendente e reabrir: o item continua.
- [ ] Usuário `supervisor` não vê botões de registro.
