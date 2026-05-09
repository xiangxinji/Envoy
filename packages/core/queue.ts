export class Queue<T> {
  private items: T[] = [];

  get length(): number {
    return this.items.length;
  }

  enqueue(item: T): void {
    this.items.push(item);
  }

  dequeue(): T | undefined {
    return this.items.shift();
  }

  peek(): T | undefined {
    return this.items[0];
  }

  remove(predicate: (item: T) => boolean): T | undefined {
    const idx = this.items.findIndex(predicate);
    if (idx === -1) return undefined;
    return this.items.splice(idx, 1)[0];
  }

  toArray(): T[] {
    return [...this.items];
  }

  clear(): void {
    this.items = [];
  }
}
