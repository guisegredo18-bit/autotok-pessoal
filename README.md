# AutoTok Pessoal

Analisa as tendências do TikTok, escreve e renderiza vídeos automaticamente, e
publica na sua conta **depois que você aprova pelo iPhone**.

O celular é o controle remoto: você recebe uma notificação quando um vídeo fica
pronto, assiste, e toca em aprovar. Renderizar vídeo exige um servidor — quem
faz o trabalho pesado é o GitHub Actions.

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

## Instalação (passo a passo)

Reserve uns 40 minutos na primeira vez. Tudo pode ser feito do computador; o
uso no dia a dia é pelo celular.

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

### 3. Chave da IA

Crie uma chave em [console.anthropic.com](https://console.anthropic.com) →
`ANTHROPIC_API_KEY`. O padrão é `claude-opus-5`; se for gerar muitos vídeos por
dia, `claude-sonnet-5` sai bem mais barato e ainda escreve roteiro bom.

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
`.env` em Settings → Environment Variables, e faça o deploy. `APP_URL` é a URL
que a Vercel te der.

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

### 8. Ligue o GitHub Actions

No repositório, em **Settings → Secrets and variables → Actions**, cadastre:

**Secrets:** `DATABASE_URL`, `ANTHROPIC_API_KEY`, `PEXELS_API_KEY`,
`S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`,
`S3_PUBLIC_URL`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`,
`TIKTOK_REDIRECT_URI`, `NTFY_TOPIC`

**Variables:** `APP_URL`, `TREND_COUNTRY` (BR), `TREND_LANGUAGE` (pt-BR),
`S3_REGION` (auto), `TTS_PROVIDER` (edge), `TTS_VOICE`, `ANTHROPIC_MODEL`

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
4. Em **Fila**, você assiste ao vídeo no próprio celular.
5. **Aprovar e publicar** manda para o TikTok. **Descartar** joga fora.

Tudo isso também funciona sob demanda pelos botões do painel — não precisa
esperar o cron.

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

## Custo mensal estimado

| Item | Custo |
|---|---|
| Neon (Postgres) | grátis |
| Cloudflare R2 (10 GB) | grátis |
| Pexels | grátis |
| Edge TTS (narração) | grátis |
| GitHub Actions (repo público) | grátis |
| Vercel (hobby) | grátis |
| API da Anthropic | ~US$ 0,05–0,30 por vídeo, conforme o modelo |

Com `claude-sonnet-5` e 3 vídeos por dia, fica na casa de poucos dólares por mês.

---

## Estrutura do projeto

```
app/                  painel PWA (Next.js App Router)
  (app)/              telas internas, já protegidas por sessão
  api/tiktok/         fluxo de OAuth
  actions.ts          server actions do painel
lib/
  trends/             coleta e pontuação das tendências
  ai/                 prompts e geração de roteiro
  video/              FFmpeg, legendas, render
  tts/                narração (Edge grátis ou ElevenLabs)
  tiktok/             OAuth e Content Posting API
  pipeline/           orquestração (ideias → render → publicação)
  db/                 schema e configurações
scripts/              entrypoints usados pelo GitHub Actions
.github/workflows/    os três jobs: tendências, render e publicação
```

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
