# Navegação por gestos

- Início, Lotes e Perfil são páginas adjacentes, nessa ordem. Arrastar para a
  esquerda ou direita mostra a próxima página durante o movimento. Os botões
  existentes também navegam pelo mesmo paginador.
- As demais páginas usam uma pilha horizontal. No Android e iOS, arrastar da
  borda esquerda (primeiros 32 pontos) para a direita volta à página anterior,
  quando houver uma. Soltar antes de concluir cancela o retorno.
- Formulários mantêm os avisos de alterações não salvas e a inspeção mantém a
  gravação do rascunho antes de sair. Um gesto não confirma nem envia formulários.
- Painéis sobrepostos podem ser arrastados para a direita para fechar. Gestos
  curtos retornam à posição original; a rolagem vertical continua disponível.
- Histórico e leitura QR/NFC continuam como ações/painéis, sem virar etapas
  obrigatórias entre as páginas principais. A câmera mantém seus controles de saída.
- Na web, o paginador e os painéis aceitam arraste; o retorno por gesto na pilha
  é próprio do Android/iOS. Os botões de voltar continuam disponíveis na web.

## Executar e validar

Após `npm ci`, reinicie o Metro. Como foram adicionados `react-native-pager-view`
e `react-native-gesture-handler`, gere novamente o development build se estiver
usando um cliente nativo personalizado; uma instalação antiga do app não recebe
esses módulos apenas recarregando o JavaScript.

Verificações automatizadas: `npm test`, `npm run typecheck` e
`npx expo export --platform all`.

Regressão da barra na web (somente ambiente local, sem backend): iniciar o Expo
com `npx expo start --web --port 8091`, abrir uma sessão Playwright e executar:

```powershell
npx --yes --package @playwright/cli playwright-cli -s=cptm open http://localhost:8091 --browser chrome
npx --yes --package @playwright/cli playwright-cli -s=cptm run-code --filename tests/browser/navigation-bar.js
```

Esse teste usa um identificador fictício no modo local, verifica os limites da
barra e a seleção das páginas em 320×568, 390×844 e 1280×720, abre e fecha os
atalhos e verifica o deslize. A captura final fica em `.expo/barra-corrigida.png`.
O `cardStyle` da pilha precisa manter `flex: 1`: sem isso, na web o cartão cresce
com o conteúdo e empurra a barra para fora da janela.

No aparelho, verificar: arraste lento e cancelamento entre as três páginas;
alternância pelos botões; rolagem vertical e filtros horizontais; retorno de
detalhes pela borda; confirmação de descarte em Editar perfil; preservação do
rascunho da inspeção; slider de umidade; abertura e fechamento repetido dos painéis.
