export type MessageType =
  | "register"
  | "register_ack"
  | "heartbeat"
  | "heartbeat_ack"
  | "execute"
  | "execute_result"
  | "execute_progress"
  | "execute_request"
  | "execute_abort"
  | "notify"
  | "message"
  | "error";

export interface Message<T = unknown> {
  id: string;
  type: MessageType;
  subtype?: string;
  from: string;
  to: string;
  replyTo?: string;
  payload: T;
  timestamp: number;
}

let counter = 0;

export function createMessage<T>(
  type: MessageType,
  from: string,
  to: string,
  payload: T,
  options?: { subtype?: string; replyTo?: string }
): Message<T> {
  return {
    id: `${Date.now()}-${++counter}`,
    type,
    from,
    to,
    subtype: options?.subtype,
    replyTo: options?.replyTo,
    payload,
    timestamp: Date.now(),
  };
}

export function serializeMessage(msg: Message): string {
  return JSON.stringify(msg);
}

export function deserializeMessage(data: string): Message {
  return JSON.parse(data);
}
