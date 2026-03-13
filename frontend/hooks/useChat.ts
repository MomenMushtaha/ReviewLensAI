"use client";
import { useState, useCallback } from "react";
import { sendChatMessage, type ChatResponse } from "@/lib/api";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: Array<{
    reviewer_name?: string;
    rating?: number;
    excerpt: string;
  }>;
  guardrailTriggered?: boolean;
}

export function useChat(projectId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => crypto.randomUUID());

  const send = useCallback(async (message: string) => {
    if (!message.trim()) return;

    const userMessage: ChatMessage = { role: "user", content: message };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const response: ChatResponse = await sendChatMessage({
        projectId,
        message,
        sessionId,
      });

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: response.response,
        sources: response.sources?.map((s) => ({
          reviewer_name: s.author,
          rating: s.rating,
          excerpt: s.excerpt,
        })),
        guardrailTriggered: response.guardrailTriggered,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: ChatMessage = {
        role: "assistant",
        content: error instanceof Error ? error.message : "Sorry, something went wrong.",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  }, [projectId, sessionId]);

  return { messages, loading, send };
}
