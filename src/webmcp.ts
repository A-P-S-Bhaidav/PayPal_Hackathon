/**
 * Browser-Native WebMCP (Web Model Context Protocol) Tool Registration
 * Exposes client-side navigation and safety verification tools to Chromium WebMCP agents.
 */

export function registerAegisWebMcpTools(
  onNavigateTab: (tab: string) => void,
  onTriggerFuzzer: () => Promise<unknown>
): () => void {
  const controller = new AbortController();
  const navAny = navigator as unknown as {
    modelContext?: {
      registerTool?: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void;
    };
  };
  const docAny = document as unknown as {
    modelContext?: {
      registerTool?: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void;
    };
  };

  const ctx = navAny.modelContext || docAny.modelContext;
  if (!ctx || typeof ctx.registerTool !== 'function') {
    return () => controller.abort();
  }

  try {
    ctx.registerTool(
      {
        name: 'open-aegispay-module',
        description:
          'Switch the active AegisPay workspace view to inspect a specific payment or AI module.',
        inputSchema: {
          type: 'object',
          properties: {
            pillar: {
              type: 'string',
              enum: [
                'command',
                'lupa',
                'scamshield',
                'dealforge',
                'cliprefund',
                'churnrescue',
                'paystream',
              ],
              description: 'Target workspace identifier to display in the UI.',
            },
          },
          required: ['pillar'],
        },
        async execute(args: { pillar: string }) {
          onNavigateTab(args.pillar);
          return { status: 'switched', activeModule: args.pillar };
        },
        annotations: { readOnlyHint: true },
      },
      { signal: controller.signal }
    );

    ctx.registerTool(
      {
        name: 'verify-kernel-safety-fuzzer',
        description:
          'Run the 1,000-case property-based deterministic safety fuzzer and update the UI proof table.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        async execute() {
          const result = await onTriggerFuzzer();
          return result;
        },
        annotations: { readOnlyHint: true },
      },
      { signal: controller.signal }
    );
  } catch {
    // WebMCP is progressive enhancement on Chromium 146+
  }

  return () => controller.abort();
}
