# Contexto do projeto para o Claude

O Claude lê este arquivo automaticamente ao abrir a pasta. Ele resume o que já foi feito e decidido, para continuar o trabalho em outro computador.

## Sobre o usuário
- Fala português. Responda sempre em português do Brasil.
- Não é programador. Explique passo a passo, com links diretos, e confirme antes de ações difíceis de desfazer.
- Fez o app para uso próprio e para ajudar um colega de trabalho a organizar as finanças.

## O que é
**Minhas Finanças**: PWA (site instalável como app) de finanças pessoais. Roda no Chrome do PC e no celular sem depender do Claude.

- **Site:** https://organiza-financas.github.io/
- **Repositório:** https://github.com/organiza-financas/organiza-financas.github.io (público, na organização `organiza-financas`, da qual o usuário é admin)
- **Publicação:** GitHub Pages a partir da branch `main`, pasta raiz. Um `git push` publica em cerca de 1 minuto.
- **Firebase:** projeto `organiza-financas-b9a6d`, console em https://console.firebase.google.com/project/organiza-financas-b9a6d
- O guia do usuário está em `LEIAME.md`.

## Stack e arquivos
JavaScript puro, sem build e sem dependências npm. O SDK do Firebase 10.12.2 é importado do CDN gstatic.
- `index.html`: telas, o modal de lançamento e o modal de meta.
- `styles.css`: mobile first, tema claro e escuro automático.
- `app.js`: toda a lógica. Inclui o motor de cálculo, as telas, os gráficos SVG e dois backends:
  - `criarBackendLocal`: usa localStorage. Fica ativo quando `firebase-config.js` está vazio.
  - `criarBackendFirebase`: Auth (Google + e-mail/senha) e Firestore com cache offline.
- `firebase-config.js`: configuração pública do Firebase. Não é segredo.
- `sw.js`: service worker. Busca primeiro na rede para os arquivos do app; usa cache para o SDK.
- `manifest.json` e `icons/`: instalação como app.
- Teste local: `npx http-server -p 8123` (configurado em `.claude/launch.json`).

## Modelo de dados (Firestore)
- `users/{uid}/transacoes/{id}` guarda `{tipo: 'entrada'|'saida', descricao, valor, categoria, periodicidade, data: 'YYYY-MM-DD', dataFim?, parcelas?, criadoEm}`.
- `users/{uid}/config/settings` guarda `{saldoInicial, mesesMedia, incluirEntradasAvulsas, metas: [{id, nome, valor, guardado, prazo: 'YYYY-MM', aporte?}]}`.
- **Regras de segurança:** cada usuário só lê e grava em `users/{seu uid}/**`. O texto das regras está no `LEIAME.md`.

## Regras de negócio decididas com o usuário
- **Categorias de saída:** moradia, comida, carro, saúde, lazer, pessoal, viagem, investimento, outros.
- **Categorias de entrada:** salário, renda extra, rendimentos, outros.
- **Periodicidades:** única, semanal, mensal, bimestral, trimestral, semestral, anual, parcelado. No parcelado o valor informado é o total, dividido por N meses.
- **Fixas** são todas as recorrentes. **Variáveis** são as "única vez".
- **Previsão de 12 meses:**
  - Gasto variável de cada mês = máx(variáveis já lançadas no mês, média dos últimos N meses completos), com N = 3 por padrão e sem contar Investimento.
  - Entradas previstas são só as recorrentes. A média das avulsas entra apenas se a opção estiver ligada em Ajustes.
- **Investimento** conta como saída de caixa, mas soma na "capacidade de guardar" (capacidade = resultado + investimentos).
- **Metas são SEM juros** (escolha do usuário).
  - Valor que falta = meta − guardado.
  - Com prazo: valor mensal = falta ÷ meses até o prazo (inclusive o mês atual).
  - Sem prazo: meses = falta ÷ capacidade média.
- **Multiusuário:** cada pessoa cria a própria conta. O dono do projeto Firebase consegue ver os dados pelo painel, e o usuário foi avisado disso.

## Situação em 26/11/2026
- App publicado, Auth (Google + e-mail/senha) ativo, domínio `organiza-financas.github.io` autorizado e Firestore criado. Acesso sem login é bloqueado (verificado).
- **Pendente:** ao salvar, o usuário logado recebeu `permission-denied`. Provável causa: as regras do Firestore não foram publicadas corretamente. O usuário foi orientado a colar as regras de novo e clicar em Publicar, a apagar a conta de teste em Authentication → Users e a limpar os dados do site no navegador. **Confirme com ele se resolveu.** Para testar daqui sem login, use a REST API pública com a apiKey:
  - `accounts:signInWithPassword` com uma conta inexistente deve responder `INVALID_LOGIN_CREDENTIALS`.
  - Um GET no Firestore sem login deve responder `PERMISSION_DENIED`.
- **iPhone:** recomendar login por e-mail/senha no app da tela inicial, porque o popup do Google falha no modo standalone.

## Ideias que ainda não foram feitas
- Botão "Excluir minha conta" dentro do app.
- Juros nas metas (o usuário escolheu sem juros por enquanto).
