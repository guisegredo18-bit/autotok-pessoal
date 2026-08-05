# AutoTok Pessoal

Analisa as tendências do TikTok, escreve e renderiza vídeos automaticamente, e
publica na sua conta **depois que você aprova pelo iPhone**.

O celular é o controle remoto: você recebe uma notificação quando um vídeo fica
pronto, assiste, e toca em aprovar. Renderizar vídeo exige um servidor — quem
faz o trabalho pesado é o GitHub Actions.

**Custo: zero.** Nenhum serviço usado na configuração padrão pede cartão de
crédito.

**Instalação:** dá para fazer tudo **[pelo iPhone](#instalação-pelo-iphone-sem-computador)**,
sem terminal — ou **[pelo computador](#instalação-pelo-computador)**, se preferir.

---

## Como funciona

```
   ┌──────────────┐   3x/dia    ┌────────────────────┐
   │ GitHub       │ ──────────▶ │ Creative Center    │  hashtags e sons em alta
   │ Actions      │             └────────────────────┘
   │              │                      │
   │              │             ┌────────▼───────────┐
   │              │ ──────────▶ │ Claude (API)       │  escreve o roteiro
   │              │             └────────┬───────────┘
   │              │                      │
   │              │             ┌────────▼───────────┐
   │              │ ──────────▶ │ TTS + Pexels +     │  monta o MP4 vertical
   │              │             │ FFmpeg             │  1080x1920, legendado
   └──────┬───────┘             └────────┬───────────┘
          │                              │
          │ notificação                  ▼
          ▼                       ┌─────────────┐
   ┌─────────────┐                │  R2 / S3    │
   │  iPhone     │ ◀──────────────┤  (o vídeo)  │
   │  (o painel) │   você assiste └─────────────┘
   └──────┬──────┘
          │ você aprova
          ▼
   ┌─────────────┐
   │  TikTok     │  Content Posting API
   └─────────────┘
```

Nada é publicado sem você tocar em **Aprovar e publicar**.

---

## O que você precisa saber antes de começar

Três limitações reais, para não haver surpresa:

1. **Publicação automática exige auditoria do TikTok.** A Content Posting API é
   oficial e funciona, mas enquanto o seu app não passar pela auditoria do
   TikTok, todo vídeo enviado por ela chega na sua conta como **privado**. Você
   abre o TikTok e muda a privacidade com um toque. Depois da auditoria
   (gratuita, feita no portal de desenvolvedores), o post vira 100% automático.
   O código já cobre os dois casos — o painel avisa em qual você está.

2. **As tendências vêm do Creative Center, que não é uma API oficial.** A API
   oficial de pesquisa do TikTok é liberada só para pesquisadores acadêmicos. O
   Creative Center é a vitrine pública de tendências e responde sem login, mas
   o TikTok pode mudar o formato a qualquer momento. O código é defensivo: se a
   coleta falhar, ele avisa em vez de quebrar, e o resto continua funcionando
   (você pode gerar ideias digitando um assunto). Se um dia parar de responder,
   o ajuste fica em `lib/trends/creative-center.ts`.

3. **Vídeo automático não substitui julgamento.** A IA dá uma nota honesta a
   cada roteiro e você define a nota mínima. Ainda assim, assista antes de
   aprovar — é exatamente para isso que existe o passo de aprovação.

---

## Instalação pelo iPhone (sem computador)

Dá para instalar tudo do celular — não é preciso terminal, `npm` nem ffmpeg na
sua máquina. Reserve uns 40 minutos e faça na ordem abaixo: cada etapa deixa
algo funcionando.

> **Dica antes de começar:** abra o app **Notas** e vá colando cada chave que
> obtiver. No Safari, mantenha uma aba por serviço — você vai alternar entre
> elas.

### Etapa 1 — pegar as 3 chaves grátis (~10 min)

Nenhuma pede cartão de crédito.

| O quê | Onde | O que copiar |
|---|---|---|
| Banco de dados | [neon.tech](https://neon.tech) → criar projeto | a *Connection string* |
| IA (roteiros) | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → *Create API key* | a chave |
| Imagens de fundo | [pexels.com/api](https://www.pexels.com/api/) | a chave |

### Etapa 2 — publicar o painel (~5 min)

1. No Safari, abra **[vercel.com/new](https://vercel.com/new)** e entre com o GitHub.
2. Encontre **autotok-pessoal** na lista e toque em **Import**.
3. Abra **Environment Variables** e adicione estas cinco:

   | Nome | Valor |
   |---|---|
   | `DATABASE_URL` | a connection string do Neon |
   | `GEMINI_API_KEY` | a chave do Google AI Studio |
   | `PEXELS_API_KEY` | a chave do Pexels |
   | `APP_PASSWORD` | uma senha sua, para entrar no painel |
   | `AUTH_SECRET` | 40+ caracteres aleatórios (digite no teclado, serve) |

4. Toque em **Deploy** e espere 2–3 minutos.

> Não precisa informar `APP_URL` nem `TIKTOK_REDIRECT_URI`: o app descobre o
> próprio endereço a partir do deploy da Vercel.

### Etapa 3 — abrir e preparar o banco (~2 min)

1. Abra a URL que a Vercel te deu e entre com a `APP_PASSWORD`.
2. Vai aparecer **"Quase lá"** — toque em **Preparar banco de dados**. Isso cria
   as tabelas. É uma vez só.
3. Toque em **Compartilhar → Adicionar à Tela de Início**. Pronto: vira um app.

Agora já dá para tocar em **Buscar tendências** e **Gerar ideias** e ver os
roteiros. O que ainda não funciona é *gravar o vídeo* — falta a Etapa 4.

### Etapa 4 — ligar a renderização (~15 min)

Renderizar vídeo precisa de ffmpeg, que a Vercel não tem. Quem faz esse
trabalho é o GitHub Actions, e ele precisa de um lugar para guardar o arquivo.

**4a. Armazenamento** — em [dash.cloudflare.com](https://dash.cloudflare.com) →
R2 → criar bucket → em *Settings* ative o **Public access** (guarde a URL
`pub-xxx.r2.dev`) → em *Manage R2 API Tokens* crie um token de leitura e escrita.

**4b. Secrets do GitHub** — abra
`github.com/guisegredo18-bit/autotok-pessoal/settings/secrets/actions` no Safari
e adicione, um por um:

`DATABASE_URL`, `GEMINI_API_KEY`, `PEXELS_API_KEY`, `S3_ENDPOINT`, `S3_BUCKET`,
`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL`

Na aba **Variables** ao lado, adicione `AI_PROVIDER` = `gemini`.

> Essa é a parte mais chata no celular. Se o formulário ficar apertado, toque no
> **aA** na barra de endereço → **Solicitar Site para Computador**.

**4c. Deixar o painel disparar os jobs** — crie um token clássico em
`github.com/settings/tokens` com o escopo **repo**. Depois, na Vercel
(*Settings → Environment Variables* do projeto), adicione:

| Nome | Valor |
|---|---|
| `GITHUB_TOKEN` | o token que você acabou de criar |
| `GITHUB_REPO` | `guisegredo18-bit/autotok-pessoal` |
| `STORAGE_DRIVER` | `s3` |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL` | os mesmos valores da Etapa 4a |

Toque em **Redeploy** para as variáveis valerem.

Agora aprove uma ideia: em poucos minutos o vídeo aparece na aba **Fila**.

### Etapa 5 — conectar o TikTok (~10 min)

Em [developers.tiktok.com](https://developers.tiktok.com): criar app → adicionar
**Login Kit** e **Content Posting API** → escopos `user.info.basic`,
`video.publish`, `video.upload`.

Em **Redirect URI**, cole exatamente:
`https://SEU-APP.vercel.app/api/tiktok/callback`

Adicione `TIKTOK_CLIENT_KEY` e `TIKTOK_CLIENT_SECRET` na Vercel, faça
**Redeploy**, e conecte em **Configurações → Conectar TikTok**.

### Etapa 6 — notificações no celular (~3 min)

Instale o app **ntfy** na App Store, assine um tópico com nome longo e aleatório
(ex.: `autotok-k3n8vqz1x`) e adicione `NTFY_TOPIC` com esse mesmo nome na Vercel
e nos secrets do GitHub.

Pronto: agora você recebe um aviso no celular sempre que um vídeo fica pronto.

---

## Instalação pelo computador

Se preferir usar o terminal, é mais rápido. Reserve uns 40 minutos na primeira vez.

### 1. Banco de dados (grátis)

Crie um Postgres no [Neon](https://neon.tech) (plano grátis serve). Copie a
connection string — ela vai em `DATABASE_URL`.

> Precisa ser um banco acessível pela internet, porque tanto o painel quanto o
> GitHub Actions gravam nele.

### 2. Armazenamento dos vídeos (grátis até 10 GB)

Crie um bucket no [Cloudflare R2](https://developers.cloudflare.com/r2/):

- Bucket → **Settings → Public access** → habilite (guarde a URL `pub-xxx.r2.dev`)
- **Manage R2 API Tokens** → crie um token com permissão de leitura e escrita

Preencha `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
e `S3_PUBLIC_URL`.

### 3. IA que escreve os roteiros (grátis)

Escolha **um** provedor em `AI_PROVIDER`. Os quatro primeiros são gratuitos:

| `AI_PROVIDER` | Como obter | Limite grátis | Precisa de cartão? |
|---|---|---|---|
| `gemini` **(padrão)** | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | ~250 pedidos/dia no 2.5 Flash | Não |
| `groq` | [console.groq.com/keys](https://console.groq.com/keys) | ~1.000 pedidos/dia no Llama 3.3 70B | Não |
| `openrouter` | [openrouter.ai](https://openrouter.ai) — modelos com `:free` | varia por modelo | Não |
| `ollama` | modelo local, nenhuma chave | ilimitado | Não |
| `anthropic` | [console.anthropic.com](https://console.anthropic.com) | — | Sim, **cobra por uso** |

Esta aplicação faz cerca de **15 chamadas por dia** (5 ideias × 3 rodadas), então
qualquer um dos gratuitos cobre com folga.

**Gemini é o padrão** por dois motivos: é o que escreve melhor em português
entre os gratuitos, e o free tier não pede cartão de crédito.

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=sua-chave-aqui
```

> **Honestidade sobre qualidade:** os modelos gratuitos escrevem roteiros bons,
> mas seguem instrução de formato pior que os pagos. O código trata isso —
> valida o JSON e, se vier torto, refaz o pedido dizendo exatamente o que estava
> errado. Na prática você não vê diferença; se quiser o teto de qualidade,
> `AI_PROVIDER=anthropic` continua disponível e é a única opção que gera custo.

> **Ollama (zero chave, zero limite):** se você já tem um VPS ou deixa o
> computador ligado, instale o [Ollama](https://ollama.com), rode
> `ollama pull llama3.1:8b` e use `AI_PROVIDER=ollama`. Nada sai da sua máquina.
> Só não funciona com o render no GitHub Actions, porque o runner não enxerga o
> seu Ollama — nesse caso rode o render pelo VPS (`npm run queue`).

### 4. Banco de imagens (grátis)

Crie uma conta em [pexels.com/api](https://www.pexels.com/api/) → `PEXELS_API_KEY`.
Sem ela os vídeos saem com fundo liso, o que funciona mas rende muito menos.

### 5. App do TikTok

Em [developers.tiktok.com](https://developers.tiktok.com):

1. Crie um app
2. Adicione os produtos **Login Kit** e **Content Posting API**
3. Em Login Kit, marque os escopos `user.info.basic`, `video.publish`, `video.upload`
4. Em **Redirect URI**, coloque exatamente `https://SEU-DOMINIO/api/tiktok/callback`
5. Copie Client key e Client secret

Preencha `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` e `TIKTOK_REDIRECT_URI`.

> Quando quiser publicação realmente pública, envie o app para auditoria nessa
> mesma tela. Enquanto isso, tudo funciona — só que privado.

### 6. Notificações no iPhone (grátis)

Instale o app **ntfy** na App Store e escolha um nome de tópico longo e
aleatório (ex: `autotok-k3n8vqz1x`). Assine esse tópico no app e coloque o mesmo
nome em `NTFY_TOPIC`.

> Qualquer pessoa que adivinhe o nome do tópico recebe suas notificações — por
> isso o nome aleatório.

### 7. Suba o painel

Copie `.env.example` para `.env`, preencha, e gere os segredos do painel:

```bash
openssl rand -hex 32   # valor de AUTH_SECRET
```

Escolha `APP_PASSWORD` (é a senha que você digita no celular).

**Opção A — Vercel (mais simples):** importe o repositório, cole as variáveis do
`.env` em Settings → Environment Variables, e faça o deploy. Não precisa
informar `APP_URL`: o app usa o endereço do próprio deploy.

**Opção B — VPS com Docker:**

```bash
cp .env.example .env   # preencha
docker compose up -d --build
```

Depois, crie as tabelas:

```bash
npm install
npm run db:push
```

> Ou pule este comando: ao entrar no painel pela primeira vez, aparece um botão
> **Preparar banco de dados** que faz exatamente o mesmo.

### 8. Ligue o GitHub Actions

No repositório, em **Settings → Secrets and variables → Actions**, cadastre:

**Secrets:** `DATABASE_URL`, `GEMINI_API_KEY` (ou a chave do provedor que você
escolheu), `PEXELS_API_KEY`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`,
`S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL`, `TIKTOK_CLIENT_KEY`,
`TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI`, `NTFY_TOPIC`

**Variables:** `AI_PROVIDER` (gemini), `APP_URL`, `TREND_COUNTRY` (BR),
`TREND_LANGUAGE` (pt-BR), `S3_REGION` (auto), `TTS_PROVIDER` (edge), `TTS_VOICE`

> Só o provedor escolhido precisa de chave — os outros secrets podem ficar
> vazios sem quebrar nada.

Depois crie um token clássico em **GitHub → Settings → Developer settings →
Personal access tokens (classic)** com o escopo `repo`, e coloque em
`GITHUB_TOKEN` no `.env` do painel (é ele que permite ao painel disparar os
jobs). `GITHUB_REPO` é `seu-usuario/autotok-pessoal`.

### 9. Instale no iPhone

Abra `APP_URL` no **Safari** → botão Compartilhar → **Adicionar à Tela de
Início**. Ele abre em tela cheia, sem barra do navegador, como um app nativo.

Entre com a `APP_PASSWORD`, vá em **Configurações** e toque em **Conectar
TikTok**.

---

## O dia a dia

1. Três vezes por dia o GitHub Actions busca tendências e gera roteiros.
2. Você abre **Ideias**, lê o roteiro e toca em **Gravar vídeo** nos que gostou.
3. Alguns minutos depois chega a notificação: o vídeo está pronto.
4. Em **Fila**, você assiste ao vídeo no próprio celular. A tela se atualiza
   sozinha enquanto houver vídeo renderizando.
5. Se quiser, toque em **Editar legenda** e ajuste o texto — é exatamente o que
   vai para o TikTok, hashtags inclusas.
6. **Aprovar e publicar** manda para o TikTok. **Descartar** joga fora.

Tudo isso também funciona sob demanda pelos botões do painel — não precisa
esperar o cron.

No fim da tela inicial há **Últimas execuções**: o histórico dos jobs que
rodaram no GitHub Actions, com o erro quando algum falha. É o lugar de olhar
quando um vídeo não aparece, sem precisar abrir a aba de Actions no celular.

---

## Ajustando o conteúdo

Em **Configurações** você define:

| Campo | O que faz |
|---|---|
| **Nicho** | Vai direto no prompt da IA. Quanto mais específico, melhor o roteiro. |
| **Formato** | `viral` (curiosidades, listas) ou `produto` (review, afiliado). |
| **Nota mínima** | Ideias com nota abaixo disso são descartadas antes de chegar em você. |
| **Duração alvo** | Segundos. 25–35s costuma ser o ponto ideal no TikTok. |
| **Vídeos por dia** | Teto de segurança para o cron não render 50 vídeos. |
| **Palavras proibidas** | Termos que a IA nunca deve usar. |

Para mudar a estrutura narrativa dos vídeos, edite os textos em
`lib/ai/templates.ts` — são instruções em português puro, não código.

Para mudar o visual das legendas (fonte, tamanho, posição), edite o bloco
`Style:` em `lib/video/subtitles.ts`.

---

## Rodando pelo terminal

```bash
npm run dev        # painel local em http://localhost:3000
npm test           # testes da lógica pura (não precisa de rede nem banco)
npm run typecheck  # checagem de tipos
npm run scan       # busca tendências agora
npm run ideas      # gera roteiros das tendências
npm run render     # renderiza o próximo da fila (precisa de ffmpeg)
npm run queue      # renderiza toda a fila, respeitando o limite diário
npm run publish -- --video=<id>   # publica um vídeo específico
npm run db:push    # cria/atualiza as tabelas
```

Renderizar localmente exige **ffmpeg**:
`apt install ffmpeg` (Linux) ou `brew install ffmpeg` (Mac).

---

## Custo mensal

**Zero, na configuração padrão.** Nenhum item abaixo pede cartão de crédito.

| Item | Plano grátis | Uso estimado (3 vídeos/dia) |
|---|---|---|
| Neon (Postgres) | 0,5 GB | alguns MB |
| Cloudflare R2 | 10 GB | ~1 GB/mês (apague os antigos de vez em quando) |
| Pexels | ilimitado com limite por hora | ~20 buscas/dia |
| Edge TTS (narração) | sem chave, sem limite publicado | ~15 min de áudio/dia |
| Google Gemini | ~250 pedidos/dia | ~15 pedidos/dia |
| GitHub Actions (repo privado) | 2.000 min/mês | ~360 min/mês |
| Vercel (hobby) | — | painel, tráfego mínimo |

O item mais apertado é o GitHub Actions: cada render leva 2–4 minutos, então os
2.000 minutos cobrem cerca de **15 vídeos por dia**. Se um dia isso apertar,
tornar o repositório público zera esse limite (Actions é ilimitado em repos
públicos) — mas aí lembre que seus workflows ficam visíveis; **os secrets
continuam privados de qualquer forma**.

Trocar para `AI_PROVIDER=anthropic` é a única mudança que gera custo
(~US$ 0,05–0,30 por vídeo).

---

## Estrutura do projeto

```
app/                  painel PWA (Next.js App Router)
  (app)/              telas internas, já protegidas por sessão
  api/tiktok/         fluxo de OAuth
  actions.ts          server actions do painel
lib/
  trends/             coleta e pontuação das tendências
  ai/                 prompts, provedores (Gemini/Groq/OpenRouter/Ollama/Claude)
                      e o tratamento de JSON dos modelos
  video/              FFmpeg, legendas, render
  tts/                narração (Edge grátis ou ElevenLabs)
  tiktok/             OAuth e Content Posting API
  pipeline/           orquestração (ideias → render → publicação)
  db/                 schema e configurações
scripts/              entrypoints usados pelo GitHub Actions
tests/                testes da lógica pura (rodam offline)
.github/workflows/    CI + os três jobs: tendências, render e publicação
```

O CI roda typecheck, testes, build e ainda verifica se a migration do banco
está em dia com o schema — se alguém alterar `lib/db/schema.ts` sem rodar
`npx drizzle-kit generate`, o CI falha em vez de deixar o deploy subir com o
banco desatualizado.

---

## Problemas comuns

**"Nenhuma tendência retornada"** — o Creative Center mudou o formato ou está
bloqueando. Enquanto isso, gere ideias digitando um assunto no campo livre da
tela **Ideias**.

**Vídeo saiu com fundo liso** — falta `PEXELS_API_KEY`, ou o termo de busca da
cena não encontrou nada. O aviso aparece no card do vídeo.

**"ffmpeg não encontrado"** — só acontece rodando local; instale o ffmpeg.

**Vídeo publicado ficou privado** — comportamento esperado antes da auditoria do
TikTok. Ver a seção "O que você precisa saber".

**"A autorização do TikTok expirou"** — o refresh token dura 365 dias. Vá em
Configurações e reconecte.

**"O modelo não devolveu um roteiro válido em duas tentativas"** — acontece com
modelos gratuitos menores. Troque `AI_PROVIDER` (gemini e groq são os mais
consistentes) ou use um modelo maior no mesmo provedor.

**Estourou o limite diário do provedor de IA** — troque `AI_PROVIDER` para outro
gratuito; as chaves convivem no mesmo `.env`, é só mudar uma linha.
