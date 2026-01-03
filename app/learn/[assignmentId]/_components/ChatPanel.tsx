"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Bot, Loader2, Paperclip, X, FileText, Image as ImageIcon } from "lucide-react";
import { ChatMessage } from "./ChatMessage";

interface Question {
  _id: Id<"questions">;
  questionNumber: number;
  questionText: string;
  questionType: string;
}

interface ChatPanelProps {
  sessionId: Id<"studentSessions"> | null;
  questionId: Id<"questions"> | undefined;
  question: Question | undefined;
}

export function ChatPanel({ sessionId, questionId, question }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get all chat history for the session (persists across questions)
  const chatHistory = useQuery(
    api.chat.getSessionChatHistory,
    sessionId ? { sessionId } : "skip"
  );

  const sendMessage = useAction(api.chat.sendMessageToTutor);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachedFiles((prev) => [...prev, ...files].slice(0, 3)); // Max 3 files
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
    });
  };

  const handleSend = async () => {
    if ((!input.trim() && attachedFiles.length === 0) || !sessionId || !questionId || isSending) return;

    const message = input.trim();
    setInput("");
    setIsSending(true);

    try {
      // Convert files to base64 for sending to LLM
      const fileData = await Promise.all(
        attachedFiles.map(async (file) => ({
          name: file.name,
          type: file.type,
          data: await fileToBase64(file),
        }))
      );

      setAttachedFiles([]);

      await sendMessage({
        sessionId,
        questionId,
        message: message || "Here's my work:",
        files: fileData.length > 0 ? fileData : undefined,
      });
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!sessionId || !questionId) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground p-4">
        <p className="text-sm">Enter your name to start</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {chatHistory?.map((msg) => (
          <ChatMessage key={msg._id} message={msg} />
        ))}

        {/* Typing indicator */}
        {isSending && (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
              <Bot className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-2.5">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* File attachments preview */}
      {attachedFiles.length > 0 && (
        <div className="px-4 pb-2 flex gap-2 flex-wrap">
          {attachedFiles.map((file, i) => (
            <div
              key={i}
              className="flex items-center gap-2 bg-muted rounded-lg px-3 py-1.5 text-sm"
            >
              {file.type.startsWith("image/") ? (
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
              ) : (
                <FileText className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="max-w-[120px] truncate">{file.name}</span>
              <button
                onClick={() => removeFile(i)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div className="border-t p-3 bg-background">
        <div className="flex gap-2 items-end">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSending || attachedFiles.length >= 3}
            className="h-10 w-10 shrink-0"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="min-h-[40px] max-h-[120px] resize-none"
            rows={1}
            disabled={isSending}
          />
          <Button
            onClick={handleSend}
            disabled={(!input.trim() && attachedFiles.length === 0) || isSending}
            size="icon"
            className="h-10 w-10 shrink-0"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
