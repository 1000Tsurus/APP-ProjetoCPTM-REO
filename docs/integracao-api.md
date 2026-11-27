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

- Movimentação, inspeção e ocorrência sempre são gravadas na fila do aparelho primeiro e depois enviadas por `POST /sincronizacao/replicar`. Cadastro de dormente pela leitura em lote também passa pela fila (`register`/`resolve`, abaixo).
- Cada item tem um `client_uuid` (UUID v4) gerado uma vez; reenviar o mesmo item não duplica (a API responde `duplicate` e o item sai da fila).
- Sem rede, o item fica **aguardando envio** e continua na fila mesmo se o app for fechado. A fila é por usuário e sobrevive a logout.
- Item **rejeitado** pela API (ex.: dormente descartado, tag inexistente) fica na tela Fila com código e motivo, e só pode ser descartado.
- Se o refresh token vencer com o aparelho offline, o app pede novo login, mas a fila do usuário permanece.
- Tags vindas do leitor em modo teclado são normalizadas (`trim().toUpperCase()`) antes de buscar, navegar ou enfileirar.

## Lotes de leitura

O operador escolhe uma **tarefa** uma vez e lê várias tags em seguida (leitor em modo teclado hoje; Bluetooth depois). Tarefas:

- **Receber** e **Transferir**: pedem o local de destino.
- **Retirar para a via**: pede o número da RM.
- **Ocorrência**: pede o tipo e uma frase de descrição.

Regra de cada leitura (`data/batch.ts`, função pura): a tag é normalizada, consultada (`lookupSleeper`) e vira um destes resultados.

| Situação da tag | Receber / Transferir | Retirar | Ocorrência |
| --- | --- | --- | --- |
| Não cadastrada (API respondeu 404) | item `register` (cadastro no local) | bloqueia | bloqueia |
| Fora do cache e sem rede | item `resolve` (decide no envio) | registra pendente (confere no envio) | registra pendente |
| Dormente conhecido | movimentação (`entry` se fora do pátio, `transfer` se em outro local); pula se já está no destino; bloqueia se descartado | só em estoque (com dado fresco) | ocorrência |

Dado vindo do cache pode estar velho, então só bloqueia ou pula com dado fresco; sem certeza, o servidor julga no envio. Tag repetida no mesmo lote é ignorada. Cada leitura mostra um cartão com o resultado (tom ok, novo, pendente, aviso ou erro).

## Fila: `register` e `resolve`

Além de `movement`, `inspection` e `occurrence`, a fila tem dois tipos que existem só para o app funcionar offline:

- `register`: cadastro de dormente novo (`POST /dormentes`, mesmo corpo do cadastro, com `client_uuid`).
- `resolve`: tag que o app não conhecia e não pôde consultar. No envio, o app pergunta à API: se a tag existe, o item vira movimentação (mesmo `client_uuid` e horário); se não existe, é cadastrada no local.

`syncNow` chama `sendRegistrations` **antes** do `POST /sincronizacao/replicar`, porque o replicar não cria dormentes. Itens `register`/`resolve` só são enviados fora da espera do desfazer. `register` com a tag já tomada (409 `rfid_tag_taken`) segue como `resolve`; destino igual ao local atual é rejeitado como `same_location`. Reenviar o mesmo `client_uuid` não duplica. Dormente cadastrado assim fica na lista de **plaquetas incompletas** (espécie, classe etc. a completar depois).

Falha de rede deixa tudo pendente; 401 e 5xx são passageiros (o item continua pendente); outro erro da API rejeita o item com `code` e motivo na tela Fila. O resumo de `syncNow` traz `sent`, `accepted`, `rejected` e `registered`.

## Desfazer (5 s)

Cada leitura de lote entra na fila com `hold_until` (`HOLD_MS` = 5 s): o sync não envia o item antes disso e o operador pode **desfazer** (`undo`), que o remove da fila sem nada chegar à API. Ao concluir o lote (`finish`), as esperas são liberadas (`releaseHolds`) e o sync roda na hora. Espera vencida (ex.: app reaberto) não segura mais o item. Item já enviado ou rejeitado não é desfeito.

## Busca manual

