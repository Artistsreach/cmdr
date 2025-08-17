import { openai } from '@ai-sdk/openai';
import { streamText, convertToCoreMessages, tool, generateText } from 'ai';
import { z } from 'zod';
import {anthropic} from '@ai-sdk/anthropic'
import { EventEmitter } from 'events';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { Stagehand } from '@browserbasehq/stagehand';

const bb_api_key = process.env.BROWSERBASE_API_KEY!
const bb_project_id = process.env.BROWSERBASE_PROJECT_ID!

// Global Stagehand instance pool keyed by sessionId to avoid reconnecting/closing per action
declare global {
  // eslint-disable-next-line no-var
  var __STAGEHAND_POOL__: Map<string, Stagehand> | undefined;
}
const STAGEHAND_POOL: Map<string, Stagehand> = globalThis.__STAGEHAND_POOL__ ?? (globalThis.__STAGEHAND_POOL__ = new Map());

// Reduce noisy listener warnings under hot-reload
try { (process as unknown as EventEmitter).setMaxListeners?.(30); } catch {}

// Helper functions (not exported)
async function getStagehand(sessionId: string): Promise<Stagehand> {
  let stagehand = STAGEHAND_POOL.get(sessionId);
  if (stagehand) {
    return stagehand;
  }

  stagehand = new Stagehand({
    env: 'BROWSERBASE',
    apiKey: process.env.BROWSERBASE_API_KEY,
    projectId: process.env.BROWSERBASE_PROJECT_ID,
    browserbaseSessionID: sessionId,
    modelName: 'gpt-4o',
    modelClientOptions: {
      apiKey: process.env.OPENAI_API_KEY,
    },
    disablePino: true,
    verbose: 0,
    domSettleTimeoutMs: 60000,
    selfHeal: true,
  });

  await stagehand.init();
  STAGEHAND_POOL.set(sessionId, stagehand);
  return stagehand;
}

async function getDebugUrl(id: string) {
  const response = await fetch(`https://www.browserbase.com/v1/sessions/${id}/debug`, {
    method: "GET",
    headers: {
      "x-bb-api-key": bb_api_key,
      "Content-Type": "application/json",
    },
  });
  const data = await response.json();
  return data;
}

