/**
 * Roteiro do vídeo de demonstração (README e LinkedIn).
 *
 *   npm run build && npx next start -p 3217            # build de produção, sem IA_AO_VIVO
 *   DEMO_BASE_URL=http://127.0.0.1:3217 npm run demo-video
 *   DEMO_DRY=1 DEMO_BASE_URL=… npm run demo-video      # ensaio: todos os waitFor, sem gravar nem codificar
 *
 * Grava o produto real em modo demonstração: nenhuma chamada de IA sai do servidor (custo zero).
 * As respostas do chat são as gravadas em `public/demo` e tocam com a animação do próprio produto
 * ("Analisando…", gráficos entrando, texto sendo escrito), em tempo real e sem aceleração: é o que
 * o visitante vê. Toda ação que a legenda promete espera por algo que só existe depois dela, e as
 * legendas com número esperam o mesmo número na tela; se os dados mudarem, a gravação quebra em vez
 * de sair errada.
 *
 * Saídas (fora do git): docs/demo/demo.mp4 (README, < 10 MB) e docs/demo/demo-linkedin.mp4
 * (2560×1440). A máquina de gravação (cursor, legendas, capa, screencast, ffmpeg) é
 * `scripts/demo/director.mjs`, da skill product-demo-video; precisa de ffmpeg no PATH e do
 * Chromium do Playwright (`npx playwright install chromium`).
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { Director, SCALE, VIEWPORT } from './demo/director.mjs';

const BASE = process.env.DEMO_BASE_URL ?? 'http://localhost:3000';
const DRY = process.env.DEMO_DRY === '1';
const OUT = {
  readme: path.resolve(import.meta.dirname, '../docs/demo/demo.mp4'),
  linkedin: path.resolve(import.meta.dirname, '../docs/demo/demo-linkedin.mp4'),
};

// O vídeo é do modo demonstração: com IA_AO_VIVO o servidor gastaria a chave e o roteiro mudaria.
const sonda = await fetch(`${BASE}/api/agente`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
if (sonda.status !== 403) throw new Error(`${BASE} não está em modo demonstração (POST /api/agente → ${sonda.status}); suba o servidor sem IA_AO_VIVO.`);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: SCALE,
  colorScheme: 'light',
  // a animação de "pensando e escrevendo" some com prefers-reduced-motion
  reducedMotion: 'no-preference',
  locale: 'pt-BR',
});
// barra de filtros e abas fixa no topo (95 px); roxo da IA do tema claro
const d = await Director.create(context, { topInset: 95, accent: '#5b3fe0' });
const { page } = d;
page.setDefaultTimeout(30_000);
if (DRY) {
  d.hold = (ms) => new Promise((resolve) => setTimeout(resolve, Math.min(ms, 150)));
  d.record = async () => {};
  d.finish = async () => {};
}

/** Rola só a conversa da gaveta (não a página atrás) até o alvo ficar a `folga` px do topo dela. */
async function rolarGaveta(alvo, folga = 12) {
  await alvo.waitFor();
  await alvo.evaluate((el, f) => {
    const fio = el.closest('.fio');
    const topo = el.getBoundingClientRect().top - fio.getBoundingClientRect().top + fio.scrollTop - f;
    fio.scrollTo({ top: topo, behavior: 'smooth' });
  }, folga);
  await d.hold(900);
}

// Aquece as rotas do roteiro fora da câmera (renderização no servidor e as duas respostas gravadas).
for (const rota of [
  '/resumo?diretoria=tecnologia',
  '/resumo?diretoria=tecnologia&lente=ceo',
  '/indicadores/turnover_voluntario?diretoria=tecnologia&lente=ceo',
  '/indicadores/turnover_voluntario?lente=ceo',
  '/demo/turnover-voluntario.json',
  '/demo/historia-fuga-tecnologia.json',
]) {
  await page.goto(`${BASE}${rota}`);
}