Quando o leitor não pega a tag, o operador procura por tag ou ata (mínimo de 4 caracteres, até 10 resultados): `GET /dormentes?q=` online; sem rede, procura entre os dormentes já consultados no aparelho.

## Faixa de status

Faixa fina no topo de todas as telas. À esquerda, o estado do leitor (toque reconecta): `● Conectado`, `○ Desconectado`, `Conectando…` ou `Teclado`. À direita, o envio (toque abre a Fila), por prioridade: rejeitados (vermelho), `Sem conexão` (âmbar), `Enviando…`, pendentes com a hora do último envio, `Tudo enviado · hh:mm`.

## Interface do leitor (`TagReader`)

O resto do app não sabe de onde vem a tag. `data/reader/types.ts` define:

```ts
interface TagReader {
  status(): ReaderStatus; // 'connected' | 'disconnected' | 'connecting' | 'none'
  subscribe(onTag: (tag: string) => void, onStatus: (s: ReaderStatus) => void): () => void;
  mode(): ReaderMode | null; // 'LEITURA' | 'GRAVACAO' | 'DESLIGADO' (só o Bluetooth)
  reconnect(): Promise<void>;
}
```

Há dois leitores: o de teclado/campo de texto (`data/reader/keyboard.ts`, status `none`) e o Bluetooth
(`data/reader/bluetooth.ts`), que fala com o leitor de mão ESP32 + RC522 pelo módulo nativo próprio
`modules/reo-bluetooth` (Kotlin, SPP). O `contexts/ReaderContext.tsx` usa o Bluetooth quando há um leitor
escolhido no Perfil (`reo.reader.device`); senão, o de teclado. O campo de texto do lote funciona com os dois.

### Leitor de mão (ESP32 + RC522)

- Firmware e protocolo: `hardware/leitor-esp32/` (`leitor-esp32.ino`, `PROTOCOLO.md`). Grave com o Arduino IDE
  num ESP32 clássico (WROOM/DevKit); o leitor aparece como `REO-Leitor`.
- No Android: pareie o `REO-Leitor` uma vez nas configurações de Bluetooth. No app: Perfil › Leitor ›
  Escolher leitor › Usar este. O app pede a permissão "Dispositivos próximos" (Android 12+).
- O app reconecta sozinho quando a conexão cai (esperas de 1 s até 30 s); tocar no leitor na faixa tenta já.
  Se a conexão falha, o motivo aparece no Perfil e no lote ("Leitor: ...").
- Com a chave em gravação, a faixa avisa "chave fora de leitura" e as tags lidas não entram no lote.
- O app usa só o UID da tag; os dados gravados na tag (blocos 4 e 5) são ignorados.
- O leitor Bluetooth exige o app instalado (APK); no Expo Go o Perfil avisa e o app usa o teclado.

## Testes automatizados

```bash
npm test            # unitários (tests/*.test.cjs), sem rede
npm run typecheck
npm run test:api    # integração contra a API local
```

`npm run test:api` carrega os módulos reais de `data/` (cliente, sessão, fila, sync, cache, formulários), com `AsyncStorage` e `SecureStore` em memória e `fetch` real contra a API. Cobre: login e catálogos, cadastro idempotente, busca por tag normalizada, transferência pela fila, offline e reenvio sem duplicar, rejeição `sleeper_not_found`, `restore` offline/online, lote de transferência, tag nova offline virando cadastro (sem duplicar no reenvio), desfazer em espera e `resolve` de tag existente virando transferência.

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

## Gerar o APK no Windows (build local, sem conta Expo)

- O `ninja` do CMake 3.22.1 do Android SDK não aceita caminhos longos: instale o CMake 3.31.6
  (`sdkmanager "cmake;3.31.6"`) e ponha `cmake.dir=<sdk>/cmake/3.31.6` em `android/local.properties`.
- Compile a partir de um caminho curto (ex.: copie o projeto para `C:\r` e rode `npm ci` lá);
  `subst` não serve, porque o autolinking do Expo não acha o `package.json` na raiz de uma unidade.
- Use o JDK 17 do Android Studio: `$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"`.
- `npx expo prebuild -p android` e depois `cd android; .\gradlew assembleRelease`.
  APK em `android\app\build\outputs\apk\release\app-release.apk` (assinado com chave de debug: só teste).
