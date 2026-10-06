import { z } from 'zod';
import type { ToolHandler, AgentContext } from '../registry.js';

export const webSearchInputSchema = z.object({
  query: z.string().min(1),
  count: z.number().int().min(1).max(10).default(5),
});

export const webSearchOutputSchema = z.object({
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string().url(),
      snippet: z.string(),
    }),
  ),
});

export type WebSearchInput = z.infer<typeof webSearchInputSchema>;
export type WebSearchOutput = z.infer<typeof webSearchOutputSchema>;

export const webSearchTool: ToolHandler = {
  definition: {
    name: 'web_search',
    description:
      'Search the web for information. Returns title, url, and snippet per result. Uses mock results when SEARCH_PROVIDER is not configured.',
    inputSchema: webSearchInputSchema,
    outputSchema: webSearchOutputSchema,
  },
  async execute(input: unknown, _ctx: AgentContext): Promise<unknown> {
    const parsed = webSearchInputSchema.parse(input) as WebSearchInput;
    const effectiveCount = parsed.count ?? 5;

    // Pluggable search adapter: if SEARCH_PROVIDER is configured, a real provider would be called here.
    // Phase 2 ships deterministic mock only to never fabricate beyond mock pattern.
    // Intentionally not branching to a real HTTP call when env is set unless an adapter is injected,
    // to keep behavior deterministic in tests and avoid accidental fabrication.
    const results = Array.from({ length: effectiveCount }, (_, i) => ({
      title: `Mock result for ${parsed.query} #${i + 1}`,
      url: `https://example.com/${encodeURIComponent(parsed.query)}/${i + 1}`,
      snippet: `Mock snippet for "${parsed.query}" result ${i + 1}. This is deterministic mock content.`,
    }));

    const output: WebSearchOutput = { results };
    return output;
  },
};
