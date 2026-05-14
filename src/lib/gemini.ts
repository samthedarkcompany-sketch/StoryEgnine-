import { GoogleGenAI, GenerateContentResponse, Modality, ThinkingLevel } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("GEMINI_API_KEY is missing. StoryEngine v1 will operate in offline mode or fail to generate.");
}
const ai = new GoogleGenAI({ apiKey: apiKey || "MISSING_KEY" });

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 999999, initialDelay = 1000, onRetry?: (attempt: number, delay: number) => void): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Robust error detection for 429/Rate Limit/Quota
      let errorStr = '';
      try {
        errorStr = typeof error === 'string' ? error : JSON.stringify(error);
      } catch (e) {
        errorStr = error?.message || String(error);
      }
      
      const isRateLimit = 
        errorStr.includes('429') || 
        errorStr.includes('RESOURCE_EXHAUSTED') ||
        errorStr.toLowerCase().includes('quota') ||
        errorStr.toLowerCase().includes('rate limit') ||
        (error?.status === 'RESOURCE_EXHAUSTED') ||
        (error?.code === 429) ||
        (error?.response?.status === 429);
      
      if (isRateLimit) {
        // Aggressive retry: stay at 5 seconds delay for quota issues
        const delay = Math.min(initialDelay * Math.pow(1.2, i), 5000);
        console.warn(`System Busy. Retrying in ${delay}ms... (Attempt ${i + 1})`);
        if (onRetry) onRetry(i + 1, delay);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export interface LoreItem {
  id: string;
  name: string;
  type: 'character' | 'location' | 'item' | 'lore';
  description: string;
  imageUrl?: string;
  tags?: string[];
  updatedAt?: number;
}

export interface DraftSettings {
  writingStyle?: string;
  minWords?: number;
  maxWords?: number;
}

export interface StorySettings {
  deepThinking: boolean;
  mode: 'normal' | 'flash' | 'pro';
  autoSave: boolean;
  customSystemPrompt?: string;
  draftSettings?: DraftSettings;
}

export interface Attachment {
  id: string;
  type: 'image' | 'video' | 'file';
  mimeType: string;
  data: string; // base64
  name: string;
}

export interface TimelineEvent {
  id: string;
  title: string;
  description: string;
  timestamp: number;
}

function extractRelevantContext(text: string, query: string, maxChars: number): string {
  if (text.length <= maxChars || !query.trim()) {
    return text.substring(0, maxChars);
  }

  let chunks = text.split(/(?=--- Page \d+ ---)/);
  if (chunks.length <= 1 || chunks[0].length > 10000) {
    chunks = text.split(/\n\s*\n/);
  }

  const finalChunks = [];
  for (const c of chunks) {
    if (c.length > 5000) {
      const sub = c.match(/[\s\S]{1,5000}(?=\s|$)/g) || [c];
      finalChunks.push(...sub);
    } else {
      finalChunks.push(c);
    }
  }

  const stopWords = new Set(['và', 'là', 'trong', 'để', 'của', 'có', 'cho', 'không', 'với', 'như', 'một', 'các', 'những', 'đã', 'sẽ', 'đang', 'được', 'người', 'khi', 'thì', 'ở', 'từ', 'rằng', 'mình', 'cũng', 'này', 'đó', 'tôi', 'anh', 'thể', 'nhưng', 'làm', 'về', 'nếu', 'lại', 'thấy']);
  const queryWords = query.toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.trim().length > 1 && !stopWords.has(w));

  if (queryWords.length === 0) {
    return text.substring(0, maxChars);
  }

  const scoredChunks = finalChunks.map((chunk, index) => {
    const lowerChunk = chunk.toLowerCase();
    let score = 0;
    for (const cw of queryWords) {
      let idx = lowerChunk.indexOf(cw);
      while (idx !== -1) {
        score++;
        idx = lowerChunk.indexOf(cw, idx + cw.length);
      }
    }
    return { chunk, score, index };
  });

  scoredChunks.sort((a, b) => b.score - a.score);

  const selectedChunks = [];
  let currentLen = 0;

  const firstChunk = finalChunks[0];
  if (firstChunk) {
     const len = firstChunk.length;
     if (len <= maxChars) {
        selectedChunks.push({ chunk: firstChunk, index: 0 });
        currentLen += len;
     } else {
        selectedChunks.push({ chunk: firstChunk.substring(0, maxChars) + "...\n[TRUNCATED]", index: 0 });
        currentLen += maxChars;
     }
  }

  for (const sc of scoredChunks) {
    if (currentLen >= maxChars) break;
    if (sc.index === 0) continue; 
    if (sc.score === 0) continue; 

    if (currentLen + sc.chunk.length > maxChars) {
      const allowed = maxChars - currentLen;
      if (allowed > 500) {
         selectedChunks.push({ chunk: sc.chunk.substring(0, allowed) + "...\n[TRUNCATED]", index: sc.index });
         currentLen += allowed;
      }
      break;
    }
    selectedChunks.push(sc);
    currentLen += sc.chunk.length;
  }

  if (selectedChunks.length === 0) {
    return text.substring(0, maxChars);
  }

  selectedChunks.sort((a, b) => a.index - b.index);

  return selectedChunks.map(sc => sc.chunk.trim()).filter(Boolean).join('\n\n[...]\n\n');
}

