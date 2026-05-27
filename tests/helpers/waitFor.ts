export async function waitFor<T>(fn: () => T | undefined, timeout = 3000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = fn();
    if (result !== undefined && result !== null) return result;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("waitFor timed out");
}
