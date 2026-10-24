# Migração para Expo SDK 58

Versões instaladas: Expo 58.0.19, Expo Router 58.0.26, React Native 0.88.0 e React 19.3.0.
Os demais módulos foram alinhados pelo `expo install --fix`; o lockfile foi recalculado
com as versões compatíveis e instalado com `npm ci`.

Adaptações aplicadas:

- Referências e propriedades usam os tipos públicos da API estrita do React Native.
- O esquema de cores assume tema claro quando o sistema retorna `null`.
- As telas usam `useRouter()` para navegar no contexto correto.
- O HTML web renderiza `headNodes` e `bodyNodes` de `useServerDocumentContext()` para preservar estilos, fontes e hidratação.
- Áreas seguras na web usam CSS `env(safe-area-inset-*)`; o provider explícito permanece apenas em Android/iOS.
- A exportação web continua estática.

Verificações executadas:

- `npx expo install --check`: dependências compatíveis.
- `npx expo-doctor`: 20/20 verificações aprovadas.
- `npx tsc --noEmit`: sem erros.
- `npx expo export --platform all --clear --output-dir dist`: bundles Android/iOS com Hermes e exportação web gerados.
- Chrome usando a exportação estática: login, painel, filtro de reprovados (2 registros), perfil e saída para `/login`, sem erros de console observados.

Isso não substitui compilar e testar um aplicativo nativo em dispositivo. Se estiver
usando development builds do SDK 57, gere novos builds para SDK 58.

O `npm audit` reportou cinco avisos de severidade alta na árvore de ferramentas do
Expo CLI, envolvendo `node-forge` e `zod` e seus dependentes. A correção automática
proposta inclui voltar para Expo 44; ela não foi aplicada por contrariar esta migração.

Referências: [SDK 58](https://docs.expo.dev/versions/v58.0.0/) e
[migração do Router](https://docs.expo.dev/router/migrate/sdk-57-to-58/).
