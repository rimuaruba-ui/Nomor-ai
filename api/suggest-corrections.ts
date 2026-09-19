import { GoogleGenAI, Type } from "@google/genai";

export const config = {
  maxDuration: 30,
};

export default async function handler(req: any, res: any) {
  // Enable CORS if needed
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const { text, mangaConfig, userApiKey } = req.body || {};

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ error: "Text is required for suggestions" });
    }

    const effectiveKey = userApiKey || process.env.GEMINI_API_KEY || "";
    const client = new GoogleGenAI({ 
      apiKey: effectiveKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const style = mangaConfig?.style || 'formal';

    const systemPrompt = `Kamu adalah editor naskah profesional berbahasa Indonesia untuk video konten narasi manga/manhwa di YouTube dan media sosial.
Tugasmu adalah menganalisis teks naskah narasi berikut dan memberikan daftar saran perbaikan/penyempurnaan yang mencakup:
1. 'tata_bahasa': Kesalahan ejaan, salah ketik (typo), tanda baca, huruf kapital, atau ketidaktepatan imbuhan kata dalam bahasa Indonesia.
2. 'pilihan_kata': Saran kata ganti (diksi) yang lebih tepat, natural, kaya, atau lebih sinematik sesuai gaya penceritaan.
3. 'gaya_bahasa': Rekomendasi penyusunan ulang kalimat agar lebih mengalir (flow), dinamis, dan enak dibaca saat diucapkan sebagai voiceover (gaya target: ${style}).

Aturan:
- Berikan saran yang benar-benar relevan dan meningkatkan kualitas naskah.
- 'original': Potongan kata atau frasa asli yang perlu diubah (harus persis ada di teks).
- 'replacement': Kata atau frasa perbaikan penggantinya.
- 'explanation': Alasan ringkas dan jelas mengapa perbaikan tersebut disarankan.
- Jika teks sudah sangat bagus dan tidak ada yang perlu diperbaiki, kembalikan array kosong.`;

    const candidateModels = ["gemini-3.8-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
    let lastError: any = null;

    for (const model of candidateModels) {
      try {
        const response = await client.models.generateContent({
          model,
          contents: [
            {
              role: "user",
              parts: [
                { text: `${systemPrompt}\n\nNaskah yang dianalisis:\n"""\n${text}\n"""` }
              ]
            }
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                suggestions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      original: { type: Type.STRING, description: "Potongan kata/frasa asli yang perlu diubah" },
                      replacement: { type: Type.STRING, description: "Kata/frasa pengganti yang disarankan" },
                      explanation: { type: Type.STRING, description: "Alasan perbaikan" },
                      type: { 
                        type: Type.STRING, 
                        enum: ["tata_bahasa", "pilihan_kata", "gaya_bahasa"],
                        description: "Kategori perbaikan"
                      }
                    },
                    required: ["original", "replacement", "explanation", "type"]
                  }
                }
              },
              required: ["suggestions"]
            }
          }
        });

        if (response.text) {
          const parsed = JSON.parse(response.text);
          return res.status(200).json({ suggestions: parsed.suggestions || [] });
        }
      } catch (err: any) {
        console.warn(`Model Suggestion (${model}) mengalami kendala:`, err?.message || err);
        lastError = err;
        continue;
      }
    }

    throw lastError || new Error("Gagal menganalisis naskah.");
  } catch (error: any) {
    console.error("AI Suggestions Error:", error);
    return res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}
