// This is a special meta-tool that triggers a hot reload of all tools
// The actual reload is handled by the main agent loop

export const definition = {
  type: "function",
  function: {
    name: "_reload_tools",
    description: "Reload all tools to pick up newly created tools. Call this after using _add_tool to make new tools available.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  }
};

// The execute function returns a signal that the main loop handles
export async function execute(args) {
  return JSON.stringify({
    success: true,
    _action: "reload_tools",
    message: "Tools will be reloaded. New capabilities are now available."
  });
}
