/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  BookOpen,
  Send,
  Settings,
  Users,
  MapPin,
  Sword,
  Scroll,
  Brain,
  Zap,
  Sparkles,
  Plus,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Paperclip,
  Image as ImageIcon,
  Film,
  FileText,
  X,
  Edit2,
  Check,
  RefreshCw,
  Copy,
  List,
  ArrowDown,
  ChevronDown,
  ChevronUp,
  Square,
  LogOut,
  LogIn,
  Cloud,
  CloudOff,
  Download,
  Upload,
  Folder,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import Markdown from "react-markdown";
import { motion, AnimatePresence } from "motion/react";
import { get, set } from "idb-keyval";
import {
  generateStoryResponse,
  LoreItem,
  StorySettings,
  suggestDraftName,
  Attachment,
  generateStoryResponseStream,
  TimelineEvent,
} from "./lib/gemini";
import { extractTextFromPDF } from "./lib/pdf";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const compressImage = (
  file: File,
  maxWidth: number = 800,
  maxHeight: number = 800,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl); // Clean up memory immediately

      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      if (height > maxHeight) {
        width = Math.round((width * maxHeight) / height);
        height = maxHeight;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };

    img.onerror = (error) => {
      URL.revokeObjectURL(objectUrl);
      reject(error);
    };

    img.src = objectUrl;
  });
};

interface Message {
  id: string;
  role: "user" | "model";
  content: string;
  thinking?: string;
  attachments?: Attachment[];
}

const ThinkingBox = ({
  thinking,
  isGenerating,
}: {
  thinking: string;
  isGenerating?: boolean;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasAutoExpanded = useRef(false);

  // Auto-expand while generating if there's thinking content, but only once
  useEffect(() => {
    if (isGenerating && thinking && !hasAutoExpanded.current) {
      setIsExpanded(true);
      hasAutoExpanded.current = true;
    }
  }, [isGenerating, thinking]);

  if (!thinking && !isGenerating) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#1e1e1e] overflow-hidden mb-4 max-w-3xl">
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-blue-400" />
          <span className="font-medium text-sm text-white/90">
            Internal Planning Mode
          </span>
        </div>
        <div className="flex items-center gap-2 text-white/40">
          {isExpanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 py-4 text-sm text-white/80 whitespace-pre-wrap markdown-body border-t border-white/5 bg-[#1e1e1e]">
          {thinking ? (
            <Markdown>{thinking}</Markdown>
          ) : (
            <span className="animate-pulse">Analyzing...</span>
          )}
        </div>
      )}
    </div>
  );
};

