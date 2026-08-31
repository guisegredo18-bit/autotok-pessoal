# Lucidez

Treino cognitivo diário em jogos curtos, que vira uma linha do tempo de desempenho por domínio.

O app existe para responder uma pergunta específica: **a cognição desta pessoa está se
mantendo, melhorando ou caindo?** Ele responde comparando a pessoa com ela mesma, ao longo
de semanas — nunca com uma tabela de "normalidade".

> **Isto não é um exame.** O Lucidez mede desempenho em jogos, não faz diagnóstico e não
> substitui avaliação médica ou neuropsicológica. Serve para levar um gráfico à consulta.

---

## O que tem dentro

Seis jogos, um por domínio cognitivo:

| Jogo | Domínio | O que mede | Duração |
|---|---|---|---|
| Reflexo | Velocidade | Tempo de reação simples e sua consistência | ~1 min |
| Vai / Não vai | Controle de impulso | Falhas de inibição (tocar quando não devia) | ~2 min |
| Sequência | Memória de trabalho | Maior sequência espacial reproduzida (span) | ~2 min |
| Pares | Memória visual | Jogadas gastas para encontrar todos os pares | ~2 min |
| Cor certa | Atenção seletiva | Interferência da palavra sobre a cor (Stroop) | ~2 min |
| Trilhas | Flexibilidade mental | Custo de alternar entre duas regras (Trail Making A/B) | ~2,5 min |

A sessão diária usa 3 jogos por padrão, em rodízio: em poucos dias toda a bateria é medida
sem que nenhum dia passe de alguns minutos.

## As decisões que sustentam a medida

Um app assim erra de dois jeitos: assustando a família com ruído, ou escondendo uma piora
real atrás de números bonitos. Cinco decisões atacam isso:

**1. Bloco calibrado separado do bloco desafio.** O bloco calibrado roda sempre com os
mesmos parâmetros — mesmo número de tentativas, mesmo intervalo, mesma grade — e é o único
que entra na análise. Comparar hoje com o mês passado só faz sentido se a prova foi a mesma.
O bloco desafio fica mais difícil conforme a pessoa melhora, mantém o interesse vivo, e é
deliberadamente descartado da linha do tempo. Treinos livres também.

**2. A referência é a própria pessoa.** As cinco primeiras sessões de cada domínio formam a
linha de base. Depois disso, o veredito é a distância entre as sessões recentes e essa base,
medida em desvios-padrão da própria variabilidade da pessoa. Não há tabela normativa por
idade — seria um número com cara de diagnóstico e sem validação nenhuma.

**3. Mediana, não média, em cada janela.** Um único dia perdido — o telefone tocou, alguém
entrou na sala — desloca a média da janela em vários desvios e produziria um alarme falso.
A mediana ignora esse dia e só se move quando a maioria das sessões se move junto.

**4. Piso no desvio-padrão.** Quem foi muito regular na linha de base teria um desvio
minúsculo, e qualquer tropeço viraria um `z` gigante. O denominador nunca cai abaixo de 4
pontos da escala.

**5. Check-in antes de jogar.** Três perguntas (sono, humor, medicação) contextualizam os
dias fora da curva. Uma queda de duas semanas por insônia ou remédio trocado é
indistinguível de uma queda cognitiva sem esse dado — e é justamente essa confusão que
assusta uma família à toa. O relatório avisa quando o período recente teve sono ruim.

O app só arrisca qualquer leitura depois de **8 sessões** (5 de base + 3 recentes). Antes
disso ele diz, com todas as letras, que ainda está formando a linha de base.

### O índice geral

A média crua das notas do dia seria enganosa: num dia em que só os dois jogos mais fáceis
entraram, ela sobe sem que nada tenha mudado. O índice converte cada domínio para desvios da
própria base e tira a média desses desvios — imune, portanto, à variação de quais jogos
caíram no dia. Na escala mostrada, **50 = igual à linha de base** e cada 10 pontos = um
desvio-padrão.

## Privacidade

Tudo fica no aparelho, em IndexedDB. Não há servidor, conta nem sincronização: a forma mais
simples de não vazar dado de saúde é nunca enviá-lo a lugar nenhum. Em troca, backup é
responsabilidade de quem usa — a tela de Ajustes exporta `.json` (para restaurar) e `.csv`
(para abrir no Excel ou levar ao médico).

Instale na tela de início do celular. Navegadores limpam o armazenamento de sites pouco
visitados; um app instalado não sofre isso.

## Acessibilidade

Tema claro fixo e de propósito: texto claro sobre fundo escuro reduz a legibilidade de quem
tem catarata ou baixa sensibilidade ao contraste. No lugar de modo escuro há dois ajustes que
ajudam de verdade — **texto grande** (três tamanhos) e **alto contraste**. Alvos de toque
nunca abaixo de 48 px, porque mão com tremor erra alvo pequeno e o erro viraria "piora
cognitiva" no gráfico. As instruções reaparecem antes de cada jogo, todas as vezes: quem tem
perda de memória não lembra da regra de ontem.

Uma limitação honesta: o jogo **Cor certa** depende de distinguir cores. Quem não distingue
vermelho de verde deve deixá-lo de fora — o relatório funciona sem ele, e os outros cinco
domínios continuam sendo medidos.

## Rodando

```bash
cd apps/lucidez
npm install
npm run dev        # desenvolvimento
npm test           # testes do núcleo de análise
npm run typecheck  # TypeScript estrito
npm run build      # gera dist/, arquivos estáticos
```

O build é estático e usa caminhos relativos: serve da raiz de um domínio, de um
subdiretório, ou de uma pasta local.

## Organização

```
src/core/      análise pura, sem DOM: scoring, estatística, tendência, rodízio de jogos
src/games/     os seis jogos
src/screens/   perfis, início, sessão, relatório, ajustes
src/storage/   IndexedDB, backup e exportação
src/state/     estado global e roteador por hash
tests/         testes do núcleo (node:test via tsx)
```

`src/core` não importa React nem toca no DOM — é onde mora tudo que decide se a cognição
subiu ou desceu, e é o que os testes cobrem.
