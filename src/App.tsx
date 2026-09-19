import React, { useState, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import { Upload, Scissors, FileText, Download, Play, Trash2, Loader2, Home as HomeIcon, Settings, Sun, Moon, Maximize, Minimize, Sparkles, Check, X, RotateCw, AlertCircle, ExternalLink, PenTool, FileEdit, RefreshCw, Zap, Cpu, ShieldCheck } from 'lucide-react';

interface PanelData {
  id: number;
  startY: number;
  imageSrc: string;
  script: string;
  isGeneratingScript: boolean;
  error: string | null;
}

interface UploadedImage {
  id: string;
  file: File;
  img: HTMLImageElement;
  name: string;
  splitPoints: number[];
  panels: PanelData[];
  hiddenPanels: number[];
}

// Utility: adaptive compression and scale down for images to ensure Vercel Serverless Function body limit (<4.5MB) is never exceeded
const compressImageForAI = (imgElement: HTMLImageElement, totalCount: number = 1): Promise<{ data: string; mimeType: string }> => {
  return new Promise((resolve) => {
    try {
      // Scale dimensions & quality adaptively based on image count
      let maxDim = 1200;
      let quality = 0.80;
      if (totalCount > 15) {
        maxDim = 720;
        quality = 0.68;
      } else if (totalCount > 8) {
        maxDim = 850;
        quality = 0.72;
      } else if (totalCount > 3) {
        maxDim = 1000;
        quality = 0.78;
      }

      const canvas = document.createElement('canvas');
      let w = imgElement.naturalWidth || imgElement.width || 1200;
      let h = imgElement.naturalHeight || imgElement.height || 1600;

      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(imgElement, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const base64 = dataUrl.split(',')[1];
        resolve({ data: base64, mimeType: 'image/jpeg' });
        return;
      }
    } catch (err) {
      console.warn("Kompresi canvas gagal, menggunakan gambar asli:", err);
    }

    const src = imgElement.src || '';
    if (src.includes(',')) {
      const parts = src.split(',');
      const mime = parts[0].includes('image/jpeg') ? 'image/jpeg' : 'image/png';
      resolve({ data: parts[1], mimeType: mime });
    } else {
      resolve({ data: '', mimeType: 'image/jpeg' });
    }
  });
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'manga-tool' | 'panel-cutter' | 'settings'>('home');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [userApiKey, setUserApiKey] = useState<string>(() => localStorage.getItem('nimo_api_key') || '');
  
  // Kie.ai & AI Provider Selection
  const [aiProvider, setAiProvider] = useState<'gemini-default' | 'kie-gemini-3.7-flash' | 'kie-gemini-3.1-pro'>(
    () => (localStorage.getItem('nimo_ai_provider') as any) || 'kie-gemini-3.7-flash'
  );
  const [kieApiKey, setKieApiKey] = useState<string>(() => localStorage.getItem('nimo_kie_api_key') || '');
  const [usedProviderLabel, setUsedProviderLabel] = useState<string>('');
  const [activeProviderWarning, setActiveProviderWarning] = useState<string | null>(null);

  // AI Suggestions states
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isAnalyzingText, setIsAnalyzingText] = useState(false);
  const [enableAiSuggestions, setEnableAiSuggestions] = useState(true);
  const [lastAnalyzedText, setLastAnalyzedText] = useState("");
  
  const hasApiKey = true; // Server always maintains connected backend infrastructure

  const handleTabChange = (tab: 'home' | 'manga-tool' | 'panel-cutter' | 'settings') => {
    setActiveTab(tab);
  };
  
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);
  
  const [fullNarrative, setFullNarrative] = useState<string>('');
  const [isGeneratingFullNarrative, setIsGeneratingFullNarrative] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Client-side sanitizer to guarantee direct narrative without [Bagian 1], [Image 1], or other labels
  const cleanClientNarrative = (text: string): string => {
    if (!text) return "";
    const cleaned = text
      .replace(/^```[\w]*\n?/gm, '')
      .replace(/```$/gm, '')
      .replace(/^#{1,6}\s*(?:Halaman|Gambar|Image|Bagian|Page|Panel|Paragraf)\s*\d+[:.\-]?\s*$/gim, '')
      .replace(/^[\[\(](?:Halaman|Gambar|Image|Bagian|Page|Panel|Paragraf)\s*\d+[\]\)][:.\-]?\s*/gim, '')
      .replace(/^\*?\*?(?:Halaman|Gambar|Image|Bagian|Page|Panel|Paragraf)\s*\d+\*?\*?[:.\-]?\s*/gim, '')
      .replace(/^Berikut\s+(?:adalah\s+)?naskah[^\n]*:\s*\n+/i, '')
      .trim();

    return cleaned
      .split(/\n\s*\n+/)
      .map(p => p
        .replace(/^[\[\(]?(?:Halaman|Gambar|Image|Bagian|Page|Panel|Paragraf)\s*\d+[\]\)]?[:.\-]?\s*/i, '')
        .replace(/^\*?\*?(?:Halaman|Gambar|Image|Bagian|Page|Panel|Paragraf)\s*\d+\*?\*?[:.\-]?\s*/i, '')
        .trim()
      )
      .filter(p => p.length > 0)
      .join('\n\n');
  };

  const [mangaConfig, setMangaConfig] = useState({
    title: '',
    videoType: 'spoiler',
    style: 'formal',
    customStyleRef: '',
    detailLevel: 'detail',
    deliveryStyle: 'narator',
    chapter: '',
    useHook: false
  });
  
  // Standalone Splitter State
  const [cutterImages, setCutterImages] = useState<UploadedImage[]>([]);
  const [activeCutterIndex, setActiveCutterIndex] = useState<number>(0);
  
  const currentImage = activeTab === 'panel-cutter' 
    ? (cutterImages[activeCutterIndex] || null)
    : (uploadedImages[activeImageIndex] || null);
  
  const [show169Guide, setShow169Guide] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  // Resize observer to keep canvas responsive
  useEffect(() => {
    if (activeTab !== 'panel-cutter' || !containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      if (entries[0]) {
        setContainerWidth(entries[0].contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [activeTab]);

  // Handle Image Upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newImagesPromises = Array.from(files).map((file: File) => {
        return new Promise<UploadedImage>((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
              resolve({
                id: Math.random().toString(36).substring(2, 11),
                file: file,
                img: img,
                name: file.name,
                splitPoints: [0],
                panels: [],
                hiddenPanels: []
              } as UploadedImage);
            };
            img.src = event.target?.result as string;
          };
          reader.readAsDataURL(file);
        });
      });

      Promise.all(newImagesPromises).then(newImages => {
        if (activeTab === 'panel-cutter') {
          setCutterImages(prev => [...prev, ...newImages]);
          if (cutterImages.length === 0) setActiveCutterIndex(0);
        } else {
          const imagesWithDefaultPanel = newImages.map(img => ({
            ...img,
            panels: [{
              id: 1,
              startY: 0,
              imageSrc: img.img.src,
              script: '',
              isGeneratingScript: false,
              error: null
            }]
          }));
          setUploadedImages(prev => [...prev, ...imagesWithDefaultPanel]);
          if (uploadedImages.length === 0) setActiveImageIndex(0);
        }
      });
    }
  };

  const updateCurrentImage = (updates: Partial<UploadedImage>) => {
    if (activeTab === 'panel-cutter') {
      setCutterImages(prev => prev.map((img, idx) => 
        idx === activeCutterIndex ? { ...img, ...updates } : img
      ));
    } else {
      setUploadedImages(prev => prev.map((img, idx) => 
        idx === activeImageIndex ? { ...img, ...updates } : img
      ));
    }
  };

  // Draw Canvas
  useEffect(() => {
    if (currentImage && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const aspectRatio = currentImage.img.height / currentImage.img.width;
        // Use container width for responsiveness
        canvas.width = Math.min(currentImage.img.width, containerWidth);
        canvas.height = canvas.width * aspectRatio;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(currentImage.img, 0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 5]);

        currentImage.splitPoints.forEach(yRatio => {
          if (yRatio > 0) {
            const y = yRatio * canvas.height;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
          }
        });

        if (show169Guide) {
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)'; // emerald-500
          ctx.setLineDash([5, 5]);
          ctx.lineWidth = 2;
          const guideHeight = canvas.width * (9 / 16);
          for (let y = 0; y < canvas.height; y += guideHeight) {
            ctx.beginPath();
            ctx.moveTo(0, y + guideHeight);
            ctx.lineTo(canvas.width, y + guideHeight);
            ctx.stroke();
          }
        }
      }
      updatePanels();
    }
  }, [currentImage?.img, currentImage?.splitPoints, currentImage?.hiddenPanels, show169Guide, containerWidth]);

  const updatePanels = () => {
    if (!currentImage || !canvasRef.current) return;
    const canvas = canvasRef.current;
    
    // Sort split points as ratios
    const sortedRatios = [...currentImage.splitPoints, 1].sort((a, b) => a - b);
    const newPanels: PanelData[] = [];

    let visibleCounter = 1;
    for (let i = 0; i < sortedRatios.length - 1; i++) {
      const startYRatio = sortedRatios[i];
      const endYRatio = sortedRatios[i + 1];
      const startY = startYRatio * canvas.height;
      const height = (endYRatio - startYRatio) * canvas.height;

      // Validation: Skip panels that are too small
      if (height <= 30) continue; 
      if (currentImage.hiddenPanels.includes(startYRatio)) continue;

      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCanvas.width = canvas.width;
        tempCanvas.height = height;
        
        const scale = currentImage.img.width / canvas.width;
        tempCtx.drawImage(
          currentImage.img,
          0, startY * scale,
          currentImage.img.width, height * scale,
          0, 0,
          canvas.width, height
        );

        const panelImageSrc = tempCanvas.toDataURL();
        
        // Preserve existing script using startYRatio as a stable key
        const existingPanel = currentImage.panels.find(p => Math.abs(p.startY - startYRatio) < 0.001);
        newPanels.push({
          id: visibleCounter++,
          startY: startYRatio, // Store as ratio
          imageSrc: panelImageSrc,
          script: existingPanel?.script || '',
          isGeneratingScript: false,
          error: null
        });
      }
    }
    updateCurrentImage({ panels: newPanels });
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!currentImage || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const yPx = e.clientY - rect.top;
    const yRatio = yPx / rect.height; // Use displayed height (rect.height) instead of internal height

    // Validation: Ensure the cut is not too close to another cut (min 2% difference or ~20px on average)
    const minDiff = 0.015; 
    const isTooClose = currentImage.splitPoints.some(p => Math.abs(p - yRatio) < minDiff);
    
    if (isTooClose) {
      return; // Silently ignore or show a very subtle indication
    }

    updateCurrentImage({ 
      splitPoints: [...currentImage.splitPoints, yRatio].sort((a, b) => a - b) 
    });
  };

  const resetSplits = () => {
    updateCurrentImage({ splitPoints: [0], panels: [], hiddenPanels: [] });
  };

  const hidePanel = (startY: number) => {
    updateCurrentImage({ hiddenPanels: [...currentImage!.hiddenPanels, startY] });
  };

  const formatAiError = (error: any) => {
    let message = error.message || String(error);
    
    // Check for specific Gemini/Google AI status codes
    if (message.includes('429') || message.toLowerCase().includes('quota') || message.toLowerCase().includes('rate limit') || message.includes('RESOURCE_EXHAUSTED')) {
      return "QUOTA EXCEEDED: Batas penggunaan API Gemini telah tercapai. Silakan gunakan API Key pribadi Anda di menu Pengaturan atau tunggu beberapa saat.";
    }
    
    if (message.includes('403') || message.toLowerCase().includes('permission denied') || message.toLowerCase().includes('not authorized')) {
      return "PERMISSION DENIED: API Key tidak valid atau tidak memiliki izin akses. Pastikan API Key di Pengaturan sudah benar dan aktif.";
    }
    
    if (message.includes('API_KEY_INVALID')) {
      return "INVALID KEY: API Key yang Anda masukkan tidak valid. Silakan periksa kembali di menu Pengaturan.";
    }

    return message;
  };

  const generateAllScripts = async () => {
    if (uploadedImages.length === 0) {
      alert("Harap unggah gambar terlebih dahulu.");
      return;
    }

    setIsGeneratingFullNarrative(true);
    setGenerationError(null);
    setActiveProviderWarning(null);
    setFullNarrative('');

    try {
      // Compress all uploaded images adaptively to prevent payload limits and speed up generation
      const imagesData = await Promise.all(
        uploadedImages.map(img => compressImageForAI(img.img, uploadedImages.length))
      );

      const response = await fetch("/api/generate-narrative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          images: imagesData,
          mangaConfig: mangaConfig,
          aiProvider: aiProvider,
          kieApiKey: kieApiKey,
          googleApiKey: userApiKey
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Server error during generation");
      }

      const data = await response.json();
      const sanitizedNarrative = cleanClientNarrative(data.text || '');
      setFullNarrative(sanitizedNarrative);
      if (data.provider) {
        setUsedProviderLabel(data.provider);
      }
      if (data.warning) {
        setActiveProviderWarning(data.warning);
      }
    } catch (error: any) {
      console.error("Error in narrative generation:", error);
      const friendlyError = formatAiError(error);
      setGenerationError(friendlyError);
    } finally {
      setIsGeneratingFullNarrative(false);
    }
  };

  // Debounced real-time proactive script improvement analyser
  useEffect(() => {
    if (!enableAiSuggestions) {
      setSuggestions([]);
      return;
    }
    const currentText = fullNarrative || uploadedImages.flatMap(img => img.panels.map(p => p.script)).filter(s => s.trim()).join('\n\n');
    if (!currentText || currentText.trim().length < 10) {
      setSuggestions([]);
      return;
    }
    if (currentText === lastAnalyzedText) return;

    const timer = setTimeout(async () => {
      setIsAnalyzingText(true);
      try {
        const response = await fetch("/api/suggest-corrections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: currentText,
            title: mangaConfig.title,
            style: mangaConfig.style
          })
        });
        if (response.ok) {
          const data = await response.json();
          setSuggestions(data.suggestions || []);
          setLastAnalyzedText(currentText);
        }
      } catch (err) {
        console.error("Gagal mendapatkan saran AI:", err);
      } finally {
        setIsAnalyzingText(false);
      }
    }, 1800); // 1.8 seconds quiet typing window

    return () => clearTimeout(timer);
  }, [fullNarrative, uploadedImages, enableAiSuggestions, lastAnalyzedText, mangaConfig.title, mangaConfig.style]);

  const handleAcceptSuggestion = (index: number) => {
    const suggestion = suggestions[index];
    if (!suggestion) return;

    const originalText = suggestion.original;
    const replacementText = suggestion.replacement;

    // Determine current text source
    const currentText = fullNarrative || uploadedImages.flatMap(img => img.panels.map(p => p.script)).filter(s => s.trim()).join('\n\n');

    if (currentText.includes(originalText)) {
      const updatedText = currentText.replace(originalText, replacementText);
      setFullNarrative(updatedText);
      setSuggestions(prev => prev.filter((_, idx) => idx !== index));
      setLastAnalyzedText(updatedText);
    } else {
      alert("Teks asli sudah berubah atau tidak ditemukan.");
      setSuggestions(prev => prev.filter((_, idx) => idx !== index));
    }
  };

  const handleDismissSuggestion = (index: number) => {
    setSuggestions(prev => prev.filter((_, idx) => idx !== index));
  };

  const [isDownloadingAll, setIsDownloadingAll] = useState(false);

  const downloadAllImages = async () => {
    if (!currentImage || currentImage.panels.length === 0) return;
    setIsDownloadingAll(true);
    try {
      // Loop through panels of the CURRENT image and trigger download for each
      for (let i = 0; i < currentImage.panels.length; i++) {
        const panel = currentImage.panels[i];
        const link = document.createElement('a');
        link.href = panel.imageSrc;
        link.download = `halaman_${activeCutterIndex + 1}_panel_${panel.id}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        // Small delay to avoid browser blocking multiple downloads if possible
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (err) {
      console.error('Error during download:', err);
      alert('Gagal mengunduh gambar. Silakan coba lagi.');
    } finally {
      setIsDownloadingAll(false);
    }
  };

  const exportScript = () => {
    let fullScript = `ALUR CERITA MANGA\n=====================\n\n`;
    uploadedImages.forEach((img, imgIdx) => {
      fullScript += `HALAMAN: ${img.name}\n`;
      fullScript += `---------------------\n`;
      img.panels.forEach((panel) => {
        fullScript += `PANEL #${panel.id}\n`;
        fullScript += `${panel.script || '(Tidak ada naskah)'}\n\n`;
      });
      fullScript += `\n`;
    });
    const blob = new Blob([fullScript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'naskah_alur_cerita_manga.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const mergeAllScripts = () => {
    let merged = "";
    uploadedImages.forEach(img => {
      img.panels.forEach(p => {
        if (p.script.trim()) {
          merged += p.script.trim() + " ";
        }
      });
    });
    
    if (!merged) {
      alert("Belum ada naskah yang digenerate.");
      return;
    }

    navigator.clipboard.writeText(merged.trim());
    alert("Seluruh naskah telah digabungkan dan disalin ke clipboard!");
  };

  return (
    <div className={`min-h-screen flex flex-col md:flex-row transition-colors duration-700 font-sans ${isDarkMode ? 'bg-[#18191c] text-white' : 'bg-[#f8fafc] text-black'}`}>
      {/* Sidebar for Desktop */}
      <aside className={`hidden md:flex flex-col w-72 h-screen sticky top-0 transition-colors duration-500 z-50 ${isDarkMode ? 'bg-[#212226] border-r border-white/5 shadow-2xl' : 'bg-white border-r border-slate-200/60 shadow-xl shadow-slate-200/20'}`}>
        <div className={`p-8 flex items-center space-x-3 transition-colors`}>
          <div className="w-10 h-10 bg-gradient-to-tr from-indigo-500 to-emerald-400 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <span className="text-white font-display font-black text-2xl italic tracking-tighter">N</span>
          </div>
          <div className="flex flex-col">
            <span className={`text-xl font-display font-black tracking-tight leading-none transition-colors ${isDarkMode ? 'text-white' : 'text-black'}`}>NIMO AI</span>
            <span className={`text-[10px] font-mono uppercase tracking-[0.2em] opacity-40 ${isDarkMode ? 'text-zinc-400' : 'text-slate-500'}`}>Creative Studio</span>
          </div>
        </div>
        
        <nav className="flex-grow p-6 space-y-1.5">
          <button
            onClick={() => handleTabChange('home')}
            className={`w-full px-5 py-4 rounded-2xl text-[11px] font-black tracking-[0.15em] uppercase transition-all flex items-center space-x-4 ${
              activeTab === 'home' 
                ? (isDarkMode ? 'bg-indigo-500/10 text-white ring-1 ring-indigo-500/30 shadow-lg shadow-indigo-500/10' : 'bg-indigo-50 text-black ring-1 ring-indigo-200 shadow-md shadow-indigo-500/5') 
                : `hover:bg-zinc-500/5 ${isDarkMode ? 'text-zinc-500 hover:text-white' : 'text-slate-500 hover:text-black font-medium'}`
            }`}
          >
            <HomeIcon className={`w-4 h-4 ${activeTab === 'home' ? 'opacity-100' : 'opacity-40'}`} />
            <span>Beranda</span>
          </button>
          <button
            onClick={() => handleTabChange('manga-tool')}
            className={`w-full px-5 py-4 rounded-2xl text-[11px] font-black tracking-[0.15em] uppercase transition-all flex items-center space-x-4 ${
              activeTab === 'manga-tool' 
                ? (isDarkMode ? 'bg-indigo-500/10 text-white ring-1 ring-indigo-500/30 shadow-lg shadow-indigo-500/10' : 'bg-indigo-50 text-black ring-1 ring-indigo-200 shadow-md shadow-indigo-500/5') 
                : `hover:bg-zinc-500/5 ${isDarkMode ? 'text-zinc-500 hover:text-white' : 'text-slate-500 hover:text-black font-medium'}`
            }`}
          >
            <FileText className={`w-4 h-4 ${activeTab === 'manga-tool' ? 'opacity-100' : 'opacity-40'}`} />
            <span>Asisten Alur Manga</span>
          </button>

          {/* Fitur Eksternal: Urutan Kedua (Pembuat Naskah) & Urutan Ketiga (Rewrite Naskah) */}
          <a
            href="https://pembuat-naskah.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            className={`w-full px-5 py-3.5 rounded-2xl text-[11px] font-black tracking-[0.15em] uppercase transition-all flex items-center justify-between hover:bg-indigo-500/10 group ${
              isDarkMode ? 'text-zinc-400 hover:text-indigo-400' : 'text-slate-600 hover:text-indigo-600'
            }`}
            title="Buka platform Pembuat Naskah"
          >
            <div className="flex items-center space-x-4">
              <PenTool className="w-4 h-4 text-indigo-500 group-hover:scale-110 transition-transform" />
              <span>Pembuat Naskah</span>
            </div>
            <ExternalLink className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />
          </a>

          <a
            href="https://pembuat-naskah.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            className={`w-full px-5 py-3.5 rounded-2xl text-[11px] font-black tracking-[0.15em] uppercase transition-all flex items-center justify-between hover:bg-emerald-500/10 group ${
              isDarkMode ? 'text-zinc-400 hover:text-emerald-400' : 'text-slate-600 hover:text-emerald-600'
            }`}
            title="Buka platform Rewrite Naskah"
          >
            <div className="flex items-center space-x-4">
              <RefreshCw className="w-4 h-4 text-emerald-500 group-hover:scale-110 transition-transform" />
              <span>Rewrite Naskah</span>
            </div>
            <ExternalLink className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />
          </a>

          <button
            onClick={() => handleTabChange('panel-cutter')}
            className={`w-full px-5 py-4 rounded-2xl text-[11px] font-black tracking-[0.15em] uppercase transition-all flex items-center space-x-4 ${
              activeTab === 'panel-cutter' 
                ? (isDarkMode ? 'bg-indigo-500/10 text-white ring-1 ring-indigo-500/30 shadow-lg shadow-indigo-500/10' : 'bg-indigo-50 text-black ring-1 ring-indigo-200 shadow-md shadow-indigo-500/5') 
                : `hover:bg-zinc-500/5 ${isDarkMode ? 'text-zinc-500 hover:text-white' : 'text-slate-500 hover:text-black font-medium'}`
            }`}
          >
            <Scissors className={`w-4 h-4 ${activeTab === 'panel-cutter' ? 'opacity-100' : 'opacity-40'}`} />
            <span>Potong Panel</span>
          </button>

          <a
            href="https://sites.google.com/view/aniimage/aniimage"
            target="_blank"
            rel="noopener noreferrer"
            className={`w-full px-5 py-4 rounded-2xl text-[11px] font-black tracking-[0.15em] uppercase transition-all flex items-center justify-between hover:bg-indigo-500/10 group ${
              isDarkMode ? 'text-zinc-400 hover:text-indigo-400' : 'text-slate-600 hover:text-indigo-600'
            }`}
            title="Buka platform AniImage untuk download gambar manga masal"
          >
            <div className="flex items-center space-x-4">
              <Download className="w-4 h-4 text-indigo-500 group-hover:scale-110 transition-transform" />
              <span>Download Gambar</span>
            </div>
            <ExternalLink className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />
          </a>
        </nav>

        <div className={`p-6 border-t transition-colors space-y-3 ${isDarkMode ? 'border-white/5' : 'border-slate-100'}`}>
          <div className={`flex rounded-2xl p-1 ${isDarkMode ? 'bg-black/20' : 'bg-slate-100'}`}>
            <button 
              onClick={() => setIsDarkMode(false)}
              className={`flex-1 py-3 rounded-xl flex items-center justify-center transition-all ${!isDarkMode ? 'bg-white shadow-md text-indigo-600' : 'text-zinc-500 hover:text-white'}`}
            >
              <Sun className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setIsDarkMode(true)}
              className={`flex-1 py-3 rounded-xl flex items-center justify-center transition-all ${isDarkMode ? 'bg-white/10 shadow-md text-white' : 'text-zinc-500 hover:text-black'}`}
            >
              <Moon className="w-4 h-4" />
            </button>
          </div>

          <button 
            onClick={toggleFullScreen}
            className={`w-full px-5 py-4 rounded-2xl text-[11px] font-black tracking-[0.15em] uppercase transition-all flex items-center space-x-4 ${isDarkMode ? 'hover:bg-white/5 text-zinc-500 hover:text-white' : 'hover:bg-slate-100 text-slate-500 hover:text-black'}`}
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            <span>{isFullscreen ? 'Keluar Layar Penuh' : 'Layar Penuh'}</span>
          </button>
          
          <button
            onClick={() => handleTabChange('settings')}
            className={`w-full px-5 py-4 rounded-2xl text-[11px] font-black tracking-[0.15em] uppercase transition-all flex items-center justify-between ${
              activeTab === 'settings' 
                ? (isDarkMode ? 'bg-indigo-500/10 text-white ring-1 ring-indigo-500/30' : 'bg-indigo-50 text-black ring-1 ring-indigo-200') 
                : `hover:bg-zinc-500/5 ${isDarkMode ? 'text-zinc-500 hover:text-white' : 'text-slate-500 hover:text-black font-medium'}`
            }`}
          >
            <div className="flex items-center space-x-4">
              <Settings className={`w-4 h-4 ${activeTab === 'settings' ? 'opacity-100' : 'opacity-40'}`} />
              <span>Pengaturan</span>
            </div>
            <div className={`w-2 h-2 rounded-full ${hasApiKey ? 'bg-emerald-500 shadow-lg shadow-emerald-500/40' : 'bg-rose-500 animate-pulse shadow-lg shadow-rose-500/40'}`}></div>
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className={`md:hidden border-b p-6 flex items-center justify-between sticky top-0 z-[60] transition-colors ${isDarkMode ? 'bg-[#212226] border-white/5' : 'bg-white/90 backdrop-blur-md border-slate-100 shadow-sm'}`}>
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 bg-gradient-to-tr from-indigo-500 to-emerald-400 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <span className="text-white font-display font-black text-xl italic tracking-tighter">N</span>
          </div>
          <span className={`text-lg font-display font-black tracking-tight transition-colors ${isDarkMode ? 'text-white' : 'text-black'}`}>NIMO AI</span>
        </div>
        <div className="flex items-center space-x-2">
          <button 
            onClick={toggleFullScreen}
            className={`p-2.5 rounded-xl transition-colors ${isDarkMode ? 'bg-white/5 text-zinc-400' : 'bg-slate-100 text-slate-500'}`}
          >
            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </button>
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`p-2.5 rounded-xl transition-colors ${isDarkMode ? 'bg-white/5 text-zinc-400' : 'bg-slate-100 text-slate-500'}`}
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button 
            onClick={() => handleTabChange('settings')}
            className={`p-2.5 rounded-xl transition-colors ${activeTab === 'settings' ? 'bg-indigo-500/10 text-indigo-500' : (isDarkMode ? 'bg-white/5 text-zinc-400' : 'bg-slate-100 text-slate-500')}`}
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-grow flex flex-col overflow-y-auto">
        <div className="flex-grow p-4 md:p-12">
          <div className="max-w-6xl mx-auto">
            {activeTab === 'home' ? (
              <div className="space-y-24 py-8 animate-reveal">
                {!hasApiKey && (
                  <div className={`group relative p-10 border transition-all duration-700 rounded-3xl ${isDarkMode ? 'border-amber-500/20 bg-amber-500/5' : 'border-amber-200 bg-amber-50 shadow-xl shadow-amber-900/5'} overflow-hidden`}>
                    <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 -rotate-45 translate-x-32 -translate-y-32 blur-3xl"></div>
                    <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-10">
                      <div className="flex items-center space-x-8">
                        <div className="shrink-0 w-16 h-16 bg-amber-500 text-white rounded-2xl flex items-center justify-center text-3xl font-display font-black shadow-lg shadow-amber-500/30">
                          !
                        </div>
                        <div className="text-left space-y-2">
                          <h4 className="text-amber-600 font-display font-black uppercase tracking-[0.2em] text-sm text-amber-500">Aksi Diperlukan: API Key Belum Ada</h4>
                          <p className={`text-[13px] font-medium leading-relaxed max-w-lg ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                            Fitur cerdas saat ini dalam status <span className="text-rose-500 font-bold uppercase tracking-widest italic text-[11px]">siaga</span>. 
                            Tautkan kredensial <span className="text-amber-600 underline underline-offset-4 decoration-amber-500/30">Gemini Pro Vision</span> Anda untuk memulai analisis adegan dan narasi otomatis.
                          </p>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleTabChange('settings')}
                        className="w-full md:w-auto px-10 py-5 bg-amber-500 text-white font-black text-[11px] uppercase tracking-[0.2em] hover:bg-amber-600 transition-all shadow-xl shadow-amber-500/20 active:scale-95 rounded-2xl"
                      >
                        Konfigurasi Kredensial
                      </button>
                    </div>
                  </div>
                )}

                <header className="text-center space-y-8 relative">
                  <div className="absolute inset-0 -z-10 flex justify-center blur-3xl opacity-20">
                    <div className="w-[500px] h-[300px] bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full"></div>
                  </div>
                  <div className="space-y-4">
                    <span className="text-[10px] font-mono font-black uppercase tracking-[0.5em] text-indigo-500">Arsitektur Rekap Manga</span>
                    <h1 className={`text-6xl md:text-9xl font-display font-black tracking-tight uppercase leading-none transition-colors ${isDarkMode ? 'text-white' : 'text-black'}`}>
                      NIMO <span className={`text-transparent bg-clip-text bg-gradient-to-r ${isDarkMode ? 'from-indigo-400 to-emerald-400' : 'from-indigo-600 to-emerald-600'}`}>CORE</span>
                    </h1>
                  </div>
                  <p className={`text-lg md:text-xl max-w-2xl mx-auto font-bold leading-[1.6] ${isDarkMode ? 'text-zinc-200' : 'text-slate-800'}`}>
                    Tingkatkan kualitas penceritaan Anda dengan <span className="text-indigo-500 font-black">Nimo AI</span>. Analisis panel presisi dan narasi sinematik untuk kreator konten modern.
                  </p>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div 
                    onClick={() => handleTabChange('manga-tool')}
                    className={`p-12 border transition-all cursor-pointer group relative overflow-hidden rounded-[40px] ${isDarkMode ? 'bg-[#212226] border-white/5 hover:border-indigo-500/30 active:bg-zinc-900' : 'bg-white border-slate-100 hover:border-indigo-200 shadow-xl hover:shadow-2xl active:bg-zinc-50'}`}
                  >
                    <div className="absolute top-0 right-0 p-8">
                      <FileText className={`w-16 h-16 transition-all duration-500 group-hover:scale-110 group-hover:rotate-6 ${isDarkMode ? 'text-white/5 group-hover:text-indigo-500/20' : 'text-slate-50 group-hover:text-indigo-500/20'}`} />
                    </div>
                    <div className="w-16 h-1.5 bg-indigo-500 mb-10 group-hover:w-32 transition-all duration-500 rounded-full"></div>
                    <div className="flex items-center space-x-3 mb-4">
                      <h3 className={`text-3xl font-display font-black uppercase tracking-tight transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Asisten Alur Manga</h3>
                      <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">Fitur 01</span>
                    </div>
                    <p className={`text-sm mb-10 leading-relaxed opacity-60 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                      Deteksi panel & inteligensi otomatis. Jalin alur cerita kompleks menjadi narasi video yang mulus.
                    </p>
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 rounded-full bg-zinc-500/5 flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition-all duration-500">
                        <Play className="w-4 h-4 ml-0.5" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40 group-hover:opacity-100 group-hover:text-indigo-500 transition-all">Inisiasi Workflow</span>
                    </div>
                  </div>

                  {/* Fitur Pembuat Naskah (Urutan 2) */}
                  <a 
                    href="https://pembuat-naskah.vercel.app/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`p-12 border transition-all cursor-pointer group relative overflow-hidden rounded-[40px] ${isDarkMode ? 'bg-[#212226] border-white/5 hover:border-indigo-500/30 active:bg-zinc-900' : 'bg-white border-slate-100 hover:border-indigo-200 shadow-xl hover:shadow-2xl active:bg-zinc-50'}`}
                  >
                    <div className="absolute top-0 right-0 p-8">
                      <PenTool className={`w-16 h-16 transition-all duration-500 group-hover:scale-110 group-hover:rotate-6 ${isDarkMode ? 'text-white/5 group-hover:text-indigo-500/20' : 'text-slate-50 group-hover:text-indigo-500/20'}`} />
                    </div>
                    <div className="w-16 h-1.5 bg-indigo-500 mb-10 group-hover:w-32 transition-all duration-500 rounded-full"></div>
                    <div className="flex items-center space-x-3 mb-4">
                      <h3 className={`text-3xl font-display font-black uppercase tracking-tight transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Pembuat Naskah</h3>
                      <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">Fitur 02</span>
                      <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">Eksternal</span>
                    </div>
                    <p className={`text-sm mb-10 leading-relaxed opacity-60 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                      Rancang dan susun naskah alur cerita manga/manhwa secara detail melalui studio pembuat naskah eksternal.
                    </p>
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 rounded-full bg-zinc-500/5 flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition-all duration-500">
                        <ExternalLink className="w-4 h-4 ml-0.5" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40 group-hover:opacity-100 group-hover:text-indigo-500 transition-all">Buka Pembuat Naskah</span>
                    </div>
                  </a>

                  {/* Fitur Rewrite Naskah (Urutan 3) */}
                  <a 
                    href="https://pembuat-naskah.vercel.app/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`p-12 border transition-all cursor-pointer group relative overflow-hidden rounded-[40px] ${isDarkMode ? 'bg-[#212226] border-white/5 hover:border-emerald-500/30 active:bg-zinc-900' : 'bg-white border-slate-100 hover:border-emerald-200 shadow-xl hover:shadow-2xl active:bg-zinc-50'}`}
                  >
                    <div className="absolute top-0 right-0 p-8">
                      <RefreshCw className={`w-16 h-16 transition-all duration-500 group-hover:scale-110 group-hover:-rotate-12 ${isDarkMode ? 'text-white/5 group-hover:text-emerald-500/20' : 'text-slate-50 group-hover:text-emerald-500/20'}`} />
                    </div>
                    <div className="w-16 h-1.5 bg-emerald-500 mb-10 group-hover:w-32 transition-all duration-500 rounded-full"></div>
                    <div className="flex items-center space-x-3 mb-4">
                      <h3 className={`text-3xl font-display font-black uppercase tracking-tight transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Rewrite Naskah</h3>
                      <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Fitur 03</span>
                      <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">Eksternal</span>
                    </div>
                    <p className={`text-sm mb-10 leading-relaxed opacity-60 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                      Tulis ulang atau poles variasi kalimat narasi skrip Anda agar alur cerita terdengar lebih sinematik dan hidup.
                    </p>
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 rounded-full bg-zinc-500/5 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-all duration-500">
                        <ExternalLink className="w-4 h-4 ml-0.5" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40 group-hover:opacity-100 group-hover:text-emerald-500 transition-all">Buka Rewrite Naskah</span>
                    </div>
                  </a>

                  {/* Fitur Potong Panel (Urutan 4) */}
                  <div 
                    onClick={() => handleTabChange('panel-cutter')}
                    className={`p-12 border transition-all cursor-pointer group relative overflow-hidden rounded-[40px] ${isDarkMode ? 'bg-[#212226] border-white/5 hover:border-emerald-500/30 active:bg-zinc-900' : 'bg-white border-slate-100 hover:border-emerald-200 shadow-xl hover:shadow-2xl active:bg-zinc-50'}`}
                  >
                    <div className="absolute top-0 right-0 p-8">
                      <Scissors className={`w-16 h-16 transition-all duration-500 group-hover:scale-110 group-hover:-rotate-12 ${isDarkMode ? 'text-white/5 group-hover:text-emerald-500/20' : 'text-slate-50 group-hover:text-emerald-500/20'}`} />
                    </div>
                    <div className="w-16 h-1.5 bg-emerald-500 mb-10 group-hover:w-32 transition-all duration-500 rounded-full"></div>
                    <div className="flex items-center space-x-3 mb-4">
                      <h3 className={`text-3xl font-display font-black uppercase tracking-tight transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Potong Panel</h3>
                      <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Fitur 04</span>
                    </div>
                    <p className={`text-sm mb-10 leading-relaxed opacity-60 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                      Akurasi bedah untuk aset visual. Ekstrak panel berkualitas tinggi untuk pengeditan video multi-track.
                    </p>
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 rounded-full bg-zinc-500/5 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-all duration-500">
                        <Play className="w-4 h-4 ml-1" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40 group-hover:opacity-100 group-hover:text-emerald-500 transition-all">Mulai Ekstraksi</span>
                    </div>
                  </div>

                  <a 
                    href="https://sites.google.com/view/aniimage/aniimage"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`p-10 md:p-12 border transition-all cursor-pointer group relative overflow-hidden rounded-[40px] md:col-span-2 flex flex-col md:flex-row items-center justify-between ${isDarkMode ? 'bg-[#212226] border-white/5 hover:border-indigo-500/30 active:bg-zinc-900 font-sans' : 'bg-white border-slate-100 hover:border-indigo-200 shadow-xl hover:shadow-2xl active:bg-zinc-50'}`}
                  >
                    <div className="flex items-center space-x-8">
                      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all ${isDarkMode ? 'bg-white/5 group-hover:bg-indigo-500/10' : 'bg-slate-50 group-hover:bg-indigo-50'}`}>
                        <Download className="w-8 h-8 text-indigo-500 group-hover:scale-110 transition-transform" />
                      </div>
                      <div className="text-left space-y-1">
                        <div className="flex items-center space-x-3">
                          <h4 className={`text-2xl font-display font-black uppercase tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Download Gambar (AniImage)</h4>
                          <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">Fitur 05</span>
                          <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">Eksternal</span>
                        </div>
                        <p className={`text-xs opacity-60 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>Unduh gambar & panel komik/manhwa masal resolusi tinggi via AniImage.</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4 mt-8 md:mt-0">
                      <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-500">Buka AniImage</span>
                      <ExternalLink className="w-4 h-4 text-indigo-500 group-hover:translate-x-1 group-hover:-translate-y-0.5 transition-transform" />
                    </div>
                  </a>
                </div>
              </div>
            ) : activeTab === 'manga-tool' ? (
              <div className="animate-reveal">
                <header className="text-center mb-20 space-y-4">
                  <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-black uppercase tracking-[0.2em] mb-4">
                    Tahap // Orkestrator
                  </div>
                  <h1 className={`text-5xl md:text-7xl font-display font-black tracking-tight uppercase leading-none transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    Asisten Alur <span className={`text-transparent bg-clip-text bg-gradient-to-r ${isDarkMode ? 'from-indigo-400 to-emerald-400' : 'from-indigo-600 to-emerald-600'}`}>Manga</span>
                  </h1>
                  <p className={`text-lg font-medium max-w-xl mx-auto opacity-60 ${isDarkMode ? 'text-zinc-500' : 'text-zinc-600'}`}>
                    Ubah panel statis menjadi naskah sinematik melalui orkestrasi AI otonom.
                  </p>
                </header>

                <main className="space-y-20">
                  {/* Step 1: Upload & Parameters */}
                  <div className="grid grid-cols-1 lg:grid-cols-11 gap-10 items-start">
                    {/* Left Side: Upload */}
                    <section className={`lg:col-span-5 p-10 border relative overflow-hidden transition-all rounded-[40px] group ${isDarkMode ? 'bg-[#212226] border-white/5 active:bg-[#1a1b1e]' : 'bg-white border-slate-100 shadow-2xl active:bg-zinc-50'}`}>
                      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 -rotate-45 translate-x-16 -translate-y-16 blur-2xl"></div>
                      <div className="flex flex-col items-center justify-center space-y-8 text-center h-full">
                        <div className={`p-8 rounded-3xl transition-all duration-500 shadow-xl ${isDarkMode ? 'bg-[#18191c] text-indigo-400 group-hover:scale-110 group-hover:bg-indigo-500 group-hover:text-white' : 'bg-indigo-50 text-indigo-600 group-hover:scale-110 group-hover:bg-indigo-500 group-hover:text-white'}`}>
                          <Upload className="w-10 h-10" />
                        </div>
                        <div className="space-y-3">
                          <h2 className={`text-3xl font-display font-black uppercase tracking-tight transition-colors ${isDarkMode ? 'text-white' : 'text-black'}`}>Upload Gambar</h2>
                          <p className={`text-[11px] font-medium leading-relaxed opacity-50 px-8 ${isDarkMode ? 'text-zinc-200' : 'text-slate-800 font-bold'}`}>Masukkan panel manga untuk dekomposisi adegan otonom dan pengambilan naskah.</p>
                        </div>
                        <div className="flex flex-col items-center space-y-3 w-full">
                          <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full max-w-xs px-12 py-5 bg-indigo-500 hover:bg-indigo-600 text-white font-black uppercase tracking-[0.2em] text-[11px] transition-all shadow-xl shadow-indigo-500/20 active:scale-95 rounded-2xl"
                          >
                            Upload Image
                          </button>
                          <a
                            href="https://sites.google.com/view/aniimage/aniimage"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center space-x-2 text-[11px] font-black uppercase tracking-widest text-indigo-400 hover:text-indigo-300 transition-colors py-2 px-4 rounded-xl hover:bg-indigo-500/10"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download Gambar via AniImage</span>
                            <ExternalLink className="w-3 h-3 opacity-60" />
                          </a>
                        </div>
                        <input 
                          type="file" 
                          ref={fileInputRef}
                          onChange={handleImageUpload}
                          accept="image/*" 
                          multiple
                          className="hidden"
                        />

                        {uploadedImages.length > 0 && (
                          <div className="mt-12 w-full space-y-6">
                            <div className="flex justify-between items-center px-2">
                              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-500">Tumpukan Aset ({uploadedImages.length})</h3>
                              <button onClick={() => setUploadedImages([])} className="text-[10px] font-black text-rose-500 uppercase tracking-widest hover:underline transition-all">Kosongkan Tumpukan</button>
                            </div>
                            <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-4 gap-3 p-2">
                              {uploadedImages.map((img, idx) => (
                                <div
                                  key={img.id}
                                  onClick={() => setActiveImageIndex(idx)}
                                  className={`relative aspect-[3/4] overflow-hidden rounded-xl border-2 transition-all cursor-pointer group/item ${
                                    activeImageIndex === idx 
                                      ? 'border-indigo-500 shadow-xl scale-105 z-10' 
                                      : (isDarkMode ? 'border-white/5 grayscale opacity-40 hover:opacity-100 hover:grayscale-0' : 'border-slate-100 grayscale opacity-40 hover:opacity-100 hover:grayscale-0')
                                  }`}
                                >
                                  <img src={img.img.src} alt={img.name} className="w-full h-full object-cover" />
                                  <div className="absolute inset-0 bg-indigo-500/10 opacity-0 group-hover/item:opacity-100 transition-opacity"></div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </section>

                    <div className="lg:col-span-1 hidden lg:flex justify-center items-center">
                       <div className={`w-0.5 h-full transition-colors ${isDarkMode ? 'bg-white/5' : 'bg-slate-100'}`}></div>
                    </div>

                    {/* Right Side: Configuration UI */}
                    <section className={`lg:col-span-5 p-10 border transition-all rounded-[40px] ${isDarkMode ? 'bg-[#212226] border-white/5' : 'bg-white border-slate-100 shadow-2xl shadow-slate-900/5'}`}>
                      <div className="space-y-8">
                        <div className="space-y-6">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center space-x-3 underline-offset-8">
                              <div className="w-1 h-6 bg-indigo-500 rounded-full"></div>
                              <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-indigo-500">Matriks Konfigurasi</h4>
                            </div>
                            <span className="text-[9px] font-mono font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                              Auto-Fallback
                            </span>
                          </div>

                          {/* Pilihan Mesin AI (Kie.ai vs Google Gemini) */}
                          <div className="space-y-3 pb-3 border-b border-indigo-500/10">
                            <label className={`text-[11px] font-black uppercase tracking-widest opacity-80 px-1 transition-colors flex items-center gap-2 ${isDarkMode ? 'text-indigo-400' : 'text-indigo-700'}`}>
                              <Cpu className="w-3.5 h-3.5" />
                              <span>Model & Mesin AI :</span>
                            </label>

                            <div className="grid grid-cols-1 gap-2.5">
                              {/* Option 1: Kie.ai Flash */}
                              <button
                                type="button"
                                onClick={() => {
                                  setAiProvider('kie-gemini-3.7-flash');
                                  localStorage.setItem('nimo_ai_provider', 'kie-gemini-3.7-flash');
                                }}
                                className={`p-3.5 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                                  aiProvider === 'kie-gemini-3.7-flash'
                                    ? 'bg-indigo-600/15 border-indigo-500 text-white shadow-md shadow-indigo-500/10 ring-1 ring-indigo-500/30'
                                    : isDarkMode ? 'bg-[#18191c] border-white/5 text-zinc-400 hover:border-white/20' : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-indigo-200'
                                }`}
                              >
                                <div className="space-y-0.5 pr-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-black">Kie.ai — Gemini 3.7 Flash</span>
                                    <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Cepat / Streaming</span>
                                  </div>
                                  <p className="text-[10px] opacity-60">Endpoint streamGenerateContent bawaan Kie.ai, super responsif</p>
                                </div>
                                <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${aiProvider === 'kie-gemini-3.7-flash' ? 'border-indigo-400 bg-indigo-500' : 'border-zinc-500'}`}>
                                  {aiProvider === 'kie-gemini-3.7-flash' && <div className="w-1.5 h-1.5 rounded-full bg-white"></div>}
                                </div>
                              </button>

                              {/* Option 2: Kie.ai Pro */}
                              <button
                                type="button"
                                onClick={() => {
                                  setAiProvider('kie-gemini-3.1-pro');
                                  localStorage.setItem('nimo_ai_provider', 'kie-gemini-3.1-pro');
                                }}
                                className={`p-3.5 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                                  aiProvider === 'kie-gemini-3.1-pro'
                                    ? 'bg-indigo-600/15 border-indigo-500 text-white shadow-md shadow-indigo-500/10 ring-1 ring-indigo-500/30'
                                    : isDarkMode ? 'bg-[#18191c] border-white/5 text-zinc-400 hover:border-white/20' : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-indigo-200'
                                }`}
                              >
                                <div className="space-y-0.5 pr-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-black">Kie.ai — Gemini 3.1 Pro</span>
                                    <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">Sinematik & Penalaran</span>
                                  </div>
                                  <p className="text-[10px] opacity-60">Endpoint chat/completions Kie.ai, diksi kaya dan alur mendalam</p>
                                </div>
                                <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${aiProvider === 'kie-gemini-3.1-pro' ? 'border-indigo-400 bg-indigo-500' : 'border-zinc-500'}`}>
                                  {aiProvider === 'kie-gemini-3.1-pro' && <div className="w-1.5 h-1.5 rounded-full bg-white"></div>}
                                </div>
                              </button>

                              {/* Option 3: Google Gemini Bawaan */}
                              <button
                                type="button"
                                onClick={() => {
                                  setAiProvider('gemini-default');
                                  localStorage.setItem('nimo_ai_provider', 'gemini-default');
                                }}
                                className={`p-3.5 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                                  aiProvider === 'gemini-default'
                                    ? 'bg-indigo-600/15 border-indigo-500 text-white shadow-md shadow-indigo-500/10 ring-1 ring-indigo-500/30'
                                    : isDarkMode ? 'bg-[#18191c] border-white/5 text-zinc-400 hover:border-white/20' : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-indigo-200'
                                }`}
                              >
                                <div className="space-y-0.5 pr-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-black">Google Gemini Bawaan</span>
                                    <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-full bg-zinc-500/20 text-zinc-400 border border-zinc-500/30">Google Cloud</span>
                                  </div>
                                  <p className="text-[10px] opacity-60">Jalur resmi Google AI Studio internal (cadangan otomatis aktif)</p>
                                </div>
                                <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${aiProvider === 'gemini-default' ? 'border-indigo-400 bg-indigo-500' : 'border-zinc-500'}`}>
                                  {aiProvider === 'gemini-default' && <div className="w-1.5 h-1.5 rounded-full bg-white"></div>}
                                </div>
                              </button>
                            </div>

                            {/* Inline API Key if Kie.ai is selected but empty */}
                            {aiProvider.startsWith('kie-') && !kieApiKey && (
                              <div className={`p-4 rounded-2xl border text-xs space-y-2.5 animate-reveal ${isDarkMode ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                                <div className="flex items-center justify-between font-bold">
                                  <span className="flex items-center gap-1.5">
                                    <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                                    <span>API Key Kie.ai Belum Terisi</span>
                                  </span>
                                  <a href="https://kie.ai/api-key" target="_blank" rel="noopener noreferrer" className="underline font-mono text-[10px] text-amber-400 hover:text-amber-300">
                                    Ambil di kie.ai/api-key ↗
                                  </a>
                                </div>
                                <div className="flex gap-2">
                                  <input 
                                    type="password"
                                    placeholder="Tempel API Key Kie.ai (e3a28ce6...)"
                                    className={`flex-1 px-4 py-2.5 text-xs rounded-xl font-mono border outline-none ${isDarkMode ? 'bg-black/50 border-white/10 text-white focus:border-indigo-500' : 'bg-white border-slate-300 text-black focus:border-indigo-500'}`}
                                    onChange={(e) => {
                                      const val = e.target.value.trim();
                                      if (val.length > 5) {
                                        setKieApiKey(val);
                                        localStorage.setItem('nimo_kie_api_key', val);
                                      }
                                    }}
                                  />
                                </div>
                                <p className="text-[10px] opacity-75 leading-tight">*Jika kosong, sistem akan otomatis beralih (fallback) ke Google Gemini bawaan.</p>
                              </div>
                            )}
                          </div>

                          {/* Judul Manga / Anime */}
                          <div className="space-y-2">
                            <label className={`text-[11px] font-black uppercase tracking-widest opacity-50 px-1 transition-colors ${isDarkMode ? 'text-zinc-200' : 'text-black font-black'}`}>1. Judul manga/manhwa/anime</label>
                            <input 
                              type="text"
                              value={mangaConfig.title}
                              onChange={(e) => setMangaConfig(prev => ({ ...prev, title: e.target.value }))}
                              placeholder="Misal: Solo Leveling"
                              className={`w-full px-6 py-4 border transition-all outline-none rounded-2xl text-sm font-medium ${isDarkMode ? 'bg-[#18191c] border-white/5 text-white focus:border-indigo-500/50' : 'bg-white border-slate-200 text-black font-bold focus:border-indigo-500 focus:shadow-lg focus:shadow-indigo-500/5'}`}
                            />
                          </div>

                          <div className="flex flex-col gap-6">
                              {/* Jenis Video */}
                              <div className="space-y-2">
                                <label className={`text-[11px] font-black uppercase tracking-widest opacity-50 px-1 transition-colors ${isDarkMode ? 'text-zinc-200' : 'text-black font-black'}`}>2. Jenis video :</label>
                                <select 
                                  value={mangaConfig.videoType}
                                  onChange={(e) => setMangaConfig(prev => ({ ...prev, videoType: e.target.value }))}
                                  className={`w-full px-6 py-4 border transition-all outline-none rounded-2xl text-sm font-medium appearance-none cursor-pointer ${isDarkMode ? 'bg-[#18191c] border-white/5 text-white focus:border-indigo-500/50' : 'bg-white border-slate-200 text-black font-bold focus:border-indigo-500 focus:shadow-lg focus:shadow-indigo-500/5'}`}
                                >
                                  <option value="spoiler">spoiler (Default)</option>
                                  <option value="tunggal">tunggal</option>
                                  <option value="part">part</option>
                                </select>
                              </div>

                              {/* Gaya Bahasa */}
                              <div className="space-y-2">
                                <label className={`text-[11px] font-black uppercase tracking-widest opacity-50 px-1 transition-colors ${isDarkMode ? 'text-zinc-200' : 'text-black font-black'}`}>3. Gaya bahasa :</label>
                                <select 
                                  value={mangaConfig.style}
                                  onChange={(e) => setMangaConfig(prev => ({ ...prev, style: e.target.value }))}
                                  className={`w-full px-6 py-4 border transition-all outline-none rounded-2xl text-sm font-black appearance-none cursor-pointer ${isDarkMode ? 'bg-indigo-500/10 border-indigo-500/30 text-white' : 'bg-white border-indigo-200 text-black shadow-inner shadow-indigo-500/5'}`}
                                >
                                  <option value="formal">Formal (Default)</option>
                                  <option value="santai">santai dan asik</option>
                                  <option value="dramatis">dramatis</option>
                                  <option value="nimo">nimo</option>
                                  <option value="custom">costum</option>
                                </select>
                              </div>
                          </div>

                          {/* Custom Style Ref */}
                          {mangaConfig.style === 'custom' && (
                            <div className="space-y-2 animate-reveal">
                              <label className="text-[10px] font-black text-indigo-500 px-1 uppercase tracking-widest">Referensi Naskah * Wajib</label>
                              <div className={`p-4 mb-2 rounded-xl text-[10px] ${isDarkMode ? 'bg-indigo-500/10 text-indigo-300' : 'bg-indigo-50 text-indigo-700'}`}>
                                Paste naskah ke kolom teks, dan Sistem akan meniru gaya bahasa, kosa kata, dan tingkat kesantaian dari naskah tersebut.
                              </div>
                              <textarea 
                                value={mangaConfig.customStyleRef}
                                onChange={(e) => setMangaConfig(prev => ({ ...prev, customStyleRef: e.target.value }))}
                                placeholder="Tempel naskah referensi di sini..."
                                className={`w-full h-32 px-6 py-4 border transition-all outline-none rounded-2xl text-[11px] font-mono resize-none leading-relaxed ${isDarkMode ? 'bg-[#18191c] border-white/5 text-white focus:border-indigo-500/50' : 'bg-white border-slate-200 text-black font-bold focus:border-indigo-500 focus:shadow-lg focus:shadow-indigo-500/5'}`}
                              />
                            </div>
                          )}

                          <div className="flex flex-col gap-6">
                            {/* Tingkat Detail */}
                            <div className="space-y-2">
                              <label className={`text-[11px] font-black uppercase tracking-widest opacity-50 px-1 transition-colors ${isDarkMode ? 'text-zinc-200' : 'text-black font-black'}`}>4. Tingkat detail :</label>
                              <select 
                                value={mangaConfig.detailLevel}
                                onChange={(e) => setMangaConfig(prev => ({ ...prev, detailLevel: e.target.value }))}
                                className={`w-full px-6 py-4 border transition-all outline-none rounded-2xl text-xs font-medium appearance-none cursor-pointer ${isDarkMode ? 'bg-[#18191c] border-white/5 text-white focus:border-indigo-500/50' : 'bg-white border-slate-200 text-black font-bold focus:border-indigo-500 focus:shadow-lg focus:shadow-indigo-500/5'}`}
                              >
                                <option value="ringkasan">ringkasan/ alur santai (fokus di alur cerita manganya)</option>
                                <option value="detail">Alur Detail ( Semua teks narasi,percakapan, dan monolog batin pada panel komik/manga semuanya dimasukkan untuk script naskah yang akan di buat nantinya.)</option>
                              </select>
                            </div>

                            {/* Gaya Penyampaian */}
                            {mangaConfig.style !== 'nimo' && (
                              <div className="space-y-2">
                                <label className={`text-[11px] font-black uppercase tracking-widest opacity-50 px-1 transition-colors ${isDarkMode ? 'text-zinc-200' : 'text-black font-black'}`}>Gaya Narasi</label>
                                <select 
                                  value={mangaConfig.deliveryStyle}
                                  onChange={(e) => setMangaConfig(prev => ({ ...prev, deliveryStyle: e.target.value }))}
                                  className={`w-full px-6 py-4 border transition-all outline-none rounded-2xl text-sm font-medium appearance-none cursor-pointer ${isDarkMode ? 'bg-[#18191c] border-white/5 text-white focus:border-indigo-500/50' : 'bg-white border-slate-200 text-black font-bold focus:border-indigo-500 focus:shadow-lg focus:shadow-indigo-500/5'}`}
                                >
                                  <option value="narator">Narator (Orang Ketiga)</option>
                                  <option value="pov">POV Karakter Utama</option>
                                </select>
                              </div>
                            )}
                          </div>

                          {/* Chapter Identification */}
                          <div className="space-y-2">
                            <label className={`text-[11px] font-black uppercase tracking-widest opacity-50 px-1 transition-colors ${isDarkMode ? 'text-zinc-200' : 'text-black font-black'}`}>5. Chapter:</label>
                            <input 
                              type="text"
                              value={mangaConfig.chapter}
                              onChange={(e) => setMangaConfig(prev => ({ ...prev, chapter: e.target.value }))}
                              placeholder="Misal: 100-112"
                              className={`w-full px-6 py-4 border transition-all outline-none rounded-2xl text-sm font-medium ${isDarkMode ? 'bg-[#18191c] border-white/5 text-white focus:border-indigo-500/50' : 'bg-white border-slate-200 text-black font-bold focus:border-indigo-500 focus:shadow-lg focus:shadow-indigo-500/5'}`}
                            />
                          </div>

                          {/* Hook / CTR Checkbox */}
                          <div className="pt-2">
                            <label className="flex items-center space-x-3 cursor-pointer group">
                              <div className="relative">
                                <input 
                                  type="checkbox"
                                  checked={mangaConfig.useHook}
                                  onChange={(e) => setMangaConfig(prev => ({ ...prev, useHook: e.target.checked }))}
                                  className="sr-only"
                                />
                                <div className={`w-10 h-6 rounded-full transition-all ${mangaConfig.useHook ? 'bg-indigo-500' : 'bg-zinc-500/20'}`}></div>
                                <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-all ${mangaConfig.useHook ? 'translate-x-4' : ''}`}></div>
                              </div>
                              <span className={`text-[11px] font-black uppercase tracking-widest opacity-80 transition-colors group-hover:opacity-100 ${isDarkMode ? 'text-zinc-200' : 'text-black'}`}>6. menggunakan hook, ctr</span>
                            </label>
                          </div>
                        </div>

                        {/* Generate Button Wrapper */}
                        <div className="pt-6">
                          <div className="mb-3 px-4 py-2.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                            <span className="text-indigo-400 font-black tracking-wide">✓ 1 GAMBAR = 1 PARAGRAF</span>
                            <span className="text-zinc-400 font-medium">Langsung naskah cerita tanpa keterangan/label</span>
                          </div>
                          <div className="relative group">
                            {isGeneratingFullNarrative && (
                              <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 via-purple-500 via-pink-500 to-emerald-400 rounded-3xl blur-md opacity-80 animate-gradient-flow animate-pulse"></div>
                            )}
                            <button 
                              onClick={generateAllScripts}
                              disabled={isGeneratingFullNarrative || uploadedImages.length === 0}
                              className={`relative w-full py-6 rounded-3xl flex items-center justify-center gap-4 font-black uppercase tracking-[0.25em] text-[12px] transition-all shadow-2xl active:scale-98 overflow-hidden ${
                                isGeneratingFullNarrative
                                  ? 'bg-gradient-to-r from-indigo-600 via-purple-600 via-pink-600 to-emerald-500 text-white animate-gradient-flow shadow-xl shadow-purple-500/30 ring-2 ring-white/30 cursor-wait' 
                                  : uploadedImages.length > 0
                                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white hover:shadow-indigo-500/30 cursor-pointer ring-4 ring-indigo-500/10' 
                                    : (isDarkMode ? 'bg-white/5 text-zinc-600 border border-white/5 cursor-not-allowed opacity-50' : 'bg-slate-100 text-slate-300 cursor-not-allowed opacity-50')
                              }`}
                            >
                              {isGeneratingFullNarrative ? (
                                <>
                                  <div className="relative flex items-center justify-center">
                                    <Loader2 className="w-6 h-6 animate-spin text-white drop-shadow" />
                                    <Sparkles className="w-3.5 h-3.5 text-amber-300 absolute -top-1.5 -right-1.5 animate-bounce" />
                                  </div>
                                  <span className="font-black text-white drop-shadow flex items-center gap-2">
                                    <span>Memproses Naskah AI...</span>
                                    <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 text-white font-mono">
                                      {uploadedImages.length} Unit
                                    </span>
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Play className="w-5 h-5 fill-current" />
                                  <span>Generate Now // {uploadedImages.length} Unit</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>

                  {/* Step 3: Export & Merged Box */}
                  {uploadedImages.some(img => img.panels.length > 0) && (
                    <section className="animate-reveal py-20 pb-40">
                      <div className="max-w-5xl mx-auto space-y-12">
                        <div className="text-center space-y-3">
                          <div className="w-12 h-1.5 bg-indigo-500 mx-auto rounded-full mb-6"></div>
                          <h2 className={`text-4xl font-display font-black uppercase tracking-tight leading-none transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Master Naskah Produksi</h2>
                          <p className="text-[11px] text-zinc-500 font-mono uppercase tracking-[0.4em] font-black opacity-60">Output Konsolidasi // Aliran Narasi</p>
                        </div>

                        {generationError && (
                          <div className="p-8 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[10px] font-black text-center uppercase tracking-[0.3em] rounded-[30px] animate-reveal">
                            [Galat Runtime Sistem: {generationError}]
                          </div>
                        )}

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                          <div className={`${enableAiSuggestions ? "lg:col-span-2" : "lg:col-span-3"} relative group w-full`}>
                            <div className={`p-1 hidden lg:block absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-[50px] blur opacity-20 group-hover:opacity-40 transition duration-1000`}></div>
                            <div className={`relative p-12 border transition-all duration-700 rounded-[45px] ${isDarkMode ? 'bg-[#212226] border-white/5 active:bg-[#1a1b1e]' : 'bg-white border-slate-100 shadow-2xl active:bg-zinc-50'}`}>
                              <div className="flex justify-between items-center mb-6">
                                <div className="flex items-center space-x-3">
                                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                  <span className={`text-[10px] font-black uppercase tracking-[0.3em] font-mono ${isDarkMode ? 'text-zinc-600' : 'text-slate-400'}`}>Status Sistem: <span className="text-emerald-500">Terkoneksi & Siap</span></span>
                                </div>
                                
                                {usedProviderLabel && (
                                  <span className="text-[10px] font-mono font-black uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-3 py-1.5 rounded-full border border-indigo-500/30 flex items-center gap-1.5">
                                    <Sparkles className="w-3 h-3 text-indigo-400" />
                                    <span>Model: {usedProviderLabel}</span>
                                  </span>
                                )}
                              </div>

                              {activeProviderWarning && (
                                <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400 text-xs flex items-center gap-3 animate-reveal">
                                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                                  <span className="font-mono text-[11px]">{activeProviderWarning}</span>
                                </div>
                              )}

                              <textarea
                                readOnly={isGeneratingFullNarrative}
                                value={fullNarrative || uploadedImages.flatMap(img => img.panels.map(p => p.script)).filter(s => s.trim()).join('\n\n')}
                                onChange={(e) => setFullNarrative(e.target.value)}
                                placeholder="Aliran naskah akan diinisialisasi di sini setelah pembuatan, atau tulis langsung naskah Anda di sini untuk mendapatkan saran AI..."
                                className={`w-full h-[500px] bg-transparent text-lg md:text-xl resize-none outline-none font-bold leading-[1.8] scrollbar-thin overflow-y-auto selection:bg-indigo-50/20 ${isDarkMode ? 'text-white' : 'text-black'}`}
                              />
                              
                              <div className={`mt-12 pt-12 border-t flex flex-col lg:flex-row items-center justify-between gap-10 ${isDarkMode ? 'border-white/5' : 'border-slate-50'}`}>
                                <div className="flex items-center space-x-12">
                                  <div className="flex flex-col space-y-1">
                                    <span className="text-[10px] text-zinc-500 font-black uppercase tracking-[.25em]">Densitas</span>
                                    <span className={`text-4xl font-display font-black tracking-tighter ${isDarkMode ? 'text-white' : 'text-black'}`}>
                                      {(fullNarrative || uploadedImages.flatMap(img => img.panels.map(p => p.script)).filter(s => s.trim()).join('\n\n')).trim().split(/\s+/).filter(Boolean).length || 0} <span className="text-sm font-medium tracking-normal text-zinc-500">Kata</span>
                                    </span>
                                  </div>
                                  <div className="flex flex-col space-y-1">
                                    <span className="text-[10px] text-zinc-500 font-black uppercase tracking-[.25em]">Volume</span>
                                    <span className={`text-4xl font-display font-black tracking-tighter ${isDarkMode ? 'text-white' : 'text-black'}`}>
                                      {uploadedImages.length} <span className="text-sm font-medium tracking-normal text-zinc-500">Bingkai</span>
                                    </span>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
                                  <button 
                                    onClick={() => {
                                      const activeText = fullNarrative || uploadedImages.flatMap(img => img.panels.map(p => p.script)).filter(s => s.trim()).join('\n\n');
                                      if (!activeText) {
                                        alert("Tidak ada naskah master yang tersedia.");
                                        return;
                                      }
                                      navigator.clipboard.writeText(activeText.trim());
                                      alert("Naskah disalin ke clipboard internal.");
                                    }}
                                    className="flex-1 lg:flex-none px-10 py-5 bg-indigo-500 text-white font-black uppercase tracking-[0.2em] text-[11px] transition-all hover:bg-indigo-600 active:scale-95 shadow-xl shadow-indigo-500/20 rounded-2xl"
                                  >
                                    Salin Narasi
                                  </button>
                                  <button 
                                    onClick={exportScript}
                                    className={`flex-1 lg:flex-none px-10 py-5 border-2 font-black uppercase tracking-[0.2em] text-[11px] transition-all rounded-2xl ${isDarkMode ? 'border-white/10 text-white hover:bg-white hover:text-black' : 'border-slate-900 text-slate-900 hover:bg-slate-900 hover:text-white'}`}
                                  >
                                    Ekspor .TXT
                                  </button>
                                  <a 
                                    href="https://pembuat-naskah.vercel.app/" 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className={`flex-1 lg:flex-none px-6 py-5 border font-black uppercase tracking-[0.2em] text-[11px] transition-all rounded-2xl flex items-center justify-center space-x-2 ${isDarkMode ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500 hover:text-white' : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-600 hover:text-white'}`}
                                    title="Buka platform Pembuat Naskah"
                                  >
                                    <PenTool className="w-3.5 h-3.5" />
                                    <span>Pembuat Naskah</span>
                                    <ExternalLink className="w-3 h-3 opacity-60" />
                                  </a>
                                  <a 
                                    href="https://nimo-script-rewrite.vercel.app/" 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className={`flex-1 lg:flex-none px-6 py-5 border font-black uppercase tracking-[0.2em] text-[11px] transition-all rounded-2xl flex items-center justify-center space-x-2 ${isDarkMode ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500 hover:text-white' : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-600 hover:text-white'}`}
                                    title="Buka platform Rewrite Naskah"
                                  >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    <span>Rewrite Naskah</span>
                                    <ExternalLink className="w-3 h-3 opacity-60" />
                                  </a>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Right Column: AI Proactive Suggestions Panel */}
                          {enableAiSuggestions && (
                            <div className={`lg:col-span-1 p-8 border transition-all duration-500 rounded-[45px] flex flex-col max-h-[700px] overflow-hidden ${isDarkMode ? 'bg-[#212226] border-white/5' : 'bg-white border-slate-100 shadow-2xl shadow-slate-900/5'}`}>
                              {/* Header */}
                              <div className="flex items-center justify-between border-b pb-4 border-zinc-500/10 mb-6 shrink-0 text-left">
                                <div className="flex items-center space-x-3">
                                  <Sparkles className="w-5 h-5 text-indigo-500 animate-pulse" />
                                  <div className="flex flex-col">
                                    <span className="font-display font-black text-xs uppercase tracking-wider">AI Koreksi & Saran</span>
                                    <span className="text-[9px] font-mono opacity-50 tracking-widest uppercase">Ejaan, Kata, & Gaya</span>
                                  </div>
                                </div>
                                <div className="flex items-center space-x-2">
                                  {isAnalyzingText && <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />}
                                  <label className="relative flex items-center cursor-pointer scale-90">
                                    <input 
                                      type="checkbox" 
                                      checked={enableAiSuggestions}
                                      onChange={(e) => setEnableAiSuggestions(e.target.checked)}
                                      className="sr-only" 
                                    />
                                    <div className={`w-8 h-4 rounded-full transition-all ${enableAiSuggestions ? 'bg-indigo-500' : 'bg-zinc-500/25'}`}></div>
                                    <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-all ${enableAiSuggestions ? 'translate-x-4' : ''}`}></div>
                                  </label>
                                </div>
                              </div>

                              {/* Suggestions List Area */}
                              <div className="flex-grow overflow-y-auto pr-1 space-y-4 scrollbar-thin">
                                {!(fullNarrative || uploadedImages.flatMap(img => img.panels.map(p => p.script)).filter(s => s.trim()).join('\n\n')) ? (
                                  <div className="flex flex-col items-center justify-center py-16 text-center space-y-3 opacity-40 h-full">
                                    <Sparkles className="w-8 h-8 text-indigo-500" />
                                    <p className="text-xs font-bold uppercase tracking-wider">Belum Ada Teks</p>
                                    <p className="text-[10px] max-w-[200px] leading-relaxed mx-auto">Tulis atau buat narasi naskah terlebih dahulu untuk memulai asisten koreksi AI otomatis.</p>
                                  </div>
                                ) : isAnalyzingText && suggestions.length === 0 ? (
                                  <div className="flex flex-col items-center justify-center py-24 text-center space-y-4 h-full">
                                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                                    <span className="text-[10px] uppercase font-black tracking-widest opacity-60">Sistem AI sedang mengevaluasi naskah...</span>
                                  </div>
                                ) : suggestions.length === 0 ? (
                                  <div className="flex flex-col items-center justify-center py-20 text-center space-y-3 opacity-60 h-full">
                                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 font-bold mb-2">✓</div>
                                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-500">Naskah Sempurna!</p>
                                    <p className="text-[10px] max-w-[220px] leading-relaxed mx-auto">Belum ada kesalahan ejaan atau saran gaya yang terdeteksi. Narasi Anda mengalir dengan indah!</p>
                                  </div>
                                ) : (
                                  <div className="space-y-4">
                                    <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest opacity-50 px-1 mb-2">
                                      <span>Daftar Evaluasi ({suggestions.length})</span>
                                      <span>Umpan Balik Instan</span>
                                    </div>
                                    {suggestions.map((suggestion, index) => {
                                      const isGrammar = suggestion.type === 'tata_bahasa';
                                      const isWordChoice = suggestion.type === 'pilihan_kata';
                                      
                                      let typeLabel = "Gaya Bahasa";
                                      let typeColor = "bg-indigo-500/10 text-indigo-400 border-indigo-500/20";
                                      let indicatorColor = "bg-indigo-500";
                                      
                                      if (isGrammar) {
                                        typeLabel = "Ejaan & Tata Bahasa";
                                        typeColor = "bg-rose-500/10 text-rose-400 border-rose-500/20";
                                        indicatorColor = "bg-rose-500";
                                      } else if (isWordChoice) {
                                        typeLabel = "Pilihan Kata";
                                        typeColor = "bg-amber-500/10 text-amber-400 border-amber-500/20";
                                        indicatorColor = "bg-amber-500";
                                      }

                                      return (
                                        <div 
                                          key={index} 
                                          className={`p-5 rounded-3xl border transition-all hover:scale-[1.01] text-left relative overflow-hidden ${
                                            isDarkMode 
                                              ? 'bg-zinc-950 border-white/5 hover:border-white/10' 
                                              : 'bg-slate-50 border-slate-100 hover:border-slate-200 shadow-sm'
                                          }`}
                                        >
                                          <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${indicatorColor}`}></div>

                                          <div className="flex items-center justify-between mb-3 pl-2">
                                            <span className={`text-[9.5px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${typeColor}`}>
                                              {typeLabel}
                                            </span>
                                            <div className="flex space-x-1.5">
                                              <button 
                                                onClick={() => handleAcceptSuggestion(index)}
                                                className="p-1 px-2.5 bg-indigo-500 text-white text-[9.5px] font-black uppercase tracking-wider hover:bg-indigo-600 rounded-lg flex items-center space-x-1 transition-all"
                                                title="Terapkan saran"
                                              >
                                                <Check className="w-3 h-3" />
                                                <span>Ubah</span>
                                              </button>
                                              <button 
                                                onClick={() => handleDismissSuggestion(index)}
                                                className="p-1.5 bg-zinc-500/15 text-zinc-400 hover:bg-rose-500/15 hover:text-rose-400 transition-all rounded-lg"
                                                title="Abaikan"
                                              >
                                                <X className="w-3 h-3" />
                                              </button>
                                            </div>
                                          </div>

                                          <div className="space-y-3 pl-2">
                                            <div className="flex flex-col space-y-0.5">
                                              <span className="text-[9px] uppercase tracking-wider text-zinc-400 opacity-40 font-mono">Asli:</span>
                                              <span className="text-xs font-semibold line-through text-rose-400/80 leading-relaxed break-words">
                                                "{suggestion.original}"
                                              </span>
                                            </div>

                                            <div className="flex flex-col space-y-0.5">
                                              <span className="text-[9px] uppercase tracking-wider text-zinc-400 opacity-40 font-mono">Saran:</span>
                                              <span className="text-xs font-black text-emerald-400 leading-relaxed break-words font-semibold">
                                                "{suggestion.replacement}"
                                              </span>
                                            </div>

                                            <p className="text-[10px] leading-relaxed opacity-70 break-words">
                                              {suggestion.explanation}
                                            </p>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex justify-center pt-8">
                          <button 
                            onClick={downloadAllImages}
                            disabled={isDownloadingAll}
                            className={`flex items-center space-x-4 px-10 py-4 rounded-full border text-[11px] font-black uppercase tracking-[0.3em] transition-all ${isDarkMode ? 'border-white/5 text-zinc-500 hover:border-emerald-500/30 hover:text-emerald-400' : 'border-slate-100 text-slate-400 hover:border-emerald-200 hover:text-emerald-600 shadow-sm hover:shadow-xl'}`}
                          >
                            <Download className="w-5 h-5" />
                            <span>{isDownloadingAll ? 'Menyusun Arsip...' : 'Arsip Bingkai (ZIP)'}</span>
                          </button>
                        </div>
                      </div>
                    </section>
                  )}
                </main>
              </div>
            ) : activeTab === 'settings' ? (
              <div className="max-w-3xl mx-auto py-24 animate-reveal space-y-16">
                <header className="text-center space-y-4">
                  <div className="w-16 h-1 w-12 bg-indigo-500 mx-auto rounded-full mb-8"></div>
                  <h1 className={`text-5xl font-display font-black tracking-tight uppercase transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    KONFIGURASI <span className="text-indigo-500 underline underline-offset-8 decoration-indigo-500/20">SISTEM</span>
                  </h1>
                  <p className={`text-lg font-medium opacity-60 ${isDarkMode ? 'text-zinc-500' : 'text-zinc-600'}`}>Sinkronkan lingkungan kreatif Anda dengan infrastruktur AI.</p>
                </header>

                {/* Default Engine Selector */}
                <section className={`p-8 lg:p-12 border transition-all rounded-[40px] ${isDarkMode ? 'bg-[#212226] border-white/5' : 'bg-white border-slate-100 shadow-2xl shadow-slate-900/5'}`}>
                  <div className="space-y-6">
                    <div className="flex items-center space-x-4">
                      <div className="w-1 h-8 bg-indigo-500 rounded-full"></div>
                      <div>
                        <h2 className={`text-xl font-display font-black uppercase tracking-tight transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Pilihan Mesin AI Default</h2>
                        <p className="text-[10px] font-mono font-black uppercase tracking-[0.3em] text-indigo-500/70">Engine Prioritas Produksi</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <button
                        type="button"
                        onClick={() => {
                          setAiProvider('kie-gemini-3.7-flash');
                          localStorage.setItem('nimo_ai_provider', 'kie-gemini-3.7-flash');
                        }}
                        className={`p-5 rounded-2xl border text-left flex flex-col justify-between space-y-3 transition-all cursor-pointer ${
                          aiProvider === 'kie-gemini-3.7-flash'
                            ? 'bg-indigo-600/15 border-indigo-500 text-white ring-1 ring-indigo-500/30 shadow-lg shadow-indigo-500/10'
                            : isDarkMode ? 'bg-[#18191c] border-white/5 text-zinc-400 hover:border-white/20' : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-indigo-200'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <span className="px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Cepat</span>
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${aiProvider === 'kie-gemini-3.7-flash' ? 'border-indigo-400 bg-indigo-500' : 'border-zinc-500'}`}>
                            {aiProvider === 'kie-gemini-3.7-flash' && <div className="w-1.5 h-1.5 rounded-full bg-white"></div>}
                          </div>
                        </div>
                        <div>
                          <h4 className="text-sm font-black">Kie.ai 3.7 Flash</h4>
                          <p className="text-[11px] opacity-60 mt-1">Streaming respon cepat, hemat kredit, parsing sekuensial optimal.</p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setAiProvider('kie-gemini-3.1-pro');
                          localStorage.setItem('nimo_ai_provider', 'kie-gemini-3.1-pro');
                        }}
                        className={`p-5 rounded-2xl border text-left flex flex-col justify-between space-y-3 transition-all cursor-pointer ${
                          aiProvider === 'kie-gemini-3.1-pro'
                            ? 'bg-indigo-600/15 border-indigo-500 text-white ring-1 ring-indigo-500/30 shadow-lg shadow-indigo-500/10'
                            : isDarkMode ? 'bg-[#18191c] border-white/5 text-zinc-400 hover:border-white/20' : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-indigo-200'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <span className="px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">Sinematik</span>
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${aiProvider === 'kie-gemini-3.1-pro' ? 'border-indigo-400 bg-indigo-500' : 'border-zinc-500'}`}>
                            {aiProvider === 'kie-gemini-3.1-pro' && <div className="w-1.5 h-1.5 rounded-full bg-white"></div>}
                          </div>
                        </div>
                        <div>
                          <h4 className="text-sm font-black">Kie.ai 3.1 Pro</h4>
                          <p className="text-[11px] opacity-60 mt-1">Penalaran narasi mendalam, diksi sastra kaya untuk video berbobot.</p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setAiProvider('gemini-default');
                          localStorage.setItem('nimo_ai_provider', 'gemini-default');
                        }}
                        className={`p-5 rounded-2xl border text-left flex flex-col justify-between space-y-3 transition-all cursor-pointer ${
                          aiProvider === 'gemini-default'
                            ? 'bg-indigo-600/15 border-indigo-500 text-white ring-1 ring-indigo-500/30 shadow-lg shadow-indigo-500/10'
                            : isDarkMode ? 'bg-[#18191c] border-white/5 text-zinc-400 hover:border-white/20' : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-indigo-200'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <span className="px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-full bg-zinc-500/20 text-zinc-400 border border-zinc-500/30">Standar</span>
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${aiProvider === 'gemini-default' ? 'border-indigo-400 bg-indigo-500' : 'border-zinc-500'}`}>
                            {aiProvider === 'gemini-default' && <div className="w-1.5 h-1.5 rounded-full bg-white"></div>}
                          </div>
                        </div>
                        <div>
                          <h4 className="text-sm font-black">Google Gemini</h4>
                          <p className="text-[11px] opacity-60 mt-1">Server Google Cloud internal bawaan, cadangan otomatis aktif.</p>
                        </div>
                      </button>
                    </div>
                  </div>
                </section>

                {/* Kie.ai Infrastructure Gateway Card */}
                <section className={`p-10 lg:p-16 border transition-all rounded-[45px] ${isDarkMode ? 'bg-[#212226] border-white/5' : 'bg-white border-slate-100 shadow-2xl shadow-slate-900/5'}`}>
                  <div className="space-y-10">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <div className="flex items-center space-x-6">
                        <div className="w-1 h-10 bg-gradient-to-b from-indigo-500 to-emerald-400 rounded-full"></div>
                        <div className="space-y-1">
                          <h2 className={`text-2xl font-display font-black uppercase tracking-tight transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Akses Kie.ai Gateway</h2>
                          <p className="text-[10px] font-mono font-black uppercase tracking-[0.3em] text-indigo-500/70">Master Key Gemini 3.7 Flash & 3.1 Pro</p>
                        </div>
                      </div>

                      <a 
                        href="https://kie.ai/api-key" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="px-5 py-2.5 rounded-xl border font-black uppercase tracking-wider text-[10px] flex items-center gap-2 transition-all bg-indigo-500/10 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500 hover:text-white"
                      >
                        <span>Buka kie.ai/api-key</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    <div className="space-y-6">
                      <p className={`text-sm leading-relaxed font-medium opacity-70 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                        Satu <strong className="text-indigo-400 font-black">Master Key Kie.ai</strong> memberi akses penuh ke model <span className="font-bold">Gemini 3.7 Flash</span> dan <span className="font-bold">Gemini 3.1 Pro</span>. Salin kunci API dari dasbor Kie.ai Anda dan tempel di bawah ini.
                      </p>

                      <div className="space-y-4">
                        <div className="relative group">
                          <input 
                            type="password"
                            value={kieApiKey}
                            onChange={(e) => {
                              const val = e.target.value;
                              setKieApiKey(val);
                              localStorage.setItem('nimo_kie_api_key', val);
                            }}
                            placeholder="Masukkan Master API Key Kie.ai (misal: e3a28ce6...)"
                            className={`w-full px-8 py-6 text-base outline-none border-2 transition-all font-mono rounded-3xl ${
                              isDarkMode 
                                ? 'bg-[#18191c] border-white/5 focus:border-indigo-500/50 text-indigo-400 shadow-inner' 
                                : 'bg-slate-100 border-slate-200 focus:border-indigo-500 text-indigo-700 shadow-inner'
                            }`}
                          />
                        </div>

                        <div className="flex flex-col md:flex-row items-center justify-between gap-6 px-4">
                          <div className="flex items-center space-x-4">
                            <div className={`w-3 h-3 rounded-full shadow-lg ${kieApiKey ? 'bg-emerald-500 shadow-emerald-500/20 animate-pulse' : 'bg-amber-500 shadow-amber-500/20'}`}></div>
                            <span className={`text-[10px] font-black uppercase tracking-[0.3em] font-mono ${isDarkMode ? 'text-zinc-600' : 'text-slate-400'}`}>
                              Status Kie.ai: <span className={kieApiKey ? 'text-emerald-500' : 'text-amber-500'}>
                                {kieApiKey ? 'TERHUBUNG & AKTIF' : 'BELUM TERHUBUNG (FALLBACK SIAGA)'}
                              </span>
                            </span>
                          </div>

                          {kieApiKey && (
                            <div className="text-[10px] text-emerald-500 font-black uppercase tracking-[0.3em] flex items-center bg-emerald-500/5 px-4 py-2 rounded-full border border-emerald-500/20">
                              <span className="mr-2">Master Key Terpasang</span>
                              <Check className="w-3.5 h-3.5" />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Google Gemini Card */}
                <section className={`p-10 lg:p-16 border transition-all rounded-[45px] ${isDarkMode ? 'bg-[#212226] border-white/5 active:bg-[#1a1b1e]' : 'bg-white border-slate-100 shadow-2xl active:bg-zinc-50'}`}>
                  <div className="space-y-12">
                    <div className="flex items-center space-x-6">
                      <div className="w-1 h-10 bg-indigo-500 rounded-full"></div>
                      <div className="space-y-1">
                         <h2 className={`text-2xl font-display font-black uppercase tracking-tight transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Akses Google Gemini Bawaan</h2>
                         <p className="text-[10px] font-mono font-black uppercase tracking-[0.3em] text-indigo-500/60">Lapisan Intelijen Google Cloud Cadangan</p>
                      </div>
                    </div>

                    <div className="space-y-8">
                      <p className={`text-sm leading-relaxed font-medium opacity-70 ${isDarkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                        Server telah dilengkapi koneksi Google Gemini internal. Anda juga dapat menautkan API Key pribadi Anda dari <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-500 font-black hover:underline underline-offset-4">Google AI Studio</a> sebagai prioritas kustom.
                      </p>

                      <div className="space-y-6">
                        <div className="relative group">
                          <input 
                            type="password"
                            value={userApiKey}
                            onChange={(e) => {
                              const val = e.target.value;
                              setUserApiKey(val);
                              localStorage.setItem('nimo_api_key', val);
                            }}
                            placeholder="Masukkan kredensial opsional AIzaSy..."
                            className={`w-full px-8 py-6 text-base outline-none border-2 transition-all font-mono rounded-3xl ${
                              userApiKey && !userApiKey.startsWith('AIzaSy')
                                ? 'border-rose-500/50 bg-rose-500/5 text-rose-500'
                                : isDarkMode 
                                  ? 'bg-[#18191c] border-white/5 focus:border-indigo-500/50 text-indigo-400 shadow-inner' 
                                  : 'bg-slate-100 border-slate-200 focus:border-indigo-500 text-indigo-700 shadow-inner'
                            }`}
                          />
                          {userApiKey && !userApiKey.startsWith('AIzaSy') && (
                            <div className="absolute right-6 top-1/2 -translate-y-1/2 text-rose-500">
                               <span className="text-[10px] font-black uppercase tracking-widest bg-rose-500/10 px-3 py-1.5 rounded-full">Galat Format</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex flex-col md:flex-row items-center justify-between gap-6 px-4">
                          <div className="flex items-center space-x-4">
                            <div className={`w-3 h-3 rounded-full shadow-lg ${userApiKey.startsWith('AIzaSy') || !userApiKey ? 'bg-emerald-500 shadow-emerald-500/20 animate-pulse' : 'bg-rose-500 shadow-rose-500/20'}`}></div>
                            <span className={`text-[10px] font-black uppercase tracking-[0.3em] font-mono ${isDarkMode ? 'text-zinc-600' : 'text-slate-400'}`}>
                              Status Node: <span className={(userApiKey.startsWith('AIzaSy') || !userApiKey) ? 'text-emerald-500' : 'text-rose-500'}>
                                {(userApiKey.startsWith('AIzaSy') || !userApiKey) ? 'AKTIF (SERVER TERHUBUNG)' : 'KUNCI TIDAK VALID'}
                              </span>
                            </span>
                          </div>
                          {userApiKey && userApiKey.startsWith('AIzaSy') && (
                            <div className="text-[10px] text-emerald-500 font-black uppercase tracking-[0.3em] flex items-center bg-emerald-500/5 px-4 py-2 rounded-full border border-emerald-500/20">
                              <span className="mr-2 italic underline underline-offset-2 decoration-emerald-500/30">Verifikasi Berhasil</span>
                              <span>✓</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <footer className="text-center space-y-3">
                  <p className="text-[10px] font-mono uppercase tracking-[0.5em] opacity-30">Nimo Core // Versi OS 3.1.0-Emerald</p>
                  <p className="text-[9px] font-medium opacity-20 px-20">Dioptimalkan untuk narasi manga fidelitas tinggi dan pengambilan sekuens sinematik.</p>
                </footer>
              </div>
            ) : (
              <>
                <header className="text-center mb-16">
                  <h1 className={`text-4xl md:text-6xl font-display font-black mb-4 tracking-tighter uppercase leading-none transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    Potong <span className="text-[#8b5cf6]">Panel</span>
                  </h1>
                  <p className={`text-xl font-light max-w-xl mx-auto transition-colors ${isDarkMode ? 'text-gray-500' : 'text-gray-600'}`}>
                    Ekstraksi panel presisi untuk aset video & narasi.
                  </p>
                </header>

                <main className="space-y-16">
                  <section className={`p-12 border relative overflow-hidden transition-colors rounded-[40px] ${isDarkMode ? 'bg-[#212226] border-white/5' : 'bg-white border-slate-100 shadow-xl'}`}>
                    <div className="flex flex-col items-center justify-center space-y-6 text-center">
                      <div className={`p-4 border shadow-[0_0_15px_rgba(139,92,246,0.2)] rounded-2xl transition-colors ${isDarkMode ? 'bg-[#18191c] border-[#8b5cf6] text-[#8b5cf6]' : 'border-slate-200 text-slate-400'}`}>
                        <Upload className="w-8 h-8" />
                      </div>
                      <h2 className={`text-2xl font-display font-bold uppercase tracking-widest leading-none transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Upload Gambar</h2>
                      <div className="flex flex-col items-center space-y-3">
                        <button 
                          onClick={() => fileInputRef.current?.click()}
                          className="px-10 py-4 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-black uppercase tracking-widest text-sm transition-all active:scale-95 shadow-[0_0_20px_rgba(139,92,246,0.3)] rounded-2xl"
                        >
                          Upload Image
                        </button>
                        <a
                          href="https://sites.google.com/view/aniimage/aniimage"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center space-x-2 text-[11px] font-black uppercase tracking-widest text-[#8b5cf6] hover:text-[#a78bfa] transition-colors py-2 px-4 rounded-xl hover:bg-[#8b5cf6]/10"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download Gambar via AniImage</span>
                          <ExternalLink className="w-3 h-3 opacity-60" />
                        </a>
                      </div>
                      <input 
                        type="file" 
                        ref={fileInputRef}
                        onChange={handleImageUpload}
                        accept="image/*" 
                        multiple
                        className="hidden"
                      />

                      {cutterImages.length > 0 && (
                        <div className="mt-12 w-full">
                          <h3 className={`text-[10px] font-black uppercase tracking-[0.3em] mb-6 transition-colors ${isDarkMode ? 'text-[#8b5cf6]' : 'text-gray-400'}`}>Arsip Terdeteksi ({cutterImages.length})</h3>
                          <div className="flex flex-wrap justify-center gap-4">
                            {cutterImages.map((img, idx) => (
                              <button
                                key={img.id}
                                onClick={() => setActiveCutterIndex(idx)}
                                className={`relative w-20 h-28 overflow-hidden border-2 transition-all ${
                                  activeCutterIndex === idx ? 'border-[#8b5cf6] shadow-[0_0_15px_rgba(139,92,246,0.4)] scale-105 z-10' : 'border-white/10 hover:border-white/30 brightness-50 hover:brightness-100'
                                }`}
                              >
                                <img src={img.img.src} alt={img.name} className="w-full h-full object-cover" />
                                <div className={`absolute top-0 left-0 px-2 py-1 text-[10px] font-mono transition-colors ${isDarkMode ? 'bg-black/80 text-[#8b5cf6]' : 'bg-white/80 text-black'}`}>
                                  {idx + 1}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </section>

                  {currentImage && (
                    <section className={`p-12 border transition-colors rounded-[40px] ${isDarkMode ? 'bg-[#212226] border-white/5' : 'bg-white border-slate-100 shadow-xl'}`}>
                        <div className="flex flex-col items-center space-y-8">
                          <div className="flex items-center space-x-4">
                            <div className={`w-1.5 h-8 transition-colors ${isDarkMode ? 'bg-[#00f2ff]' : 'bg-cyan-600'}`}></div>
                            <h2 className={`text-3xl font-display font-black uppercase tracking-tighter transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Pemotong Presisi (Halaman {activeCutterIndex + 1})</h2>
                          </div>
                        <p className="text-gray-500 text-center max-w-2xl text-sm uppercase tracking-widest font-mono">
                          // Protokol: Klik untuk menempatkan titik iris horizontal.
                        </p>
                        <div className="flex space-x-6">
                          <button 
                            onClick={resetSplits}
                            className={`px-6 py-2 border border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest ${!isDarkMode ? 'bg-white' : ''}`}
                          >
                            Reset Irisan
                          </button>
                        </div>
                        <div className="relative group overflow-auto max-w-full" ref={containerRef}>
                          <canvas 
                            ref={canvasRef}
                            onClick={handleCanvasClick}
                            className={`cursor-crosshair border shadow-[0_0_50px_rgba(0,0,0,1)] mx-auto transition-colors block ${isDarkMode ? 'border-white/10' : 'border-gray-200'}`}
                            style={{ maxWidth: '100%', height: 'auto' }}
                          />
                        </div>
                      </div>
                    </section>
                  )}

                  {currentImage && currentImage.panels.length > 0 && (
                    <section className="space-y-10">
                      <div className="flex items-center justify-between border-b border-white/10 pb-6">
                        <h2 className={`text-3xl font-display font-black uppercase tracking-tighter transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Fragmen Terekstraksi ({currentImage.panels.length})</h2>
                      </div>
                      
                      <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4 rounded-[30px] border transition-colors ${isDarkMode ? 'bg-[#18191c] border-white/5' : 'bg-slate-100 border-slate-200'}`}>
                        {currentImage.panels.map((panel) => (
                          <div key={`${currentImage.id}-${panel.id}`} className={`overflow-hidden group relative aspect-[3/4] rounded-2xl ${isDarkMode ? 'bg-zinc-900' : 'bg-white shadow-xl shadow-slate-200/50'}`}>
                            <img 
                              src={panel.imageSrc} 
                              alt={`Panel ${panel.id}`} 
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            />
                            
                            {/* Always visible action button for deletion in corner */}
                            <button 
                              onClick={() => hidePanel(panel.startY)}
                              className="absolute top-2 right-2 p-2 bg-red-600/90 text-white hover:bg-red-500 transition-all rounded-lg z-10 shadow-lg"
                              title="Hapus"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>

                            <div className={`absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center p-6 border border-[#8b5cf6]/0 group-hover:border-[#8b5cf6]/50`}>
                              <span className="text-[#8b5cf6] font-display font-black text-lg mb-6 uppercase tracking-widest">ID: {panel.id}</span>
                              <div className="flex space-x-3">
                                <a 
                                  href={panel.imageSrc} 
                                  download={`halaman_${activeCutterIndex + 1}_panel_${panel.id}.png`}
                                  className="p-3 bg-white text-black hover:bg-[#00f2ff] transition-all rounded-lg"
                                  title="Unduh"
                                >
                                  <Download className="w-5 h-5" />
                                </a>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-center pt-8">
                        <button 
                          onClick={downloadAllImages}
                          disabled={isDownloadingAll}
                          className="w-full max-w-md px-12 py-5 bg-[#00f2ff] hover:bg-[#00d8e6] disabled:bg-white/5 text-black font-black uppercase tracking-[0.2em] text-[11px] transition-all shadow-[0_0_30px_rgba(0,242,255,0.2)] active:scale-95 rounded-2xl flex items-center justify-center space-x-4"
                        >
                          <Download className="w-5 h-5" />
                          <span>{isDownloadingAll ? 'Mengunduh...' : 'Download Hasil Potongan Panel'}</span>
                        </button>
                      </div>
                    </section>
                  )}
                </main>
              </>
            )}
          </div>
        </div>

        {/* Mobile Navigation (Bottom) */}
        <div className={`md:hidden border-t flex justify-around p-4 sticky bottom-0 z-50 backdrop-blur-xl transition-colors ${isDarkMode ? 'bg-[#212226]/90 border-white/5' : 'bg-white/90 border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]'}`}>
          <button
            onClick={() => handleTabChange('home')}
            className={`flex flex-col items-center p-2 rounded-none transition-all ${
              activeTab === 'home' ? (isDarkMode ? 'text-[#00f2ff]' : 'text-cyan-600') + ' scale-110' : (isDarkMode ? 'text-gray-600' : 'text-gray-400')
            }`}
          >
            <HomeIcon className="w-5 h-5" />
            <span className="text-[8px] font-black uppercase mt-1 tracking-widest">Beranda</span>
          </button>
          <button
            onClick={() => handleTabChange('manga-tool')}
            className={`flex flex-col items-center p-2 rounded-none transition-all ${
              activeTab === 'manga-tool' ? (isDarkMode ? 'text-[#00f2ff]' : 'text-cyan-600') + ' scale-110' : (isDarkMode ? 'text-gray-600' : 'text-gray-400')
            }`}
          >
            <FileText className="w-5 h-5" />
            <span className="text-[8px] font-black uppercase mt-1 tracking-widest">Alur Manga</span>
          </button>
          <button
            onClick={() => handleTabChange('panel-cutter')}
            className={`flex flex-col items-center p-2 rounded-none transition-all ${
              activeTab === 'panel-cutter' ? (isDarkMode ? 'text-[#00f2ff]' : 'text-cyan-600') + ' scale-110' : (isDarkMode ? 'text-gray-600' : 'text-gray-400')
            }`}
          >
            <Scissors className="w-5 h-5" />
            <span className="text-[8px] font-black uppercase mt-1 tracking-widest">Potong Panel</span>
          </button>
          <button
            onClick={() => handleTabChange('settings')}
            className={`flex flex-col items-center p-2 rounded-none transition-all ${
              activeTab === 'settings' ? (isDarkMode ? 'text-[#00f2ff]' : 'text-cyan-600') + ' scale-110' : (isDarkMode ? 'text-gray-600' : 'text-gray-400')
            }`}
          >
            <Settings className="w-5 h-5" />
            <span className="text-[8px] font-black uppercase mt-1 tracking-widest">Setelan</span>
          </button>
        </div>
      </div>
    </div>
  );
}
