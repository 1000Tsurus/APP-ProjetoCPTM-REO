# Leitura, histórico e acesso operacional

## Estado da implementação

O projeto existente permanece no Expo SDK 58. A barra flutuante abre **Ler QR Code** e **Ler NFC** em Início, Lotes e Perfil. O diagnóstico, as quatro categorias fotográficas obrigatórias, a captura com `expo-camera`, a seleção de imagens na web e a persistência de fotografias foram reutilizados.

Sem `EXPO_PUBLIC_OPERATIONS_API_URL`, o aplicativo informa **modo local**. A matrícula identifica o trabalho neste aparelho; não autentica uma pessoa. Senhas não são verificadas nem persistidas. A biometria local também não autentica no backend. O perfil local sempre recebe capacidades de operador, inclusive quando declara a função técnica “Supervisão”. Não há conta de gerente, senha fixa, botão de promoção ou aprovação local.

O cadastro grava uma solicitação **pendente neste dispositivo**, sem senha. A tela de solicitações locais avisa que não houve envio à gerência. Não existe aprovação segura, push remoto nem sincronização entre aparelhos sem integração. Solicitações locais não são enviadas automaticamente quando uma API é configurada; é necessário solicitá-las novamente pelo serviço, com consentimento da pessoa.

**Criar lote exige gerente autenticado e autorização do backend**, na interface, na rota direta e no caminho de gravação. No modo local essa ação fica indisponível; lotes já existentes continuam consultáveis e inspecionáveis. Vários lotes são preservados; nenhum limite global de um lote foi introduzido. Não existe ação ou endpoint cliente para excluir perfis.

As telas gerenciais estão preparadas para consultar perfis, aprovar/rejeitar solicitações e atribuir/ajustar a função técnica operacional via API. Somente respostas do servidor confirmam mudanças. Gerente e operador são papéis de autorização, separados da função técnica declarada no cadastro. A aprovação pelo aplicativo concede papel de **operador**; provisionamento inicial de gerentes e mudanças de papel privilegiado pertencem à administração do provedor de identidade.

O aviso de pendências no Início e a caixa de gestão consultam o servidor a cada 30 segundos enquanto a tela está aberta e o app está ativo. Essa caixa dentro do aplicativo **não é notificação push**. Nenhum recebimento em segundo plano é prometido.

## Identificadores QR e NFC

- QR de lote: `raillog:lot:LT-001` ou `LT-001`.
- QR de dormente: `raillog:sleeper:LT-001-D0001` ou `LT-001-D0001`.
- NFC: um único registro de texto NDEF reconhecido com `raillog:sleeper:LT-001-D0001`.

O ID do dormente combina o código imutável e único do lote de origem com o número imutável da unidade. Esse formato já era gerado pelas inspeções e foi mantido para compatibilidade. Não altere nem reutilize códigos de lote. O backend deve garantir unicidade permanente desses códigos e IDs. Uma unidade precisa estar entre 1 e a quantidade do lote cadastrado para ser resolvida.

A etiqueta contém somente uma referência estável. Material, situação, origem e histórico vêm do armazenamento da sessão, nunca de atributos arbitrários da etiqueta. Não são aceitos JSON, comandos, URLs externas ou permissões da leitura. Uma etiqueta pode ser copiada: seu conteúdo e o UID do chip não comprovam identidade nem concedem acesso. A resolução é somente leitura; iniciar uma inspeção exige ação posterior explícita e, quando integrado, autorização do servidor.

Gravação física/provisionamento das etiquetas não faz parte do leitor. Grave o texto NDEF correspondente ao ID mostrado na tela do dormente com uma ferramenta autorizada. Não há vinculação automática de chip desconhecido. Se o formato real das etiquetas existentes for diferente, definir uma tabela autorizada `tagIdentifier -> sleeperId` no serviço e um fluxo gerencial auditado para provisioná-la.

## Histórico e lote de origem

Cada inspeção tem seu próprio ID, operador, datas, diagnóstico, resultado e evidências. Uma nova avaria cria um evento `kind: occurrence` no mesmo `sleeperId` e `lotId`, inclusive em lote finalizado. Um rascunho existente é retomado para impedir duplicação acidental. Fotos novas pertencem ao evento novo; fotos anteriores não são substituídas.

