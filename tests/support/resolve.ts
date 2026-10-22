// Резолвер для `node --test`: Node ESM требует расширение и не читает
// tsconfig paths. Достраиваем .ts/.tsx и alias'ы из tsconfig — исходники
// и тесты остаются с импортами без расширений.
import { statSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const aliases: Array<[string, URL]> = [
  ['@lib/', new URL('src/lib/', root)],
  ['@widgets/', new URL('src/widgets/', root)],
];

const isFile = (url: URL) => {
  try {
    return statSync(fileURLToPath(url)).isFile();
  } catch {
    return false;
  }
};

/** Файл как есть, затем .ts/.tsx, затем index.ts/index.tsx в каталоге. */
const resolveFile = (url: URL): URL | null => {
  if (isFile(url)) {
    return url;
  }

  for (const ext of ['.ts', '.tsx']) {
    const file = new URL(`${url.href}${ext}`);
    if (isFile(file)) {
      return file;
    }
  }

  for (const ext of ['.ts', '.tsx']) {
    const index = new URL(`${url.href}/index${ext}`);
    if (isFile(index)) {
      return index;
    }
  }

  return null;
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    for (const [prefix, base] of aliases) {
      if (specifier.startsWith(prefix)) {
        const url = resolveFile(new URL(specifier.slice(prefix.length), base));
        if (url) {
          return { url: url.href, shortCircuit: true };
        }
      }
    }

    if (specifier.startsWith('.') && context.parentURL) {
      const url = resolveFile(new URL(specifier, context.parentURL));
      if (url) {
        return { url: url.href, shortCircuit: true };
      }
    }

    return nextResolve(specifier, context);
  },
});
