import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const publicDir = fileURLToPath(new URL("../public", import.meta.url));

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("/")) {
    const url = pathToFileURL(join(publicDir, specifier)).href;
    return { url, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}