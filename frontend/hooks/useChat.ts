"use client";
import { useState } from "react";
import { sendChat } from "@/lib/api";
import type { ChatMessage } from "@/types";

const SESSION_KEY = "reviewlens_session_id";

function getSessionId(): string {
  if (typeof window === "undefined") return crypto.randomUUID();
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function useChat(projectId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const send = async (content: string) => {
    if (!content.trim() || loading) return;
    const userMsg: ChatMessage = { role: "user", content };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    try {
      const data = await sendChat({
        project_id: projectId,
        session_id: getSessionId(),
        message: content,
      });
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: data.response,
        sources: data.sources,
        guardrailTriggered: data.guardrail_triggered,
        guardrailCategory: data.guardrail_category,
        followUps: data.follow_ups,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return { messages, loading, send };
}
