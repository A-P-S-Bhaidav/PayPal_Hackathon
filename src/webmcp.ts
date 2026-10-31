/**
 * Browser-Native WebMCP (Web Model Context Protocol) Tool Registration
 * Exposes client-side navigation and verification tools to Chromium WebMCP agents.
 */

export type WorkspaceSectionId = 'overview' | 'protect' | 'merchant' | 'getpaid';

export function registerAegisWebMcpTools(
  onNavigateSection: (section: WorkspaceSectionId | 'diagnostics') => void,
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
        name: 'open-aegispay-section',
        description:
          'Switch the active AegisPay workspace view between Overview, Pay Safely, Recover & Retain, Get Paid, or the Verification Lab.',
        inputSchema: {
          type: 'object',
          properties: {
            section: {
              type: 'string',
              enum: ['overview', 'protect', 'merchant', 'getpaid', 'diagnostics'],
              description: 'Target workspace section to display.',
            },
          },
          required: ['section'],
        },
        async execute(args: { section: WorkspaceSectionId | 'diagnostics' }) {
          onNavigateSection(args.section);
          return { status: 'switched', activeSection: args.section };
        },
        annotations: { readOnlyHint: true },
      },
      { signal: controller.signal }
    );

    ctx.registerTool(
      {
        name: 'verify-safety-invariants',
        description: 'Run the 1,000-case property-based safety verifier in the Verification Lab.',
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
