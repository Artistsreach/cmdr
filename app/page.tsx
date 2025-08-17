'use client';

import { useChat } from 'ai/react';
import { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import FlickeringGrid from '@/components/ui/flickering-grid';

function Chat() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    maxSteps: 5,
  });
  
  const [liveViewUrl, setLiveViewUrl] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const autoStartedRef = useRef(false);
  const [assistantIdx, setAssistantIdx] = useState<number>(-1);
  const [showMessages, setShowMessages] = useState<boolean>(true);

  // Only assistant text messages (exclude tool invocations)
  const assistantMessages = useMemo(() =>
    messages.filter(m => m.role === 'assistant' && !!m.content?.trim()),
    [messages]
  );

  // When messages change, default to the latest assistant message
  useEffect(() => {
    if (assistantMessages.length) {
      setAssistantIdx(assistantMessages.length - 1);
    } else {
      setAssistantIdx(-1);
    }
  }, [assistantMessages.length]);

  // Auto-start when a `command` (or `cmd`) query param is present
  useEffect(() => {
    const command = searchParams?.get('command') ?? searchParams?.get('cmd');
    const sessionId = searchParams?.get('sessionId');

    if (command && !autoStartedRef.current) {
      autoStartedRef.current = true;
      
      let value = command;
      if (sessionId) {
        value = `In session ${sessionId}, ${command}`;
      }

      // Mirror the manual flow: set input, then submit the real form
      try {
        handleInputChange({ target: { value } } as unknown as React.ChangeEvent<HTMLInputElement>);
        // Allow state to flush before submitting
        setTimeout(() => {
          const form = document.getElementById('chat-form') as HTMLFormElement | null;
          form?.requestSubmit();
        }, 50);
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.toolInvocations) {
      for (const invocation of lastMessage.toolInvocations as unknown as Array<any>) {
        // The result is populated by the useChat hook
        if (invocation.result) {
          const result = invocation.result;
          if (result.debugUrl) {
            const dbg = result.debugUrl;
            setLiveViewUrl(`${dbg}&navBar=false`);
          }
          if (result.sessionId) {
            const sessionId = result.sessionId;
            if (window.history) {
              const url = new URL(window.location.href);
              if (url.searchParams.get('sessionId') !== sessionId) {
                url.searchParams.set('sessionId', sessionId);
                window.history.replaceState({ ...window.history.state, as: url.href, url: url.href }, '', url.href);
              }
            }
          }
        }
      }
    }
  }, [messages]);

  const handleSubmitWrapper = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Read the value from the form to mirror actual submit behavior
    const form = e.currentTarget as HTMLFormElement;
    const fd = new FormData(form);
    const value = (fd.get('chat-input') as string | null) ?? input;
    handleSubmit(e, { data: { message: value } });
  };

  return (
    <div className="min-h-screen w-full relative">
      {/* Fullscreen Live View background */}
      {liveViewUrl ? (
        <iframe
          src={liveViewUrl}
          className="fixed inset-0 w-full h-full z-0"
          title="Browser Live View"
          sandbox="allow-same-origin allow-scripts"
          allow="clipboard-read; clipboard-write"
        />
      ) : (
        <>
          <FlickeringGrid className="fixed inset-0 z-0 h-full w-full bg-black" color="rgb(34, 197, 94)" />
          <div className="fixed inset-0 z-10 flex items-center justify-center">
            <div className="flex items-center justify-center">
              <Image
                src="https://inrveiaulksfmzsbyzqj.supabase.co/storage/v1/object/public/images/CMDrLogo.png"
                alt="CMDr"
                width={320}
                height={160}
                priority
              />
            </div>
          </div>
        </>
      )}

      {/* Floating Input Only Overlay */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 mb-6 flex justify-center px-4">
        <div className="pointer-events-auto w-full max-w-2xl rounded-xl border border-white/10 bg-black/60 backdrop-blur-xl shadow-2xl">
          <div className="px-4 py-3 space-y-3">
            {/* Toolbar (hidden until there's at least one assistant message) */}
            {assistantMessages.length > 0 && (
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setShowMessages(v => !v)}
                  aria-expanded={showMessages}
                  aria-controls="assistant-section"
                  className="pointer-events-auto inline-flex items-center gap-2 rounded-md border border-gray-700 bg-neutral-800/80 px-2 py-1 text-xs text-gray-200 hover:text-green-400 hover:border-green-600 transition-colors"
                  title={showMessages ? 'Hide messages' : 'Show messages'}
                >
                  <span>{showMessages ? 'Hide' : 'Show'} messages</span>
                  <span aria-hidden className={`transition-transform duration-200 ${showMessages ? '' : 'rotate-180'}`}>▾</span>
                </button>
              </div>
            )}

            {/* Assistant bubble (one at a time) with slide animation */}
            <div
              id="assistant-section"
              className={`overflow-hidden transition-all duration-300 ease-out ${showMessages ? 'max-h-64 opacity-100 translate-y-0' : 'max-h-0 opacity-0 -translate-y-2'}`}
            >
              {assistantIdx > -1 && assistantMessages[assistantIdx] && (
                <div className="relative w-full rounded-lg border border-gray-700 bg-neutral-900/90 text-white px-3 py-3">
                  <div className="pr-16 whitespace-pre-wrap text-sm leading-relaxed">
                    {assistantMessages[assistantIdx].content}
                  </div>
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1">
                    <button
                      type="button"
                      className="h-7 w-7 rounded-md border border-gray-700 bg-neutral-800 text-gray-200 hover:text-green-400 disabled:opacity-40"
                      onClick={() => setAssistantIdx(i => Math.max(0, i - 1))}
                      disabled={assistantIdx <= 0}
                      aria-label="Previous assistant message"
                      title="Previous"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="h-7 w-7 rounded-md border border-gray-700 bg-neutral-800 text-gray-200 hover:text-green-400 disabled:opacity-40"
                      onClick={() => setAssistantIdx(i => Math.min(assistantMessages.length - 1, i + 1))}
                      disabled={assistantIdx >= assistantMessages.length - 1}
                      aria-label="Next assistant message"
                      title="Next"
                    >
                      ▼
                    </button>
                  </div>
                </div>
              )}
            </div>
            <form id="chat-form" onSubmit={handleSubmitWrapper} className="w-full relative">
              <input
                className="w-full p-3 pr-12 rounded-md border border-gray-600 bg-neutral-900/80 text-white placeholder-gray-400 transition-all duration-200 ease-in-out shadow-md shadow-black/40 focus:border-blue-400 focus:shadow-lg focus:shadow-blue-400/30 outline-none"
                name="chat-input"
                autoComplete="off"
                autoFocus
                value={input}
                placeholder="Type a command, ex. build a project managment app named Xilo"
                onChange={handleInputChange}
              />
              <button
                type="submit"
                className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-200 hover:text-green-400 transition-colors duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!input.trim()}
                aria-label="Send"
                title="Send"
              >
                <span className="text-2xl leading-none font-bold" aria-hidden>
                  ⏎
                </span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Chat />
    </Suspense>
  );
}
