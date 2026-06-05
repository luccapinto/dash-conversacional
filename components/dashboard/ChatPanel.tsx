'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useFilter } from '@/lib/context/FilterContext';
import type { MensagemChat, ChatGraph, Diretoria } from '@/lib/types';
import { TrendChart } from './TrendChart';
import { RankingChart } from './RankingChart';
import { ChatBars } from './ChatBars';
import { Markdown } from './Markdown';

// ── Perguntas sugeridas por diretoria ─────────────────────────────────────────

const SUGESTOES: Record<string, string[]> = {
  Geral: [
    'Qual diretoria tem o maior turnover?',
    'O que está puxando o turnover da empresa?',
    'Quanto o turnover está custando em 2024?',
    'Estamos perdendo os nossos melhores?',
  ],
  Tecnologia: [
    'O que está puxando o turnover de Tecnologia?',
    'Quanto custa a perda de talento em Tecnologia?',
    'Quem sai proporcionalmente mais em Tecnologia?',
    'Compare Tecnologia com a Gente',
  ],
  'Distribuição & Assessoria': [
    'O pico de janeiro é sazonal ou crônico?',
    'Como está o turnover fora de janeiro?',
    'Como Distribuição se compara com a meta?',
    'Qual o perfil de quem está saindo?',
  ],
  Operações: [
    'O turnover de Operações está crescendo?',
    'Desde quando o problema em Operações começou?',
    'Como Operações se compara com Tecnologia?',
    'Qual o perfil de quem está saindo de Operações?',
  ],
  'Financeiro & Risco': [
    'Financeiro & Risco está dentro da meta?',
    'Qual a tendência de Financeiro & Risco?',
    'O que explica a boa retenção?',
    'Como se compara com a média da empresa?',
  ],
  Gente: [
    'Gente tem o menor turnover da empresa?',
    'Qual a tendência de turnover em Gente?',
    'O que explica a retenção exemplar de Gente?',
    'Qual o perfil de quem saiu de Gente?',
  ],
  'Produtos & Plataforma': [
    'O turnover de Produtos & Plataforma está crescendo?',
    'Qual a tendência de Produtos & Plataforma?',
    'Como Produtos se compara com Tecnologia?',
    'Qual o perfil de quem está saindo?',
  ],
};

// ── Inline graph ──────────────────────────────────────────────────────────────

function ChatInlineGraph({ graph }: { graph: ChatGraph }) {
  if (graph.type === 'trend') {
    return (
      <div className="mt-3 rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
        <TrendChart
          tendencia={graph.tendencia}
          projecao={graph.projecao}
          meta={graph.meta}
          compact
        />
      </div>
    );
  }
  if (graph.type === 'ranking') {
    return (
      <div className="mt-3 rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
        <RankingChart mode="ranking" data={graph.data} compact />
      </div>
    );
  }
  if (graph.type === 'breakdown') {
    return (
      <div className="mt-3 rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
        <RankingChart mode="breakdown" data={graph.data} compact />
      </div>
    );
  }
  if (graph.type === 'bars') {
    return (
      <div className="mt-3 rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
        <ChatBars title={graph.title} unit={graph.unit} data={graph.data} />
      </div>
    );
  }
  return null;
}

// ── Progress indicator (status real das funções) ──────────────────────────────

