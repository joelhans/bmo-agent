import { performance } from 'perf_hooks';

export const description = "Retry a function with exponential backoff and jitter";

export const schema = {
  type: "object",
  properties: {
    fn: { 
      type: "function", 
      description: "Function to retry" 
    },
    maxRetries: { 
      type: "number", 
      description: "Maximum number of retry attempts",
      default: 3
    },
    baseDelay: {
      type: "number",
      description: "Base delay in milliseconds",
      default: 1000
    },
    maxDelay: {
      type: "number", 
      description: "Maximum delay between retries",
      default: 10000
    }
  },
  required: ["fn"]
};

export async function run({ 
  fn, 
  maxRetries = 3, 
  baseDelay = 1000, 
  maxDelay = 10000 
}) {
  let retries = 0;

  while (retries < maxRetries) {
    try {
      // Execute the function
      return await fn();
    } catch (error) {
      // Check if it's a rate limit error
      if (!isRateLimitError(error)) {
        throw error; // Re-throw non-rate limit errors
      }

      retries++;

      // If we've exhausted retries, throw the last error
      if (retries >= maxRetries) {
        throw error;
      }

      // Calculate exponential backoff with jitter
      const exponentialDelay = Math.min(
        maxDelay, 
        baseDelay * Math.pow(2, retries)
      );
      
      // Add jitter (random variation)
      const jitterDelay = exponentialDelay * (1 + Math.random());
      
      console.warn(`Rate limit hit. Retry ${retries}/${maxRetries}. Waiting ${Math.round(jitterDelay)}ms`);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, jitterDelay));
    }
  }

  // This should never be reached, but TypeScript wants a return
  throw new Error('Max retries exceeded');
}

// Helper to identify rate limit errors
function isRateLimitError(error) {
  // Check for OpenAI-specific rate limit error
  if (error instanceof Error && error.message.includes('Rate limited by provider')) {
    return true;
  }

  // Could extend to other provider-specific rate limit errors
  return false;
}

export const requires = [];
