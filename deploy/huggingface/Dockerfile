# Painel + renderizacao num Space do Hugging Face.
#
# Existe porque o GitHub Actions pode simplesmente parar de entregar maquina:
# o job fica em "queued" para sempre, sem erro nenhum, e nao ha o que consertar
# do lado de ca. Aqui o painel roda num container de verdade — com ffmpeg e sem
# limite de tempo de request — entao ele mesmo renderiza, e o Actions vira
# dispensavel.
#
# O Space guarda so este arquivo. O codigo vem do repositorio publico no clone
# abaixo, entao atualizar e reconstruir o Space (Settings > Factory rebuild).

FROM node:20-bookworm-slim

# ffmpeg renderiza, as fontes desenham a legenda, o git traz o codigo.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       ffmpeg fonts-dejavu-core ca-certificates git \
  && rm -rf /var/lib/apt/lists/*

# O Space executa o container como UID 1000. Arquivos copiados como root
# ficariam so-leitura para quem de fato roda o processo.
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user
WORKDIR /home/user/app

ARG REPO=https://github.com/guisegredo18-bit/autotok-pessoal
ARG BRANCH=claude/tiktok-trends-analysis-app-pihsab
RUN git clone --depth 1 --branch "$BRANCH" "$REPO" .

RUN npm install --no-audit --no-fund

# Valores falsos so para o build: nenhum modulo pode abrir conexao no import,
# e e exatamente isso que estes valores provam. As chaves de verdade chegam em
# tempo de execucao, pelos secrets do Space.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
    AUTH_SECRET=build-secret-only \
    npm run build

# O Hugging Face publica a porta 7860 e nenhuma outra.
ENV NODE_ENV=production PORT=7860
EXPOSE 7860

CMD ["npm", "run", "start"]
