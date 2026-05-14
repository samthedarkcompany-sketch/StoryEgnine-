import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

async function test() {
  const modelsToTest = ["gemini-2.5-pro", "gemini-2.5-flash"];
  for (const model of modelsToTest) {
    try {
      console.log(`Testing ${model} with thinking...`);
      const response = await ai.models.generateContent({
        model,
        contents: "Tell me a joke.",
        config: {
          thinkingConfig: { thinkingLevel: "HIGH" as any }
        }
      });
      console.log(`Success with ${model}: ${response.text?.substring(0, 50)}`);
    } catch (e: any) {
      console.error(`Failed with ${model}:`, e.message);
    }
  }
}

test();

