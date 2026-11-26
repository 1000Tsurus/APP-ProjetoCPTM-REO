# App simples para o operador de pátio — design

Data: 2026-11-26 · Branch: `feat/simplificar-operador` (a partir de `feat/integracao-api`) · Entrega: PR neste repo, depois do #1.

## Intenção e porquê

O PR #1 ligou o app à API, mas as telas espelham os formulários da API: para cada dormente o operador
lê a tag, abre o dormente, rola até as ações, abre o formulário e salva (5 passos; ~150 toques para 30
dormentes). O app vai ser usado por operadores de pátio, com um leitor RFID de mão, e precisa ser o mais
simples possível **sem perder informação** no registro.

A ideia central: o operador escolhe **a tarefa uma vez** (receber, transferir, retirar, ocorrência) e
depois **lê vários dormentes seguidos**. Cada leitura registra sozinha, com um cartão de confirmação e
"Desfazer". O app só pede o que não dá para adivinhar.

## Metas

- Duas rotas para cada tarefa, com o mesmo resultado na API:
  - **com leitor**: leitura → confirmação automática, zero toques por dormente;
  - **manual**: buscar pelo final da tag ou pela ata, tocar na sugestão.
- Tag desconhecida em Receber/Transferir vira cadastro sozinha (plaqueta completada depois).
- Sincronização e estado do leitor sempre visíveis.
- Continuar 100% offline, sem duplicar nada (fila e `client_uuid` do PR #1).

## Não-metas (fora deste PR)

- **Conexão Bluetooth com o leitor ESP32 + RC522.** É a próxima tarefa (ver "Leitor"); este PR deixa a
  peça de entrada pronta para recebê-la e usa o modo teclado/campo de texto enquanto isso.
- Mudanças na API. Tudo usa rotas que já existem.
- Inventário, fotos, telas gerenciais (continuam no site).
- iPhone: o leitor é Bluetooth clássico (SPP), que só funciona no Android. O app segue só Android.

## Anti-metas (seria falha mesmo "funcionando")

- Registrar um dormente que o operador desfez.
- Dizer "enviado" para algo que está só na fila.
- Perder uma leitura feita offline, inclusive de tag nova.
- Esconder um item rejeitado pela API.

## Decisões tomadas com o usuário

| Tema | Decisão |
|---|---|
| Leitor | De mão, feito com ESP32 + RC522, Bluetooth clássico (serial). Só Android. |
| Tarefas do operador | Movimentação, cadastro de dormente novo e ocorrência. Inspeção continua só para técnico+. |
| Ordem | Escolhe a tarefa antes, depois lê vários (lote). |
| Confirmação | Automática, com "Desfazer" por alguns segundos e vibração. |
| Tag desconhecida | Cadastra sozinho com o local do lote; plaqueta completada depois. |
| Lotes no Início | Receber (entrada), Transferir, Retirar (com RM), Ocorrência. |
| Descrição da ocorrência | Frases prontas por tipo + texto livre, uma para o lote. |
| Status | Faixa fixa no topo (leitor + sync) e rodapé de andamento no lote. |
| Navegação | Abas Início, Consultar, Perfil. A lista paginada de dormentes sai do app. |
| Rota manual | Busca por ≥4 caracteres (final da tag ou ata) com sugestões; tag nova pede a tag completa. |

## Regras da API que moldam o desenho

Conferidas no código da API (`app/services/movements.py`, `app/services/sleepers.py`, `app/schemas/`):

- **Entrada** só para dormente fora do pátio (`already_in_yard` se já estiver em algum local).
  **Transferência** só para dormente no pátio (`not_in_yard`) e para outro local (`same_location`).
  **Retirada** exige RM e dormente `in_stock` (`not_in_stock`, `sleeper_quarantined`).
- **Cadastro** (`POST /dormentes`): só `rfid_tag` e `location_id` são obrigatórios; idempotente por
  `client_uuid`; tag repetida → 409 `rfid_tag_taken`. **Não passa por `/sincronizacao/replicar`**
  (o sync não cria dormente).
- **Ocorrência**: `kind` (damage, loss, misplaced, other) e `description` obrigatória (3–2000).
- **Plaqueta** (`PATCH /dormentes/{id}`): operador pode editar; espécie só especialista. Só online.
- **Busca** (`GET /dormentes?q=`): parte da tag ou da ata. Só online.
- **Tag**: até 64 caracteres, normalizada em maiúsculas. O UID do RC522 (8 ou 14 hex) é aceito.

## Desenho

### Navegação e telas

```
(tabs)
  Início      → 4 botões grandes de lote
  Consultar   → ler/buscar tag → ficha do dormente
  Perfil      → conta, leitor pareado, sair
lote/[tarefa] → preparar (destino / RM / tipo+frase) → leitura contínua
fila          → como hoje (pendentes, rejeitados com motivo, descartar)
dormente/[tag]→ ficha: dados, histórico, Completar plaqueta, Ocorrência, Inspecionar (técnico+)
plaqueta/[tag]→ formulário da plaqueta em modo edição (PATCH)
inspecionar/[tag] → como hoje
```

Saem: aba Dormentes (lista paginada), `movimentar/[tag]`, `cadastrar-dormente`, `ocorrencia/index`.
Movimentar um dormente só é um lote de um. A ocorrência avulsa a partir da ficha reaproveita o
`OccurrenceForm`, já com a tag.

`supervisor` (só consulta) vê Início sem botões de lote, com um aviso, e usa Consultar.

### Faixa de status (todas as telas)

- Esquerda — leitor: `● Conectado`, `○ Desconectado` (toque tenta reconectar) ou `Sem leitor`
  (enquanto a tarefa do Bluetooth não entra, mostra `Teclado`).
- Direita — sync: `3 pendentes · enviado 10:42`, `Tudo enviado · 10:42`, `Sem conexão · 3 pendentes`;
  vermelha com `1 rejeitado` quando houver. Toque abre a Fila.
- Substitui a faixa "Sem conexão" e o painel de sync do Início atual.

### Lote

1. **Preparar** (uma tela, 1–2 toques):
   - Receber / Transferir: escolher o local (lista de locais ativos, os últimos usados no topo).
   - Retirar: digitar a RM.
   - Ocorrência: escolher o tipo e uma frase pronta ou texto livre.
2. **Leitura contínua**:
   - Topo: a tarefa ("Transferir para Pátio Lapa · Rua 3") e "Concluir".
   - Centro: o último cartão lido, grande.
     - Verde: registrado ("E280…1B21 · Eucalipto · AR00224-02").
     - Amarelo: dormente novo cadastrado, ou "já está neste local" (nada registrado).
     - Vermelho: não registrado, com o motivo (ex.: retirada de dormente fora de estoque, quando o app
       já sabe pelo cache), sem bloquear a próxima leitura.
     - "Desfazer" visível por **5 s** no cartão verde/amarelo.
   - Lista dos lidos neste lote, abaixo, com o estado de cada um.
   - Rodapé: `12 lidos · 9 enviados · 3 na fila`.
   - Leitura repetida da mesma tag no lote: ignora, vibra diferente, mostra "já lido".
   - Rota manual: campo de busca fixo acima da lista (ver "Rota manual").

### Como cada leitura vira registro

O app decide o tipo pela tarefa e pelo que sabe do dormente (cache ou API):

| Tarefa | Dormente conhecido | Tag desconhecida |
|---|---|---|
| Receber / Transferir para L | fora do pátio → entrada em L; no pátio em outro local → transferência para L; já em L → aviso amarelo, nada registrado | cadastro em L (entrada gerada pela API) |
| Retirar com RM | retirada | vermelho "tag não cadastrada", nada registrado |
| Ocorrência | ocorrência com tipo + frase | ocorrência pela tag (a API rejeita se não existir; aparece na Fila) |

Receber e Transferir ficam com a mesma regra; os dois botões existem porque é a linguagem do operador,
e o rótulo do lote muda.

**Offline e tag fora do cache:** o app não sabe se a tag é nova. A leitura entra na fila como
**leitura pendente** (`resolve`, com tarefa, local e `client_uuid` gerados na hora). Na sincronização,
antes do `replicar`:
- `GET /dormentes/tag/{tag}` → existe: vira movimentação (entrada/transferência pela regra acima)
  com o mesmo `client_uuid`;
- 404 → `POST /dormentes` com tag, local e o `client_uuid` (idempotente);
- 409 `rfid_tag_taken` numa corrida → trata como existente.

O mesmo caminho serve para cadastro online: cadastro é um item da fila do tipo `register`, enviado
por `POST /dormentes` antes do lote do `replicar`. Assim, cadastro offline deixa de ser bloqueado
(no PR #1 exigia rede) e continua sem duplicar.

### Desfazer

Cada item entra na fila com `hold_until = agora + 5 s` e o sync não envia itens em espera.
"Desfazer" remove o item da fila. Depois de enviado, desfazer não existe (o botão some com o prazo).
Concluir o lote ou sair da tela libera as esperas na hora.

### Rota manual

Campo único no lote (e em Consultar):
- ≥4 caracteres → sugestões: online por `GET /dormentes?q=`; offline pelos dormentes do cache.
  Toque na sugestão = mesma coisa que uma leitura.
- Texto que parece tag completa + Enter → tratado como leitura (cobre tag nova e o leitor em modo
  teclado).
- Teclado em maiúsculas, sem autocorreção. O campo volta a ficar focado depois de cada registro.

### Cadastros incompletos

O app guarda, por usuário, a lista dos dormentes que **ele cadastrou pelo lote** sem plaqueta
(AsyncStorage). Em Consultar aparece "Cadastros sem plaqueta (N)" → abre a lista → `plaqueta/[tag]`.
Ao salvar a plaqueta (PATCH, exige rede), sai da lista. Espécie só aparece para especialista.

`TODO(decidir)`: o site deveria listar todos os dormentes sem plaqueta (de qualquer aparelho)? Isso
pede um filtro novo na API; fica fora deste PR.

### Frases prontas da ocorrência

Constante em `data/occurrence-phrases.ts`, editável. Proposta inicial, `TODO(decidir)` com a equipe:

- Dano: "Rachadura", "Apodrecido", "Quebrado", "Tag danificada"
- Extravio: "Não encontrado no local"
- Fora do lugar: "Encontrado em outro local"
- Outro: só texto livre

A descrição enviada é a frase (ou o texto livre). Frase e texto podem ser combinados.

### Leitor (preparo para a próxima tarefa)

`data/reader/` com uma interface única:

```ts
type ReaderStatus = 'connected' | 'disconnected' | 'connecting' | 'none';
interface TagReader {
  status(): ReaderStatus;
  subscribe(onTag: (tag: string) => void, onStatus: (s: ReaderStatus) => void): () => void;
  reconnect(): Promise<void>;
}
```

Neste PR: `KeyboardReader` (campo de texto/modo teclado, status `none`). A próxima tarefa adiciona o
`BluetoothSerialReader` (ESP32, `react-native-bluetooth-classic`, build próprio em vez do Expo Go) e
a escolha do aparelho pareado em Perfil, sem tocar nas telas de lote.

### Contagem de toques (toques na tela; letras digitadas à parte)

| Tarefa | Com leitor | Manual | Hoje (PR #1) |
|---|---|---|---|
| Transferir 30 | 3 + 30 gatilhos | 3 + 30 × (≈4 letras + 1) | ≈150 |
| Receber 30 (alguns novos) | 3 + 30 gatilhos | idem; tag nova = tag completa | ≈150 + cadastros de 10 campos |
| Retirar 30 | 3 + RM + 30 gatilhos | 3 + RM + 30 × (≈4 letras + 1) | ≈150 + RM a cada um |
| Ocorrência em 5 | 5 + 5 gatilhos | 5 + 5 × (≈4 letras + 1) | ≈25 + descrição a cada um |
| Desfazer | 1 | 1 | — |

Os 3 toques: botão da tarefa, escolher o local (1 toque na lista), Concluir.

### Testes

- Unidade (`node --test`):
  - regra leitura → registro (tabela acima, inclusive "já neste local" e repetida no lote);
  - resolução de leitura pendente (existe / 404 / 409);
  - `hold_until` e desfazer (não envia em espera; desfazer remove; concluir libera);
  - ordem do sync: `register`/`resolve` antes do `replicar`;
  - textos da faixa de status;
  - busca manual offline no cache.
- Integração (`npm run test:api`, API local): lote de transferência; tag nova offline cadastrada no
  sync sem duplicar no reenvio; desfazer não chega à API; retirada sem RM rejeitada no preparo.
- Emulador: lote com a rota manual e com o campo em modo teclado; prints para o PR.

## Deixado ao implementador

- Layout exato dos cartões e da lista (seguindo `constants/theme.ts` e os componentes de `components/ui`).
- Duração da vibração e padrões diferentes para ok / aviso / erro.
- Quantos "últimos locais usados" mostrar.

## Decisões minhas para revisar

Consequências das regras da API que não foram perguntadas uma a uma:

1. Receber e Transferir usam a mesma regra (entrada ou transferência conforme o estado do dormente).
2. Cadastro passa a ir pela fila (`register`) e funciona offline; leitura de tag fora do cache offline
   vira `resolve`.
3. "Desfazer" por 5 s, segurando o envio nesse tempo.
4. Movimentar um dormente só é um lote de um (sai a tela `movimentar/[tag]`).
5. Leitura repetida no mesmo lote é ignorada.
