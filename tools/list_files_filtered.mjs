import { promises as fs } from "fs";
import path from "path";

export const schema = {
  type: "object",
  properties: {
    directory: { type: "string" },
    excludeDirs: {
      type: "array",
      items: { type: "string" },
      default: ["node_modules", "build"]
    },
    fileExtensions: {
      type: "array",
      items: { type: "string" },
      default: [".tsx"]
    },
    maxFiles: { type: "integer", default: 100 }
  },
  required: ["directory"]
};

export const description = "List files in a directory, excluding specified directories and truncating output based on a file count threshold.";

async function listFiles(dir, fileExtensions, excludeDirs, fileList = []) {
  const files = await fs.readdir(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = await fs.stat(filePath);
    if (stat.isDirectory() && !excludeDirs.includes(file)) {
      fileList = await listFiles(filePath, fileExtensions, excludeDirs, fileList);
    } else if (fileExtensions.includes(path.extname(file))) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

export async function run({ directory, excludeDirs = ["node_modules", "build"], fileExtensions = [".tsx"], maxFiles = 100 }) {
  try {
    let files = await listFiles(directory, fileExtensions, excludeDirs);
    if (files.length > maxFiles) {
      files = files.slice(0, maxFiles);
      return { ok: true, result: files.concat(["...and more"]) };
    }
    return { ok: true, result: files };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
