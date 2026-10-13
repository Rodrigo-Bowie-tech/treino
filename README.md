# Treino

App instalável (PWA) para treinos de **até 1 hora**, com foco no **desenvolvimento dos braços** e exercícios para **fascite plantar**. Funciona no celular (Android e iPhone) e no computador, sem loja de aplicativos, e continua funcionando sem internet.

**Endereço:** https://rodrigo-bowie-tech.github.io/treino/

É um app separado do [Minha Saúde](https://github.com/Rodrigo-Bowie-tech/Sa-de-): repositório, endereço, ícone e instalação próprios.

| Área | Recursos |
| --- | --- |
| **Treino de hoje** | Monta o treino sozinho, sempre nesta ordem: **aquecimento que faz suar** (trote, mobilidade dos braços, polichinelo, prancha e, em rodízio, skipping, boxe no ar, agachamento, afundo, burpee, escalador...; os de salto têm versão sem impacto para os dias em que o calcanhar doer), bloco de **fascite plantar** (alongamento da fáscia e da panturrilha no degrau em todo treino, elevação de calcanhar no degrau com toalha em treinos alternados e, nos outros dias, bolinha, toalha com os dedos, pegar bolinhas, pé curto, equilíbrio...), **braços** com halteres e banco (roscas direta, alternada, martelo, concentrada, Scott, Zottman, 21; tríceps francês, testa, coice, supino fechado, mergulho; desenvolvimento, Arnold, elevações; antebraço) e alongamento final. Os braços são feitos em **bi-sets** (bíceps + tríceps, ombros + antebraço, alternando as séries), o que cabe mais séries na mesma hora: cerca de 24 séries no treino de 60 min. Duração de **30, 45 ou 60 min**: o aquecimento encolhe (7, 10 ou 15 min) e os braços ficam com a maior parte do tempo; o que sobra vira uma rodada extra. Os exercícios variam de um treino para o outro. |
| **Durante o treino** | Cronômetro com contagem regressiva, voz anunciando cada exercício, bipes, vibração e tela sempre ligada. Séries com registro de repetições e carga e descanso automático. **Limite de 1 hora**: avisos aos 50 e 55 min, atalho para o alongamento final e encerramento automático aos 60 min (pausas não contam). |
| **Progressão** | Meta de cada série pela última vez que você fez o exercício: mantém o peso até completar o máximo de repetições em todas as séries, depois sugere subir o peso. |
| **Histórico** | Treinos, gráfico de evolução de carga por exercício e da dor no pé (0 a 10, registrada ao fim de cada treino). |
| **Exercícios** | Biblioteca com passo a passo, ritmo, material, dicas e cuidados de cada exercício, **link para vídeos no YouTube** (uma busca pelo exercício em português; durante o treino, abrir o vídeo pausa o cronômetro) e orientações gerais para a fascite. Funciona com halteres, banco, elástico, barra fixa ou sem equipamento (peso do corpo, cadeira, mochila). |
| **Perfis com PIN** | Cada pessoa tem seu perfil (nome + PIN de 4 a 8 números), com treinos, histórico, ajustes, treino em andamento e progressão próprios. Ao abrir o app, escolha o perfil e digite o PIN; o login fica salvo no aparelho até tocar em **Sair**. Depois de 5 PINs errados, o app espera 30 s. Em **Ajustes → Perfil**: trocar nome e PIN, sair/trocar de perfil e excluir o perfil (apaga os treinos dele em todos os aparelhos). |
| **Sincronização** | Celular e computador com os mesmos perfis, treinos e ajustes. Os dados de todos os perfis ficam numa **gist secreta da sua conta do GitHub** (sem servidor próprio): crie um token com a permissão `gist`, cole em **Ajustes → Sincronização** e conecte os outros aparelhos pelo **código QR** ou colando o código. Sincroniza ao abrir o app, após cada alteração e a cada 5 min; funciona offline e envia depois. |

> **Sobre o PIN:** ele separa os perfis dentro do app, mas os dados de todos os perfis ficam juntos na mesma gist (o PIN é guardado só como hash). Quem tiver o token ou o código de conexão da sincronização consegue redefinir um PIN esquecido (“Esqueci o PIN”).
>
> No iPhone, o app instalado na Tela de Início não compartilha dados com o Safari: conecte a sincronização de dentro do app instalado (colando o código). As orientações sobre fascite são gerais e não substituem a avaliação de um médico ou fisioterapeuta.

## Como instalar

Abra o endereço no celular ou no computador. Uma janela **“Instalar o app”** aparece sozinha (e também em **Ajustes → Instalar o app**):

- **Android e computador (Chrome/Edge):** toque em **Baixar e instalar**.
- **iPhone (Safari):** botão Compartilhar → **Adicionar à Tela de Início** (a janela mostra o passo a passo).

### Publicação no GitHub Pages

O workflow `.github/workflows/ci.yml` roda os testes e o build em cada push e PR, e publica o app a cada push na branch padrão. Para ativar, no GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions** (em conta gratuita, o repositório precisa ser público).

## Desenvolvimento

Requer Node.js 22+.

```bash
npm install
npm run dev        # servidor de desenvolvimento
npm test           # testes (montagem do treino, cronômetro, progressão, perfis, sincronização)
npm run build      # verificação de tipos + build de produção em dist/
npm run preview    # serve o build localmente
```

Tecnologias: React + TypeScript + Vite, Dexie (IndexedDB), vite-plugin-pwa (service worker e manifesto), Vitest, uqr (código QR).

```
src/
  data/        catálogo de exercícios
  lib/         regras: montagem do treino, cronômetro, progressão, perfis/PIN, sincronização (gist), instalação
  components/  componentes de interface
  hooks/       dados do perfil logado, sincronização, instalação
  pages/       telas do app
```