O armazenamento mantém a versão 1 e a chave original no modo local. Registros antigos sem `kind` são inspeções iniciais. A tela apresenta todos os eventos e suas evidências e destaca registros anteriores. O progresso conta dormentes únicos; a situação e os totais de aprovação/reprovação usam a última inspeção concluída por unidade. Uma reinspeção não reabre automaticamente o lote finalizado.

**Transferência entre lotes não foi implementada.** Antes de adicionar essa ação, esclarecer se existe transferência física, quem autoriza, quando ocorre e como preservar origem, destino, contagens e auditoria. Registrar uma avaria por si só não muda o lote.

## Development build NFC

Dependências: `react-native-nfc-manager` 4.2.0 e `expo-dev-client` compatível com SDK 58. O plugin e a descrição de uso estão em `app.json`. O módulo é carregado apenas ao iniciar leitura nativa. Expo Go e web informam indisponibilidade e mantêm QR.

Para aparelho físico NFC Android, com ferramentas nativas instaladas:

```sh
npm ci
npx expo run:android --device
npx expo start --dev-client
```

No macOS, usar `npx expo run:ios --device` para iPhone e configurar assinatura, App ID e provisionamento com capacidade NFC. Dependências/plugins nativos exigem recompilar. EAS é uma alternativa; conta, perfis de build e credenciais de assinatura não foram configurados neste trabalho.

O leitor trata plataforma sem suporte, Expo Go, módulo ausente, NFC desativado, permissão negada, etiqueta desconhecida, falha/cancelamento e timeout. A sessão é cancelada ao sair ou colocar o app em segundo plano. **É necessária validação em aparelho físico compatível; bundles JavaScript não comprovam o rádio NFC.**

## Contrato proposto de API

Configurar `EXPO_PUBLIC_OPERATIONS_API_URL=https://seu-servico/v1`. A URL é pública e não deve conter segredos. Respostas são JSON. Timeout: 15 segundos; backend configurado com falha não causa fallback local. Tokens ficam somente em memória; reiniciar exige novo login. “Manter conectado” do protótipo não persiste sessão autenticada; refresh/revogação precisam ser integrados ao provedor escolhido.

- `POST /access-requests` (público): recebe `nomeCompleto`, `matriculaOuEmail`, `funcaoOperacional`, `baseLotacao`, `password`. O servidor valida, limita tentativas, verifica o identificador e cria uma pendência. Nunca aceitar `role`, `status` ou aprovação do cliente. Resposta: `201 { id, status: "pending" }`.
- `POST /auth/login` (público): recebe `{ identifier, password }`; autentica no provedor e responde `{ accessToken, subject }`. Armazenamento/verificação de senha pertence ao provedor.
- `GET /auth/session` (Bearer): responde `{ profile: { id, nomeCompleto, matriculaOuEmail, funcaoOperacional, baseLotacao, role: "manager" | "operator", status: "approved" } }`. O cliente valida `id === subject` e aprovação; pendentes/rejeitados não entram na operação.
- `GET /access-requests` (gerente): lista `{ id, nomeCompleto, matriculaOuEmail, funcaoOperacional, baseLotacao, status, createdAt }`, sem senha/hash. Fonte do aviso de pendências.
- `POST /access-requests/:id/decision` (gerente): recebe `{ decision: "approved" | "rejected", funcaoOperacional, role: "operator" }`; valida transição e audita gerente/data. Responde `{ id, status }`. Repetição da mesma decisão deve ser idempotente; decisões conflitantes devem falhar.
- `GET /operators` (gerente): lista os campos de perfil, inclusive estado de aprovação, sem credenciais.
- `PATCH /operators/:id` (gerente): recebe somente `{ funcaoOperacional }`; valida, audita e responde perfil atualizado. Recusar alteração de papel privilegiado, estado e exclusão por esse endpoint.
- `PATCH /operators/me` (sessão aprovada): recebe somente `{ nomeCompleto }`; responde perfil atualizado. Não altera papel, função ou aprovação.
- `GET /lots` (sessão aprovada): responde somente os `Lot[]` autorizados. Campos: `id`, `code`, `line`, `location`, `supplier`, `predominantMaterial`, `total`, `receiptDate`, `notes`, `operatorId`, `operatorName`, `createdAt`, `status`, `finishedAt?`. Código `LT-` + dígitos, material conforme os valores existentes, total inteiro positivo, status `waiting | inspection | finished`. Sem limite global de um lote.
- `POST /lots` (gerente): recebe os campos de cadastro e `start: boolean`. Verifica aprovação, papel e escopo **dentro da criação**; atribui ID/código/data/responsável a partir da identidade e responde o `Lot` persistido. Não confiar em `operatorId`/`operatorName` do corpo. Garantir unicidade e planejar idempotência para repetição após perda de conexão.
- `POST /authorization/check` (sessão aprovada): recebe `{ lotId, action: "read" | "inspect" }`; verifica atribuições e responde `{ allowed: boolean }`. Usado antes de abrir registros/gravar rascunhos. Não substitui autorização transacional nos futuros endpoints de inspeção.