function ProgressIndicator({ status }: { status?: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <div className="flex items-center gap-1">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full animate-bounce"
            style={{ backgroundColor: 'var(--color-accent)', animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
      {status && (
        <span className="text-[0.78rem]" style={{ color: 'var(--color-text-muted)' }}>{status}</span>
      )}
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: MensagemChat }) {
  const isUser = msg.role === 'user';

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} gap-1`}>
      <div
        className="max-w-[94%] rounded-xl px-3 py-2 text-sm leading-relaxed"
        style={{
          backgroundColor: isUser ? 'var(--color-accent)' : 'var(--color-surface-raised)',
          color: isUser ? 'var(--color-text-inverse)' : 'var(--color-text-primary)',
        }}
      >
        {msg.streaming && !msg.content ? (
          <ProgressIndicator status={msg.status} />
        ) : isUser ? (
          <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
        ) : (
          <>
            <Markdown text={msg.content} />
            {msg.streaming && (
              <span
                className="inline-block w-0.5 h-3 ml-0.5 animate-pulse"
                style={{ backgroundColor: 'var(--color-accent)', verticalAlign: 'middle' }}
              />
            )}
          </>
        )}
      </div>
      {!isUser && msg.graph && !msg.streaming && (
        <div className="w-full">
          <ChatInlineGraph graph={msg.graph} />
        </div>
      )}
    </div>
  );
}

// ── Main ChatPanel ────────────────────────────────────────────────────────────

export function ChatPanel() {
  const { periodo, diretoria } = useFilter();
  const [messages, setMessages] = useState<MensagemChat[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const sugestoes = SUGESTOES[diretoria as Diretoria] ?? SUGESTOES.Geral;

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: MensagemChat = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim(),
    };

    const assistantId = crypto.randomUUID();
    const assistantPlaceholder: MensagemChat = {
      id: assistantId,
      role: 'assistant',
      content: '',
      streaming: true,
    };

    setMessages(prev => [...prev, userMsg, assistantPlaceholder]);
    setInput('');
    setLoading(true);

    try {
      // Build history for API (exclude placeholder)
      const history = [...messages, userMsg].map(m => ({
        role: m.role,
        content: m.content,
      }));

      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, periodo, diretoria }),
      });

      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let accumulated = '';
      let graph: ChatGraph | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') continue;

          try {
            const evt = JSON.parse(raw) as { t: string; v: unknown };
            if (evt.t === 's') {
              const status = evt.v as string;
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId ? { ...m, status, streaming: true } : m
                )
              );
            } else if (evt.t === 'c') {
              accumulated += evt.v as string;
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? { ...m, content: accumulated, status: undefined, streaming: true }
                    : m
                )
              );
            } else if (evt.t === 'g') {
              graph = evt.v as ChatGraph;
            } else if (evt.t === 'e') {
              accumulated = `Erro: ${evt.v as string}`;
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId ? { ...m, content: accumulated, streaming: false } : m
                )
              );
            }
          } catch {
            // ignore malformed events
          }
        }
      }

      // Mark as done, attach graph
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: accumulated || 'Sem resposta.', streaming: false, graph }
            : m
        )
      );
    } catch (err) {
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: `Erro de conexão: ${String(err)}`, streaming: false }
            : m
        )
      );
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [loading, messages, periodo, diretoria]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div
      className="flex flex-col h-full min-h-[400px] rounded-xl overflow-hidden"
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <div
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: loading ? 'var(--color-warn)' : 'var(--color-good)' }}
        />
        <span
          className="text-xs font-medium uppercase tracking-wide"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Chat Analytics
        </span>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="ml-auto text-xs"
            style={{ color: 'var(--color-text-muted)' }}
            title="Limpar conversa"
          >
            limpar
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-3 mt-2">
            {/* Prompt inicial */}
            <p className="text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>
              Pergunte sobre os dados de turnover
            </p>

            {/* Sugestões */}
            <div className="flex flex-col gap-2">
              {sugestoes.map(q => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="text-left text-xs px-3 py-2 rounded-lg transition-colors"
                  style={{
                    backgroundColor: 'var(--color-surface-raised)',
                    color: 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border)',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-accent)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-border)';
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
            {/* Follow-ups contextuais — após a resposta, mantém a conversa fluindo */}
            {!loading && messages.length > 0 && !messages[messages.length - 1].streaming && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {sugestoes
                  .filter(q => !messages.some(m => m.role === 'user' && m.content === q))
                  .slice(0, 3)
                  .map(q => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="text-left text-[0.72rem] px-2.5 py-1.5 rounded-full transition-colors"
                      style={{
                        backgroundColor: 'var(--color-surface-raised)',
                        color: 'var(--color-text-secondary)',
                        border: '1px solid var(--color-border)',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-accent)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-border)'; }}
                    >
                      {q}
                    </button>
                  ))}
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        className="flex items-center gap-2 p-3 shrink-0"
        style={{ borderTop: '1px solid var(--color-border)' }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          placeholder={loading ? 'Analisando...' : 'Pergunte sobre os dados...'}
          className="flex-1 rounded-lg px-3 py-2 text-xs outline-none"
          style={{
            backgroundColor: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-primary)',
          }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={loading || !input.trim()}
          className="shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-opacity"
          style={{
            backgroundColor: 'var(--color-accent)',
            color: 'var(--color-text-inverse)',
            opacity: loading || !input.trim() ? 0.5 : 1,
          }}
        >
          {loading ? '...' : '→'}
        </button>
      </div>
    </div>
  );
}
