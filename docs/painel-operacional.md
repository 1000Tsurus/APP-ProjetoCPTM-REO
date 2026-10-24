# Painel operacional

Após entrar ou concluir o cadastro, o inspetor acessa o início do RailLog Inspect.
Nome, função e base são compartilhados por `contexts/SessionContext.tsx`.
O último perfil fica no SecureStore (Android/iOS) ou no sessionStorage (web), sem senhas;
o login só reutiliza seus dados quando a matrícula/e-mail corresponde. A sessão ativa é
mantida em memória; recarregar o aplicativo exige nova entrada.

O painel inclui meta diária somente para leitura, categorias da via permanente,
volume consolidado, filtros e detalhes das inspeções, lotes, histórico e perfil.
Os dados de `data/operational-summary.ts` são demonstrativos, inclusive a meta da gestão.
Ainda não há API de login, operações ou metas. GPS, captura e calibração LiDAR não são
apresentados como ativos sem integração real.

Sem `EXPO_PUBLIC_CREDENTIALS_API_URL`, o cadastro abre uma sessão demonstrativa local.
Quando configurada, a URL recebe o formulário por POST e a tela inicial abre somente
após uma resposta HTTP de sucesso. Falhas mantêm o formulário com a mensagem de erro.
A liberação operacional e a autorização para alterar metas precisam ser verificadas
pelo backend na integração dos serviços reais.

Iniciar: `npm install` e `npm run web`.
Verificar: `npx tsc --noEmit` e `npx expo export --platform web`.
Referência: https://docs.expo.dev/versions/v58.0.0/.
