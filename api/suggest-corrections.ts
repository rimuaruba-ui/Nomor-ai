import { GoogleGenAI, Type } from "@google/genai";

export default async function handler(req: any, res: any) {
  // Handle CORS and preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, title, style } = req.body || {};
    
    if (!text || typeof text !== "string" || text.trim().length < 5) {
      return res.status(200).json({ suggestions: [] });
    }

    const ai = new GoogleGenAI({ 
      apiKey: process.env.GEMINI_API_KEY || "",
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const prompt = `
      Tugas: Analisis teks naskah alur cerita komik/manga berikut dan berikan saran perbaikan tata bahasa (grammar/spelling), pilihan kata yang lebih kaya (vocabulary), atau variasi kalimat bergaya YouTube Recap / Storytelling (Bahasa Indonesia) agar terdengar lebih dramatis, seru, dan mengalir natural saat dibaca / disuarakan.

      INFORMASI TAMBAHAN (Jika relevan):
      - Judul Cerita: ${title || "Tidak disebutkan"}
      - Gaya Alur: ${style || "dramatis"}

      TEKS YANG HARUS DIANALISIS:
      "${text}"

      PANDUAN SARAN:
      1. "tata_bahasa": Temukan salah tik (typo), kesalahan ejaan formal/tidak baku, tanda baca yang hilang yang mengganggu jeda napas (breathability), dll. Misal: "slalu" -> "selalu", "karna" -> "karena".
      2. "pilihan_kata": Identifikasi pengulangan kata yang membosankan (seperti mengulang kata "lalu", "lalu", "lalu") dan sarankan sinonim yang lebih kaya (kemudian, setelah itu, tak berselang lama, selanjutnya, alhasil).
      3. "gaya_bahasa": Untuk kalimat yang terdengar kaku, berikan alternatif kalimat terstruktur yang lebih dramatis, sinematik, suspenseful, atau membangkitkan emosi pendengar YT recap.
      
      CRITICAL RULE:
      Bagian "original" dalam respons JSON HARUS merupakan substring yang ada PERSIS sama karakter-demi-karakter di dalam TEKS YANG HARUS DIANALISIS sehingga frontend dapat mencocokkan dan menggantinya langsung. Jangan tambahkan tanda kutip ekstra atau modifikasi pada bagian "original".
    `;

    const candidateModels = ["gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3.8-flash"];
    let responseText = "";

    for (const model of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                suggestions: {
                  type: Type.ARRAY,
                  description: "Daftar saran perbaikan naskah berurutan",
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      type: {
                        type: Type.STRING,
                        description: "Kategori saran: 'tata_bahasa', 'pilihan_kata', 'gaya_bahasa'"
                      },
                      severity: {
                        type: Type.STRING,
                        description: "Tingkat dampak: 'warning' atau 'info'"
                      },
                      original: {
                        type: Type.STRING,
                        description: "Sub-teks asli yang persis ada di teks input untuk diganti."
                      },
                      replacement: {
                        type: Type.STRING,
                        description: "Teks pengganti yang disarankan."
                      },
                      explanation: {
                        type: Type.STRING,
                        description: "Penjelasan singkat mengapa saran ini lebih baik (dalam Bahasa Indonesia)."
                      }
                    },
                    required: ["type", "severity", "original", "replacement", "explanation"]
                  }
                }
              },
              required: ["suggestions"]
            }
          }
        });

        if (response.text) {
          responseText = response.text;
          break;
        }
      } catch (modelErr: any) {
        const msg = modelErr?.message || String(modelErr);
        if (msg.includes('503') || msg.includes('high demand') || msg.includes('UNAVAILABLE')) {
          continue;
        }
        console.warn(`Saran AI model ${model} mengalami kendala:`, msg);
        continue;
      }
    }

    if (responseText) {
      try {
        const parsed = JSON.parse(responseText);
        return res.status(200).json(parsed);
      } catch {
        return res.status(200).json({ suggestions: [] });
      }
    }

    return res.status(200).json({ suggestions: [], status: "temporarily_busy" });
  } catch (error: any) {
    console.warn("Suggestions unavailable (high traffic):", error.message || error);
    return res.status(200).json({ suggestions: [], status: "unavailable" });
  }
}
