# Início operacional

**Objetivo:** implementar a referência para o inspetor CPTM após login/cadastro.
**Arquitetura:** Expo Router 57 existente, contexto de perfil compartilhado e dados demonstrativos isolados. Sem novas dependências. Meta somente para leitura; edição pertence ao gestor e depende do backend.

- [x] Compartilhar nome, matrícula, função e base entre cadastro, login e início, sem guardar senhas. Reutilizar perfil apenas quando o identificador corresponder.
- [x] Criar cabeçalho, meta com progresso, categorias, resumo, filtros e inspeções; identificar os números demonstrativos.
- [x] Implementar painéis de categorias, lotes, histórico, perfil e inspeção, sem simular captura LiDAR ou GPS ativo.
- [x] Verificar TypeScript e exportação web. No Chrome: cadastro com nome/base, filtro de reprovados (2 registros), filtro LT-002 (3 registros), detalhes e categoria vazia.
- [x] Reconfirmar entrada e saída no navegador após correção de rota: login abre o painel e sair retorna a `/login`. A rota explícita evita a ambiguidade entre os dois índices. Sem erros no console na nova aba.

Documentação consultada antes da implementação: https://docs.expo.dev/versions/v57.0.0/ e referência versionada do Expo Router. A sessão existente é um protótipo local sem validação de credenciais no servidor.
