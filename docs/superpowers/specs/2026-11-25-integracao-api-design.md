# Integração do app com a API cptm-reo-api — design

Data: 2026-11-25 · Branch: `feat/integracao-api` · Entrega: PR neste repo.

## Intenção e porquê

O app hoje roda num modelo próprio (lotes `LT-001`, dormentes `LT-001-D0001`, 4 fotos por
inspeção, leitura QR/NFC, autocadastro com aprovação de gerente) e só guarda dados no aparelho.
Nada do que o operador registra chega ao site gerencial. A API (`cptm-reo-api`) já está no ar na
Azure e o site já fala com ela. Este trabalho faz o **app se adaptar à API como ela está** — sem
rotas novas e sem mudar o contrato — para que app, API e site usem o mesmo modelo de domínio:
dormente identificado por **tag RFID**, com espécie, local, movimentações, inspeções e ocorrências.

Fonte de verdade do domínio: `docs/CONTEXTO.md` do repo da API (QR/NFC e lotes estão fora do escopo;
"só RFID").

## Metas

- Login real na API por matrícula (ou e-mail) e senha, com sessão que sobrevive aos 15 min do access token.
- Ler/informar a tag → abrir o dormente → movimentar, inspecionar ou registrar ocorrência.
- Funcionar **offline**: o que for registrado sem rede vai para uma fila local e é enviado depois por
  `POST /sincronizacao/replicar`, sem duplicar (idempotência por `client_uuid`).
- Respeitar os papéis da API na interface (a API é quem autoriza de verdade).

## Não-metas (fora deste PR)

- Inventário (`/estoque/inventario`).
- Integração com SDK nativo de leitor RFID UHF. A tag entra por um campo de texto que aceita digitação
  ou o leitor em **modo teclado** (coletores Chainway/Zebra fazem isso).
- Upload de fotos (a API não recebe arquivos).
- Telas gerenciais (usuários, papéis, convites, espécies, locais, indicadores) — são do site.
- Build web do app contra a API (o CORS da API só libera o site; o alvo é Android).
- MFA e credencial offline de 48h (A DECIDIR na API; rotas devolvem 501).

## Anti-metas (seria falha mesmo "funcionando")

- Mostrar como salvo no servidor algo que só está na fila local.
- Perder ou duplicar registro feito offline.
- Guardar senha no aparelho, ou logar token/senha.
- Inventar dados que a API não tem (lote, foto, umidade em %).

## Restrições

- Expo SDK 58, expo-router, React Native 0.88 — ler https://docs.expo.dev/versions/v58.0.0/ antes de codar (AGENTS.md).
- **Sem dependências novas.** Usa o que já está no `package.json`: AsyncStorage (fila e cache),
  SecureStore (refresh token). `client_uuid` exige UUID válido: o fallback atual do app
  (`${Date.now()}-${Math.random()}`) seria rejeitado pela API (`client_uuid_required`) e o Hermes não
  garante `crypto.randomUUID` → gerador UUID v4 próprio em `data/uuid.ts` (usa `crypto.getRandomValues`
  quando existir, senão `Math.random`), com teste de formato.
- Paths, campos e enums exatamente como a API (ver "Contrato usado"). Datas em UTC ISO 8601.
- Listagens da API voltam paginadas `{items, total, limit, offset}` (máx. 200).
- Erros da API: `{"detail": str, "code": str}` (422 traz também `errors[]`). Mostrar `detail`.
- `/sincronizacao/replicar` **não** cria dormente: cadastro de dormente exige rede.
- Papéis que podem registrar em campo (e sincronizar): `operador`, `tecnico`, `especialista` e `admin`
  (a API aceita `admin` em toda rota). Inspeção: `tecnico`, `especialista` e `admin`. `supervisor`
  entra só para consulta. O app espelha isso para esconder botões; quem decide é a API.
- Visual: manter o estilo atual do app (`workflow-styles.ts`, cores, `BottomNavigation`, `SwipeStack`).
- Testes no padrão existente: `node --test tests/*.test.cjs`, transpilando TS e injetando módulos.

