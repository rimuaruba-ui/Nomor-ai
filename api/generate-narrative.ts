import { GoogleGenAI } from "@google/genai";

export const config = {
  maxDuration: 60,
};

// Post-processing function to ensure pure narrative output without headers, brackets, or label tags
function cleanNarrativeScript(text: string): string {
  if (!text) return "";
  const cleaned = text
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
}

function buildMangaPrompt(mangaConfig: any, imageCount: number) {
  const { title, style, customStyleRef, chapter, useHook, deliveryStyle } = mangaConfig || {};
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
}

async function generateWithGoogleGemini(images: any[], prompt: string, customGoogleKey?: string) {
  const client = new GoogleGenAI({ 
    apiKey: customGoogleKey || process.env.GEMINI_API_KEY || "",
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

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
      console.warn(`Model Google Gemini (${model}) mengalami kendala:`, err?.message || err);
      lastError = err;
      continue;
    }
  }

  throw lastError || new Error("Layanan Gemini sedang mengalami lonjakan trafik tinggi. Silakan coba sesaat lagi.");
}

async function generateWithKieGeminiFlash(images: any[], prompt: string, kieKey: string) {
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
        // ignore
      }
    }
  }

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
}

async function generateWithKieGeminiPro(images: any[], prompt: string, kieKey: string) {
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
}

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
    const { images, mangaConfig, aiProvider, kieApiKey, googleApiKey } = req.body || {};
    
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

    text = cleanNarrativeScript(text);

    return res.status(200).json({ 
      text, 
      provider: activeProviderLabel,
      warning
    });
  } catch (error: any) {
    console.error("Narrative Generation API Error:", error);
    return res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}
