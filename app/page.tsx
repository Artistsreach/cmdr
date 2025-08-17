'use client';

import { useChat } from 'ai/react';
import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import FlickeringGrid from '@/components/ui/flickering-grid';

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    maxSteps: 5,
  });
  
  const [liveViewUrl, setLiveViewUrl] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const autoStartedRef = useRef(false);

  // Auto-start when a `command` (or `cmd`) query param is present
  useEffect(() => {
    const param = searchParams?.get('command') ?? searchParams?.get('cmd');
    if (param && !autoStartedRef.current) {
      autoStartedRef.current = true;
      try {
        // Trigger the chat submission with the preset command
        handleSubmit(new Event('submit') as unknown as React.FormEvent<HTMLFormElement>, {
          data: { message: param },
        });
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.toolInvocations) {
      for (const invocation of lastMessage.toolInvocations as unknown as Array<unknown>) {
        if (invocation && typeof invocation === 'object') {
          const invObj = invocation as Record<string, unknown>;
          const args = invObj['args'];
          if (args && typeof args === 'object') {
            const dbg = (args as Record<string, unknown>)['debuggerFullscreenUrl'];
            if (typeof dbg === 'string' && dbg) {
              // Always hide navbar for maximal viewport
              setLiveViewUrl(`${dbg}&navBar=false`);
            }
          }
        }
      }
    }
  }, [messages]);

  const handleSubmitWrapper = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    handleSubmit(e, { data: { message: input } });
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
          <div className="px-4 py-3">
            <form onSubmit={handleSubmitWrapper} className="w-full relative">
              <input
                className="w-full p-3 pr-12 rounded-md border border-gray-600 bg-neutral-900/80 text-white placeholder-gray-400 transition-all duration-200 ease-in-out shadow-md shadow-black/40 focus:border-blue-400 focus:shadow-lg focus:shadow-blue-400/30 outline-none"
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