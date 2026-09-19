import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  const getGeminiClient = (customKey?: string): GoogleGenAI | null => {
    const key = customKey || process.env.GEMINI_API_KEY;
    if (!key) return null;
    return new GoogleGenAI({ 
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  };

  // Post-processing function to ensure pure narrative output without headers, brackets, or label tags
  const cleanNarrativeScript = (text: string): string => {
    if (!text) return "";
    let cleaned = text
      // Remove markdown code blocks if wrapped
      .replace(/^```[\w]*\n?/gm, '')
      .replace(/```$/gm, '')
      // Remove headers like # Halaman 1, ## Image 1, ### Bagian 1, #### Paragraf 1
      .replace(/^#{1,6}\s*(?:Halaman|Gambar|Image|Bagian|Page|Panel|Paragraf)\s*\d+[:.\-]?\s*$/gim, '')
      // Remove bracket labels like [Image 1], [Halaman 1], [Bagian 1], (Image 1), [Page 1]
      .replace(/^[\[\(](?:Halaman|Gambar|Image|Bagian|Page|Panel|Paragraf)\s*\d+[\]\)][:.\-]?\s*/gim, '')
      // Remove lines starting with "Image 1:", "Halaman 1:", "Gambar 1 -", "**Image 1:**", "**Halaman 1**"
      .replace(/^\*?\*?(?:Halaman|Gambar|Image|Bagian|Page|Panel|Paragraf)\s*\d+\*?\*?[:.\-]?\s*/gim, '')
      // Remove intro conversational openers if any
      .replace(/^Berikut\s+(?:adalah\s+)?naskah[^\n]*:\s*\n+/i, '')
      .trim();

    // Split into paragraphs, clean any inline stray bracket tags at the start of each paragraph, and rejoin
    const paragraphs = cleaned
      .split(/\n\s*\n+/)
      .map(p => {
        return p
          .replace(/^[\[\(]?(?:Halaman|Gambar|Image|Bagian|Page|Panel|Paragraf)\s*\d+[\]\)]?[:.\-]?\s*/i, '')
          .replace(/^\*?\*?(?:Halaman|Gambar|Image|Bagian|Page|Panel|Paragraf)\s*\d+\*?\*?[:.\-]?\s*/i, '')
          .trim();
      })
      .filter(p => p.length > 0);

    return paragraphs.join('\n\n');
  };

  const buildMangaPrompt = (mangaConfig: any, imageCount: number) => {
    const { title, videoType, style, customStyleRef, detailLevel, chapter, useHook, deliveryStyle } = mangaConfig || {};
    const effectiveStyle = style || 'formal';
    const pov = deliveryStyle === 'pov' ? 'POV Karakter Utama (Gunakan kata ganti "Aku")' : 'Narator Orang Ketiga (Sudut pandang orang ketiga serba tahu)';

    return `
TUGAS UTAMA:
Buat naskah narasi spoiler alur cerita manga/manhwa untuk VOICEOVER YouTube Recap dengan ATURAN STRUKTUR DAN FORMAT MUTLAK berikut:

ATURAN STRUKTUR WAJIB: 1 GAMBAR = TEPAT 1 PARAGRAF NASKAH
1. JUMLAH GAMBAR: Terdapat TEPAT ${imageCount} gambar halaman manga yang diunggah secara berurutan.
2. JUMLAH PARAGRAF OUTPUT: Naskah yang kamu hasilkan WAJIB terdiri dari TEPAT ${imageCount} PARAGRAF NARASI.
   - Paragraf ke-1 menceritakan adegan pada gambar/halaman ke-1.
   - Paragraf ke-2 menceritakan adegan pada gambar/halaman ke-2.
   - ...dan seterusnya berurutan hingga Paragraf ke-${imageCount} menceritakan gambar/halaman ke-${imageCount}.
   - Setiap paragraf dipisahkan dengan SATU BARIS KOSONG (dua newline \\n\\n).

DILARANG KERAS MENYERTAKAN KETERANGAN ATAU LABEL APAPUN:
- JANGAN menulis label seperti "[Bagian 1]", "[Image 1]", "[Halaman 1]", "Halaman 1:", "Paragraf 1:", "Gambar 1:", "**Image 1**", judul bab, atau penomoran apapun!
- JANGAN menulis kata pembuka basa-basi seperti "Berikut adalah naskahnya...", "Tentu,", "Halo...", dll.
- JANGAN menulis kata penutup seperti "Bersambung...", "To be continued...", "Terima kasih...", dll.
- OUTPUT HARUS LANGSUNG NASKAH SAJA! Karakter pertama yang kamu keluarkan adalah langsung awal kalimat paragraf pertama.

GAYA PENULISAN & PENCERITAAN:
- Gaya Bahasa Default: Formal, lugas, mengalir sinematik tanpa banyak basa-basi.
- Sudut Pandang: ${pov}
- Alur & Detail: Spoiler alur lengkap terurut sesuai jalannya cerita. Ceritakan secara rinci dialog penting, interaksi karakter, serta dinamika emosi dan situasi pada setiap halaman komik secara faktual tanpa halusinasi.
- Urutan Baca: Ikuti logika baca manga standar (dari KANAN ke KIRI, lalu ATAS ke BAWAH).
- TANPA SFX: JANGAN menyertakan onomatopoeia atau efek suara (seperti: sfx, tap, brak, dor, dsb). Integrasikan suara atau aksi ke dalam kalimat deskriptif yang elegan.

CONTOH GAYA DAN CARA PENCERITAAN (Perhatikan struktur 1 halaman = 1 paragraf mengalir formal):
Cerita dimulai dengan memperlihatkan Taiki dan Chinatsu yang sedang berkunjung ke sebuah toko perlengkapan olahraga besar bernama Alpen Outdoors. Mereka berdua tampak terkesima melihat banyaknya pilihan pakaian olahraga yang tersedia di sana sambil berdiskusi apakah harus menuju area bulu tangkis atau melihat koleksi pakaian terlebih dahulu.

Sambil berjalan menaiki eskalator menuju lantai dua, Taiki terus memperhatikan Chinatsu dan mulai membayangkan betapa kerennya gadis itu saat beraksi dalam berbagai cabang olahraga seperti tenis dan sepak bola. Hal ini membuat Taiki merasa sangat antusias untuk menghabiskan waktu bersama di toko tersebut.

Setibanya di area pakaian, Taiki menyadari bahwa momen ini adalah kencan pertama mereka yang sebenarnya. Ia merasa sangat senang karena kali ini dialah yang mengajak Chinatsu keluar untuk bersenang-senang, sebuah kemajuan besar dibandingkan interaksi mereka sebelumnya.

INFORMASI TAMBAHAN:
- Judul Manga: ${title || "Tidak disebutkan"}
- Chapter: ${chapter || "Tidak disebutkan"}
- Gaya Bahasa Terpilih: ${effectiveStyle === 'formal' ? 'Formal (Default)' : effectiveStyle}
${effectiveStyle === 'custom' && customStyleRef ? `REFERENSI GAYA KHUSUS:\n"${customStyleRef}"\n` : ''}
${useHook ? '- CATATAN HOOK: Di paragraf pertama, buat kalimat pembuka yang langsung memikat rasa penasaran audiens (High CTR).' : ''}

INGAT: Tepat ${imageCount} gambar = Tepat ${imageCount} paragraf naskah. LANGSUNG NASKAH SAJA tanpa keterangan [Bagian X] atau [Image X]!
`;
  };

  const generateWithGoogleGemini = async (images: any[], prompt: string, customGoogleKey?: string) => {
    const client = getGeminiClient(customGoogleKey);
    if (!client) {
      throw new Error("Kunci API Gemini belum dikonfigurasi. Masukkan Gemini API Key di Pengaturan.");
    }

    const candidateModels = ["gemini-3.8-flash", "gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3-flash-preview"];
    let lastError: any = null;

    for (const model of candidateModels) {
      try {
        const response = await client.models.generateContent({
          model,
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                ...images.map((img: any) => ({
                  inlineData: {
                    mimeType: img.mimeType || "image/jpeg",
                    data: img.data
                  }
                }))
              ]
            }
          ]
        });

        if (response.text) {
          return response.text;
        }
      } catch (err: any) {
        console.warn(`Model Google Gemini (${model}) mengalami kendala/503:`, err?.message || err);
        lastError = err;
        continue;
      }
    }

    throw lastError || new Error("Layanan Gemini sedang mengalami lonjakan trafik tinggi (503). Silakan coba sesaat lagi.");
  };

  const generateWithKieGeminiFlash = async (images: any[], prompt: string, kieKey: string) => {
    const response = await fetch("https://api.kie.ai/gemini/v1/models/gemini-3-7-flash:streamGenerateContent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${kieKey}`
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              ...images.map((img: any) => ({
                inlineData: {
                  mimeType: img.mimeType || "image/jpeg",
                  data: img.data
                }
              }))
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Kie.ai (HTTP ${response.status}): ${errText}`);
    }

    const rawText = await response.text();
    let fullText = "";

    // Parse SSE stream lines
    const lines = rawText.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "data: [DONE]") continue;
      if (trimmed.startsWith("data:")) {
        try {
          const jsonStr = trimmed.replace(/^data:\s*/, "");
          const parsed = JSON.parse(jsonStr);
          const partText = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (partText) fullText += partText;
        } catch {
          // ignore non-json line
        }
      }
    }

    // Direct JSON fallback
    if (!fullText) {
      try {
        const directJson = JSON.parse(rawText);
        if (Array.isArray(directJson)) {
          for (const item of directJson) {
            const partText = item.candidates?.[0]?.content?.parts?.[0]?.text;
            if (partText) fullText += partText;
          }
        } else if (directJson.candidates?.[0]?.content?.parts?.[0]?.text) {
          fullText = directJson.candidates[0].content.parts[0].text;
        }
      } catch {
        if (rawText.length > 50) fullText = rawText;
      }
    }

    return fullText;
  };

  const generateWithKieGeminiPro = async (images: any[], prompt: string, kieKey: string) => {
    const response = await fetch("https://api.kie.ai/gemini-3.1-pro/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${kieKey}`
      },
      body: JSON.stringify({
        model: "gemini-3.1-pro",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              ...images.map((img: any) => ({
                type: "image_url",
                image_url: {
                  url: `data:${img.mimeType || 'image/jpeg'};base64,${img.data}`
                }
              }))
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Kie.ai (HTTP ${response.status}): ${errText}`);
    }

    const data: any = await response.json();
    const fullText = data.choices?.[0]?.message?.content || "";
    return fullText;
  };

  // Main Narrative Generation Endpoint (supports Google Gemini, Kie.ai 3.7 Flash, & Kie.ai 3.1 Pro)
  app.post("/api/generate-narrative", async (req, res) => {
    try {
      const { images, mangaConfig, aiProvider, kieApiKey, googleApiKey } = req.body;
      
      if (!images || !Array.isArray(images) || images.length === 0) {
        return res.status(400).json({ error: "No images provided" });
      }

      const prompt = buildMangaPrompt(mangaConfig, images.length);
      const effectiveKieKey = kieApiKey || process.env.KIE_API_KEY || "";
      const effectiveGoogleKey = googleApiKey || process.env.GEMINI_API_KEY || "";
      const selectedProvider = aiProvider || 'gemini-default';

      let text = "";
      let activeProviderLabel = "Google Gemini Bawaan";
      let warning: string | null = null;

      if (selectedProvider === 'kie-gemini-3.7-flash') {
        if (!effectiveKieKey) {
          warning = "API Key Kie.ai belum diatur. Otomatis dialihkan ke Google Gemini bawaan.";
          text = await generateWithGoogleGemini(images, prompt, effectiveGoogleKey);
          activeProviderLabel = "Google Gemini (Auto-Fallback)";
        } else {
          try {
            text = await generateWithKieGeminiFlash(images, prompt, effectiveKieKey);
            activeProviderLabel = "Kie.ai — Gemini 3.7 Flash";
          } catch (kieErr: any) {
            console.warn("Kie.ai Flash gagal, menjalankan proteksi auto-fallback:", kieErr.message);
            warning = `Kie.ai tidak merespons (${kieErr.message}). Otomatis dialihkan ke Google Gemini bawaan.`;
            text = await generateWithGoogleGemini(images, prompt, effectiveGoogleKey);
            activeProviderLabel = "Google Gemini (Auto-Fallback)";
          }
        }
      } else if (selectedProvider === 'kie-gemini-3.1-pro') {
        if (!effectiveKieKey) {
          warning = "API Key Kie.ai belum diatur. Otomatis dialihkan ke Google Gemini bawaan.";
          text = await generateWithGoogleGemini(images, prompt, effectiveGoogleKey);
          activeProviderLabel = "Google Gemini (Auto-Fallback)";
        } else {
          try {
            text = await generateWithKieGeminiPro(images, prompt, effectiveKieKey);
            activeProviderLabel = "Kie.ai — Gemini 3.1 Pro";
          } catch (kieErr: any) {
            console.warn("Kie.ai Pro gagal, menjalankan proteksi auto-fallback:", kieErr.message);
            warning = `Kie.ai tidak merespons (${kieErr.message}). Otomatis dialihkan ke Google Gemini bawaan.`;
            text = await generateWithGoogleGemini(images, prompt, effectiveGoogleKey);
            activeProviderLabel = "Google Gemini (Auto-Fallback)";
          }
        }
      } else {
        text = await generateWithGoogleGemini(images, prompt, effectiveGoogleKey);
        activeProviderLabel = "Google Gemini Bawaan";
      }

      // Ensure 100% clean narrative without [Bagian 1], [Image 1], or intro/outro remarks
      text = cleanNarrativeScript(text);

      res.json({ 
        text, 
        provider: activeProviderLabel,
        warning
      });
    } catch (error: any) {
      console.error("Narrative Generation API Error:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // Background correction and suggestion endpoint using gemini-3.5-flash
  app.post("/api/suggest-corrections", async (req, res) => {
    try {
      const { text, title, style } = req.body;
      
      if (!text || typeof text !== "string" || text.trim().length < 5) {
        return res.json({ suggestions: [] });
      }

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

      const client = getGeminiClient();
      if (!client) {
        return res.json({ suggestions: [], status: "api_key_not_set" });
      }

      const candidateModels = ["gemini-3.8-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
      let responseText = "";

      for (const model of candidateModels) {
        try {
          const response = await client.models.generateContent({
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
          console.warn(`Saran AI model ${model} sedang padat/503 (${modelErr.message || modelErr}). Mencoba alternatif...`);
          continue;
        }
      }

      if (responseText) {
        try {
          const parsed = JSON.parse(responseText);
          return res.json(parsed);
        } catch {
          return res.json({ suggestions: [] });
        }
      }

      // If all models are temporarily saturated (503), gracefully return empty list without crashing
      return res.json({ suggestions: [], status: "temporarily_busy" });
    } catch (error: any) {
      console.warn("Suggestions unavailable (high traffic):", error.message || error);
      res.json({ suggestions: [], status: "unavailable" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
