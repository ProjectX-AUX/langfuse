import { v4 as uuidv4 } from "uuid";
import {
  type ChatMessage,
  type ChatMessageWithIdNoPlaceholders,
  ChatMessageType,
} from "@langfuse/shared";

export function createEmptyMessage(
  message: ChatMessage,
): ChatMessageWithIdNoPlaceholders {
  const baseMessage = {
    ...message,
    content: message.content ?? "",
    id: uuidv4(),
  };

  // Initialize images and audio arrays for user messages
  if (message.type === ChatMessageType.User) {
    return {
      ...baseMessage,
      images: (message as any).images ?? [],
      audio: (message as any).audio ?? [],
    } as ChatMessageWithIdNoPlaceholders;
  }

  return baseMessage;
}
