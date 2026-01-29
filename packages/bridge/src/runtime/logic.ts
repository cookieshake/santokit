import type { DatabasePool } from './server.js';
import type { Bundle, LogicHandler } from './types.js';
import type { Context } from '../context/index.js';

function compileJsHandler(source: string): LogicHandler {
  const transformed = source.replace(/export\s+default\s+/g, 'module.exports.default = ');
  const module = { exports: {} as Record<string, unknown> };
  const exports = module.exports;
  const factory = new Function(
    'module',
    'exports',
    `${transformed}\nreturn module.exports.default ?? module.exports;`
  );

  const handler = factory(module, exports);
  if (typeof handler !== 'function') {
    throw new Error('JS handler not found in bundle content');
  }
  return handler as LogicHandler;
}

function prepareSql(
  template: string,
  params: Record<string, unknown>
): { sql: string; values: unknown[] } {
  const values: unknown[] = [];
  let paramIndex = 0;

  // Replace :param_name with $1, $2, etc.
  const sql = template.replace(/:(\w+)/g, (_, name) => {
    paramIndex++;
    values.push(params[name]);
    return `$${paramIndex}`;
  });

  return { sql, values };
}

export async function executeBundle(
  bundle: Bundle,
  params: Record<string, unknown>,
  options: { db: Record<string, DatabasePool>; context: Context }
): Promise<unknown> {
  if (bundle.type === 'sql') {
    const target = bundle.config.target || 'main';
    const db = options.db[target];
    if (!db) {
      throw new Error(`Database "${target}" not configured`);
    }

    const { sql, values } = prepareSql(bundle.content, params);
    return await db.query(sql, values);
  }

  if (bundle.type === 'js') {
    let handler = bundle.config.handler;
    if (!handler) {
      handler = compileJsHandler(bundle.content);
      bundle.config.handler = handler;
    }
    return await handler(params, options.context);
  }

  throw new Error(`Unknown bundle type: ${bundle.type}`);
}