// ── 0 · Capa ────────────────────────────────────────────────────────
await d.goto(`${BASE}/`);
await d.card(
  `<h1>Dashboard Conversacional</h1><p>People Analytics com IA: a IA decide a apresentação, o código decide os números.</p>` +
    `<small>Dados sintéticos da Verta S.A., uma empresa fictícia.<br>O chat desta demo toca respostas gravadas do agente; os números são calculados pelo motor.</small>`,
);
await page.getByRole('heading', { name: 'Painel gerencial' }).waitFor();
await d.hold(800);
await d.record();
await d.hold(3400);
await d.card(null, 700);

// ── 1 · Gerencial e filtro ──────────────────────────────────────────
await d.caption('Gerencial', 'Os 25 indicadores do painel: mês e acumulado do ano, cada um contra a sua meta');
await d.pointAt(page.locator('.th1 .grupo').nth(1), 900);
await d.hold(1800);
await d.choose(page.getByLabel('Diretoria'), 'tecnologia', 800);
await page.getByText(/25 indicadores · Tecnologia · .*12 fora \(YTD\)/).waitFor();
await d.caption('Filtros', 'Filtro na URL e o motor recalcula tudo: em Tecnologia, 12 das 15 metas estão fora no ano');
await d.hold(600);
const linhaTV = page.getByRole('link', { name: 'Turnover voluntário: abrir a página do indicador' });
await d.pointAt(linhaTV.locator('.by').first(), 900);
await d.hold(2600);

// ── 2 · Resumo executivo ────────────────────────────────────────────
await d.click(page.getByRole('navigation', { name: 'Seções' }).getByRole('link', { name: 'Resumo executivo' }));
const manchete = page.locator('h1.manchete');
await manchete.filter({ hasText: 'Tecnologia' }).waitFor();
await page.getByText('Leitura da IA a partir de 27 sinais calculados').waitFor();
await d.caption('Resumo executivo', 'A IA lê os 27 sinais que o motor detectou em Tecnologia e escreve a manchete');
await d.hold(400);
await d.pointAt(manchete, 900);
await d.hold(2400);

// ── 3 · Lente ───────────────────────────────────────────────────────
const antes = await manchete.textContent();
await d.click(page.getByRole('navigation', { name: 'Público' }).getByRole('link', { name: 'CEO', exact: true }));
await page.waitForFunction((t) => document.querySelector('h1.manchete')?.textContent !== t, antes);
await d.caption('Lentes', 'Mesmos números, outro público: para o CEO, a IA troca manchete, ordem e destaques');
await d.hold(900);
const destaques = page.locator('section[aria-labelledby="t-destaques"]');
await d.pointAt(destaques.getByText('Turnover voluntário em Tecnologia supera a meta'), 900);
await d.hold(2600);

// ── 4 · Indicador ───────────────────────────────────────────────────
await d.click(page.locator('.motivo').getByRole('link', { name: 'Turnover voluntário', exact: true }));
await page.getByRole('heading', { level: 1, name: 'Turnover voluntário' }).waitFor();
await d.caption('Indicador', 'A ficha do indicador: pergunta, fórmula, meta, mês e acumulado do ano');
await d.hold(1600);
await d.choose(page.getByLabel('Diretoria'), { label: 'Empresa toda' }, 800);
const quebra = page.getByRole('heading', { name: 'Quebra por diretoria' });
await quebra.waitFor();
await d.caption('Indicador', 'Na empresa toda, 24 meses de evolução e a quebra por diretoria, do pior ao melhor');
await d.hold(500);
await d.frame(page.getByText('Evolução mês a mês', { exact: true }));
await d.hold(1600);
await d.frame(quebra);
// a primeira linha tem de ser Tecnologia, a pior no acumulado do ano
const linhaTec = page.locator('table.tdir tbody tr').first().filter({ hasText: 'Tecnologia' });
await d.pointAt(linhaTec, 900);
await d.hold(2200);

