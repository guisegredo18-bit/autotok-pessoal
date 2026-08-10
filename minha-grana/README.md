# Minha Grana

Consolida em **dólar** o que suas afiliações da **Amazon Associates** e da
**Hotmart** pagam, mostra quais produtos você está promovendo e quanto cada um
rendeu, e exporta uma planilha de apoio para o contador.

**Instalação pelo iPhone, sem terminal.** Você registra as credenciais dentro
do próprio aplicativo — nada de colar chave em painel de hospedagem.

**Custo: zero.** Nenhum serviço da configuração padrão pede cartão de crédito.

---

## O que ele faz

```
   ┌──────────────┐              ┌────────────────────┐
   │  Hotmart     │ ──── API ──▶ │                    │
   │  (vendas)    │              │                    │
   └──────────────┘              │                    │
                                 │    Minha Grana     │──▶ painel em USD
   ┌──────────────┐              │                    │    projeção 30 dias
   │  Amazon      │ ── PA-API ─▶ │  (Postgres)        │    meus produtos
   │  (catálogo)  │              │                    │
   └──────────────┘              │                    │──▶ CSV para o contador
                                 │                    │
   ┌──────────────┐              │                    │
   │  CSV ganhos  │ ── upload ─▶ │                    │
   │  (Amazon)    │              └────────────────────┘
   └──────────────┘
```

| Dado | Amazon | Hotmart |
|---|---|---|
| Catálogo de produtos | PA-API 5.0 (`SearchItems`/`GetItems`) | seus produtos, via API |
| Preço, categoria, ranking | PA-API | API |
| **Comissão recebida** | **CSV de ganhos** (upload) | API de vendas/comissões |
| Percentual de comissão | não informado pela API | informado quando existe |

---

## Três limitações que o projeto assume, em vez de disfarçar

**1. A PA-API da Amazon não informa quanto você ganhou.** Ela é uma API de
catálogo. O valor real só existe no relatório do painel do Associates
(*Relatórios → Ganhos → Download*), e por isso a comissão da Amazon entra por
upload de CSV. Reenviar o mesmo período não duplica nada: as linhas são
reconhecidas e atualizadas.

Seria fácil estimar a comissão multiplicando o preço pela tabela de categorias
— e o painel pareceria completo. Não faz, porque essa tabela muda sem aviso e o
número nunca fecharia com o extrato, que é justamente para o que ele serve.

**2. A Hotmart não publica o marketplace de afiliados em API.** Temperatura e
ranking de produtos afiliáveis não têm endpoint oficial. Dá para trazer suas
vendas e os produtos já ligados à sua conta; a descoberta de produtos novos
fica com a Amazon.

**3. Contas novas do Associates não têm cota na PA-API.** A Amazon só libera
depois das primeiras vendas qualificadas. Até lá as chamadas voltam com
`TooManyRequests` — o painel diz isso com essas palavras, e a importação de CSV
funciona desde o primeiro dia.

---

## Instalação pelo iPhone (~15 min)

### Etapa 1 — banco de dados grátis (~3 min)

