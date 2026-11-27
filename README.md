# APP-ProjetoCPTM-REO

App de campo do Projeto REO / CPTM: consulta, cadastro, movimentação, inspeção e ocorrências de dormentes identificados por tag RFID. Expo SDK 58 + Expo Router, consumindo a API REST do projeto (`cptm-reo-api`).

- Instalação: `npm ci`; execução: `npm start` (ou `npm run android`).
- URL da API: `EXPO_PUBLIC_API_URL` (veja `.env.example`); sem ela usa a API na Azure.
- Login com matrícula e senha; movimentações, inspeções e ocorrências passam por uma fila offline e sincronizam quando há rede.
- Validação: `npm test`, `npm run typecheck`, `npm run test:api` (integração com a API local) e `npx expo export --platform android`.

Veja [integração com a API, papéis, fila offline e roteiro de teste](docs/integracao-api.md) e [migração para o SDK 58](docs/sdk-58.md).