async function createSessionWithOptions(opts: {
  timeout?: number;
  keepAlive?: boolean;
  region?: 'us-west-2' | 'us-east-1' | 'eu-central-1' | 'ap-southeast-1';
  viewport?: { width?: number; height?: number };
  blockAds?: boolean;
  solveCaptchas?: boolean;
  recordSession?: boolean;
  proxies?: boolean;
  userMetadata?: Record<string, unknown>;
}) {
  const body: Record<string, unknown> = {
    projectId: bb_project_id,
    ...(opts.timeout ? { timeout: opts.timeout } : {}),
    ...(typeof opts.keepAlive === 'boolean' ? { keepAlive: opts.keepAlive } : {}),
    ...(opts.region ? { region: opts.region } : {}),
    ...(typeof opts.proxies === 'boolean' ? { proxies: opts.proxies } : {}),
    ...(opts.userMetadata ? { userMetadata: opts.userMetadata } : {}),
    browserSettings: {
      ...(opts.viewport?.width || opts.viewport?.height
        ? { viewport: { width: opts.viewport?.width ?? 1280, height: opts.viewport?.height ?? 720 } }
        : {}),
      ...(typeof opts.blockAds === 'boolean' ? { blockAds: opts.blockAds } : {}),
      ...(typeof opts.solveCaptchas === 'boolean' ? { solveCaptchas: opts.solveCaptchas } : {}),
      ...(typeof opts.recordSession === 'boolean' ? { recordSession: opts.recordSession } : {}),
    },
  };

  const response = await fetch(`https://www.browserbase.com/v1/sessions`, {
    method: 'POST',
    headers: {
      'x-bb-api-key': bb_api_key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return { id: data.id, debugUrl: data.debugUrl };
}

async function createSession() {
  const response = await fetch(`https://www.browserbase.com/v1/sessions`, {
    method: "POST",
    headers: {
      "x-bb-api-key": bb_api_key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      projectId: bb_project_id,
      keepAlive: true,
      timeout: 900
     }),
  });
  const data = await response.json();
  return { id: data.id, debugUrl: data.debugUrl };
}

// Main API route handler
export const runtime = 'nodejs';
export const maxDuration = 300; // Set max duration to 300 seconds (5 minutes)

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = await streamText({
    experimental_toolCallStreaming: true,
    model: openai('gpt-4-turbo'),
    // model: openai('gpt-4o'),
    // model: anthropic('claude-3-5-sonnet-20240620'),
    messages: convertToCoreMessages(messages),
    tools: {
      createSession: tool({
        description: 'Create a new session',
        parameters: z.object({}),
        execute: async () => {
          const session = await createSession();
          const debugUrl = await getDebugUrl(session.id);
          return { sessionId: session.id, debugUrl: debugUrl.debuggerFullscreenUrl, toolName: 'Creating a new session'};
        },
      }),
      createSessionAdvanced: tool({
        description: 'Create a new Browserbase session with advanced options (timeout, keepAlive, region, viewport, proxies, etc.)',
        parameters: z.object({
          toolName: z.string().describe('What the tool is doing'),
          timeout: z.number().min(60).max(21600).optional().describe('Session timeout in seconds'),
          keepAlive: z.boolean().optional().describe('Keep session alive after disconnection (plan-dependent)'),
          region: z.enum(['us-west-2','us-east-1','eu-central-1','ap-southeast-1']).optional(),
          proxies: z.boolean().optional(),
          viewport: z.object({ width: z.number().optional(), height: z.number().optional() }).partial().optional(),
          blockAds: z.boolean().optional(),
          solveCaptchas: z.boolean().optional(),
          recordSession: z.boolean().optional(),
          userMetadata: z.record(z.any()).optional(),
        }),
        execute: async ({ timeout, keepAlive, region, viewport, blockAds, solveCaptchas, recordSession, proxies, userMetadata }) => {
          try {
            const session = await createSessionWithOptions({
              timeout,
              keepAlive,
              region,
              viewport,
              blockAds,
              solveCaptchas,
              recordSession,
              proxies,
              userMetadata,
            });
            const debugUrl = await getDebugUrl(session.id);
            return { toolName: 'Creating a new session (advanced)', sessionId: session.id, debugUrl: debugUrl.debuggerFullscreenUrl };
          } catch (error) {
            console.error('Error in createSessionAdvanced:', error);
            return { toolName: 'Creating a new session (advanced)', content: `Error creating session: ${error}`, dataCollected: false };
          }
        },
      }),
      closeStagehand: tool({
        description: 'Close and cleanup the Stagehand instance for a given session. Use this when you are done interacting with the session.',
        parameters: z.object({ sessionId: z.string().describe('Existing Browserbase session ID') }),
        execute: async ({ sessionId }) => {
          const inst = STAGEHAND_POOL.get(sessionId);
          if (!inst) return { toolName: 'Close Stagehand', content: 'No Stagehand instance found for this session.', dataCollected: false };
          try {
            await inst.close();
            STAGEHAND_POOL.delete(sessionId);
            return { toolName: 'Close Stagehand', content: 'Stagehand closed.', dataCollected: true };
          } catch (e) {
            return { toolName: 'Close Stagehand', content: `Error closing Stagehand: ${e}`, dataCollected: false };
          }
        }
      }),
      stagehandAct: tool({
        description: 'Use Stagehand to take a natural-language action on the current page. Prefer this for robust interactions (click, type, press).',
        parameters: z.object({
          toolName: z.string().describe('What the tool is doing'),
          instruction: z.string().describe('The action to perform, e.g., "click \"Sign in\""'),
          sessionId: z.string().describe('Existing Browserbase session ID. If none, create one first.'),
          debuggerFullscreenUrl: z.string().optional().describe('Optional debugger URL (not required).'),
        }),
        execute: async ({ instruction, sessionId }) => {
          try {
            const stagehand = await getStagehand(sessionId);
            const page = stagehand.page;
            try { page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(45000); } catch {}

            let result: unknown;
            try {
              result = await page.act(instruction);
            } catch (e) {
              const msg = String((e as unknown as { toString?: () => string })?.toString?.() ?? e);
              if (msg.includes('Execution context was destroyed')) {
                try { await page.waitForLoadState('load', { timeout: 10000 }); } catch {}
                result = await page.act(instruction);
              } else {
                throw e;
              }
            }
            return {
              toolName: 'Stagehand act',
              content: typeof result === 'object' && result !== null && 'message' in result
                ? (result as { message?: string }).message ?? 'Action executed'
                : 'Action executed',
              dataCollected: true,
            };
          } catch (error) {
            console.error('Error in stagehandAct:', error);
            const msg = String(error?.toString?.() ?? error);
            if (msg.includes('409') || msg.includes('not currently active') || msg.includes('Session closed')) {
              try { STAGEHAND_POOL.delete(sessionId); } catch {}
            }
            return {
              toolName: 'Stagehand act',
              content: `Error performing action: ${error}`,
              dataCollected: false,
            };
          }
        },
      }),
      stagehandExtract: tool({
        description: 'Use Stagehand to extract structured data from the current page as plain text.',
        parameters: z.object({
          toolName: z.string().describe('What the tool is doing'),
          instruction: z.string().describe('What to extract, e.g., "extract the main headline"'),
          sessionId: z.string().describe('Existing Browserbase session ID. If none, create one first.'),
          debuggerFullscreenUrl: z.string().optional().describe('Optional debugger URL (not required).'),
        }),
        execute: async ({ instruction, sessionId }) => {
          try {
            const stagehand = await getStagehand(sessionId);
            const page = stagehand.page;

            try { page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(45000); } catch {}

            let data: unknown;
            try {
              data = await page.extract({
                instruction,
                schema: z.object({ text: z.string() }),
              });
            } catch (e) {
              const msg = String((e as unknown as { toString?: () => string })?.toString?.() ?? e);
              if (msg.includes('Execution context was destroyed')) {
                try { await page.waitForLoadState('load', { timeout: 10000 }); } catch {}
                data = await page.extract({
                  instruction,
                  schema: z.object({ text: z.string() }),
                });
              } else {
                throw e;
              }
            }
            return {
              toolName: 'Stagehand extract',
              content: (typeof data === 'object' && data !== null && 'text' in data
                ? (data as { text?: string }).text
                : undefined) ?? (typeof data === 'object' && data !== null && 'extraction' in data
                ? (data as { extraction?: string }).extraction
                : undefined) ?? JSON.stringify(data),
              dataCollected: true,
            };
          } catch (error) {
            console.error('Error in stagehandExtract:', error);
            const msg = String(error?.toString?.() ?? error);
            if (msg.includes('409') || msg.includes('not currently active') || msg.includes('Session closed')) {
              try { STAGEHAND_POOL.delete(sessionId); } catch {}
            }
            return {
              toolName: 'Stagehand extract',
              content: `Error extracting content: ${error}`,
              dataCollected: false,
            };
          }
        },
      }),
      navigateTo: tool({
        description: 'Directly navigate to a specific URL in the existing browser session. Prefer this when the user requests to open a known site (e.g., "go to bestbuy.com").',
        parameters: z.object({
          toolName: z.string().describe('What the tool is doing'),
          url: z.string().describe('The full URL to navigate to (e.g., https://www.bestbuy.com). Include scheme.'),
          sessionId: z.string().describe('The session ID to use. If none exists, create one with createSession Tool.'),
          debuggerFullscreenUrl: z.string().describe('The fullscreen debug URL for the session.'),
        }),
        execute: async ({ url, sessionId }) => {
          try {
            const stagehand = await getStagehand(sessionId);
            const page = stagehand.page;
            await page.goto(url, { waitUntil: 'load' });
            try { await page.waitForLoadState('domcontentloaded', { timeout: 10000 }); } catch {}
            try { await page.waitForLoadState('networkidle', { timeout: 7500 }); } catch {}
            const title = await page.title();
            return { toolName: 'Navigating to URL', content: `Navigated to ${url}. Page title: ${title}`, dataCollected: true };
          } catch (error) {
            console.error('Error in navigateTo:', error);
            const msg = String(error?.toString?.() ?? error);
            if (msg.includes('409') || msg.includes('not currently active') || msg.includes('Session closed')) {
              try { STAGEHAND_POOL.delete(sessionId); } catch {}
            }
            return { toolName: 'Navigating to URL', content: `Error navigating to ${url}: ${error}`, dataCollected: false };
          }
        },
      }),
      askForConfirmation: tool({
        description: 'Ask the user for confirmation.',
        parameters: z.object({
          message: z.string().describe('The message to ask for confirmation.'),
        }),
      }),
      googleSearch: tool({
        description: 'Search the web for a query using DuckDuckGo (preferred to reduce captchas). Use this when the user requests to "search" or find information, not when they ask to open a specific site.',
        parameters: z.object({
          toolName: z.string().describe('What the tool is doing'),
          query: z.string().describe('The exact and complete search query as provided by the user. Do not modify this in any way.'),
          sessionId: z.string().describe('The session ID to use for the search. If there is no session ID, create a new session with createSession Tool.'),
          debuggerFullscreenUrl: z.string().describe('The fullscreen debug URL to use for the search. If there is no debug URL, create a new session with createSession Tool.')
        }),
        execute: async ({ query, sessionId }) => {
          try {
            const stagehand = await getStagehand(sessionId);
            const page = stagehand.page;
            await page.goto(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { waitUntil: 'load' });
            try { await page.waitForLoadState('domcontentloaded', { timeout: 10000 }); } catch {}
            try { await page.waitForLoadState('networkidle', { timeout: 7500 }); } catch {}
            await page.waitForSelector('div.result');
            const results = await page.evaluate(() => {
              const items = document.querySelectorAll('div.result');
              return Array.from(items).map((item) => {
                const title = (item.querySelector('a.result__a') as HTMLElement)?.innerText || '';
                const description = (item.querySelector('a.result__snippet') as HTMLElement)?.innerText || '';
                return { title, description };
              });
            });
            const typedResults = results as Array<{ title: string; description: string }>;
            const text = typedResults.map((item) => `${item.title}\n${item.description}`).join('\n\n');

            const response = await generateText({
              model: anthropic('claude-3-5-sonnet-20240620'),
              prompt: `Evaluate the following web page content: ${text}`,
            });
            return { toolName: 'Searching the web', content: response.text, dataCollected: true };
          } catch (error) {
            console.error('Error in webSearch:', error);
            const msg = String(error?.toString?.() ?? error);
            if (msg.includes('409') || msg.includes('not currently active') || msg.includes('Session closed')) {
              try { STAGEHAND_POOL.delete(sessionId); } catch {}
            }
            return { toolName: 'Searching the web', content: `Error performing web search: ${error}` , dataCollected: false };
          }
        },
      }),
      getPageContent: tool({
        description: 'Get the content of a page using Playwright',
        parameters: z.object({
          toolName: z.string().describe('What the tool is doing'),
          url: z.string().describe('The url to get the content of'),
          sessionId: z.string().describe('The session ID to use for the search. If there is no session ID, create a new session with createSession Tool.'),
          debuggerFullscreenUrl: z.string().describe('The fullscreen debug URL to use for the search. If there is no debug URL, create a new session with createSession Tool.')
        }),
        execute: async ({ url, sessionId }) => {
          try {
            const stagehand = await getStagehand(sessionId);
            const page = stagehand.page;
            await page.goto(url);
            try { await page.waitForLoadState('domcontentloaded', { timeout: 10000 }); } catch {}
            try { await page.waitForLoadState('networkidle', { timeout: 7500 }); } catch {}
            const content = await page.content();
            const dom = new JSDOM(content);
            const reader = new Readability(dom.window.document);
            const article = reader.parse();
            const text = `${article?.title || ''}\n${article?.textContent || ''}`;
            const response = await generateText({
              model: anthropic('claude-3-5-sonnet-20240620'),
              prompt: `Evaluate the following web page content: ${text}`,
            });
            return { toolName: 'Getting page content', content: response.text };
          } catch (error) {
            console.error('Error in getPageContent:', error);
            const msg = String(error?.toString?.() ?? error);
            if (msg.includes('409') || msg.includes('not currently active') || msg.includes('Session closed')) {
              try { STAGEHAND_POOL.delete(sessionId); } catch {}
            }
            return { toolName: 'Getting page content', content: `Error fetching page content: ${error}` };
          }
        },
      }),
    },
  });

  return result.toDataStreamResponse();
}
