import { BarChart2, MessageSquare, Zap } from 'lucide-react';

export default function Home() {
  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center px-6"
      style={{ backgroundColor: 'var(--color-canvas)' }}
    >
      <div className="w-full max-w-2xl space-y-8 text-center">
        {/* Ícone */}
        <div className="flex justify-center">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ backgroundColor: 'var(--color-accent-muted)' }}
          >
            <BarChart2 size={32} style={{ color: 'var(--color-accent)' }} />
          </div>
        </div>

        {/* Título */}
        <div className="space-y-3">
          <h1
            className="text-4xl font-bold tracking-tight"
            style={{ color: 'var(--color-text-primary)' }}
          >
            Dashboard Conversacional
          </h1>
          <p
            className="text-lg"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            People Analytics potencializado por IA
          </p>
        </div>

        {/* Tese */}
        <p
          className="text-base leading-relaxed mx-auto max-w-lg"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Dashboards deixam de ser repositórios de gráficos que o usuário
          interpreta — e passam a ser sistemas analíticos que entregam{' '}
          <span style={{ color: 'var(--color-text-secondary)' }}>respostas</span>.
        </p>

        {/* Features */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 text-left">
          {[
            {
              icon: BarChart2,
              title: 'Dashboard Executivo',
              desc: 'As 4 perguntas respondidas visualmente: como estamos, tendência, projeção e onde está o problema.',
            },
            {
              icon: Zap,
              title: 'IA Proativa',
              desc: 'Manchetes analíticas pré-geradas que o dashboard fala antes mesmo do usuário perguntar.',
            },
            {
              icon: MessageSquare,
              title: 'Chat Conversacional',
              desc: 'Perguntas em linguagem natural respondidas com dados reais e rastreáveis, com function calling.',
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="rounded-xl p-4 space-y-2"
              style={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
              }}
            >
              <Icon size={20} style={{ color: 'var(--color-accent)' }} />
              <p
                className="text-sm font-semibold"
                style={{ color: 'var(--color-text-primary)' }}
              >
                {title}
              </p>
              <p
                className="text-xs leading-relaxed"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {desc}
              </p>
            </div>
          ))}
        </div>

        {/* Status */}
        <div
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm"
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-muted)',
          }}
        >
          <span
            className="h-2 w-2 animate-pulse rounded-full"
            style={{ backgroundColor: 'var(--color-warn)' }}
          />
          Em construção — M1 concluída
        </div>
      </div>
    </main>
  );
}
