/**
 * Roteiro do vídeo de demonstração (docs/demo/demo.mp4).
 *
 *   npm run demo-video                      # servidor de produção em :3220
 *   DEMO_BASE_URL=http://localhost:3000 npm run demo-video
 *
 * Grave sempre contra um build de produção (`npm run build && npm run start`),
 * nunca contra `next dev` — o overlay de desenvolvimento aparece no vídeo.
 * O chat faz chamadas reais ao OpenRouter: cada espera de modelo passa por
 * `fastForward`, que comprime o tempo com um selo na tela.
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { Director, VIEWPORT, SCALE } from './demo/director.mjs';

const BASE = process.env.DEMO_BASE_URL ?? 'http://localhost:3220';
const OUT = path.resolve(import.meta.dirname, '../docs/demo/demo.mp4');

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: SCALE,
  locale: 'pt-BR',
  timezoneId: 'America/Sao_Paulo',
  reducedMotion: 'no-preference',
});

// topInset: altura do header fixo (sticky) do dashboard.
const d = await Director.create(context, { topInset: 68, accent: '#3b82f6' });
const { page } = d;
page.setDefaultTimeout(30_000);

const banner = page.getByText('Análise IA');
const ytdToggle = page.getByRole('button', { name: 'YTD', exact: true });
// O card inteiro do gráfico de tendência (não só o wrapper do toggle).
const trendCard = page
  .locator('div')
  .filter({ has: ytdToggle })
  .filter({ has: page.locator('.recharts-wrapper') })
  .last();
const rankingTable = page.locator('table').first();
const rankingRow = (nome) => rankingTable.locator('tr').filter({ hasText: nome }).first();
const chat = page.locator('aside');
const chatInput = page.getByPlaceholder('Pergunte sobre os dados...');
const diretoriaSelect = page.locator('select[aria-label="Diretoria"]');

// ── 0 · Capa ────────────────────────────────────────────────────────────────
await d.goto(BASE);
await page.getByText('Chat Analytics').waitFor();
await banner.waitFor();
await d.card(
  `<h1>Dashboard Conversacional</h1>
   <p>People analytics de turnover que responde perguntas — em vez de só desenhar gráficos.</p>
   <small>Dados sintéticos de uma empresa fictícia (Verta S.A.)</small>`,
);
await d.hold(700);
await d.record();
await d.hold(2600);
await d.card(null, 700);

// ── 1 · As quatro perguntas executivas ──────────────────────────────────────
await d.caption('Visão geral', 'As quatro perguntas de um comitê: como estamos, tendência, projeção e onde dói');
await d.scrollTop();
await d.pointAt(page.getByText('Visão Mensal'), 900);
await d.hold(1600);
await d.pointAt(page.getByText('Visão YTD'), 700);
await d.hold(1800);

// ── 2 · Insight proativo ────────────────────────────────────────────────────
await d.caption('IA proativa', 'O dashboard abre já com a leitura pronta — manchete e títulos escritos pela IA');
await d.pointAt(banner, 800);
await d.hold(2600);

// ── 3 · Tendência e meta ────────────────────────────────────────────────────
await d.caption('Tendência', 'Série mensal contra a meta, com a projeção de onde a curva termina');
await d.frame(trendCard);
await d.hold(1800);
// O centro do retângulo do toggle cai sobre o card (o header do Card cobre a
// metade direita do botão no hit-test), então o clique sintético por
// coordenada erra: o cursor vai até lá e quem clica é o próprio locator.
await d.pointAt(ytdToggle, 700);
await d.hold(200);
await ytdToggle.click();
// A legenda promete o acumulado: só siga quando o gráfico realmente trocou.
await page.getByText('linha tracejada = meta acumulada').waitFor({ timeout: 10_000 });
await d.caption('Acumulado', 'O mesmo gráfico em YTD: o ano inteiro comparado à meta acumulada');
await d.hold(3000);

// ── 4 · Onde está o problema ────────────────────────────────────────────────
await d.caption('Ranking', 'Cada diretoria contra a própria meta — o problema tem nome e tamanho');
await d.frame(rankingTable);
await d.hold(1200);
await d.pointAt(rankingRow('Tecnologia'), 900);
await d.hold(2600);

// ── 5 · Filtro global ───────────────────────────────────────────────────────
await d.caption('Recorte', 'Um filtro reescreve o dashboard inteiro: números, gráficos e a narrativa da IA');
await d.scrollTop();
await d.choose(diretoriaSelect, 'Tecnologia', 800);
// A troca de filtro recalcula tudo e a IA reescreve a leitura: espera o ciclo
// "IA analisando…" → manchete nova, que é o que a legenda promete.
await page.getByText('IA analisando...').waitFor({ timeout: 15_000 }).catch(() => {});
await banner.waitFor({ timeout: 30_000 });
await d.hold(900);
await d.pointAt(banner, 700);
await d.hold(2600);

// ── 6 · Chat com function calling ───────────────────────────────────────────
await d.caption('Pergunta', 'Agora a pergunta que ninguém consegue responder olhando gráfico');
await d.type(chatInput, 'Por que o turnover de Tecnologia disparou em 2024? Compare com as outras diretorias.', 20);
await d.hold(500);
await page.keyboard.press('Enter');
await d.hold(1400);

// A espera é real: o modelo chama as funções de cálculo uma a uma e só então
// escreve. O gráfico embutido só é montado quando o streaming termina — é ele,
// e não a tabela (que aparece no meio do texto), que marca o fim da resposta.
await d.caption('Ferramentas', 'Cada número vem de uma função determinística do próprio dashboard, não da memória do modelo');
const answerTable = chat.locator('table').first();
// O gráfico embutido e as sugestões de follow-up só são montados quando o
// streaming termina — são eles que marcam o fim real da resposta.
const chatGraph = chat.locator('div.mt-3.rounded-lg').last();
const followUps = chat.locator('button[class*="rounded-full"]').first();
await d.fastForward(8, async () => {
  await answerTable.waitFor({ timeout: 240_000 });
  await followUps.waitFor({ timeout: 240_000 });
});
await d.hold(1200);

// ── 7 · Resposta rastreável ─────────────────────────────────────────────────
await d.caption('Resposta', 'Diagnóstico com tabela comparativa e gráfico montado pela própria resposta');
await d.frame(answerTable);
await d.hold(3400);
// O resto do diagnóstico vem depois da tabela; o gráfico fecha a resposta.
await d.caption('Diagnóstico', 'Drivers, motivos de saída e recomendação — tudo apoiado nos mesmos números');
await chat.locator('div.overflow-y-auto').first().evaluate((el) => el.scrollBy({ top: 460, behavior: 'smooth' }));
await d.hold(3200);
await d.caption('Gráfico', 'A própria resposta monta o gráfico do recorte que ela citou');
await d.frame(chatGraph);
await d.hold(3000);

// ── 8 · Encerramento ────────────────────────────────────────────────────────
await d.caption('', '');
await d.card(
  `<h1>Dashboard Conversacional</h1>
   <p>Next.js 16 · TypeScript · Tailwind v4 · Recharts · OpenRouter com function calling</p>
   <small>github.com/luccapinto/dash-conversacional</small>`,
  3600,
);

await d.finish(OUT);
await browser.close();
console.log(`Demo gravada em ${path.relative(process.cwd(), OUT)}`);
