// config_introspect.mjs — One-shot inspection of BMO config and provider status

import { readFile } from 'fs/promises';
import { join } from 'path';

export const description = "Inspect BMO configuration: providers, models, API keys, and readiness status in one call.";

export const schema = {
  type: "object",
  properties: {
    bmoHome: {
      type: "string",
      description: "BMO data directory (default: BMO_HOME env or ~/.local/share/bmo)"
    },
    showKeys: {
      type: "boolean",
      description: "Show partial API key values (default: false)",
      default: false
    }
  },
  required: []
};

export async function run({ bmoHome, showKeys = false } = {}) {
  try {
    const home = bmoHome || process.env.BMO_HOME || join(process.env.HOME, '.local/share/bmo');
    
    const result = {
      bmoHome: home,
      config: null,
      keys: null,
      providers: [],
      readiness: {}
    };
    
    // Read config.json
    try {
      const configPath = join(home, 'config.json');
      const configContent = await readFile(configPath, 'utf-8');
      const config = JSON.parse(configContent);
      result.config = {
        defaultProvider: config.defaultProvider,
        defaultModel: config.defaultModel,
        providers: Object.keys(config.providers || {}).map(name => ({
          name,
          baseUrl: config.providers[name]?.baseUrl,
          apiKeyEnv: config.providers[name]?.apiKeyEnv,
          models: config.providers[name]?.models
        }))
      };
    } catch (e) {
      result.config = { error: e.code === 'ENOENT' ? 'config.json not found' : e.message };
    }
    
    // Read keys.json
    try {
      const keysPath = join(home, 'keys.json');
      const keysContent = await readFile(keysPath, 'utf-8');
      const keys = JSON.parse(keysContent);
      result.keys = {};
      for (const [provider, key] of Object.entries(keys)) {
        if (showKeys && key) {
          result.keys[provider] = key.slice(0, 8) + '...' + key.slice(-4);
        } else {
          result.keys[provider] = key ? 'present' : 'empty';
        }
      }
    } catch (e) {
      result.keys = { error: e.code === 'ENOENT' ? 'keys.json not found' : e.message };
    }
    
    // Compute readiness
    if (result.config && !result.config.error && result.keys && !result.keys.error) {
      for (const provider of result.config.providers) {
        const hasKey = result.keys[provider.name] === 'present' || 
                       (showKeys && result.keys[provider.name]?.includes('...'));
        const hasEnvKey = provider.apiKeyEnv && process.env[provider.apiKeyEnv];
        result.readiness[provider.name] = {
          configured: true,
          hasStoredKey: hasKey,
          hasEnvKey: !!hasEnvKey,
          ready: hasKey || !!hasEnvKey
        };
      }
    }
    
    // Summary
    const readyProviders = Object.entries(result.readiness)
      .filter(([_, v]) => v.ready)
      .map(([k, _]) => k);
    result.summary = {
      defaultProvider: result.config?.defaultProvider,
      defaultModel: result.config?.defaultModel,
      readyProviders,
      totalProviders: result.config?.providers?.length || 0
    };
    
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
