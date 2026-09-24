import { ReplyRef } from "./types";

export interface QueuedMessage {
  tempId: string;
  toId: string;
  content: string;
  createdAt: number;
  replyTo?: ReplyRef;
}

/**
 * Messages composed while the socket was offline. Kept at module scope so a
 * pending message survives leaving the chat view; each entry knows its own
 * recipient, so switching conversations can never misdeliver it.
 */
const queue: QueuedMessage[] = [];

export function enqueueMessage(message: QueuedMessage): void {
  if (queue.some((item) => item.tempId === message.tempId)) return;
  queue.push(message);
}

export function getQueuedMessages(): QueuedMessage[] {
  return [...queue];
}

export function getQueuedFor(toId: string): QueuedMessage[] {
  return queue.filter((item) => item.toId === toId);
}

export function removeQueuedMessage(tempId: string): void {
  const index = queue.findIndex((item) => item.tempId === tempId);
  if (index !== -1) queue.splice(index, 1);
}