// ── 5 · Deep dive ✦ ─────────────────────────────────────────────────
await d.scrollTop();
await d.click(page.locator('main').getByRole('button', { name: /O que influenciou/ }).first());
const gaveta = page.getByRole('dialog', { name: 'O que influenciou o resultado' });
await gaveta.locator('.passos li').first().waitFor();
await d.caption('Deep dive', 'Resposta gravada do agente: ele consulta o motor com ferramentas e narra cada passo');
await d.pointAt(gaveta.locator('.passos'), 800);
await gaveta.getByText('Analisando…').waitFor();
await gaveta.locator('figure.bloco').first().waitFor();
await gaveta.locator('.resp').waitFor();
await d.caption('Deep dive', 'Os gráficos e o texto saem dos resultados das ferramentas; a IA nunca faz a conta');
const selo = gaveta.locator('.verif').first();
await selo.waitFor();
await selo.getByText('17 de 17 números conferidos').waitFor();
await d.hold(900);
await d.caption('Guarda de números', 'Cada número do texto é conferido contra os resultados do motor: 17 de 17 batem');
const blocos = gaveta.locator('figure.bloco');
await rolarGaveta(blocos.nth(0));
await d.hold(1300);
await rolarGaveta(blocos.nth(1));
await d.hold(1300);
await rolarGaveta(gaveta.locator('details.calc').first(), 160);
await d.pointAt(selo, 700);
await d.hold(2200);

// ── 6 · Como calculei ───────────────────────────────────────────────
const calc = gaveta.locator('details.calc').first();
await d.click(calc.locator('summary'));
await calc.locator('li').first().waitFor();
await d.caption('Como calculei', 'O rastro de cada conta: função, argumentos, fórmula, período efetivo e n');
await rolarGaveta(calc);
await d.pointAt(calc.locator('li').first().locator('code'), 800);
await d.hold(3000);

// ── 7 · Continuação ─────────────────────────────────────────────────
const continuar = gaveta.locator('.continuar').getByRole('button', { name: 'Por que estamos perdendo talento em Tecnologia?' });
await d.click(continuar);
await gaveta.locator('.msg-u').nth(1).waitFor();
await d.caption('Continuação', 'Uma pergunta pronta segue a investigação: por que Tecnologia perde talentos');
await d.pointAt(gaveta.locator('.passos').nth(1), 800);
const selo2 = gaveta.locator('.verif').nth(1);
await selo2.waitFor();
await selo2.getByText('16 de 16 números conferidos').waitFor();
await d.hold(900);
// os dois números da legenda têm de estar no gráfico
const faixa = gaveta
  .locator('figure.bloco')
  .filter({ has: page.locator('h4', { hasText: 'Turnover total por posição na faixa salarial do cargo' }) })
  .filter({ hasText: '57,6' })
  .filter({ hasText: '13,8' });
await rolarGaveta(faixa);
await d.caption('Continuação', 'Em Tecnologia, o turnover vai de 57,6% a.a. no piso da faixa salarial a 13,8% no teto');
await d.pointAt(faixa, 800);
await d.hold(3200);
await rolarGaveta(gaveta.locator('details.calc').nth(1), 160);
await d.caption('Continuação', 'E de novo a guarda: 16 de 16 números da resposta conferidos contra o motor');
await d.pointAt(selo2, 700);
await d.hold(2000);

// ── 8 · Encerramento ────────────────────────────────────────────────
await d.caption('', '');
await d.card(
  `<h1>Dashboard Conversacional</h1><p>Next.js 16 · React 19 · TypeScript · gráficos em SVG próprio · DeepSeek na IA ao vivo (opcional)</p>` +
    `<small>github.com/luccapinto/dash-conversacional<br>demo ao vivo: dash-conversacional.vercel.app</small>`,
  4200,
);

await d.finish(OUT);
await browser.close();
if (DRY) console.log('Ensaio completo: todos os waitFor passaram.');
else for (const file of Object.values(OUT)) console.log(`Demo gravada em ${path.relative(process.cwd(), file)}`);