## Abordagens consideradas

1. **Trocar a camada de dados, sem dependências novas** (escolhida). Cliente HTTP próprio + fila offline
   em AsyncStorage + telas reescritas sobre isso. Resolve o offline, que é o central, sem peças novas
   para uma equipe que não usa libs de cache.
2. TanStack Query com cache persistido. Cache e retry prontos, mas traz dependências e conceitos novos,
   e a fila de envio teria de ser escrita de qualquer jeito.
3. Só online agora, offline depois. PR menor, mas falha justamente no pátio/via, onde o app é usado.

Escolha do Caio: **1, com fila offline**. Também decidido: **substituir** (não manter ao lado) lotes,
fotos, QR/NFC e autocadastro.

## Desenho

### Configuração
- `EXPO_PUBLIC_API_URL`, padrão `https://reo-api.ambitiousbeach-eac3bf23.brazilsouth.azurecontainerapps.io`
  (substitui `EXPO_PUBLIC_OPERATIONS_API_URL`). Em dev pode apontar para `http://<ip-do-pc>:4000`;
  aceitar `http` só quando `__DEV__`.
- Sem "modo local": sem API configurada o app não opera (a API sempre tem URL padrão).

### Camada de dados (`data/`)
- `api/client.ts` — `request<T>(method, path, body?, {auth})`: base URL, JSON, timeout 15 s, Bearer.
  Em 401 tenta **um** `POST /auth/refresh` e repete; se falhar, encerra a sessão. Converte erro da API
  em `ApiError {status, code, detail}`; falha de rede vira `NetworkError` (é o que manda para a fila).
- `api/types.ts` — tipos espelhando os schemas da API (`UserRead`, `SleeperRead`, `SleeperHistory`,
  `SpeciesRead`, `LocationRead`, `MovementCreate`, `InspectionCreate`, `OccurrenceCreate`,
  `SyncBatchRead`, `Page<T>`, enums de `app/models/enums.py`).
- `api/endpoints.ts` — funções finas por rota (lista abaixo).
- `auth-store.ts` — guarda `refresh_token` + `refresh_expires_at` + o último `UserRead` (não é
  segredo) no SecureStore; access token só em memória. Na abertura do app, se houver refresh dentro
  da validade: tenta `/auth/refresh`; **falha de rede → entra em modo offline** com o `UserRead` salvo
  (fila, papel e cache funcionam; a tela mostra "Sem conexão"); 401 no refresh → volta ao login.
  Senha nunca é persistida. A biometria atual (`expo-local-authentication`) não autentica nada no
  servidor e sai do login neste PR.
- Troca de usuário e expiração: a fila é por usuário e **fica retida** no aparelho até aquele usuário
  logar de novo (só ele pode enviá-la). Sair com itens pendentes mostra um aviso com a contagem e pede
  confirmação; os itens não são apagados. Refresh expirado (7 dias) → novo login do mesmo usuário
  envia a fila normalmente.
- `outbox.ts` — fila offline em AsyncStorage, chave por usuário (`reo.outbox.<user_id>`). Item:
  `{type: 'movement'|'inspection'|'occurrence', client_uuid, payload, created_at, status:
  'pending'|'rejected', error?}`. Payload já no formato do POST da API, referenciando o dormente por
  `rfid_tag` e com `occurred_at`/`inspected_at` do momento do registro.
- `sync.ts` — envia pendentes em lotes de até 1000 para `/sincronizacao/replicar` com `device_id`
  (UUID do aparelho gerado uma vez e guardado). O corpo separa os itens nas listas `movements`,
  `inspections` e `occurrences`; a resposta identifica cada item por `type` + `index` (posição na
  lista enviada) e `client_uuid` — casar por `client_uuid`. Resultado por item: `accepted`/`duplicate` → remove da
  fila; `rejected` → fica marcado com `code`/`reason` para o operador ver e descartar. Dispara: ao
  registrar algo, ao voltar o app para primeiro plano, e por botão "Sincronizar". Uma sincronização
  por vez (mutex simples, como o `queue` atual).
