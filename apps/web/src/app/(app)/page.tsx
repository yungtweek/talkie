'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { chatStore } from '@/features/chat/chat.store';
import { useSessionsActions } from '@/features/chat/chat.sessions.store';
import { useAuthState } from '@/features/auth/auth.store';

export default function TalkieEntry() {
  const { reset } = chatStore();
  const { setSelectedSessionId, setActiveSessionId } = useSessionsActions();
  const { user } = useAuthState();
  useEffect(() => {
    setSelectedSessionId(null);
    setActiveSessionId(null);
    reset();
  }, [setActiveSessionId, setSelectedSessionId, reset]);

  const cardClass =
    'rounded-2xl border border-neutral-200/70 bg-white/80 p-6 shadow-sm backdrop-blur-sm ' +
    'transition hover:border-neutral-400/80 hover:shadow-md ' +
    'dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20';
  const ctaClass =
    'inline-flex items-center justify-center rounded-lg border border-neutral-300/80 px-3 py-2 ' +
    'text-sm font-medium text-neutral-800 transition hover:border-transparent hover:bg-neutral-900 hover:text-white ' +
    'dark:border-white/20 dark:text-white dark:hover:bg-white/10';

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-white to-neutral-100 text-neutral-900 dark:from-neutral-950 dark:to-neutral-900 dark:text-white">
      <main className="mx-auto flex max-w-6xl flex-col gap-12 px-6 py-16 md:px-10 lg:py-24">
        <section className="space-y-4 text-center md:text-left">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Hi, I’m <span className="text-sky-400">TALKIE</span>😎
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-neutral-600 dark:text-neutral-300 md:mx-0">
            An AI chat assistant built for real-time reasoning, streaming, and observability.
          </p>
        </section>

        <section className="space-y-6">
          <h2 className="text-2xl font-semibold">Features</h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <article className={cardClass}>
              <h3 className="text-lg font-semibold">💬 Generative Chat</h3>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
                Real-time text streaming powered by FastAPI and Kafka. Optimized for responsiveness and scalability.
              </p>
              <Link href={user ? '/chat' : '/login'} className={`${ctaClass} mt-4 w-full`}>
                {user ? 'Try your chat' : 'Login to test with demo chat'}
              </Link>
            </article>

            <article className={cardClass}>
              <h3 className="text-lg font-semibold">📄 RAG Search</h3>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
                Retrieve and reason with your uploaded data using Weaviate and LangChain.
              </p>
              <Link href={user ? '/documents' : '/login'} className={`${ctaClass} mt-4 w-full`}>
                {user ? 'Try your data' : 'Login to test with demo data'}
              </Link>
            </article>

            <article className={cardClass}>
              <h3 className="text-lg font-semibold">📊 Metrics Dashboard</h3>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
                Observe latency, token usage, and performance through Prometheus & Grafana.
              </p>
              <Link
                href="/"
                className={`${ctaClass} mt-4 w-full cursor-not-allowed opacity-60`}
                onClick={e => e.preventDefault()}
              >
                🚧 Working on it...
              </Link>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}
