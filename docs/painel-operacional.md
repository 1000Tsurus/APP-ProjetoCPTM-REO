# Painel operacional

Depois do login (matrícula ou e-mail e senha, validados pela API), o operador cai nas três
páginas principais. Nome e papel vêm da sessão (`contexts/SessionContext.tsx`); o refresh
token e o usuário ficam no SecureStore, nunca a senha.

- **Início**: campo de tag com foco para o leitor RFID em modo teclado, aviso de registros
  aguardando envio, data do último envio ao servidor e, para quem faz trabalho de campo,
  o atalho "Registrar ocorrência sem dormente".
- **Dormentes**: lista paginada vinda da API, com busca por tag ou ata e filtro por status.
- **Perfil**: dados da sessão, estado da fila de envio, "Sincronizar agora" e "Sair".

A tela do dormente mostra os dados e o histórico, e oferece as ações conforme o papel:
`operador` movimenta, registra ocorrência e cadastra dormente; `tecnico`, `especialista`
e `admin` também inspecionam; `supervisor` só consulta. A autorização real é da API.

Movimentação, inspeção e ocorrência são gravadas na fila do aparelho e enviadas por
`POST /sincronizacao/replicar` (detalhes em `docs/integracao-api.md`). A faixa "Sem conexão"
acompanha a conectividade real: aparece quando uma requisição falha por rede e some assim
que o servidor responde de novo.

Iniciar: `npm install` e `npx expo start`.
Verificar: `npm test`, `npm run typecheck` e `npx expo export --platform android`.
Referência: https://docs.expo.dev/versions/v58.0.0/.