const MessageItem = React.memo(
  ({
    message,
    settings,
    editingMessageId,
    cancelEditing,
    saveEdit,
    copyToClipboard,
    startEditing,
    deleteMessage,
    copiedMessageId,
    isGenerating,
  }: {
    message: Message;
    settings: StorySettings;
    editingMessageId: string | null;
    cancelEditing: () => void;
    saveEdit: (type: "keep" | "rewrite", newContent: string) => void;
    copyToClipboard: (message: Message, isMarkdown: boolean) => void;
    startEditing: (message: Message) => void;
    deleteMessage: (id: string) => void;
    copiedMessageId: string | null;
    isGenerating?: boolean;
  }) => {
    const isEditing = editingMessageId === message.id;
    const [localEditContent, setLocalEditContent] = useState("");

    useEffect(() => {
      if (isEditing) {
        setLocalEditContent(message.content);
      }
    }, [isEditing, message.content]);

    return (
      <div
        id={`msg-${message.id}`}
        className={cn(
          "max-w-4xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500 group/msg",
          message.role === "user" ? "flex flex-col items-end" : "",
        )}
      >
        {isEditing ? (
          <div
            className={cn(
              "w-full p-6 lg:p-8 rounded-3xl border bg-white/5 border-white/20 space-y-4",
              message.role === "user" ? "max-w-[90%]" : "",
            )}
          >
            <textarea
              value={localEditContent}
              onChange={(e) => setLocalEditContent(e.target.value)}
              className="w-full bg-white/5 border border-white/20 rounded-xl p-4 text-white outline-none focus:border-orange-500/50 min-h-[150px] resize-none text-base lg:text-lg"
            />
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                onClick={cancelEditing}
                className="px-4 py-2 text-sm font-bold text-white/40 hover:text-white transition-all"
              >
                Hủy
              </button>
              <button
                onClick={() => saveEdit("keep", localEditContent)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-bold rounded-lg flex items-center gap-2 transition-all"
              >
                <Check className="w-4 h-4" />
                Giữ nguyên
              </button>
              <button
                onClick={() => saveEdit("rewrite", localEditContent)}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg flex items-center gap-2 transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                Viết lại
              </button>
            </div>
          </div>
        ) : (
          <div className="relative w-full">
            <div className="absolute -top-4 right-0 opacity-0 group-hover/msg:opacity-100 transition-all flex gap-1 z-10">
              <button
                onClick={() => copyToClipboard(message, false)}
                className="p-2 text-white/20 hover:text-orange-400 transition-all rounded-lg hover:bg-white/10 bg-black/40 backdrop-blur-sm flex items-center gap-1"
                title="Copy Text"
              >
                {copiedMessageId === `${message.id}-text` ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                <span className="text-[10px] uppercase font-bold">Text</span>
              </button>
              <button
                onClick={() => copyToClipboard(message, true)}
                className="p-2 text-white/20 hover:text-orange-400 transition-all rounded-lg hover:bg-white/10 bg-black/40 backdrop-blur-sm flex items-center gap-1"
                title="Copy Markdown"
              >
                {copiedMessageId === `${message.id}-md` ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                <span className="text-[10px] uppercase font-bold">MD</span>
              </button>
              <button
                onClick={() => startEditing(message)}
                className="p-2 text-white/20 hover:text-orange-400 transition-all rounded-lg hover:bg-white/10 bg-black/40 backdrop-blur-sm"
                title="Chỉnh sửa"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => deleteMessage(message.id)}
                className="p-2 text-white/20 hover:text-red-400 transition-all rounded-lg hover:bg-white/10 bg-black/40 backdrop-blur-sm"
                title="Xóa"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {message.role === "user" ? (
              <div className="flex flex-col items-end gap-2 max-w-[90%] sm:max-w-[80%] ml-auto">
                {message.attachments && message.attachments.length > 0 && (
                  <div className="flex flex-wrap justify-end gap-2 mb-1">
                    {message.attachments.map((att) => (
                      <div key={att.id} className="relative group">
                        {att.type === "image" ? (
                          <img
                            src={`data:${att.mimeType};base64,${att.data}`}
                            alt={att.name}
                            className="w-32 h-32 object-cover rounded-xl border border-white/10"
                          />
                        ) : att.type === "video" ? (
                          <div className="w-32 h-32 bg-white/5 rounded-xl border border-white/10 flex items-center justify-center">
                            <Film className="w-8 h-8 text-white/40" />
                          </div>
                        ) : (
                          <div className="px-3 py-2 bg-white/5 rounded-xl border border-white/10 flex items-center gap-2 text-xs">
                            <FileText className="w-4 h-4 text-orange-500" />
                            <span className="truncate max-w-[100px]">
                              {att.name}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="bg-white/5 border border-white/10 px-4 lg:px-6 py-2 lg:py-3 rounded-2xl text-white/80 text-sm lg:text-base">
                  {message.content}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {(message.thinking || isGenerating) && (
                    <ThinkingBox
                      thinking={message.thinking || ""}
                      isGenerating={isGenerating}
                    />
                  )}
                {message.content ? (
                  <div
                    id={`msg-content-${message.id}`}
                    className="story-content markdown-body text-base lg:text-xl"
                  >
                    <Markdown>{message.content}</Markdown>
                  </div>
                ) : isGenerating &&
                  (!message.thinking || !settings.deepThinking) ? (
                  <div className="flex items-center gap-2 text-white/50 py-2">
                    <div
                      className="w-2 h-2 bg-orange-500 rounded-full animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <div
                      className="w-2 h-2 bg-orange-500 rounded-full animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <div
                      className="w-2 h-2 bg-orange-500 rounded-full animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>
    );
  },
);

const ChatInput = React.memo(
  ({
    onSend,
    onStop,
    isLoading,
    pendingAttachments,
    handleFileUpload,
    removeAttachment,
    settings,
    setSettings,
  }: {
    onSend: (input: string) => void;
    onStop: () => void;
    isLoading: boolean;
    pendingAttachments: Attachment[];
    handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    removeAttachment: (id: string) => void;
    settings: StorySettings;
    setSettings: React.Dispatch<React.SetStateAction<StorySettings>>;
  }) => {
    const [localInput, setLocalInput] = useState(() => localStorage.getItem("chat_input_draft") || "");

    useEffect(() => {
      const timer = setTimeout(() => {
        localStorage.setItem("chat_input_draft", localInput);
      }, 500);
      return () => clearTimeout(timer);
    }, [localInput]);

    const handleSend = () => {
      if ((!localInput.trim() && pendingAttachments.length === 0) || isLoading)
        return;
      onSend(localInput);
      setLocalInput("");
      localStorage.removeItem("chat_input_draft");
    };

    return (
      <div className="p-4 lg:p-6 bg-gradient-to-t from-[#0a0502] to-transparent">
        <div className="max-w-4xl mx-auto space-y-4">
          {pendingAttachments.length > 0 && (
            <div className="flex flex-wrap gap-3 p-3 bg-white/5 rounded-2xl border border-white/10">
              {pendingAttachments.map((att) => (
                <div key={att.id} className="relative group">
                  {att.type === "image" ? (
                    <img
                      src={`data:${att.mimeType};base64,${att.data}`}
                      alt={att.name}
                      className="w-20 h-20 object-cover rounded-xl border border-white/10"
                    />
                  ) : att.type === "video" ? (
                    <div className="w-20 h-20 bg-white/10 rounded-xl border border-white/10 flex items-center justify-center">
                      <Film className="w-6 h-6 text-white/40" />
                    </div>
                  ) : (
                    <div className="px-3 py-2 bg-white/10 rounded-xl border border-white/10 flex items-center gap-2 text-xs">
                      <FileText className="w-4 h-4 text-orange-500" />
                      <span className="truncate max-w-[100px]">{att.name}</span>
                    </div>
                  )}
                  <button
                    onClick={() => removeAttachment(att.id)}
                    className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-lg"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="relative">
            <textarea
              value={localInput}
              onChange={(e) => setLocalInput(e.target.value)}
              placeholder="Viết tiếp câu chuyện... (Dán link hoặc đính kèm file)"
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 lg:px-6 py-3 lg:py-4 pr-24 lg:pr-28 focus:outline-none focus:border-orange-500/50 transition-colors resize-none h-24 lg:h-32 text-base lg:text-lg"
            />
            <div className="absolute right-2 lg:right-4 bottom-2 lg:bottom-4 flex items-center gap-2">
              <label className="p-2.5 lg:p-3 bg-white/5 hover:bg-white/10 text-white/60 rounded-xl cursor-pointer transition-all border border-white/10">
                <Paperclip className="w-4 h-4 lg:w-5 lg:h-5" />
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileUpload}
                  accept="image/*,video/*,.pdf,.txt,.doc,.docx"
                />
              </label>
              {isLoading ? (
                <button
                  onClick={onStop}
                  className="p-2.5 lg:p-3 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-all shadow-lg shadow-red-500/20"
                  title="Dừng lại"
                >
                  <Square className="w-4 h-4 lg:w-5 lg:h-5 fill-current" />
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={
                    !localInput.trim() && pendingAttachments.length === 0
                  }
                  className="p-2.5 lg:p-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:hover:bg-orange-500 text-white rounded-xl transition-all shadow-lg shadow-orange-500/20"
                >
                  <Send className="w-4 h-4 lg:w-5 lg:h-5" />
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-4">
          <div className="flex flex-wrap justify-center bg-white/5 rounded-full p-0.5 w-full sm:w-auto">
            {[
              { id: "flash", icon: Zap, label: "Flash (Tốc độ)" },
              { id: "normal", icon: Sparkles, label: "Flash (Ép xung)" },
              { id: "pro", icon: BookOpen, label: "Pro (Deep Narrative)" },
            ].map((mode) => (
              <button
                key={mode.id}
                onClick={() =>
                  setSettings((s) => ({ ...s, mode: mode.id as any }))
                }
                className={cn(
                  "px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-bold flex items-center gap-1.5 transition-all text-center justify-center flex-1 sm:flex-none",
                  settings.mode === mode.id
                    ? "bg-white/10 text-white"
                    : "text-white/40 hover:text-white/60",
                )}
              >
                <mode.icon className="w-3 h-3 shrink-0" />
                <span className="whitespace-nowrap">{mode.label}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() =>
              setSettings((s) => ({ ...s, deepThinking: !s.deepThinking }))
            }
            className={cn(
              "px-4 py-1.5 rounded-full text-[10px] sm:text-xs font-bold flex items-center justify-center gap-1.5 transition-all w-full sm:w-auto",
              settings.deepThinking
                ? "bg-orange-500 text-white"
                : "bg-white/5 text-white/40",
            )}
          >
            <Brain className="w-3 h-3 shrink-0" />
            <span className="whitespace-nowrap">Deep Thinking</span>
          </button>
        </div>
      </div>
    );
  },
);

const LoreItemCard = React.memo(
  ({
    item,
    activeLoreTab,
    onUpdate,
    onDelete,
    onImageUpload,
  }: {
    item: LoreItem;
    activeLoreTab: LoreItem["type"];
    onUpdate: (id: string, updates: Partial<LoreItem>) => void;
    onDelete: (id: string) => void;
    onImageUpload: (id: string, e: React.ChangeEvent<HTMLInputElement>) => void;
  }) => {
    const [localName, setLocalName] = useState(item.name);
    const [localDescription, setLocalDescription] = useState(item.description);
    const [tagInput, setTagInput] = useState("");
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Sync local state with item if it changes from outside
    useEffect(() => {
      setLocalName(item.name);
      setLocalDescription(item.description);
    }, [item.id]);

    const debouncedUpdate = (updates: Partial<LoreItem>) => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        onUpdate(item.id, updates);
      }, 500);
    };

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setLocalName(val);
      debouncedUpdate({ name: val });
    };

    const handleDescriptionChange = (
      e: React.ChangeEvent<HTMLTextAreaElement>,
    ) => {
      const val = e.target.value;
      setLocalDescription(val);
      debouncedUpdate({ description: val });
    };

    const addTag = () => {
      if (!tagInput.trim()) return;
      const newTags = Array.from(
        new Set([...(item.tags || []), tagInput.trim()]),
      );
      onUpdate(item.id, { tags: newTags });
      setTagInput("");
    };

    const removeTag = (tag: string) => {
      const newTags = (item.tags || []).filter((t) => t !== tag);
      onUpdate(item.id, { tags: newTags });
    };

    const handleTagKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addTag();
      }
    };

    return (
      <div className="p-6 bg-white/5 rounded-2xl border border-white/10 space-y-4 group relative">
        <div className="flex justify-between items-start">
          <div className="flex-1 space-y-4">
            <input
              value={localName}
              onChange={handleNameChange}
              placeholder="Tên..."
              className="bg-transparent text-xl font-bold text-white outline-none w-full border-b border-white/10 pb-1 focus:border-orange-500/50 transition-all"
            />

            {activeLoreTab === "character" && (
              <div className="flex gap-4 items-start">
                <div className="flex flex-col gap-2 items-center">
                  <div className="relative w-24 h-24 rounded-xl bg-white/5 border border-white/10 overflow-hidden flex-shrink-0">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={localName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/20">
                        <Users className="w-8 h-8" />
                      </div>
                    )}
                  </div>
                  <label className="cursor-pointer px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-medium flex items-center gap-2 transition-all">
                    <ImageIcon className="w-4 h-4" />
                    {item.imageUrl ? "Đổi ảnh" : "Thêm ảnh"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => onImageUpload(item.id, e)}
                    />
                  </label>
                </div>
                <textarea
                  value={localDescription}
                  onChange={handleDescriptionChange}
                  placeholder="Mô tả chi tiết ngoại hình, tính cách..."
                  className="bg-transparent text-sm text-white/60 outline-none w-full resize-none min-h-[150px]"
                />
              </div>
            )}

            {activeLoreTab !== "character" && (
              <textarea
                value={localDescription}
                onChange={handleDescriptionChange}
                placeholder="Mô tả chi tiết..."
                className="bg-transparent text-sm text-white/60 outline-none w-full resize-none min-h-[150px]"
              />
            )}

            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {(item.tags || []).map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-1 bg-orange-500/20 text-orange-400 text-[10px] font-bold uppercase tracking-wider rounded flex items-center gap-1 group/tag"
                  >
                    {tag}
                    <button
                      onClick={() => removeTag(tag)}
                      className="hover:text-white transition-all"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  placeholder="Thêm tag (VD: Thế giới A, Sci-Fi...)"
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-orange-500/50 flex-1"
                />
                <button
                  onClick={addTag}
                  className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-all"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
          <button
            onClick={() => onDelete(item.id)}
            className="p-2 text-white/20 hover:text-red-400 transition-all"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  },
);

const LoreMemoryModal = React.memo(
  ({
    isOpen,
    onClose,
    lore,
    activeLoreTab,
    setActiveLoreTab,
    onAdd,
    onUpdate,
    onDelete,
    onImageUpload,
    onManualSave,
    isSavingLore,
    activeTags,
    setActiveTags,
  }: {
    isOpen: boolean;
    onClose: () => void;
    lore: LoreItem[];
    activeLoreTab: LoreItem["type"];
    setActiveLoreTab: (tab: LoreItem["type"]) => void;
    onAdd: () => string;
    onUpdate: (id: string, updates: Partial<LoreItem>) => void;
    onDelete: (id: string) => void;
    onImageUpload: (id: string, e: React.ChangeEvent<HTMLInputElement>) => void;
    onManualSave: (e: React.MouseEvent) => void;
    isSavingLore: boolean;
    activeTags: string[];
    setActiveTags: (tags: string[]) => void;
  }) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedLoreId, setSelectedLoreId] = useState<string | null>(null);

    const hasUntagged = lore.some(item => !item.tags || item.tags.length === 0);
    const allTags = Array.from(
      new Set(lore.flatMap((item) => item.tags || [])),
    );
    if (hasUntagged && !allTags.includes("Chưa phân loại")) {
      allTags.push("Chưa phân loại");
    }

    const toggleTag = (tag: string) => {
      if (activeTags.includes(tag)) {
        setActiveTags(activeTags.filter((t) => t !== tag));
      } else {
        setActiveTags([...activeTags, tag]);
      }
    };

    const filteredLore = lore
      .filter((item) => item.type === activeLoreTab)
      .filter((item) => 
        searchQuery ? 
          item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
          item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (item.tags && item.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase())))
        : true
      );

    const groupedLore: Record<string, LoreItem[]> = {};
    const UNTAGGED = "Chưa phân loại";

    filteredLore.forEach(item => {
      if (!item.tags || item.tags.length === 0) {
        if (!groupedLore[UNTAGGED]) groupedLore[UNTAGGED] = [];
        groupedLore[UNTAGGED].push(item);
      } else {
        item.tags.forEach(tag => {
          if (!groupedLore[tag]) groupedLore[tag] = [];
          groupedLore[tag].push(item);
        });
      }
    });

    const selectedLoreItem = lore.find(item => item.id === selectedLoreId);

    // If activeLoreTab changes, clear selection if the selected item is not in this tab
    useEffect(() => {
      if (selectedLoreItem && selectedLoreItem.type !== activeLoreTab) {
        setSelectedLoreId(null);
      }
    }, [activeLoreTab, selectedLoreItem]);

    return (
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="fixed inset-0 md:inset-20 z-50 glass-panel flex flex-col overflow-hidden max-h-[100dvh]"
            >
              <div className="p-4 md:p-6 border-b border-white/10 flex items-center justify-between shrink-0 pt-[env(safe-area-inset-top,16px)]">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 md:w-6 md:h-6 text-orange-500" />
                  <h2 className="font-serif text-xl md:text-2xl font-bold">Lore Memory</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onManualSave}
                    className={cn(
                      "px-3 md:px-4 py-1.5 md:py-2 text-white text-xs md:text-sm font-bold rounded-lg transition-all flex items-center gap-1 md:gap-2",
                      isSavingLore
                        ? "bg-green-500 hover:bg-green-600"
                        : "bg-orange-500 hover:bg-orange-600",
                    )}
                  >
                    {isSavingLore ? (
                      <>
                        <Check className="w-3 h-3 md:w-4 md:h-4" />
                        <span className="hidden sm:inline">Đã lưu</span>
                        <span className="sm:hidden">Lưu</span>
                      </>
                    ) : (
                      "Lưu"
                    )}
                  </button>
                  <button
                    onClick={onClose}
                    className="p-1 md:p-2 hover:bg-white/10 rounded-lg"
                  >
                    <ChevronRight className="w-5 h-5 md:w-6 md:h-6 rotate-90" />
                  </button>
                </div>
              </div>

              <div className="px-4 md:px-6 py-2 md:py-3 border-b border-white/10 bg-white/5 flex flex-wrap gap-2 items-center shrink-0">
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest mr-2">
                  Thế giới đang kích hoạt:
                </span>
                {allTags.length === 0 && (
                  <span className="text-[10px] text-white/20 italic">
                    Chưa có tag nào...
                  </span>
                )}
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-bold transition-all",
                      activeTags.includes(tag)
                        ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20"
                        : "bg-white/5 text-white/40 hover:bg-white/10",
                    )}
                  >
                    {tag}
                  </button>
                ))}
                {activeTags.length > 0 && (
                  <button
                    onClick={() => setActiveTags([])}
                    className="text-[10px] text-white/40 hover:text-white underline ml-2"
                  >
                    Bỏ chọn tất cả
                  </button>
                )}
              </div>

              <div className="flex overflow-x-auto border-b border-white/10 bg-white/5 shrink-0 custom-scrollbar pb-1">
                {[
                  { id: "character", icon: Users, label: "Nhân vật" },
                  { id: "location", icon: MapPin, label: "Địa điểm" },
                  { id: "item", icon: Sword, label: "Vật phẩm" },
                  { id: "lore", icon: Scroll, label: "Thế giới" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveLoreTab(tab.id as any)}
                    className={cn(
                      "flex-1 min-w-[80px] py-3 md:py-4 flex flex-col items-center gap-1 transition-all border-b-2",
                      activeLoreTab === tab.id
                        ? "border-orange-500 bg-white/5 text-orange-400"
                        : "border-transparent text-white/40 hover:text-white/60",
                    )}
                  >
                    <tab.icon className="w-4 h-4 md:w-5 md:h-5" />
                    <span className="text-[10px] md:text-xs uppercase tracking-wider font-bold">
                      {tab.label}
                    </span>
                  </button>
                ))}
              </div>

              <div className="px-4 md:px-6 py-3 md:py-4 border-b border-white/10 bg-black/40 flex gap-4 shrink-0">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input
                    type="text"
                    placeholder="Tìm kiếm Lore theo tên, mô tả hoặc tag..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white outline-none focus:border-orange-500/50 transition-all"
                  />
                </div>
              </div>

              <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0 relative">
                {/* Left Sidebar: Folder & Item List */}
                <div className={cn(
                  "w-full md:w-1/3 min-h-0 h-full border-r border-white/10 overflow-y-auto custom-scrollbar bg-black/20 p-4 space-y-2 flex-1 md:flex-none border-b md:border-b-0",
                  selectedLoreId ? "hidden md:flex flex-col" : "flex flex-col"
                )}>
                  {Object.keys(groupedLore).sort().map((folderName) => (
                    <details key={folderName} className="group" open>
                      <summary className="flex items-center gap-2 text-white/80 pb-2 cursor-pointer outline-none select-none hover:text-white transition-all list-none">
                        <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90 text-white/40" />
                        <Folder className="w-4 h-4 text-orange-500" />
                        <h3 className="font-bold text-sm">{folderName}</h3>
                        <span className="text-white/40 text-[10px]">({groupedLore[folderName].length})</span>
                      </summary>
                      <div className="flex flex-col space-y-1 pl-6 pb-2">
                        {groupedLore[folderName].map((item) => (
                          <button
                            key={item.id}
                            onClick={() => setSelectedLoreId(item.id)}
                            className={cn(
                              "text-left px-3 py-2 rounded-lg text-sm transition-all truncate",
                              selectedLoreId === item.id 
                                ? "bg-orange-500/20 text-orange-400 font-bold border border-orange-500/30" 
                                : "text-white/60 hover:bg-white/5 hover:text-white border border-transparent"
                            )}
                          >
                            {item.name}
                          </button>
                        ))}
                      </div>
                    </details>
                  ))}
                  <button
                    onClick={() => {
                      const newId = onAdd();
                      setSelectedLoreId(newId);
                    }}
                    className="w-full py-3 border border-dashed border-white/20 rounded-xl flex items-center justify-center gap-2 text-white/40 hover:text-white/80 hover:border-white/40 transition-all text-sm mt-4"
                  >
                    <Plus className="w-4 h-4" />
                    Thêm {activeLoreTab === "character" ? "nhân vật" : activeLoreTab === "location" ? "địa điểm" : activeLoreTab === "item" ? "vật phẩm" : "thông tin"} mới
                  </button>
                </div>

                {/* Right Content Area: LoreItemCard for selected item */}
                <div className={cn(
                  "flex-1 min-h-0 h-full overflow-y-auto custom-scrollbar p-4 md:p-6 bg-black/40 pb-[calc(2rem+env(safe-area-inset-bottom,0px))]",
                  !selectedLoreId ? "hidden md:flex flex-col" : "flex flex-col"
                )}>
                  {selectedLoreItem ? (
                    <div className="flex flex-col gap-4">
                      <button 
                        onClick={() => setSelectedLoreId(null)}
                        className="md:hidden flex items-center gap-2 text-white/60 hover:text-white transition-all text-sm font-bold bg-white/5 py-2 px-3 rounded-xl w-fit"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Danh sách
                      </button>
                      <LoreItemCard
                        key={selectedLoreItem.id}
                        item={selectedLoreItem}
                        activeLoreTab={activeLoreTab}
                        onUpdate={onUpdate}
                        onDelete={(id) => {
                          onDelete(id);
                          if (selectedLoreId === id) setSelectedLoreId(null);
                        }}
                        onImageUpload={onImageUpload}
                      />
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-white/20 space-y-4">
                      <BookOpen className="w-16 h-16 opacity-50" />
                      <p className="font-bold">Chọn một mục để xem chi tiết</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  },
);

interface Draft {
  id: string;
  title: string;
  messages: Message[];
  timeline?: TimelineEvent[];
  updatedAt: number;
  activeTags?: string[];
  draftSettings?: {
    writingStyle?: string;
    minWords?: number;
    maxWords?: number;
  };
}

function DebouncedTextarea({ value, onChange, ...props }: any) {
  const [localValue, setLocalValue] = useState(value);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalValue(e.target.value);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      onChange(e.target.value);
    }, 500);
  };

  return <textarea value={localValue} onChange={handleChange} {...props} />;
}

function DebouncedInput({ value, onChange, ...props }: any) {
  const [localValue, setLocalValue] = useState(value);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      onChange(e.target.value);
    }, 500);
  };

  return <input value={localValue} onChange={handleChange} {...props} />;
}

export default function App() {
  const [isStorageLoaded, setIsStorageLoaded] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState<string>("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [lore, setLore] = useState<LoreItem[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [settings, setSettings] = useState<StorySettings>({
    deepThinking: true,
    mode: "normal",
    autoSave: true,
    customSystemPrompt: "",
  });
  const [apiError, setApiError] = useState<string | null>(null);
  const [isPdfExtracting, setIsPdfExtracting] = useState(false);
  const [userApiKey, setUserApiKey] = useState(() => localStorage.getItem("USER_GEMINI_API_KEY") || "");
  const isApiKeyMissing = !process.env.GEMINI_API_KEY && !userApiKey;
  
  const handleSaveUserApiKey = (key: string) => {
    localStorage.setItem("USER_GEMINI_API_KEY", key);
    setUserApiKey(key);
    window.location.reload();
  };

  const stateRef = useRef({ drafts, messages, lore, timeline, activeTags, settings, currentDraftId, isStorageLoaded });
  useEffect(() => {
    stateRef.current = { drafts, messages, lore, timeline, activeTags, settings, currentDraftId, isStorageLoaded };
  }, [drafts, messages, lore, timeline, activeTags, settings, currentDraftId, isStorageLoaded]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && stateRef.current.isStorageLoaded) {
        const { drafts: currentDrafts, messages: currentMessages, lore: currentLore, timeline: currentTimeline, activeTags: currentActiveTags, settings: currentSettings, currentDraftId: currentId } = stateRef.current;
        const updatedDrafts = currentDrafts.map((d) => 
          d.id === currentId ? { ...d, messages: currentMessages, timeline: currentTimeline, activeTags: currentActiveTags, updatedAt: Date.now() } : d
        );
        // Fire-and-forget IDB saves
        set("storyDrafts", updatedDrafts).catch(() => {});
        set("storyLore", currentLore).catch(() => {});
        set("storySettings", currentSettings).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    const loadStorage = async () => {
      try {
        // Load settings
        const defaultSettings: StorySettings = {
          deepThinking: true,
          mode: "normal",
          autoSave: true,
          customSystemPrompt: "",
        };
        const savedSettings = await get("storySettings");
        if (savedSettings) {
          setSettings({ ...defaultSettings, ...savedSettings });
        } else {
          const localSettings = localStorage.getItem("storySettings");
          if (localSettings) {
            const parsed = JSON.parse(localSettings);
            setSettings({ ...defaultSettings, ...parsed });
            await set("storySettings", { ...defaultSettings, ...parsed });
          }
        }

        // Load global lore
        let savedLore = await get("storyLore");

        // Load drafts from IDB
        let loadedDrafts: any[] | undefined = await get("storyDrafts");

        // Fallback to localStorage for drafts if IDB is empty
        const localDraftsStr = localStorage.getItem("storyDrafts");
        let localDrafts: any[] = [];
        if (localDraftsStr) {
          try {
            localDrafts = JSON.parse(localDraftsStr);
          } catch (e) {}
        }

        // Combine sources for migration
        const migrationSources = [
          ...(Array.isArray(loadedDrafts) ? loadedDrafts : []),
          ...(Array.isArray(localDrafts) ? localDrafts : []),
        ];

        // Migration logic: if global lore is missing or empty, collect it from all available draft sources
        if (!savedLore || !Array.isArray(savedLore) || savedLore.length === 0) {
          const allLoreItems: LoreItem[] = [];
          const seenIds = new Set<string>();

          migrationSources.forEach((d: any) => {
            if (d && d.lore && Array.isArray(d.lore)) {
              d.lore.forEach((item: LoreItem) => {
                if (item && item.id && !seenIds.has(item.id)) {
                  allLoreItems.push(item);
                  seenIds.add(item.id);
                }
              });
            }
          });

          if (allLoreItems.length > 0) {
            savedLore = allLoreItems;
            await set("storyLore", allLoreItems);
            console.log(
              `Migrated ${allLoreItems.length} lore items from drafts.`,
            );
          }
        }

        if (savedLore && Array.isArray(savedLore)) {
          setLore(savedLore);
        }

        // Ensure loadedDrafts is populated for the rest of the logic
        if (!loadedDrafts || !Array.isArray(loadedDrafts) || loadedDrafts.length === 0) {
          loadedDrafts = localDrafts;
          if (loadedDrafts.length > 0) {
            await set("storyDrafts", loadedDrafts);
          }
        }

        if (
          loadedDrafts &&
          Array.isArray(loadedDrafts) &&
          loadedDrafts.length > 0
        ) {
          const sanitizedDrafts: Draft[] = loadedDrafts.map((d) => ({
            id: d.id,
            title: d.title,
            messages: Array.isArray(d.messages) ? d.messages : [],
            timeline: Array.isArray(d.timeline) ? d.timeline : [],
            updatedAt: d.updatedAt || Date.now(),
            activeTags: Array.isArray(d.activeTags) ? d.activeTags : [],
            draftSettings: d.draftSettings,
          }));
          setDrafts(sanitizedDrafts);

          let savedDraftId = await get("currentDraftId");
          if (!savedDraftId) {
            savedDraftId = localStorage.getItem("currentDraftId");
          }

          const current =
            sanitizedDrafts.find((d) => d.id === savedDraftId) ||
            sanitizedDrafts[0];
          setCurrentDraftId(current.id);
          setMessages(current.messages || []);
          setTimeline(current.timeline || []);
        } else {
          const initialDraft: Draft = {
            id: Date.now().toString(),
            title: "Bản thảo mới",
            messages: [],
            timeline: [],
            updatedAt: Date.now(),
          };
          setDrafts([initialDraft]);
          setCurrentDraftId(initialDraft.id);
          setMessages([]);
        }
      } catch (e) {
        console.error("Failed to load storage", e);
      } finally {
        setIsStorageLoaded(true);
      }
    };
    loadStorage();
  }, []);

  const currentDraft = drafts.find((d) => d.id === currentDraftId) ||
    drafts[0] || {
      id: "fallback",
      title: "Bản thảo mới",
      messages: [],
      updatedAt: Date.now(),
    };

  const [isLoading, setIsLoading] = useState(false);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoreOpen, setIsLoreOpen] = useState(false);
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);
  const [isChatTimelineOpen, setIsChatTimelineOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDraftSettingsOpen, setIsDraftSettingsOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [activeLoreTab, setActiveLoreTab] =
    useState<LoreItem["type"]>("character");
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>(
    [],
  );
  const restoreInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadBackup = async () => {
    try {
      const backupData = {
        drafts,
        lore,
        settings,
        version: 1,
        timestamp: Date.now()
      };
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `story-engine-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Failed to download backup", e);
      alert("Lỗi khi tải bản sao lưu.");
    }
  };

  const handleRestoreBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const backupData = JSON.parse(content);
        
        if (backupData.drafts && Array.isArray(backupData.drafts)) {
          setDrafts(backupData.drafts);
          await set("storyDrafts", backupData.drafts);
          if (backupData.drafts.length > 0) {
            setCurrentDraftId(backupData.drafts[0].id);
            setMessages(backupData.drafts[0].messages || []);
            setTimeline(backupData.drafts[0].timeline || []);
          }
        }
        if (backupData.lore && Array.isArray(backupData.lore)) {
          setLore(backupData.lore);
          await set("storyLore", backupData.lore);
        }
        if (backupData.settings) {
          setSettings(backupData.settings);
          await set("storySettings", backupData.settings);
        }
        
        alert("Khôi phục dữ liệu thành công!");
        setIsSettingsOpen(false);
      } catch (err) {
        console.error("Failed to restore backup", err);
        alert("File sao lưu không hợp lệ hoặc bị lỗi.");
      }
      // Reset input
      if (restoreInputRef.current) {
        restoreInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  const handleEmergencyRestore = async () => {
    try {
      const localStr = localStorage.getItem("storyDrafts");
      if (localStr) {
        const parsed = JSON.parse(localStr);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setDrafts(parsed);
          await set("storyDrafts", parsed);
          setCurrentDraftId(parsed[0].id);
          setMessages(parsed[0].messages || []);
          setTimeline(parsed[0].timeline || []);
          alert("Tuyệt vời! Đã tìm thấy và khôi phục dữ liệu từ bộ nhớ dự phòng (localStorage).");
          setIsSettingsOpen(false);
          return;
        }
      }
      alert("Rất tiếc, không tìm thấy dữ liệu dự phòng nào. Dữ liệu có thể đã bị ghi đè hoàn toàn. Thành thật xin lỗi bạn vì sự cố này :(");
    } catch (e) {
      alert("Có lỗi khi khôi phục dữ liệu.");
    }
  };

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [showDeleteDraftConfirm, setShowDeleteDraftConfirm] = useState(false);
  const [draftIdToDelete, setDraftIdToDelete] = useState<string | null>(null);

  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editingDraftTitle, setEditingDraftTitle] = useState("");

  const startDraftEditing = (id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingDraftId(id);
    setEditingDraftTitle(title);
  };
  
  const saveDraftEdit = (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) e.stopPropagation();
    if (editingDraftId && editingDraftTitle.trim()) {
      updateDraft(editingDraftId, { title: editingDraftTitle.trim() });
    }
    setEditingDraftId(null);
    setEditingDraftTitle("");
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [isSavingLore, setIsSavingLore] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  const copyToClipboard = (message: Message, isMarkdown: boolean) => {
    let textToCopy = message.content;
    if (!isMarkdown && message.role === "model") {
      const el = document.getElementById(`msg-content-${message.id}`);
      if (el) {
        textToCopy = el.innerText;
      }
    }
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedMessageId(`${message.id}-${isMarkdown ? "md" : "text"}`);
      setTimeout(() => setCopiedMessageId(null), 2000);
    });
  };

  const handleManualSaveLore = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      try {
        // 1. Create the updated drafts array
        const updatedDrafts = drafts.map((d) =>
          d.id === currentDraftId
            ? { ...d, messages, timeline, activeTags, updatedAt: Date.now() }
            : d,
        );

        // 2. Save both drafts and global lore
        await Promise.all([
          set("storyDrafts", updatedDrafts),
          set("storyLore", lore),
        ]);

        // 3. Update the React state
        setDrafts(updatedDrafts);
        setIsSavingLore(true);
        setTimeout(() => setIsSavingLore(false), 2000);
      } catch (error) {
        console.error("Save failed:", error);
        alert("Lỗi: Không thể lưu bản thảo. Vui lòng thử lại.");
      }
    },
    [drafts, currentDraftId, messages, lore, timeline, activeTags],
  );

  // Sync state with current draft when switching
  useEffect(() => {
    if (isStorageLoaded && currentDraft) {
      setMessages(currentDraft.messages || []);
      setTimeline(currentDraft.timeline || []);
      setActiveTags(currentDraft.activeTags || []);
      set("currentDraftId", currentDraftId).catch(console.error);
      setTimeout(scrollToBottom, 50);
    }
  }, [currentDraftId, isStorageLoaded]);

  // Persistence
  useEffect(() => {
    if (isStorageLoaded) {
      set("storyDrafts", drafts).catch((e) => {
        console.error("Failed to save drafts to idb-keyval", e);
      });
    }
  }, [drafts, isStorageLoaded]);

  useEffect(() => {
    if (isStorageLoaded) {
      set("storySettings", settings).catch((e) => {
        console.error("Failed to save settings to idb-keyval", e);
      });
    }
  }, [settings, isStorageLoaded]);

  useEffect(() => {
    if (isStorageLoaded) {
      set("storyLore", lore).catch((e) => {
        console.error("Failed to save lore to idb-keyval", e);
      });
    }
  }, [lore, isStorageLoaded]);

  // Auto-save logic
  useEffect(() => {
    if (settings.autoSave) {
      const timer = setTimeout(() => {
        updateDraft(currentDraftId, {
          messages,
          timeline,
          activeTags,
          updatedAt: Date.now(),
        });
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [messages, timeline, activeTags, settings.autoSave, currentDraftId]);

  const updateDraft = (id: string, updates: Partial<Draft>) => {
    setDrafts((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...updates } : d)),
    );
  };

  const createNewDraft = () => {
    // Save current draft before creating a new one
    updateDraft(currentDraftId, {
      messages,
      timeline,
      activeTags,
      updatedAt: Date.now(),
    });

    const newDraft: Draft = {
      id: Date.now().toString(),
      title: "Bản thảo mới",
      messages: [],
      timeline: [],
      updatedAt: Date.now(),
    };
    setDrafts((prev) => [newDraft, ...prev]);
    setCurrentDraftId(newDraft.id);
    setIsSidebarOpen(false);
  };

  const confirmDeleteDraft = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDraftIdToDelete(id);
    setShowDeleteDraftConfirm(true);
  };

  const executeDeleteDraft = () => {
    if (!draftIdToDelete) return;
    if (drafts.length <= 1) {
      setShowDeleteDraftConfirm(false);
      setDraftIdToDelete(null);
      return;
    }
    setDrafts((prev) => prev.filter((d) => d.id !== draftIdToDelete));
    if (currentDraftId === draftIdToDelete) {
      setCurrentDraftId(drafts.find((d) => d.id !== draftIdToDelete)!.id);
    }

    setShowDeleteDraftConfirm(false);
    setDraftIdToDelete(null);
  };

  const handleTimelinePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsPdfExtracting(true);
      const text = await extractTextFromPDF(file);
      
      const newLore: LoreItem = {
        id: Date.now().toString(),
        name: `PDF Trích xuất: ${file.name}`,
        type: "lore",
        description: text,
        tags: ["pdf-source", "timeline"],
      };

      setLore((prev) => [...prev, newLore]);
      setSettings((prev) => ({ ...prev, autoSave: true })); // trigger save
      
      alert(`Đã trích xuất xong ${file.name} và lưu vào Lore Memory.`);
    } catch (error) {
      console.error("PDF extraction error:", error);
      alert("Đã có lỗi khi phân tích PDF. Vui lòng thử lại.");
    } finally {
      setIsPdfExtracting(false);
      e.target.value = ""; // reset input
    }
  };

  const getErrorMessage = (error: any) => {
    let errorStr = "";
    try {
      errorStr = typeof error === "string" ? error : (error?.message || JSON.stringify(error));
    } catch(e) {
      errorStr = String(error);
    }

    if (errorStr.includes("403") || errorStr.includes("PERMISSION_DENIED")) {
      return "Lỗi xác thực (403). Bạn không có quyền thực hiện thao tác này.";
    }

    if (
      errorStr.includes("429") ||
      errorStr.includes("RESOURCE_EXHAUSTED") ||
      errorStr.toLowerCase().includes("quota") ||
      errorStr.toLowerCase().includes("rate limit")
    ) {
      return "Hệ thống đang bận xử lý nhiều yêu cầu cùng lúc. Vui lòng giữ nguyên màn hình, AI đang tự động thử lại sau vài giây...";
    }

    // Clean up generic API errors
    const sanitizedError = errorStr
      .replace("Failed to call the Gemini API:", "")
      .replace("user has exceeded quota.", "")
      .replace("Please try again later.", "")
      .replace(/\s+/g, " ")
      .trim();

    return sanitizedError || "Đã có lỗi xảy ra. AI đang cố gắng kết nối lại.";
  };

  const handleSend = async (textInput: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: textInput,
      attachments: [...pendingAttachments],
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    const currentInput = textInput;
    const currentAttachments = [...pendingAttachments];
    setPendingAttachments([]);
    setIsLoading(true);
    setRetryMessage(null);
    setApiError(null);

    // Auto-name draft if it's the first message
    if (messages.length === 0) {
      suggestDraftName(currentInput || "Bản thảo mới").then((name) => {
        updateDraft(currentDraftId, { title: name });
      });
    }

    abortControllerRef.current = new AbortController();

    const hasAnyTagsDefined = lore.some(item => item.tags && item.tags.length > 0);
    const filteredLore = lore.filter((item) => {
      if (activeTags.length === 0) return !hasAnyTagsDefined;
      const itemHasNoTags = !item.tags || item.tags.length === 0;
      if (itemHasNoTags) return activeTags.includes("Chưa phân loại");
      return item.tags.some((tag) => activeTags.includes(tag));
    });

    const aiMessageId = (Date.now() + 1).toString();
    try {
      const history = messages.map((m) => {
        const parts: any[] = [];
        if (m.content) {
          parts.push({ text: m.content });
        }
        if (m.attachments) {
          m.attachments.forEach((att) => {
            parts.push({
              inlineData: {
                mimeType: att.mimeType,
                data: att.data,
              },
            });
          });
        }
        if (parts.length === 0) {
          parts.push({ text: " " });
        }
        return {
          role: m.role,
          parts,
        };
      });

      const aiMessage: Message = {
        id: aiMessageId,
        role: "model",
        content: "",
        thinking: "",
      };

      setMessages((prev) => [...prev, aiMessage]);

      const activeDraft = drafts.find(d => d.id === currentDraftId);
      const combinedSettings = {
        ...settings,
        draftSettings: activeDraft?.draftSettings
      };

      const stream = await generateStoryResponseStream(
        currentInput,
        history,
        filteredLore,
        combinedSettings,
        currentAttachments,
        timeline,
        abortControllerRef.current.signal,
        (attempt, delay) => {
          setRetryMessage(`Hệ thống đang quá tải. Đang thử lại lần ${attempt}...`);
        }
      );

      setRetryMessage(null);
      let fullText = "";
      let fullThinking = "";

      for await (const chunk of stream) {
        if (abortControllerRef.current?.signal.aborted) {
          break;
        }

        const parts = chunk.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.thought && part.text) {
            fullThinking += part.text;
          } else if (!part.thought && part.text) {
            fullText += part.text;
          }
        }

        let thinking = fullThinking;
        let content = fullText;

        const thinkingLower = fullText.toLowerCase();
        const startTag = "[thinking]";
        const endTag = "[/thinking]";
        const startIndex = thinkingLower.indexOf(startTag);
        const endIndex = thinkingLower.indexOf(endTag);

        if (startIndex !== -1) {
          if (endIndex !== -1) {
            // Found both tags
            const extracted = fullText.substring(startIndex + startTag.length, endIndex).trim();
            thinking = (thinking ? thinking + "\n\n" : "") + extracted;
            content = (fullText.substring(0, startIndex) + fullText.substring(endIndex + endTag.length)).trim();
          } else {
            // Still thinking, no end tag yet
            const extracted = fullText.substring(startIndex + startTag.length).trim();
            thinking = (thinking ? thinking + "\n\n" : "") + extracted;
            content = fullText.substring(0, startIndex).trim();
          }
        }

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === aiMessageId ? { ...msg, content, thinking } : msg,
          ),
        );
      }

      if (!abortControllerRef.current?.signal.aborted && !fullText.trim() && fullThinking.trim()) {
        fullText = "_⚠️ Cảnh báo: Mô hình đã dừng lại trong quá trình suy nghĩ (có thể do giới hạn về output token hoặc timeout). Vui lòng gửi lại yêu cầu để tiếp tục._";
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === aiMessageId ? { ...msg, content: fullText, thinking: fullThinking } : msg,
          ),
        );
      }
    } catch (error: any) {
      if (error.name === "AbortError") {
        console.log("Generation stopped by user");
      } else {
        console.error("Error generating story:", error);
        setApiError(getErrorMessage(error));
        // Remove the empty AI message if it failed immediately and had no content/thoughts
        setMessages((prev) =>
          prev.filter((m) => m.id !== aiMessageId || m.content !== "" || m.thinking !== ""),
        );
      }
    } finally {
      setIsLoading(false);
      setRetryMessage(null);
      abortControllerRef.current = null;
    }
  };

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
    }
  };

  const addLoreItem = useCallback(() => {
    const id = Date.now().toString();
    const newItem: LoreItem = {
      id,
      name: "Mục mới",
      type: activeLoreTab,
      description: "Mô tả chi tiết...",
      imageUrl: "",
      updatedAt: Date.now(),
    };
    setLore((prev) => [...(prev || []), newItem]);
    return id;
  }, [activeLoreTab]);

  const updateLoreItem = useCallback(
    (id: string, updates: Partial<LoreItem>) => {
      setLore((prev) =>
        (prev || []).map((item) =>
          item.id === id
            ? { ...item, ...updates, updatedAt: Date.now() }
            : item,
        ),
      );
    },
    [],
  );

  const deleteLoreItem = useCallback(
    (id: string) => {
      setLore((prev) => (prev || []).filter((item) => item.id !== id));
    },
    [],
  );

  const addTimelineEvent = () => {
    const newEvent: TimelineEvent = {
      id: Date.now().toString(),
      title: "Sự kiện mới",
      description: "Mô tả sự kiện...",
      timestamp: Date.now(),
    };
    setTimeline((prev) => [...(prev || []), newEvent]);
  };

  const updateTimelineEvent = (id: string, updates: Partial<TimelineEvent>) => {
    setTimeline((prev) =>
      (prev || []).map((item) =>
        item.id === id ? { ...item, ...updates } : item,
      ),
    );
  };

  const deleteTimelineEvent = (id: string) => {
    setTimeline((prev) => (prev || []).filter((item) => item.id !== id));
  };

  const handleShare = () => {
    if (!shareEmail) return;
    // For now, just show a success message since we don't have a real email service yet
    // but we'll implement the UI for it
    alert(`Đã gửi link bản thảo tới: ${shareEmail}`);
    setIsShareOpen(false);
    setShareEmail("");
  };

  const deleteMessage = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const startEditing = useCallback((message: Message) => {
    setEditingMessageId(message.id);
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingMessageId(null);
  }, []);

  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const saveEdit = useCallback(async (option: "rewrite" | "keep", newContent: string) => {
    if (!editingMessageId) return;

    const currentMessages = messagesRef.current;
    const messageIndex = currentMessages.findIndex((m) => m.id === editingMessageId);
    if (messageIndex === -1) return;

    const updatedMessages = [...currentMessages];
    updatedMessages[messageIndex] = {
      ...updatedMessages[messageIndex],
      content: newContent,
    };

    if (option === "keep") {
      setMessages(updatedMessages);
      setEditingMessageId(null);
      return;
    }

    // Rewrite option: remove all messages after the edited one and trigger generation
    const truncatedMessages = updatedMessages.slice(0, messageIndex + 1);
    setMessages(truncatedMessages);
    setEditingMessageId(null);

    if (truncatedMessages[messageIndex].role === "user") {
      // Re-trigger handleSend logic but with the truncated history
      setIsLoading(true);
      setRetryMessage(null);
      setApiError(null);
      abortControllerRef.current = new AbortController();

      const hasAnyTagsDefined = lore.some(item => item.tags && item.tags.length > 0);
      const filteredLore = lore.filter((item) => {
        if (activeTags.length === 0) return !hasAnyTagsDefined;
        const itemHasNoTags = !item.tags || item.tags.length === 0;
        if (itemHasNoTags) return activeTags.includes("Chưa phân loại");
        return item.tags.some((tag) => activeTags.includes(tag));
      });

      const aiMessageId = (Date.now() + 1).toString();
      try {
        const history = truncatedMessages.slice(0, -1).map((m) => {
          const parts: any[] = [];
          if (m.content) {
            parts.push({ text: m.content });
          }
          if (m.attachments) {
            m.attachments.forEach((att) => {
              parts.push({
                inlineData: {
                  mimeType: att.mimeType,
                  data: att.data,
                },
              });
            });
          }
          if (parts.length === 0) {
            parts.push({ text: " " });
          }
          return {
            role: m.role,
            parts,
          };
        });

        const aiMessage: Message = {
          id: aiMessageId,
          role: "model",
          content: "",
          thinking: "",
        };

        setMessages((prev) => [...prev, aiMessage]);

        const stream = await generateStoryResponseStream(
          newContent, // fix: used to be editContent
          history,
          filteredLore,
          settings,
          truncatedMessages[messageIndex].attachments || [],
          timeline,
          abortControllerRef.current.signal,
          (attempt, delay) => {
            setRetryMessage(`Hệ thống đang quá tải. Đang thử lại lần ${attempt}...`);
          }
        );

        setRetryMessage(null);
        let fullText = "";
        let fullThinking = "";

        for await (const chunk of stream) {
          if (abortControllerRef.current?.signal.aborted) {
            break;
          }

          const parts = chunk.candidates?.[0]?.content?.parts || [];
          for (const part of parts) {
            if (part.thought && part.text) {
              fullThinking += part.text;
            } else if (!part.thought && part.text) {
              fullText += part.text;
            }
          }

          let thinking = fullThinking;
          let content = fullText;

          const thinkingLower = fullText.toLowerCase();
          const startTag = "[thinking]";
          const endTag = "[/thinking]";
          const startIndex = thinkingLower.indexOf(startTag);
          const endIndex = thinkingLower.indexOf(endTag);

          if (startIndex !== -1) {
            if (endIndex !== -1) {
              const extracted = fullText.substring(startIndex + startTag.length, endIndex).trim();
              thinking = (thinking ? thinking + "\n\n" : "") + extracted;
              content = (fullText.substring(0, startIndex) + fullText.substring(endIndex + endTag.length)).trim();
            } else {
              const extracted = fullText.substring(startIndex + startTag.length).trim();
              thinking = (thinking ? thinking + "\n\n" : "") + extracted;
              content = fullText.substring(0, startIndex).trim();
            }
          }

          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === aiMessageId ? { ...msg, content, thinking } : msg,
            ),
          );
        }

        if (!abortControllerRef.current?.signal.aborted && !fullText.trim() && fullThinking.trim()) {
          fullText = "_⚠️ Cảnh báo: Mô hình đã dừng lại trong quá trình suy nghĩ (có thể do giới hạn về output token hoặc timeout). Vui lòng nhấn nút Rewrite để thử lại._";
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === aiMessageId ? { ...msg, content: fullText, thinking: fullThinking } : msg,
            ),
          );
        }
      } catch (error: any) {
        if (error.name !== "AbortError") {
          console.error("Error rewriting story:", error);
          setApiError(getErrorMessage(error));
          // Remove the empty AI message if it failed immediately and had no content/thoughts
          setMessages((prev) =>
            prev.filter((m) => m.id !== aiMessageId || m.content !== "" || m.thinking !== ""),
          );
        }
      } finally {
        setIsLoading(false);
        setRetryMessage(null);
        abortControllerRef.current = null;
      }
    } else {
      // If model message was edited and "rewrite" chosen, maybe we should regenerate the model message itself?
      // "the model will rewrite the result based on what has been edited"
      // If I edit the model's last response, maybe I want it to try again?
      // Let's treat it as: if model message is edited, we regenerate the model message using the same prompt.
      let lastUserMessageIndex = -1;
      for (let i = messageIndex - 1; i >= 0; i--) {
        if (truncatedMessages[i].role === "user") {
          lastUserMessageIndex = i;
          break;
        }
      }
      if (lastUserMessageIndex !== -1) {
        const history = truncatedMessages
          .slice(0, lastUserMessageIndex)
          .map((m) => {
            const parts: any[] = [];
            if (m.content) {
              parts.push({ text: m.content });
            }
            if (m.attachments) {
              m.attachments.forEach((att) => {
                parts.push({
                  inlineData: {
                    mimeType: att.mimeType,
                    data: att.data,
                  },
                });
              });
            }
            if (parts.length === 0) {
              parts.push({ text: " " });
            }
            return {
              role: m.role,
              parts,
            };
          });
        const lastUserMessage = truncatedMessages[lastUserMessageIndex];

        // Remove the edited model message and regenerate
        setMessages(truncatedMessages.slice(0, lastUserMessageIndex + 1));

        setIsLoading(true);
        setRetryMessage(null);
        setApiError(null);
        abortControllerRef.current = new AbortController();

        const hasAnyTagsDefined = lore.some(item => item.tags && item.tags.length > 0);
        const filteredLore = lore.filter((item) => {
          if (activeTags.length === 0) return !hasAnyTagsDefined;
          const itemHasNoTags = !item.tags || item.tags.length === 0;
          if (itemHasNoTags) return activeTags.includes("Chưa phân loại");
          return item.tags.some((tag) => activeTags.includes(tag));
        });

        try {
          const response = await generateStoryResponse(
            lastUserMessage.content,
            history,
            filteredLore,
            settings,
            lastUserMessage.attachments || [],
            timeline,
            abortControllerRef.current.signal,
            (attempt, delay) => {
              setRetryMessage(`Hệ thống đang quá tải. Đang thử lại lần ${attempt}...`);
            }
          );

          setRetryMessage(null);
          let text = "";
          let thinking = "";

          const parts = response.candidates?.[0]?.content?.parts || [];
          for (const part of parts) {
            if (part.thought && part.text) {
              thinking += part.text;
            } else if (!part.thought && part.text) {
              text += part.text;
            }
          }

          let content = text;
          const thinkingMatch = text.match(
            /\[Thinking\]([\s\S]*?)(?=\n\n|\n[A-Z]|$|\[\/Thinking\])/i,
          );
          if (thinkingMatch) {
            thinking =
              (thinking ? thinking + "\n\n" : "") + thinkingMatch[1].trim();
            content = text.replace(thinkingMatch[0], "").trim();
          }

          if (!abortControllerRef.current?.signal.aborted && !content.trim() && thinking.trim()) {
            content = "_⚠️ Cảnh báo: Mô hình đã dừng lại trong quá trình suy nghĩ (có thể do giới hạn về output token hoặc timeout). Vui lòng nhấn nút Rewrite để thử lại._";
          }

          const aiMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: "model",
            content,
            thinking,
          };
          setMessages((prev) => [...prev, aiMessage]);
        } catch (error: any) {
          if (error.name !== "AbortError") {
            console.error("Error rewriting story:", error);
            setApiError(getErrorMessage(error));
          }
        } finally {
          setIsLoading(false);
          abortControllerRef.current = null;
        }
      }
    }
  }, [editingMessageId, lore, activeTags, settings, timeline]);

  const handleImageUpload = useCallback(
    async (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        try {
          const compressedDataUrl = await compressImage(file, 800, 800);
          updateLoreItem(id, { imageUrl: compressedDataUrl });
        } catch (error) {
          console.error("Error compressing image:", error);
          alert("Lỗi: Không thể xử lý ảnh này. Vui lòng thử một ảnh khác.");
        }
      }
      // Reset input
      e.target.value = "";
    },
    [updateLoreItem],
  );

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      try {
        const type: Attachment["type"] = file.type.startsWith("image/")
          ? "image"
          : file.type.startsWith("video/")
            ? "video"
            : "file";

        let dataUrl = "";
        if (type === "image") {
          dataUrl = await compressImage(file, 1024, 1024); // slightly larger for chat attachments
        } else {
          dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        }

        const newAttachment: Attachment = {
          id: Math.random().toString(36).substring(7),
          type,
          mimeType: type === "image" ? "image/jpeg" : file.type, // compressImage returns image/jpeg
          data: dataUrl.split(",")[1],
          name: file.name,
        };
        setPendingAttachments((prev) => [...prev, newAttachment]);
      } catch (error) {
        console.error("Error processing file upload:", error);
      }
    }
    // Reset input
    e.target.value = "";
  };

  const removeAttachment = (id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const groupedDrafts = drafts.reduce(
    (groups: { [key: string]: Draft[] }, draft) => {
      const date = new Date(draft.updatedAt || Date.now());
      const now = new Date();
      const diffDays = Math.floor(
        (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
      );

      let group = "Cũ hơn";
      if (diffDays === 0) group = "Hôm nay";
      else if (diffDays === 1) group = "Hôm qua";
      else if (diffDays < 7) group = "7 ngày qua";
      else if (
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear()
      )
        group = "Tháng này";

      if (!groups[group]) groups[group] = [];
      groups[group].push(draft);
      return groups;
    },
    {},
  );

  const groupOrder = [
    "Hôm nay",
    "Hôm qua",
    "7 ngày qua",
    "Tháng này",
    "Cũ hơn",
  ];

  if (!isStorageLoaded) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[#0a0a0a] text-white">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 text-orange-500 animate-spin" />
          <p className="text-white/60 font-serif">Đang tải dữ liệu...</p>
        </div>
      </div>
    );
  }

  if (isApiKeyMissing && drafts.length === 0) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[#0a0a0a] text-white p-6">
        <div className="max-w-md w-full glass-panel p-8 space-y-8 text-center animate-in fade-in zoom-in-95 duration-500">
          <div className="w-20 h-20 bg-orange-500/20 rounded-full flex items-center justify-center mx-auto">
            <Zap className="w-10 h-10 text-orange-500" />
          </div>
          <div className="space-y-2">
            <h1 className="font-serif text-3xl font-bold">StoryEngine v1</h1>
            <p className="text-white/60">
              Kiến trúc kể chuyện độc lập, không giới hạn.
            </p>
          </div>
          <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl space-y-3">
            <p className="text-sm text-orange-400 font-bold">
              Cần kết nối với Core Engine
            </p>
            <p className="text-xs text-orange-300/60 leading-relaxed">
              Vui lòng nhập API Key của Google Gemini để bắt đầu. Key của bạn sẽ chỉ được lưu trên trình duyệt hiện tại.
            </p>
            <input 
               type="password"
               placeholder="AIza..."
               className="w-full bg-black/50 border border-white/10 rounded-lg p-2 text-sm outline-none focus:border-orange-500/50 text-white"
               onKeyDown={(e) => {
                 if (e.key === "Enter") {
                    handleSaveUserApiKey(e.currentTarget.value);
                 }
               }}
            />
          </div>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Kiểm tra lại kết nối
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] overflow-hidden relative">
      <div className="atmosphere" />

      {/* Sidebar - Draft Storage */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            <motion.aside
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 z-50 w-[85vw] max-w-[320px] glass-panel m-0 flex flex-col overflow-hidden"
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between">
                <h2 className="font-serif text-xl font-bold">Kho Bản Thảo</h2>
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-lg"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4">
                <button
                  onClick={createNewDraft}
                  className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl flex items-center justify-center gap-2 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  Bản thảo mới
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {groupOrder.map((groupName) => {
                  const groupDrafts = groupedDrafts[groupName];
                  if (!groupDrafts || groupDrafts.length === 0) return null;

                  return (
                    <div key={groupName} className="space-y-2">
                      <h3 className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/30 px-2">
                        {groupName}
                      </h3>
                      <div className="space-y-1">
                        {groupDrafts.map((draft) => (
                          <div
                            key={draft.id}
                            onClick={() => {
                              // Save current draft before switching
                              updateDraft(currentDraftId, {
                                messages,
                                timeline,
                                activeTags,
                                updatedAt: Date.now(),
                              });
                              setCurrentDraftId(draft.id);
                              setIsSidebarOpen(false);
                            }}
                            className={cn(
                              "w-full p-3 rounded-xl border transition-all text-left group cursor-pointer",
                              currentDraftId === draft.id
                                ? "bg-white/10 border-orange-500/50"
                                : "bg-white/5 border-transparent hover:bg-white/10",
                            )}
                          >
                            <div className="flex justify-between items-start gap-2">
                              <div className="flex-1 min-w-0">
                                {editingDraftId === draft.id ? (
                                  <input
                                    autoFocus
                                    value={editingDraftTitle}
                                    onChange={(e) => setEditingDraftTitle(e.target.value)}
                                    onBlur={() => saveDraftEdit()}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') saveDraftEdit(e);
                                      if (e.key === 'Escape') {
                                        e.stopPropagation();
                                        setEditingDraftId(null);
                                      }
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full bg-black/40 border border-white/20 rounded px-2 py-1 text-sm text-white outline-none focus:border-orange-500/50 mb-1"
                                  />
                                ) : (
                                  <h4 className="font-bold text-sm text-white truncate">
                                    {draft.title}
                                  </h4>
                                )}
                                <div className="flex items-center gap-2 mt-0.5">
                                  <p className="text-[10px] text-white/40">
                                    {draft.messages.length} tin nhắn
                                  </p>
                                  <span className="w-1 h-1 rounded-full bg-white/10" />
                                  <p className="text-[10px] text-white/20">
                                    {new Date(
                                      draft.updatedAt,
                                    ).toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </p>
                                </div>
                              </div>
                              <div className="flex opacity-0 group-hover:opacity-100 transition-all">
                                <button
                                  onClick={(e) => startDraftEditing(draft.id, draft.title, e)}
                                  className="p-1 text-white/20 hover:text-orange-400 transition-all"
                                  title="Đổi tên"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={(e) => confirmDeleteDraft(draft.id, e)}
                                  className="p-1 text-white/20 hover:text-red-400 transition-all"
                                  title="Xóa"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="p-4 border-t border-white/10 space-y-3">
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl flex items-center justify-center gap-2 transition-all font-bold text-sm"
                >
                  <Settings className="w-4 h-4" />
                  Cài đặt
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Timeline Modal */}
      <AnimatePresence>
        {isTimelineOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsTimelineOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="fixed inset-4 md:inset-20 z-50 glass-panel flex flex-col overflow-hidden"
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Scroll className="w-6 h-6 text-orange-500" />
                  <h2 className="font-serif text-2xl font-bold">
                    Dòng Thời Gian
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => document.getElementById("timeline-pdf-upload")?.click()}
                    disabled={isPdfExtracting}
                    className="px-3 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg flex items-center gap-2 text-sm font-bold transition-all"
                  >
                    {isPdfExtracting ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                    {isPdfExtracting ? "Đang phân tích..." : "Nhập PDF (>500 trang)"}
                  </button>
                  <input
                    type="file"
                    id="timeline-pdf-upload"
                    accept=".pdf"
                    className="hidden"
                    onChange={handleTimelinePdfUpload}
                  />
                  <button
                    onClick={() => setIsTimelineOpen(false)}
                    className="p-2 hover:bg-white/10 rounded-lg"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                <div className="relative border-l-2 border-white/10 ml-4 pl-8 space-y-12">
                  {timeline
                    .sort((a, b) => a.timestamp - b.timestamp)
                    .map((event, index) => (
                      <div key={event.id} className="relative group">
                        <div className="absolute -left-[41px] top-0 w-5 h-5 rounded-full bg-orange-500 border-4 border-[#0a0a0a] z-10" />
                        <div className="glass-panel p-6 space-y-4 relative">
                          <div className="flex items-start justify-between gap-4">
                            <DebouncedInput
                              value={event.title}
                              onChange={(val: string) =>
                                updateTimelineEvent(event.id, {
                                  title: val,
                                })
                              }
                              className="bg-transparent border-none text-xl font-bold text-white outline-none focus:ring-0 p-0 w-full"
                              placeholder="Tiêu đề sự kiện..."
                            />
                            <button
                              onClick={() => deleteTimelineEvent(event.id)}
                              className="p-2 text-white/20 hover:text-red-400 transition-all"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                          <DebouncedTextarea
                            value={event.description}
                            onChange={(val: string) =>
                              updateTimelineEvent(event.id, {
                                description: val,
                              })
                            }
                            className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm outline-none focus:border-orange-500/50 h-24 resize-none"
                            placeholder="Mô tả diễn biến sự kiện..."
                          />
                          <div className="flex items-center justify-between text-[10px] text-white/40 font-bold uppercase tracking-widest">
                            <span>Sự kiện #{index + 1}</span>
                            <input
                              type="datetime-local"
                              value={new Date(event.timestamp)
                                .toISOString()
                                .slice(0, 16)}
                              onChange={(e) =>
                                updateTimelineEvent(event.id, {
                                  timestamp: new Date(e.target.value).getTime(),
                                })
                              }
                              className="bg-transparent border-none text-white/40 outline-none focus:ring-0 p-0 text-right"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  <button
                    onClick={addTimelineEvent}
                    className="w-full py-8 border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center gap-4 text-white/20 hover:text-white/40 hover:border-white/20 transition-all"
                  >
                    <Plus className="w-10 h-10" />
                    <span className="font-bold">Thêm cột mốc mới</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Share Modal */}
      <AnimatePresence>
        {isShareOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsShareOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-[450px] max-h-[90vh] overflow-y-auto glass-panel p-6 md:p-8 space-y-6 md:space-y-8"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Send className="w-6 h-6 text-orange-500" />
                  <h2 className="font-serif text-2xl font-bold">
                    Chia sẻ bản thảo
                  </h2>
                </div>
                <button
                  onClick={() => setIsShareOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-lg"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-white/60">
                    Email người nhận
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="email"
                      value={shareEmail}
                      onChange={(e) => setShareEmail(e.target.value)}
                      placeholder="example@email.com"
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-orange-500/50"
                    />
                    <button
                      onClick={handleShare}
                      className="px-6 py-3 sm:py-0 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl transition-all"
                    >
                      Gửi
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-white/60">
                    Link chia sẻ
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white/40 text-sm truncate">
                      {window.location.origin}/share/{currentDraftId}
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `${window.location.origin}/share/${currentDraftId}`,
                        );
                        alert("Đã copy link vào bộ nhớ tạm!");
                      }}
                      className="px-4 py-3 sm:py-0 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      <Copy className="w-4 h-4" />
                      Copy
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <LoreMemoryModal
        isOpen={isLoreOpen}
        onClose={() => setIsLoreOpen(false)}
        lore={lore}
        activeLoreTab={activeLoreTab}
        setActiveLoreTab={setActiveLoreTab}
        onAdd={addLoreItem}
        onUpdate={updateLoreItem}
        onDelete={deleteLoreItem}
        onImageUpload={handleImageUpload}
        onManualSave={handleManualSaveLore}
        isSavingLore={isSavingLore}
        activeTags={activeTags}
        setActiveTags={setActiveTags}
      />

      {/* Chat Timeline Modal */}
      <AnimatePresence>
        {isChatTimelineOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsChatTimelineOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ x: 320 }}
              animate={{ x: 0 }}
              exit={{ x: 320 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 z-50 w-[85vw] max-w-[320px] glass-panel m-0 flex flex-col overflow-hidden"
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <List className="w-5 h-5 text-orange-500" />
                  <h2 className="font-serif text-xl font-bold">Mục lục Chat</h2>
                </div>
                <button
                  onClick={() => setIsChatTimelineOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {messages.filter((m) => m.role === "user").length === 0 ? (
                  <p className="text-center text-white/40 text-sm mt-8">
                    Chưa có tin nhắn nào.
                  </p>
                ) : (
                  messages
                    .filter((m) => m.role === "user")
                    .map((msg, idx) => (
                      <button
                        key={msg.id}
                        onClick={() => {
                          setIsChatTimelineOpen(false);
                          setTimeout(() => {
                            const el = document.getElementById(`msg-${msg.id}`);
                            if (el) {
                              el.scrollIntoView({
                                behavior: "smooth",
                                block: "start",
                              });
                            }
                          }, 100);
                        }}
                        className="w-full text-left p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all group"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-5 h-5 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0">
                            <span className="text-[10px] font-bold text-orange-500">
                              {idx + 1}
                            </span>
                          </div>
                          <span className="text-xs text-white/40">
                            Người dùng
                          </span>
                        </div>
                        <p className="text-sm text-white/80 line-clamp-2 leading-relaxed">
                          {msg.content}
                        </p>
                      </button>
                    ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-[500px] max-h-[90vh] overflow-y-auto glass-panel p-6 md:p-8 space-y-6 md:space-y-8"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-2xl font-bold">
                  Cài Đặt Hệ Thống
                </h2>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-lg"
                >
                  <ChevronRight className="w-6 h-6 rotate-90" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                  <div className="space-y-1">
                    <p className="font-bold">Tự động lưu</p>
                    <p className="text-xs text-white/40">
                      Lưu bản thảo sau mỗi 2 giây thay đổi
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      setSettings((s) => ({ ...s, autoSave: !s.autoSave }))
                    }
                    className={cn(
                      "w-12 h-6 rounded-full relative transition-all",
                      settings.autoSave ? "bg-orange-500" : "bg-white/20",
                    )}
                  >
                    <div
                      className={cn(
                        "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                        settings.autoSave ? "left-7" : "left-1",
                      )}
                    />
                  </button>
                </div>

                <div className="space-y-2">
                  <p className="font-bold">Chỉ dẫn hệ thống tùy chỉnh</p>
                  <p className="text-xs text-white/40">
                    Thêm quy tắc riêng cho AI của bạn
                  </p>
                  <DebouncedTextarea
                    value={settings.customSystemPrompt}
                    onChange={(val: string) =>
                      setSettings((s) => ({
                        ...s,
                        customSystemPrompt: val,
                      }))
                    }
                    placeholder="Ví dụ: Luôn viết theo ngôi thứ nhất, sử dụng từ ngữ cổ phong..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm outline-none focus:border-orange-500/50 h-32 resize-none"
                  />
                </div>

                <div className="pt-4 border-t border-white/10 space-y-4">
                  <div className="space-y-2">
                    <p className="font-bold text-orange-400">Thiết lập Gemini API Key</p>
                    <p className="text-xs text-white/40">
                      Chỉ sử dụng nếu bản cài đặt của bạn báo lỗi thiếu API Key (khi bạn nhấn nút Share App).
                    </p>
                    <input 
                      type="password"
                      placeholder="AIzaSy..."
                      defaultValue={userApiKey}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm outline-none focus:border-orange-500/50"
                      onChange={(e) => {
                        const val = e.target.value.trim();
                        localStorage.setItem("USER_GEMINI_API_KEY", val);
                        setUserApiKey(val);
                      }}
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-white/10 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-bold">Khôi phục Lore Memory</p>
                      <p className="text-[10px] text-white/40">
                        Tìm kiếm lại các mục Lore bị thất lạc từ các bản thảo cũ
                      </p>
                    </div>
                    <button
                      onClick={async () => {
                        const allDrafts = await get("storyDrafts");
                        if (Array.isArray(allDrafts)) {
                          const allLoreItems: LoreItem[] = [...lore];
                          const seenIds = new Set(lore.map((i) => i.id));
                          let count = 0;
                          allDrafts.forEach((d: any) => {
                            if (d.lore && Array.isArray(d.lore)) {
                              d.lore.forEach((item: LoreItem) => {
                                if (!seenIds.has(item.id)) {
                                  allLoreItems.push(item);
                                  seenIds.add(item.id);
                                  count++;
                                }
                              });
                            }
                          });
                          if (count > 0) {
                            setLore(allLoreItems);
                            await set("storyLore", allLoreItems);
                            alert(`Đã khôi phục thành công ${count} mục Lore!`);
                          } else {
                            alert(
                              "Không tìm thấy mục Lore nào mới để khôi phục.",
                            );
                          }
                        }
                      }}
                      className="w-full sm:w-auto px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold transition-all whitespace-nowrap"
                    >
                      Khôi phục
                    </button>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-bold">Sao lưu dữ liệu</p>
                      <p className="text-[10px] text-white/40">
                        Tải toàn bộ bản thảo và Lore về máy
                      </p>
                    </div>
                    <button
                      onClick={handleDownloadBackup}
                      className="w-full sm:w-auto px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                      <Download className="w-3 h-3 shrink-0" />
                      Tải về
                    </button>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-bold">Khôi phục dữ liệu</p>
                      <p className="text-[10px] text-white/40">
                        Khôi phục từ file sao lưu (Ghi đè dữ liệu hiện tại)
                      </p>
                    </div>
                    <input
                      type="file"
                      accept=".json"
                      ref={restoreInputRef}
                      onChange={handleRestoreBackup}
                      className="hidden"
                    />
                    <button
                      onClick={() => restoreInputRef.current?.click()}
                      className="w-full sm:w-auto px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                      <Upload className="w-3 h-3 shrink-0" />
                      Khôi phục
                    </button>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/10 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-orange-400">Khôi phục khẩn cấp</p>
                      <p className="text-[10px] text-white/40">
                        Tìm lại dữ liệu bị mất từ bộ nhớ tạm trình duyệt (localStorage)
                      </p>
                    </div>
                    <button
                      onClick={handleEmergencyRestore}
                      className="w-full sm:w-auto px-4 py-2 bg-orange-500/20 hover:bg-orange-500/30 text-orange-500 border border-orange-500/20 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                      <RefreshCw className="w-3 h-3 shrink-0" />
                      Tìm Bản Sao Cũ
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => {
                    updateDraft(currentDraftId, {
                      messages,
                      updatedAt: Date.now(),
                    });
                    setIsSettingsOpen(false);
                  }}
                  className="w-full py-4 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl transition-all"
                >
                  Lưu thay đổi
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Draft Settings Modal */}
      <AnimatePresence>
        {isDraftSettingsOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDraftSettingsOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-[500px] max-h-[90vh] overflow-y-auto glass-panel p-6 md:p-8 space-y-6 md:space-y-8"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-2xl font-bold">
                  Cài Đặt Truyện Này
                </h2>
                <button
                  onClick={() => setIsDraftSettingsOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-lg"
                >
                  <ChevronRight className="w-6 h-6 rotate-90" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <p className="font-bold">Phong cách hành văn (Writing Style)</p>
                  <p className="text-xs text-white/40">
                    Chi tiết phong cách viết cho riêng bản thảo này.
                  </p>
                  <DebouncedTextarea
                    value={currentDraft.draftSettings?.writingStyle || ""}
                    onChange={(val: string) =>
                      updateDraft(currentDraftId, {
                        draftSettings: {
                          ...currentDraft.draftSettings,
                          writingStyle: val,
                        },
                      })
                    }
                    placeholder="Ví dụ: Giọng văn lạnh lùng, dứt khoát, nhiều cảnh hành động miêu tả chi tiết..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm outline-none focus:border-orange-500/50 h-32 resize-none"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="font-bold text-sm">Số từ tối thiểu (minWords)</p>
                    <input
                      type="number"
                      placeholder="VD: 8000"
                      value={currentDraft.draftSettings?.minWords || ""}
                      onChange={(e) =>
                        updateDraft(currentDraftId, {
                          draftSettings: {
                            ...currentDraft.draftSettings,
                            minWords: e.target.value ? parseInt(e.target.value, 10) : undefined,
                          },
                        })
                      }
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm outline-none focus:border-orange-500/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="font-bold text-sm">Số từ tối đa (maxWords)</p>
                    <input
                      type="number"
                      placeholder="Tùy chọn"
                      value={currentDraft.draftSettings?.maxWords || ""}
                      onChange={(e) =>
                        updateDraft(currentDraftId, {
                          draftSettings: {
                            ...currentDraft.draftSettings,
                            maxWords: e.target.value ? parseInt(e.target.value, 10) : undefined,
                          },
                        })
                      }
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm outline-none focus:border-orange-500/50"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-white/10">
                  <button
                    onClick={() => {
                      updateDraft(currentDraftId, {
                        messages,
                        updatedAt: Date.now(),
                      });
                      setIsDraftSettingsOpen(false);
                    }}
                    className="w-full py-4 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl transition-all"
                  >
                    Lưu cài đặt
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative w-full">
        {/* Header */}
        <header className="p-4 lg:p-6 flex items-center justify-between gap-4 border-b border-white/5">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 glass-panel hover:bg-white/10"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <h1 className="font-serif text-2xl lg:text-3xl font-bold tracking-tight hidden sm:block">
              StoryEngine v1
            </h1>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar lg:pb-0 lg:overflow-visible">
            <button
              onClick={() => setIsChatTimelineOpen(true)}
              className="p-2 lg:px-4 lg:py-2 glass-panel hover:bg-white/10 flex items-center gap-2 text-sm font-bold whitespace-nowrap shrink-0"
            >
              <List className="w-4 h-4 text-orange-500" />
              <span className="hidden md:inline">Mục lục Chat</span>
            </button>
            <button
              onClick={() => setIsTimelineOpen(true)}
              className="p-2 lg:px-4 lg:py-2 glass-panel hover:bg-white/10 flex items-center gap-2 text-sm font-bold whitespace-nowrap shrink-0"
            >
              <Scroll className="w-4 h-4 text-orange-500" />
              <span className="hidden md:inline">Timeline</span>
            </button>
            <button
              onClick={() => setIsLoreOpen(true)}
              className="p-2 lg:px-4 lg:py-2 glass-panel hover:bg-white/10 flex items-center gap-2 text-sm font-bold whitespace-nowrap shrink-0"
            >
              <BookOpen className="w-4 h-4 text-orange-500" />
              <span className="hidden md:inline">Lore Memory</span>
            </button>
            <button
              onClick={() => setIsShareOpen(true)}
              className="p-2 lg:px-4 lg:py-2 glass-panel hover:bg-white/10 flex items-center gap-2 text-sm font-bold whitespace-nowrap shrink-0"
            >
              <Send className="w-4 h-4 text-orange-500" />
              <span className="hidden md:inline">Chia sẻ</span>
            </button>
            <button
              onClick={() => setIsDraftSettingsOpen(true)}
              className="p-2 lg:px-4 lg:py-2 glass-panel hover:bg-white/10 flex items-center gap-2 text-sm font-bold whitespace-nowrap shrink-0"
            >
              <SlidersHorizontal className="w-4 h-4 text-orange-500" />
              <span className="hidden md:inline">Cài đặt truyện</span>
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 lg:px-4 lg:py-2 glass-panel hover:bg-white/10 flex items-center gap-2 text-sm font-bold whitespace-nowrap shrink-0"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden md:inline">Cài đặt</span>
            </button>
          </div>
        </header>

        {/* Story Area */}
        <div className="flex-1 relative min-h-0 flex flex-col">
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto custom-scrollbar px-4 lg:px-6 py-8 space-y-12"
          >
            {apiError && (
              <div className="max-w-4xl mx-auto w-full p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-400 text-sm animate-in fade-in slide-in-from-top-2">
                <X
                  className="w-4 h-4 cursor-pointer"
                  onClick={() => setApiError(null)}
                />
                <p>{apiError}</p>
              </div>
            )}

            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto space-y-6 opacity-60 px-4">
                <div className="w-16 h-16 lg:w-20 lg:h-20 bg-orange-500/20 rounded-full flex items-center justify-center">
                  <Sparkles className="w-8 h-8 lg:w-10 lg:h-10 text-orange-500" />
                </div>
                <h2 className="font-serif text-2xl lg:text-3xl">
                  {currentDraft.title}
                </h2>
                <p className="text-base lg:text-lg leading-relaxed">
                  Bắt đầu hành trình sáng tác của bạn. Mọi thay đổi sẽ được tự
                  động lưu lại.
                </p>
              </div>
            )}

            {messages.map((message, index) => (
              <MessageItem
                key={message.id}
                message={message}
                settings={settings}
                editingMessageId={editingMessageId}
                cancelEditing={cancelEditing}
                saveEdit={saveEdit}
                copyToClipboard={copyToClipboard}
                startEditing={startEditing}
                deleteMessage={deleteMessage}
                copiedMessageId={copiedMessageId}
                isGenerating={isLoading && index === messages.length - 1}
              />
            ))}
          </div>

          {/* Scroll to bottom button */}
          <button
            onClick={scrollToBottom}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 p-3 bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-full shadow-lg border border-white/10 transition-all z-20 group"
            title="Cuộn xuống cuối"
          >
            <ArrowDown className="w-5 h-5 text-white/60 group-hover:text-white" />
          </button>
        </div>

        {/* Input Area */}
        <ChatInput
          onSend={handleSend}
          onStop={stopGeneration}
          isLoading={isLoading}
          pendingAttachments={pendingAttachments}
          handleFileUpload={handleFileUpload}
          removeAttachment={removeAttachment}
          settings={settings}
          setSettings={setSettings}
        />
      </main>
      {/* Draft Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteDraftConfirm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDeleteDraftConfirm(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100]"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-[90vw] max-w-[400px] glass-panel p-8 text-center space-y-6"
            >
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold">Xác nhận xóa?</h2>
                <p className="text-white/60 text-sm">
                  Bạn có chắc chắn muốn xóa bản thảo này không? Hành động này
                  không thể hoàn tác.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteDraftConfirm(false)}
                  className="flex-1 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold transition-all"
                >
                  Không, giữ lại
                </button>
                <button
                  onClick={executeDeleteDraft}
                  className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition-all"
                >
                  Có, xóa đi
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
