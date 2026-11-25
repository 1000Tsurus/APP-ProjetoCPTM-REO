# Navegação por gestos

- Início, Dormentes e Perfil são páginas adjacentes, nessa ordem. Arrastar para a
  esquerda ou direita mostra a próxima página durante o movimento. A barra inferior
  navega pelo mesmo paginador.
- As demais telas (dormente, movimentar, inspecionar, ocorrência, cadastrar dormente e
  fila) usam uma pilha horizontal. No Android e iOS, arrastar da borda esquerda
  (primeiros 32 pontos) para a direita volta à tela anterior, quando houver uma.
  Soltar antes de concluir cancela o retorno.
- Um gesto nunca confirma nem envia formulários: salvar sempre exige tocar em "Salvar".
- Na web, o paginador aceita arraste; o retorno por gesto na pilha é próprio do
  Android/iOS. Os botões "Voltar" continuam disponíveis em todas as plataformas.

## Executar e validar

Após `npm ci`, reinicie o Metro. O app usa `react-native-pager-view` e
`react-native-gesture-handler`; gere novamente o development build se estiver usando
um cliente nativo personalizado, porque uma instalação antiga não recebe módulos nativos
apenas recarregando o JavaScript.

Verificações automatizadas: `npm test`, `npm run typecheck` e
`npx expo export --platform android`.

O `cardStyle` da pilha precisa manter `flex: 1`: sem isso, na web o cartão cresce
com o conteúdo e empurra a barra para fora da janela.

No aparelho, verificar: arraste lento e cancelamento entre as três páginas;
alternância pela barra inferior; rolagem vertical da lista de dormentes e filtros
horizontais; retorno pela borda a partir de dormente, movimentar e fila; slider de
umidade na inspeção sem acionar o retorno.
