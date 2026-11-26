# Minhas Finanças: guia de configuração

App de finanças pessoais que roda no navegador do computador e do celular (instalável como app), com sincronização pela nuvem.

**Endereço do app:** https://organiza-financas.github.io/

**Código:** repositório `organiza-financas/organiza-financas.github.io` no GitHub (público; os dados financeiros não ficam lá).

Cada pessoa cria a própria conta no login e só enxerga os próprios lançamentos.

## O que tem no app

| Aba | O que faz |
|---|---|
| **Resumo** | Entradas, saídas e saldo do mês, divisão entre gastos fixos e variáveis, gastos por categoria e quanto guardar para a sua meta principal. |
| **Lançamentos** | Lista do mês com filtros. Toque num item para editar ou excluir. |
| **Previsão** | Projeção dos próximos 12 meses: entradas, despesas fixas, média de variáveis, resultado de cada mês e saldo acumulado. |
| **Metas** | Para cada meta mostra quanto guardar por mês e por quantos meses, se cabe no orçamento, e tem um simulador. |
| **Ajustes** | Saldo inicial, número de meses usados na média, backup (.json), exportação para planilha (.csv) e saída da conta. |

### Como os cálculos funcionam

- **Despesas fixas** são tudo que é recorrente: semanal, mensal, bimestral, trimestral, semestral, anual e parcelado.
- **Gastos variáveis** são os lançamentos "uma única vez". A previsão usa a **média dos últimos 3 meses completos** (dá para mudar em Ajustes). Se um mês futuro já tiver gastos avulsos lançados acima da média, o app usa o valor maior.
- **Entradas previstas** são só as recorrentes (salário etc.). Para incluir a média de freelas e extras, ative a opção em Ajustes.
- **Parcelado**: informe o **valor total** e o número de parcelas. O app divide e lança uma parcela por mês.
- **Categoria Investimento**: o que você lança como investimento conta como saída de caixa, mas também conta como **dinheiro guardado** na capacidade de poupança. Assim não é descontado duas vezes.
- **Meta** (sem juros): `falta = meta − já guardado`.
  - Com prazo: `guardar por mês = falta ÷ meses até o prazo`.
  - Sem prazo: `meses = falta ÷ sobra mensal média`.

---

## Passo 1: criar o Firebase (sincronização), cerca de 10 minutos

O Firebase é um serviço gratuito do Google que guarda os dados e cuida do login. O plano gratuito ("Spark") é muito maior do que o uso de uma pessoa.

1. Acesse **https://console.firebase.google.com** e entre com sua conta Google.
2. Clique em **Criar um projeto**, dê um nome (ex: `minhas-financas`) e conclua. O Google Analytics pode ficar desativado.
3. **Registrar o app web**: na página inicial do projeto, clique no ícone **`</>`** (Web). Dê um apelido (ex: `financas-web`), **não** marque "Firebase Hosting" e clique em **Registrar app**.
4. Vai aparecer um bloco de código com `const firebaseConfig = { apiKey: "...", ... }`. **Copie esses valores** para o arquivo [firebase-config.js](firebase-config.js) desta pasta, substituindo as aspas vazias.
5. **Ativar o login**: no menu à esquerda, vá em **Criação → Authentication → Vamos começar**.
   - Em **Método de login**, ative **Google** (escolha seu e-mail de suporte e salve).
   - Ative também **E-mail/senha**. Ele serve de alternativa caso o login Google dê problema no app instalado no celular.
6. **Criar o banco de dados**: no menu, **Criação → Firestore Database → Criar banco de dados**.
   - Localização: `southamerica-east1 (São Paulo)`.
   - Comece no **modo de produção**.
7. **Regras de segurança** (importante, é o que deixa seus dados privados): na aba **Regras** do Firestore, apague tudo, cole o texto abaixo e clique em **Publicar**:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```

> Os valores do `firebase-config.js` **não são senhas**: o Firebase foi feito para eles ficarem visíveis no site. Quem protege os dados são as regras do item 7. Cada pessoa só lê e grava os próprios lançamentos.

## Passo 2: publicar no GitHub Pages (já feito)

> O app já está publicado em https://organiza-financas.github.io/. As instruções abaixo ficam só como referência, caso precise publicar de novo em outro lugar.

### Referência

O GitHub Pages hospeda o app de graça num endereço como `https://SEU-USUARIO.github.io/minhas-financas/`.

> No plano gratuito o **repositório precisa ser público**. Fica público só o **código** do app. **Seus dados financeiros não vão para o GitHub**: eles ficam no Firebase, protegidos pelo login.

**Pelo site do GitHub:**
1. Em https://github.com/new crie um repositório chamado `minhas-financas` (público).
2. Clique em **uploading an existing file** e arraste **todos os arquivos desta pasta**, menos a pasta `.claude`. Inclua a pasta `icons`. Depois clique em **Commit changes**.
3. Vá em **Settings → Pages**. Em *Branch*, escolha `main` e `/ (root)` e salve.
4. Espere 1 ou 2 minutos. O endereço aparece no topo da mesma página.

**Último ajuste no Firebase:** em **Authentication → Configurações → Domínios autorizados**, clique em **Adicionar domínio** e coloque `organiza-financas.github.io` (sem `https://` e sem a barra final). Sem isso o login dá erro de "domínio não autorizado".

## Passo 3: instalar no celular e no computador

- **Android (Chrome)**: abra o endereço, toque no menu **⋮ → Adicionar à tela inicial / Instalar app**.
- **iPhone (Safari)**: abra o endereço, toque em **Compartilhar (□↑) → Adicionar à Tela de Início**.
  - Se o login com Google não abrir no app instalado, use **e-mail e senha**. Crie a conta uma vez e use o mesmo e-mail em todos os aparelhos.
- **Computador (Chrome)**: abra o endereço e clique no ícone de instalar na barra de endereço (ou menu **⋮ → Transmitir, salvar e compartilhar → Instalar página como app**).

Faça login **com a mesma conta** em todos os aparelhos e os dados ficam sincronizados. O app funciona offline: se você lançar algo sem internet, ele envia quando a conexão voltar.

---

## Dicas de uso

1. Comece lançando as **entradas fixas** (salário) e as **despesas fixas** (aluguel, contas, parcelas, seguro anual etc.) com a periodicidade certa.
2. Em **Ajustes**, informe o **saldo em conta no início do mês**.
3. Lance os gastos do dia a dia como **"Uma única vez"**. Depois de 2 ou 3 meses a média de variáveis fica bem realista.
4. Para uma conta que acabou (ex: cancelou a academia), edite e preencha **"Termina em"**. **Não exclua**, porque excluir apaga o histórico também.
5. Faça um **backup (.json)** de vez em quando em Ajustes.

## Testar no computador sem publicar

Com o `firebase-config.js` ainda vazio, o app roda em **modo local**: sem login, com os dados salvos só naquele navegador. Para abrir:

```
npx http-server -p 8123
```

Depois acesse http://localhost:8123. Abrir o `index.html` direto com dois cliques não funciona, porque o navegador bloqueia módulos JavaScript em arquivos locais.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `index.html` | Estrutura das telas |
| `styles.css` | Visual (claro e escuro automático) |
| `app.js` | Toda a lógica: cálculos, previsão, metas, armazenamento |
| `firebase-config.js` | **Seus dados do Firebase (você preenche)** |
| `manifest.json`, `sw.js`, `icons/` | Fazem o app ser instalável e funcionar offline |
