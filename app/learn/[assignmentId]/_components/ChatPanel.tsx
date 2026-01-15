"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Send, Paperclip, X, FileText, Image as ImageIcon } from "lucide-react";
import { ChatMessage } from "./ChatMessage";
import { ChatQuestion } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ChatPanelProps {
  sessionId: Id<"studentSessions"> | null;
  questionId: Id<"questions"> | undefined;
  question: ChatQuestion | undefined;
  questions: ChatQuestion[];
}

export function ChatPanel({
  sessionId,
  questionId,
  question,
  questions,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [rateLimitInfo, setRateLimitInfo] = useState<{
    scope: "minute" | "day";
    retryAfterMs: number;
    limit: number;
    retryAt: number;
  } | null>(null);
  const [retryCountdownMs, setRetryCountdownMs] = useState(0);
  const [previewAttachment, setPreviewAttachment] = useState<{
    name: string;
    type: string;
    url?: string;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  type RateLimitResponse = {
    rateLimited?: {
      scope: "minute" | "day";
      retryAfterMs: number;
      limit: number;
    };
  };

  type AttachmentPreview = {
    name: string;
    type: string;
    url?: string;
  };

  // Live chat data for current question
  const chatHistory = useQuery(
    api.chat.getSessionChatHistory,
    sessionId ? { sessionId, includeAttachments: true } : "skip",
  );
  type ChatHistoryItem = NonNullable<typeof chatHistory>[number];
  const [displayMessages, setDisplayMessages] = useState<ChatHistoryItem[]>(
    [],
  );

  const addFiles = (files: File[]) => {
    if (!files.length) return;
    setAttachedFiles((prev) => {
      const remainingSlots = Math.max(0, 3 - prev.length);
      return [...prev, ...files.slice(0, remainingSlots)];
    });
  };

  // Helper to get question number from questionId
  const getQuestionNumber = (qId: Id<"questions">) => {
    return questions.find((q) => q._id === qId)?.questionNumber;
  };

  const sendMessage = useAction(api.chat.sendMessageToTutor);
  const warmTutor = useAction(api.chat.warmTutorClient);
  const isInitialMount = useRef(true);
  const hasWarmedTutorClient = useRef(false);

  // Sync live query results into local display list (resets on question change)
  useEffect(() => {
    setDisplayMessages(chatHistory ?? []);
  }, [chatHistory, questionId]);

  const lastChatQuestionId =
    displayMessages.length > 0
      ? displayMessages[displayMessages.length - 1]?.questionId
      : null;

  // Scroll to bottom on new messages or question change (for divider visibility)
  useEffect(() => {
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({
        behavior: "instant",
      });
      isInitialMount.current = false;
    }, 50);
    return () => clearTimeout(timer);
  }, [displayMessages, questionId]);

  // Warm the tutor client on mount to reduce first-turn latency
  useEffect(() => {
    if (!sessionId || !questionId || hasWarmedTutorClient.current) return;
    hasWarmedTutorClient.current = true;
    warmTutor({}).catch((err) =>
      console.warn("Failed to warm tutor client", err),
    );
  }, [sessionId, questionId, warmTutor]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  // Track rate limit countdown
  useEffect(() => {
    if (!rateLimitInfo) {
      setRetryCountdownMs(0);
      return;
    }
    const updateCountdown = () => {
      const remaining = rateLimitInfo.retryAt - Date.now();
      setRetryCountdownMs(Math.max(0, remaining));
    };
    updateCountdown();
    const timer = setInterval(updateCountdown, 500);
    return () => clearInterval(timer);
  }, [rateLimitInfo]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    addFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!sessionId || !questionId) return;
    const items = Array.from(e.dataTransfer?.items || []);
    const hasFiles = items.some((item) => item.kind === "file");
    if (hasFiles) {
      e.preventDefault();
      setIsDraggingOver(true);
    } else {
      setIsDraggingOver(false);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  // Ensure drag overlay clears even if the drag leaves the window or is canceled
  useEffect(() => {
    const clearDrag = () => setIsDraggingOver(false);
    window.addEventListener("dragend", clearDrag);
    window.addEventListener("drop", clearDrag);
    window.addEventListener("dragleave", clearDrag);
    return () => {
      window.removeEventListener("dragend", clearDrag);
      window.removeEventListener("drop", clearDrag);
      window.removeEventListener("dragleave", clearDrag);
    };
  }, []);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (!sessionId || !questionId) return;
    const files = Array.from(e.dataTransfer.files || []);
    addFiles(files);
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
    if (
      (!input.trim() && attachedFiles.length === 0) ||
      !sessionId ||
      !questionId ||
      isSending ||
      (rateLimitInfo && retryCountdownMs > 0)
    )
      return;

    const rawInput = input;
    const messageToSend = rawInput.trim() || "Here's my work:";
    setInput(""); // Clear immediately so the box empties as soon as the user sends
    setIsSending(true);
    setRateLimitInfo(null);

    const filesToSend = attachedFiles;
    const optimisticId = `optimistic-${Date.now()}-${Math.random().toString(16).slice(2)}` as unknown as Id<"chatMessages">;
    const optimisticMessage: ChatHistoryItem = {
      _id: optimisticId,
      _creationTime: Date.now(),
      sessionId,
      questionId,
      role: "student" as const,
      content: messageToSend,
      timestamp: Date.now(),
    };
    let optimisticAdded = false;

    try {
      setDisplayMessages((prev) => {
        optimisticAdded = true;
        return [...prev, optimisticMessage];
      });

      // Convert files to base64 for sending to LLM
      const fileData = await Promise.all(
        filesToSend.map(async (file) => ({
          name: file.name,
          type: file.type,
          data: await fileToBase64(file),
        })),
      );

      // Clear bottom-row attachments immediately
      setAttachedFiles([]);

      const response = (await sendMessage({
        sessionId,
        questionId,
        message: messageToSend,
        files: fileData.length > 0 ? fileData : undefined,
      })) as RateLimitResponse;

      if (response?.rateLimited) {
        const info = response.rateLimited;
        setRateLimitInfo({
          ...info,
          retryAt: Date.now() + info.retryAfterMs,
        });
        // Restore attachments for retry
        setAttachedFiles(filesToSend);
        setInput(rawInput);
        // Remove optimistic bubble
        if (optimisticAdded) {
          setDisplayMessages((prev) =>
            prev.filter((m) => m._id !== optimisticId),
          );
        }
        return;
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      setInput(rawInput);
      // Remove optimistic bubble on failure
      if (optimisticAdded) {
        setDisplayMessages((prev) =>
          prev.filter((m) => m._id !== optimisticId),
        );
      }
    } finally {
      setIsSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const renderPreviewContent = (att: AttachmentPreview) => {
    if (!att.url) return null;
    if (att.type.startsWith("image/")) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={att.url}
          alt={att.name}
          className="w-full h-auto rounded-md"
        />
      );
    }
    if (att.type === "application/pdf") {
      return (
        <iframe
          src={att.url}
          className="w-full h-full rounded-md"
          title={att.name}
        />
      );
    }
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <FileText className="h-10 w-10 mb-3" />
        <p className="mb-2 text-sm">
          Preview not available for this file type.
        </p>
        <a
          href={att.url}
          download={att.name}
          className="text-primary underline"
        >
          Download to view
        </a>
      </div>
    );
  };

  if (!sessionId || !questionId) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground p-4">
        <p className="text-sm">Enter your name to start</p>
      </div>
    );
  }

  return (
    <>
      <div
        className="h-full flex flex-col relative min-h-0 min-w-0 flex-1 w-full"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onDragEnd={() => setIsDraggingOver(false)}
      >
        {isDraggingOver && (
          <div className="absolute inset-0 z-20 m-4 rounded-lg bg-background/90 border-2 border-dashed border-primary flex items-center justify-center pointer-events-none shadow-lg">
            <span className="text-sm font-medium text-foreground px-4 py-3">
              Drop files to attach to your message
            </span>
          </div>
        )}
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 pb-1.5 pt-2 min-h-0 min-w-0">
          {chatHistory === undefined ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <div className="text-sm">Loading chat…</div>
            </div>
          ) : displayMessages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted-foreground text-sm text-center px-6">
              Start the conversation for this question by sending a message or attaching a file.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {displayMessages.map((msg, index) => {
                const prevMsg = index > 0 ? displayMessages[index - 1] : null;
                const nextMsg =
                  index < displayMessages.length - 1
                    ? displayMessages[index + 1]
                    : null;
                const showDivider =
                  prevMsg && prevMsg.questionId !== msg.questionId;
                const questionNum = getQuestionNumber(msg.questionId);

                // Show Rio only on the last tutor message
                const isLastTutorMessage =
                  msg.role === "tutor" &&
                  !displayMessages
                    .slice(index + 1)
                    .some((m) => m.role === "tutor");

                // Check if this is the last message from this sender (next message is different role or doesn't exist)
                const isLastFromSender = !nextMsg || nextMsg.role !== msg.role;

                return (
                  <div key={msg._id}>
                    {showDivider && (
                      <div className="flex items-center gap-3 py-2">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-xs text-muted-foreground font-medium px-2">
                          Question {questionNum}
                        </span>
                        <div className="flex-1 h-px bg-border" />
                      </div>
                    )}
                    <ChatMessage
                      message={msg}
                      showRio={isLastTutorMessage}
                      isLastFromSender={isLastFromSender}
                      isSending={isSending}
                      onAttachmentClick={(att) => setPreviewAttachment(att)}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {rateLimitInfo && (
            <div className="flex items-start gap-3 px-2">
              <div className="rounded-2xl bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 px-3 py-2 text-sm shadow-sm">
                <div className="font-medium">
                  You&apos;re sending messages too quickly (limit{" "}
                  {rateLimitInfo.limit} per{" "}
                  {rateLimitInfo.scope === "minute" ? "minute" : "day"}).
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span>
                    {retryCountdownMs > 0
                      ? `Try again in ${Math.ceil(retryCountdownMs / 1000)}s.`
                      : "You can retry now."}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleSend}
                    disabled={isSending || retryCountdownMs > 0}
                    className="h-8"
                  >
                    {retryCountdownMs > 0
                      ? `Retry in ${Math.ceil(retryCountdownMs / 1000)}s`
                      : "Retry"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {question &&
            displayMessages &&
            lastChatQuestionId &&
            lastChatQuestionId !== questionId && (
              <div className="flex items-center gap-3 py-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground font-medium px-2">
                  Question {question.questionNumber}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
            )}

          {/* Show divider for current question if no messages yet or different from last message */}
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
        <div className="border-t px-[0.5625rem] py-[0.5625rem] bg-background">
          <div className="flex gap-[0.5625rem] items-center">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.pptx,.ppt"
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
            />
            <Button
              onClick={handleSend}
              disabled={
                (!input.trim() && attachedFiles.length === 0) ||
                isSending ||
                (!!rateLimitInfo && retryCountdownMs > 0)
              }
              size="icon"
              className="h-10 w-10 shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Close chat container */}
      </div>

      <Dialog
        open={!!previewAttachment}
        onOpenChange={(open) => {
          if (!open) setPreviewAttachment(null);
        }}
      >
        <DialogContent
          className="!max-w-none flex flex-col"
          style={{ width: "80vw", height: "85vh" }}
        >
          <DialogHeader>
            <DialogTitle className="truncate pr-8">
              {previewAttachment?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto">
            {previewAttachment && renderPreviewContent(previewAttachment)}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
