import fs from 'fs/promises';

export const schema = {
  type: 'object',
  properties: {
    filepath: { type: 'string' },
  },
  required: ['filepath'],
};

export const description = 'Counts characters in a specified file.';

export async function run({ filepath }) {
  try {
    const content = await fs.readFile(filepath, 'utf8');
    return { ok: true, result: content.length };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
