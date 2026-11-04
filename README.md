# Foto → Vídeo 2 frames

Página que transforma qualquer imagem em um vídeo MP4 9:16 com 2 frames, para postar no Instagram.

**No ar:** https://juliocesargfx-sys.github.io/foto-2-frames/

- A imagem é cortada para preencher 1080×1920. A pessoa pode arrastar a foto e dar zoom (com dois dedos, a roda do mouse ou o controle deslizante) antes de gerar.
- O vídeo sai em H.264 (High), 30 fps, com 2 frames (cerca de 0,07 s), sem áudio, com o `moov` no início do arquivo.
- Tudo roda no navegador de quem usa. Não há servidor e a foto não é enviada para lugar nenhum.

## Rodar no computador

Precisa ser aberto por um servidor local. Abrir o `index.html` com dois cliques não funciona, porque o navegador bloqueia módulos JavaScript em `file://`.

```bash
npx http-server . -p 8765 -c-1
```

Depois é só abrir http://localhost:8765.

## Colocar no ar (grátis)

Qualquer hospedagem de site estático com HTTPS serve. O HTTPS é obrigatório, porque o codificador de vídeo do navegador só funciona em páginas seguras.

- **Netlify Drop:** arraste esta pasta para https://app.netlify.com/drop.
- **Vercel / GitHub Pages:** publique esta pasta como site estático, sem etapa de build.

A pasta `tests/` e o `package.json` ficam só na cópia local e não vão para o site publicado.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `index.html`, `styles.css` | Página e visual |
| `app.js` | Envio da imagem, prévia, gestos de ajuste, botões de gerar, baixar e compartilhar |
| `crop.js` | Cálculo do corte "preencher 9:16" (funções puras, com testes) |
| `video.js` | Gera o MP4 de 2 frames a partir do canvas |
| `vendor/mediabunny.lite.js` | Biblioteca [Mediabunny](https://mediabunny.dev) 1.65.1 (MPL-2.0), reduzida só ao que é usado |

## Ajustes rápidos

- **Duração:** em `video.js`, `FPS = 30` e `FRAMES = 2`. Com `FPS = 1`, o vídeo passa a ter 2 frames de 1 s cada (2 s no total).
- **Qualidade:** em `video.js`, `quantizer` (quanto menor, mais nítido e maior o arquivo) e `bitrate`, que é usado no Safari.

## Testes (cópia local)

```bash
npm test
```

Os testes automáticos cobrem a matemática do corte. No navegador, `tests/browser-helpers.js` traz ferramentas para simular o envio de imagens e inspecionar o MP4 gerado (número de frames, resolução, perfil H.264, PSNR).