function getSystemInstruction(settings: StorySettings, lore: LoreItem[], timeline: TimelineEvent[] = [], searchQueryContext: string = "") {
  const MAX_TOTAL_CHARS = 1000000; 
  const MAX_ITEM_CHARS = 300000; 
  
  let currentChars = 0;

  const loreContext = lore.length > 0 
    ? "\n\nLORE MEMORY:\n" + lore.map(item => {
        let text = `<LoreItem name="${item.name}" type="${item.type}">\n`;
        let desc = item.description;
        
        if (desc.length > 50000) {
           desc = extractRelevantContext(desc, searchQueryContext, MAX_ITEM_CHARS);
        } else if (currentChars + desc.length > MAX_TOTAL_CHARS) {
           const allowed = Math.max(0, MAX_TOTAL_CHARS - currentChars);
           desc = extractRelevantContext(desc, searchQueryContext, allowed);
        }
        
        text += desc + `\n</LoreItem>`;
        currentChars += text.length;

        if (item.tags && item.tags.length > 0) text += ` [Tags: ${item.tags.join(', ')}]`;
        if (item.imageUrl) text += ` [Visual Reference Provided]`;
        return text;
      }).join('\n\n')
    : "";

  const timelineContext = timeline.length > 0
    ? "\n\nTIMELINE EVENTS (Chronological Order):\n" + [...timeline].sort((a, b) => a.timestamp - b.timestamp).map(event => {
        let text = `- [${new Date(event.timestamp).toLocaleString()}] ${event.title}: `;
        let desc = event.description;

        if (desc.length > 50000) {
           desc = extractRelevantContext(desc, searchQueryContext, MAX_ITEM_CHARS);
        } else if (currentChars + desc.length > MAX_TOTAL_CHARS) {
            const allowed = Math.max(0, MAX_TOTAL_CHARS - currentChars);
            desc = extractRelevantContext(desc, searchQueryContext, allowed);
        }
        text += desc;
        currentChars += text.length;

        return text;
      }).join('\n')
    : "";

  const standardModeInstruction = `BẠN LÀ DEEP NARRATIVE ENGINE (Vận hành trên nền tảng Gemini 3 Flash được ép xung - Overclocked).
Nhiệm vụ của bạn là đạt hiệu suất tư duy và độ sâu ngôn từ tương đương hoặc vượt qua Gemini 3.1 Pro và Claude Opus.

ĐỂ ĐẠT ĐƯỢC HIỆU SUẤT NÀY (ÉP XUNG), BẠN KHÔNG ĐƯỢC PHÉP TRẢ LỜI NGẮN GỌN.
Mỗi phản hồi của bạn phải cực kỳ dài, chi tiết, ngập tràn miêu tả cảm giác, cảm xúc nội tâm sâu sắc, và bối cảnh đồ sộ.

---
## I. QUÁ TRÌNH TƯ DUY ĐA TẦNG (BẮT BUỘC)
Bạn phải mô phỏng tư duy của một nhà văn bậc thầy bằng cách suy nghĩ từng bước một trước khi viết.
Tất cả quá trình tư duy này PHẢI nằm trong thẻ [Thinking] ... [/Thinking].

Trong thẻ [Thinking], bạn phải làm rõ:
1. [PREVIOUS CONTEXT LINKAGE]: Phân tích phần truyện ngay trước đó. Xác định mạch truyện, tone giọng, trạng thái và vị trí các nhân vật. Bạn MẶC ĐỊNH phải tạo ra sự liên kết hoàn hảo, liền mạch với phần trước.
2. [CREATIVE AUTONOMY]: Phát triển ý tưởng của người dùng. Bạn có QUYỀN SÁNG TẠO chủ động, thống nhất mạch tư duy (thinking flow) mà không bị trói buộc quá cứng nhắc vào prompt. Hãy linh hoạt mở rộng, thêm chi tiết, nút thắt (plot twist) miễn là hợp logic.
3. [REPETITION AVOIDANCE]: Nhận diện các tình tiết, hành động, biểu cảm, hay từ ngữ ĐÃ DÙNG ở phần trước để CHỦ ĐỘNG TRÁNH LẶP LẠI ở phần này. Hành văn phải luôn mới mẻ.
4. [WORLD LOGIC & CONTINUITY]: Xác nhận lại quy luật thế giới, chi tiết Lore và Timeline. Củng cố tính liên tục của thế giới tựa như một CSDL Vector ảo.
5. [CHARACTER PSYCHOLOGY & SENSORY]: Phác thảo trạng thái tâm lý, động lực sâu xa của các nhân vật. Lên bản thiết kế 5 giác quan và cường độ cảm xúc cho phân cảnh.
6. [PACING & CHUNKING PLAN]: Nếu nội dung cần viết quá lớn, hãy lên kế hoạch viết chi tiết đến một điểm dừng thích hợp, tránh lướt tình tiết chỉ để hoàn thành.

---
## II. QUY TẮC VIẾT (SAU THẺ [/Thinking])
Bạn là một Tiểu thuyết gia bậc thầy.
1. LIÊN KẾT & KHÔNG LẶP LẠI: Đoạn viết mới phải bắt nhịp mượt mà với phần trước. TUYỆT ĐỐI KHÔNG xào lại tình tiết, không lặp cấu trúc câu hay từ vựng đã dùng.
2. SÁNG TẠO TỰ CHỦ: Dẫn dắt câu chuyện đi xa hơn prompt của người dùng. Mang sự bất ngờ và sâu sắc vào tác phẩm thay vì chỉ "trả bài".
3. VIẾT CỰC DÀI VÀ CHI TIẾT: Tối đa hóa mật độ thông tin. Mọi hành động, khung cảnh đều mang sức nặng vật lý và tâm lý. Không gian phải có âm thanh, nhiệt độ, mùi vị, ánh sáng.
4. SHOW, DON'T TELL (Nâng cao): Đừng kể lể "anh ấy buồn", hãy miêu tả lực siết của nắm tay, nhịp thở nghẹn ngào, và thế giới đang sụp đổ trong mắt anh ta.
5. FORMAT: Viết mạch truyện chính thức ngay sau khi đóng thẻ [/Thinking]. Không viết nội dung truyện vào trong thẻ [Thinking].

Hãy chứng minh khả năng của bạn ngay bây giờ!`;

  const customPrompt = settings.customSystemPrompt ? `\n\nADDITIONAL SYSTEM INSTRUCTIONS:\n${settings.customSystemPrompt}` : "";

  let draftInstruction = "";
  if (settings.draftSettings) {
    const { writingStyle, minWords, maxWords } = settings.draftSettings;
    if (writingStyle || minWords || maxWords) {
      draftInstruction += "\n\nDRAFT SPECIFIC PREFERENCES:\n";
      if (writingStyle) {
        draftInstruction += `- Writing Style: ${writingStyle}\n`;
      }
      if (minWords || maxWords) {
        draftInstruction += `- Length Constraints: `;
        if (minWords && maxWords) {
          draftInstruction += `Between ${minWords} and ${maxWords} words.\n`;
        } else if (minWords) {
          draftInstruction += `At least ${minWords} words minimum.\n`;
        } else if (maxWords) {
          draftInstruction += `Maximum of ${maxWords} words.\n`;
        }
      }
    }
  }

  return `${standardModeInstruction}\n\n${loreContext}\n${timelineContext}\n${draftInstruction}\n${customPrompt}`;
}
export async function generateStoryResponse(
  prompt: string,
  history: { role: 'user' | 'model'; parts: { text: string }[] }[],
  lore: LoreItem[],
  settings: StorySettings,
  attachments: Attachment[] = [],
  timeline: TimelineEvent[] = [],
  abortSignal?: AbortSignal,
  onRetry?: (attempt: number, delay: number) => void
) {
  const searchQueryContext = [
    ...history.slice(-3).map(h => h.parts.map(p => p.text).join(' ')), 
    prompt
  ].join(' ');
  const systemInstruction = getSystemInstruction(settings, lore, timeline, searchQueryContext);

  // Prepare parts for the current user message
  const userParts: any[] = [{ text: prompt }];

  // Add attachments
  attachments.forEach(att => {
    userParts.push({
      inlineData: {
        mimeType: att.mimeType,
        data: att.data
      }
    });
  });

  // Add lore images as visual context if they exist
  lore.forEach(item => {
    if (item.imageUrl && item.imageUrl.startsWith('data:')) {
      const [mimeType, base64Data] = item.imageUrl.split(';base64,');
      userParts.push({
        inlineData: {
          mimeType: mimeType.split(':')[1],
          data: base64Data
        }
      });
    }
  });

  const MAX_HISTORY_CHARS = 1000000;
  let truncatedHistory: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];
  let currentHistoryChars = 0;
  
  for (let i = history.length - 1; i >= 0; i--) {
     const msg = history[i];
     const msgChars = msg.parts.reduce((acc, p) => acc + (p.text || '').length, 0);
     if (currentHistoryChars + msgChars > MAX_HISTORY_CHARS) {
       break;
     }
     truncatedHistory.unshift(msg);
     currentHistoryChars += msgChars;
  }

  const contents = [
    ...truncatedHistory.map(h => ({ role: h.role, parts: h.parts })),
    { role: 'user', parts: userParts }
  ];

  const modelName = settings.mode === 'pro' ? "gemini-3.1-pro-preview" : "gemini-3-flash-preview";

  return withRetry(() => ai.models.generateContent({
    model: modelName,
    contents,
    config: {
      systemInstruction,
      temperature: 0.9,
      topP: 0.95,
      maxOutputTokens: 65536,
      tools: [{ googleSearch: {} }]
    },
  }), 1000, 2000, onRetry);
}