- `catalog-cache.ts` — cache em AsyncStorage de espécies ativas e locais ativos (para os seletores
  funcionarem offline) e dos últimos dormentes abertos por tag (consulta offline com aviso "dados de
  <data>"). Atualiza ao logar e ao abrir telas com rede.

**Regra de escrita (movimentar / inspecionar / ocorrência):** sempre gera `client_uuid` e grava na fila
antes de tentar enviar; em seguida tenta sincronizar. Assim online e offline seguem o mesmo caminho e
um reenvio nunca duplica. A interface mostra "Pendente de envio" até o item sair da fila.

**Estado do dormente com itens na fila:** sem projeção local. A tela do dormente mostra o estado
do servidor (ou do cache, com data) e, acima dele, a lista "Pendente de envio" daquele dormente
(ex.: "Transferência para Rua 08 — aguardando envio"). As ações continuam liberadas; se a sequência
violar uma regra da API (`not_in_stock`, `sleeper_quarantined`, `same_location`…), o item volta como
rejeitado com o motivo. Projetar o efeito local de cada regra duplicaria a lógica da API e erraria
quando ela mudar.

**Tag lida offline e fora do cache:** a tela avisa "Sem conexão — não foi possível confirmar esta tag"
e ainda deixa movimentar, inspecionar e registrar ocorrência (o cache só tem dormentes já abertos,
então bloquear impediria trabalhar com dormentes existentes). Se a tag não existir, o sync devolve
`sleeper_not_found` e o item aparece como rejeitado. Cadastrar fica desabilitado sem rede.

**Cadastro de dormente:** online direto (`POST /dormentes` com `client_uuid`). Sem rede, a tela informa
que cadastro exige conexão.

### Telas (expo-router)
| Rota | O que faz | Substitui |
|---|---|---|
| `app/index.tsx` (login; `app/login.tsx` continua reexportando) | Matrícula ou e-mail + senha → `/auth/login`. "Primeiro acesso" explica que o convite vem do administrador e é aceito pelo link do e-mail (o aceite é no site). | login + link de cadastro |
| `(pages)/index` Início | Campo "Ler tag" (foco automático, Enter/leitor dispara), pendências da fila, último sync (`/sincronizacao/status`), atalhos. | Início atual (tira "7 ordens" fixas) |
| `(pages)/dormentes` | Lista paginada `/dormentes` com busca `q` (ata ou tag) e filtro de status/local. | aba Lotes |
| `(pages)/perfil` | Nome, matrícula, papel (do `/auth/me`), fila/rejeitados, sincronizar, sair. | Perfil (sem edição de nome — a API não tem) |
| `dormente/[tag]` | `GET /dormentes/tag/{tag}`; dados da plaqueta, espécie, local, status; histórico `/dormentes/{id}/historico`; ações conforme papel e status. Tag desconhecida (404) → oferece cadastrar. Offline → cache, se houver. | `dormente/[sleeperId]`, `lote/[lotId]` |
| `cadastrar-dormente` | Formulário de `SleeperCreate` (tag pré-preenchida, espécie, local de entrada, campos da plaqueta). | `cadastrar-lote` |
| `movimentar/[tag]` | Tipo `entry`/`withdrawal`/`transfer`; destino (seletor de locais) exceto retirada; RM obrigatória na retirada; observações. | — |
| `inspecionar/[tag]` | Checklist `InspectionCreate`: conservação, rachaduras, ataque biológico, umidade (seco/úmido/molhado), vida útil estimada, espécie confirmada ou corrigida, observações, resultado. Cronômetro desde a abertura → `duration_seconds`. Só `tecnico`/`especialista`. | `inspecionar/[lotId]` |
| `ocorrencia/[tag]` | `kind` (dano/perda/fora do lugar/outro) + descrição. Também acessível sem dormente, escolhendo local. | — |
| `fila` | Itens pendentes e rejeitados com motivo. Rejeitado só pode ser **descartado** (sem edição nem reenvio: reenviar igual seria rejeitado de novo); para corrigir, o operador registra de novo pela tela do dormente. | `operadores` |

Estrutura de rotas: mantém o grupo `app/(tabs)` (o `_layout` dele redireciona para `/login` sem
sessão) com `(pages)` = Início, Dormentes e Perfil nas abas de baixo; as telas de ação
(`dormente/[tag]`, `movimentar/[tag]` etc.) ficam na raiz `app/`, como hoje `lote/[lotId]`.

Removidos: `cadastro`, `cadastrar-lote`, `lote/[lotId]`, `ler-etiqueta` (QR/NFC), `operadores`,
`(tabs)/editar-perfil`, `two`, `modal`, `ManagerInbox`, `InspectionCard`, `data/inspection-store.ts`,
`data/access-service.ts`, `data/nfc-reader.ts`, `data/photo-storage.ts`, e as dependências de uso
(`expo-camera`, `react-native-nfc-manager`, `expo-image-picker`, `expo-local-authentication`) **saem do código**; tirar do
`package.json`/`app.json` fica a critério do Pina no review (ver "Deixado ao implementador").

Rótulos em PT para enums (good → Bom, fair → Regular, poor → Ruim; dry/moist/wet → Seco/Úmido/Molhado;
in_stock → Em estoque etc.) num único `labels.ts`.

### Contrato usado (todas já existem na API)
`POST /auth/login {login, password}` · `POST /auth/refresh {refresh_token}` · `GET /auth/me` ·
`GET /dormentes?q&status&location_id&limit&offset` · `GET /dormentes/tag/{rfid_tag}` ·
`GET /dormentes/{id}/historico` · `POST /dormentes` · `GET /especies` · `GET /locais` ·
`POST /sincronizacao/replicar` · `GET /sincronizacao/status`.
`POST /estoque/movimentacao`, `/inspecoes` e `/estoque/ocorrencias` não são chamados direto: vão
pela fila/sync, que aplica as mesmas validações.

### Erros e estados
- Rede caiu no meio da escrita: o item já está na fila → nada se perde.
- 422 em cadastro: mostrar `detail` e, se houver, o campo de `errors[].loc`.
- 403: "Seu papel não permite esta ação." 409 (tag duplicada): "Esta tag já está cadastrada" → abrir o dormente.
- Item rejeitado no sync (ex. `sleeper_discarded`, tag inexistente): aparece na tela Fila com o `reason`.

### Testes
No padrão `node --test` existente, com módulos injetados:
- `client`: refresh único em 401; erro da API vira `ApiError`; falha de rede vira `NetworkError`.
- `outbox`/`sync`: grava antes de enviar; `accepted`/`duplicate` saem; `rejected` fica com motivo;
  reenvio do mesmo item usa o mesmo `client_uuid`; fila separada por usuário; sem sync concorrente;
  lote > 1000 é dividido.
- `auth-store`: refresh token e `UserRead` persistem, senha não; falha de rede no refresh entra em
  modo offline; 401 no refresh volta ao login; logout limpa a sessão mas não a fila.
- `uuid`: gera v4 válido (regex) mesmo sem `crypto`.
- Montagem de payloads: retirada exige RM; inspeção calcula `duration_seconds`.
- Remover/reescrever `operational-flows.test.cjs` (testa o modelo de lotes, que sai).
Verificação final: `npm test`, `npm run typecheck`, `npx expo export --platform android`, e um
roteiro manual contra a API local (`docker compose up` no repo da API) cobrindo login, cadastro,
movimentação/inspeção offline → online e item rejeitado.

## Deixado ao implementador
- Layout fino de cada tela, dentro do estilo atual.
- Tamanho de página e quantos dormentes manter no cache (sugestão: 200).
- Se remove as dependências não usadas do `package.json`/`app.json` neste PR ou deixa para o Pina
  (sugestão: remover, citando no PR).
- Texto exato das mensagens.
