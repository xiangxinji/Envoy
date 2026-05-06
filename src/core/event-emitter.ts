export type EventMap = { [K: string]: (...args: any[]) => void };

export class EventEmitter<Events extends EventMap = EventMap> {
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  on<K extends string & keyof Events>(event: K, listener: Events[K]): this;
  on(event: string, listener: (...args: unknown[]) => void): this;
  on(event: string, listener: (...args: unknown[]) => void): this {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return this;
  }

  off<K extends string & keyof Events>(event: K, listener: Events[K]): this;
  off(event: string, listener: (...args: unknown[]) => void): this;
  off(event: string, listener: (...args: unknown[]) => void): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  emit<K extends string & keyof Events>(event: K, ...args: Parameters<Events[K]>): this;
  emit(event: string, ...args: unknown[]): this;
  emit(event: string, ...args: unknown[]): this {
    this.listeners.get(event)?.forEach((fn) => fn(...args));
    return this;
  }

  once<K extends string & keyof Events>(event: K, listener: Events[K]): this;
  once(event: string, listener: (...args: unknown[]) => void): this;
  once(event: string, listener: (...args: unknown[]) => void): this {
    const wrapper = (...args: unknown[]) => {
      this.off(event, wrapper);
      listener(...args);
    };
    return this.on(event, wrapper);
  }

  removeAllListeners<K extends string & keyof Events>(event?: K): this;
  removeAllListeners(event?: string): this;
  removeAllListeners(event?: string): this {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    return this;
  }
}