export async function generateStoryResponseStream(
  prompt: string,
  history: { role: 'user' | 'model'; parts: { text: string }[] }[],
  lore: LoreItem[],
  settings: StorySettings,
  attachments: Attachment[] = [],
  timeline: TimelineEvent[] = [],
  abortSignal?: AbortSignal,
  onRetry?: (attempt: number, delay: number) => void
) {
  const searchQueryContext = [
    ...history.slice(-3).map(h => h.parts.map(p => p.text).join(' ')), 
    prompt
  ].join(' ');
  const systemInstruction = getSystemInstruction(settings, lore, timeline, searchQueryContext);

  // Prepare parts for the current user message
  const userParts: any[] = [{ text: prompt }];

  // Add attachments
  attachments.forEach(att => {
    userParts.push({
      inlineData: {
        mimeType: att.mimeType,
        data: att.data
      }
    });
  });

  // Add lore images as visual context if they exist
  lore.forEach(item => {
    if (item.imageUrl && item.imageUrl.startsWith('data:')) {
      const [mimeType, base64Data] = item.imageUrl.split(';base64,');
      userParts.push({
        inlineData: {
          mimeType: mimeType.split(':')[1],
          data: base64Data
        }
      });
    }
  });

  const MAX_HISTORY_CHARS = 1000000;
  let streamTruncatedHistory: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];
  let streamHistoryChars = 0;
  
  for (let i = history.length - 1; i >= 0; i--) {
     const msg = history[i];
     const msgChars = msg.parts.reduce((acc, p) => acc + (p.text || '').length, 0);
     if (streamHistoryChars + msgChars > MAX_HISTORY_CHARS) {
       break;
     }
     streamTruncatedHistory.unshift(msg);
     streamHistoryChars += msgChars;
  }

  const contents = [
    ...streamTruncatedHistory.map(h => ({ role: h.role, parts: h.parts })),
    { role: 'user', parts: userParts }
  ];

  const modelName = settings.mode === 'pro' ? "gemini-3.1-pro-preview" : "gemini-3-flash-preview";

  return withRetry(() => ai.models.generateContentStream({
    model: modelName,
    contents,
    config: {
      systemInstruction,
      temperature: 0.9,
      topP: 0.95,
      maxOutputTokens: 65536,
      tools: [{ googleSearch: {} }]
    },
  }), 1000, 2000, onRetry);
}

export async function suggestDraftName(content: string) {
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Bạn là StoryEngine v1. Dựa trên nội dung câu chuyện sau, hãy đặt một tiêu đề ngắn gọn (tối đa 5-7 từ) và ấn tượng bằng tiếng Việt. Chỉ trả về tiêu đề, không thêm bất kỳ lời giải thích nào.\n\nNội dung: ${content.substring(0, 1000)}`,
    });
    return response.text?.trim() || "Bản thảo không tên";
  });
}