Todo endpoint protegido deve verificar assinatura, validade/revogação do token, aprovação, papel e escopo no servidor, independentemente da interface. Responder `401` para sessão inválida, `403` para acesso negado e `409` para conflitos, sem dados protegidos. O backend também deve proibir exclusão de perfis por gerentes operacionais. O primeiro gerente é provisionado fora do app pelo administrador do provedor, com auditoria e sem credencial embarcada.

### Inspeções e evidências ainda locais

Mesmo com autenticação configurada, diagnósticos e fotos são rascunhos locais separados por `subject`. O cache autenticado não mistura dados com o armazenamento legado ou outra conta. O acesso exige pré-check online; autorização offline autenticada não foi implementada. `/lots` controla a lista autorizada. Backend indisponível bloqueia operações autenticadas.

Ainda precisam de implementação/integração: histórico remoto (`GET /sleepers/:id` e `/sleepers/:id/inspections`), criação append-only (`POST /sleepers/:id/inspections`), upload autorizado das evidências, conclusão de inspeções e transições de lote. Cada comando deve revalidar identidade/aprovação/escopo, preservar eventos concluídos, exigir quatro fotos e usar idempotência/concorrência. Resolver lote de origem no servidor, sem transferência implícita. Nenhuma sincronização ausente é apresentada como funcional.

### Notificações remotas ainda não integradas

O servidor deve emitir `operator.access_requested` após persistir a pendência, com `requestId` e timestamp, e entregar push aos gerentes autorizados. Serão necessários registro/remoção de tokens de dispositivos, consentimento, validação de destinatários, recibos/falhas e consulta autenticada ao abrir. Não incluir senha/perfil completo no push. A caixa persistente é a fonte de verdade; push não concede aprovação. Não há solicitação de permissão push nem envio remoto nesta implementação.

## Verificação

`npm test` cobre resolução, origem/histórico, evidências anteriores, rascunhos concorrentes, progresso por unidade e autorização. `npm run typecheck` verifica tipos; iniciar Expo gera os tipos das rotas em checkout limpo. `npx expo install --check` verifica dependências; `npx expo export --platform all` verifica bundles. Os testes de contrato usam serviços isolados de teste; não constituem uma API instalada.

Antes do campo: testar QR de lote/unidade, câmera negada, NFC ausente/desligado, etiqueta reconhecida/desconhecida, cancelamento/timeout/segundo plano, nova avaria em lote finalizado com quatro fotos novas e fotos antigas após reiniciar. Após integrar backend: aprovação/rejeição, revogação de gerente, acesso direto indevido, lotes de outro operador e entrega real das notificações.

Referências: [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/), [Camera SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/camera/), [Development builds](https://docs.expo.dev/develop/development-builds/introduction/), [NFC Manager](https://github.com/revtel/react-native-nfc-manager), [plugin Expo NFC](https://github.com/revtel/react-native-nfc-manager/blob/main/docs/guide/expo.md).
