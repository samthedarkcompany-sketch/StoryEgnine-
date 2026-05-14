import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import * as dotenv from "dotenv";
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function run() {
  const response = await ai.models.generateContentStream({
    model: "gemini-3-flash-preview",
    contents: "Why is the sky blue?",
    config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
  });
  
  for await (const chunk of response) {
    console.log(JSON.stringify(chunk.candidates?.[0]?.content?.parts, null, 2));
    break;
  }
}
run();