1. No Safari, abra **[neon.tech](https://neon.tech)** e entre com o GitHub.
2. Crie um projeto e copie a **Connection string** (começa com `postgresql://`).

### Etapa 2 — publicar (~5 min)

1. Abra **[vercel.com/new](https://vercel.com/new)** e entre com o GitHub.
2. Encontre **minha-grana** na lista e toque em **Import**.
3. Em **Environment Variables**, adicione as três:

   | Nome | Valor |
   |---|---|
   | `DATABASE_URL` | a connection string do Neon |
   | `APP_PASSWORD` | uma senha sua, para entrar no painel |
   | `AUTH_SECRET` | 40+ caracteres aleatórios (digite no teclado, serve) |

4. Toque em **Deploy** e espere 2–3 minutos.

> Guarde o `AUTH_SECRET`. Se ele mudar, as credenciais que você registrar
> precisam ser preenchidas de novo — é ele que as decifra.

#### Reaproveitando o banco de outro aplicativo

Dá para colar a **mesma `DATABASE_URL`** que outro app seu já usa (o AutoTok,
por exemplo) em vez de criar um banco novo. Funciona, e três medidas tornam
isso seguro:

- **As chaves na tabela `settings` são prefixadas** (`grana_app`,
  `grana_secrets`, `grana_fx`). Sem isso os dois apps escreveriam nas mesmas
  linhas: salvar uma preferência aqui apagaria as do vizinho, e registrar uma
  credencial tornaria as dele ilegíveis — cada app cifra com um sal diferente.
  Nada disso daria erro; daria perda de dados descoberta dias depois.
- **A migration usa `CREATE TABLE IF NOT EXISTS`**, porque as tabelas podem já
  ter sido criadas pelo outro app.
- **O controle de migrations aplicadas fica numa tabela própria**
  (`__drizzle_migrations_grana`). A tabela padrão guarda só a data da última
  migration aplicada e pula tudo mais antigo que ela — compartilhada, a
  migration de um app poderia ser marcada como aplicada sem nunca ter rodado.

O que os dois passam a compartilhar de verdade são as tabelas
`affiliate_products` e `commissions`. Como o painel de comissões sai do
AutoTok, na prática só este app as usa.

O custo de dividir: apagar o projeto no Neon derruba os dois. Se preferir
independência total, crie um banco novo — o resto da instalação é idêntico.

### Etapa 3 — preparar e instalar (~2 min)

1. Abra a URL que a Vercel deu e entre com a `APP_PASSWORD`.
2. Aparece **"Quase lá"** — toque em **Preparar banco de dados**. Cria as
   tabelas. É uma vez só.
3. Toque em **Compartilhar → Adicionar à Tela de Início**. Vira um app.

### Etapa 4 — registrar suas chaves (~5 min)

Tudo em **Configurações**, dentro do app. Pode preencher só uma das duas
plataformas; a outra fica quieta.

**Hotmart** — em [developers.hotmart.com](https://developers.hotmart.com) →
Credenciais: `Client ID` e `Client Secret`.

**Amazon** — em afiliados.amazon.com.br → Ferramentas → API de Publicidade de
Produtos: `Access Key`, `Secret Key`, sua tag de afiliado (ex: `seunome-20`) e
o marketplace.

Depois, em **Importar**, toque em **Testar conexão**. Se algo estiver errado, a
mensagem diz o quê, em português.

### Etapa 5 — primeira importação

1. Em **Importar**, confira *Seu papel na Hotmart*. Se você promove produtos
   dos outros, deixe **Afiliado** — esse campo é o que impede o painel de somar
   o faturamento do produto como se fosse seu ganho.
2. Preencha os **termos de busca da Amazon** (um por linha) com os assuntos que
   você promove.
3. Toque em **Importar comissões** e em **Buscar produtos pelos meus termos**.
4. Para a Amazon, baixe o relatório de ganhos do painel do Associates e suba o
   CSV — o Safari salva em Arquivos, e o seletor lê de lá.

---

## Instalação pelo computador

```bash
cp .env.example .env    # preencher DATABASE_URL, APP_PASSWORD, AUTH_SECRET
npm install
npm run dev             # http://localhost:3000
```

Não precisa de ffmpeg, nem de nenhuma outra dependência de sistema.

Para o banco, aponte o `DATABASE_URL` para o mesmo Neon do celular (os dados
ficam sincronizados entre os dois) ou para um Postgres local.

```bash
npm test           # 116 testes da lógica pura (sem rede, sem banco)
npm run typecheck
npm run db:push    # cria as tabelas pelo terminal, se preferir
```

---

## Como o dinheiro é tratado

Três regras valem para o projeto inteiro:

**Centavo é inteiro.** Ponto flutuante acumula erro (`0.1 + 0.2 !== 0.3`) e a
soma de trezentas comissões precisa fechar com o extrato ao centavo.

**A conversão para dólar acontece na importação, não na exibição.** Cada
comissão guarda o valor original, a cotação usada e o valor em USD. Um total
que muda de tarde para noite, com as mesmas vendas, não serve para conferir com
o extrato nem para entregar ao contador. A cotação vem do open.er-api.com (sem
chave) e é buscada uma vez por dia.

**Sem cotação, o valor em USD fica vazio — nunca zero.** Um zero desaparece
dentro da soma e faz o painel afirmar que você ganhou menos do que ganhou. O
painel mostra quantas linhas estão nessa situação.

---

## A projeção

Média diária do período observado × 30. Só isso, e de propósito: qualquer curva
de tendência seria simulação com cara de precisão.

O período observado nunca conta dias anteriores à sua primeira comissão — quem
importou ontem veria a média dividida por 30 e concluiria que não ganha quase
nada. Abaixo de 14 dias de histórico, o painel marca a projeção como instável.
Sem nada aprovado no último mês, ele não projeta: mostra `—` em vez de afirmar
"você vai ganhar US$ 0".

---

## Segurança

As credenciais **não** ficam em texto puro. São cifradas com **AES-256-GCM**,
com chave derivada do `AUTH_SECRET` via scrypt, e guardadas no seu banco. Quem
ler o banco sem o `AUTH_SECRET` não consegue usar suas chaves.

Elas nunca chegam ao navegador: os campos sensíveis voltam sempre vazios para a
tela, marcados como "preenchido".

Toda chamada às APIs externas sai do servidor. A rota de exportação exige
sessão e responde `no-store, private` — dado de renda não fica em cache de
proxy nenhum.

---

## Exportação

**Importar → Exportar** baixa um CSV com data, produto, valor na moeda original,
cotação usada e valor em dólar. Separado por ponto-e-vírgula e com BOM, que é o
que o Excel em português abre direto, sem a etapa de "importar dados".

É material de apoio para o contador (carnê-leão). **O projeto não calcula
imposto** — isso é trabalho de contador, e um cálculo errado aqui sairia caro.

---

## Estrutura do projeto

```
app/
  (app)/              telas internas, protegidas por sessão
    page.tsx          o painel
    importar/         importações, preferências e exportação
    config/           registro das chaves
  api/exportar/       download do CSV consolidado
  actions.ts          server actions
lib/
  money.ts            centavos, cotação e conversão para USD
  afiliados/          nota, somas, projeção e exportação (sem rede, sem banco)
  amazon/             PA-API 5.0 (assinatura SigV4) + leitura do CSV de ganhos
  hotmart/            OAuth2 client credentials + vendas e comissões
  pipeline/           importação e gravação
  db/                 schema, configurações e cotação
  secrets.ts          cofre cifrado das credenciais
tests/                testes da lógica pura (rodam offline)
```

O CI roda typecheck, testes, build e ainda verifica se a migration está em dia
com o schema — se alguém alterar `lib/db/schema.ts` sem rodar
`npx drizzle-kit generate`, o CI falha em vez de deixar o deploy subir com o
banco desatualizado.

A assinatura SigV4 da Amazon é conferida contra o **vetor de teste publicado
pela AWS**, e não contra um valor produzido por esta mesma implementação — o
que só provaria que ela é consistente consigo mesma. Assinatura errada se
manifesta apenas como `signature does not match`, que não diz qual dos quatro
passos da derivação saiu torto.

---

## Problemas comuns

**"A Amazon limitou as chamadas"** — cota da PA-API. Contas novas do Associates
só recebem depois das primeiras vendas qualificadas. Não é chave errada. Use a
importação do CSV enquanto isso.

**"A Hotmart recusou as credenciais"** — Client ID ou Secret errados. Copie de
novo em developers.hotmart.com → Credenciais.

**"Li N vendas, mas nenhuma tinha comissão no papel X"** — o campo *Seu papel
na Hotmart* está errado. Se você é o produtor dos produtos (e não afiliado),
mude para **Produtor**.

**As chaves sumiram da tela** — o `AUTH_SECRET` mudou. O painel avisa
explicitamente quando é isso, com a contagem de quantas chaves não puderam ser
decifradas. Restaure o valor antigo ou registre as chaves de novo.

**Comissões sem valor em dólar** — não havia cotação no momento da importação.
Importe de novo; as linhas são atualizadas, não duplicadas.
