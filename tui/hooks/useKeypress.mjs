import { useEffect } from 'react';
import { useStdin } from 'ink';
import * as readline from 'node:readline';

// useKeypress: low-level keypress listener using Node's readline keypress events
// handler({ str, key }) where key has { name, sequence, ctrl, meta, shift }
export default function useKeypress(handler, { isActive = true } = {}) {
  const { stdin } = useStdin();

  useEffect(() => {
    if (!stdin || !isActive) return;
    try {
      readline.emitKeypressEvents(stdin);
    } catch (_) {
      // ignore
    }

    const onKeypress = (str, key) => {
      if (typeof handler === 'function') handler({ str, key });
    };

    // Readline attaches 'keypress' on the stream itself
    stdin.on('keypress', onKeypress);
    return () => {
      stdin.off('keypress', onKeypress);
    };
  }, [stdin, isActive, handler]);
}
