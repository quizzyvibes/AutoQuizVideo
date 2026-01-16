import React, { useState } from 'react';
import { generateThumbnail, generateMetadata } from '../services/geminiService';
import { Copy, Download, Wand2, Image as ImageIcon, FileText, Check, Hash, Tag, Loader2, Sparkles, Youtube } from 'lucide-react';

interface UploadKitProps {
  topic: string;
  slideCount: number;
}

export const UploadKit: React.FC<UploadKitProps> = ({ topic, slideCount }) => {
  // Thumbnail State
  const [thumbText, setThumbText] = useState(topic);
  const [thumbStyle, setThumbStyle] = useState('Neon/Gaming');
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [loadingThumb, setLoadingThumb] = useState(false);

  // Metadata State
  const [metadata, setMetadata] = useState<{ titles: string[], description: string, hashtags: string[], tags: string } | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [activeTab, setActiveTab] = useState<'titles' | 'description' | 'tags'>('titles');
  const [copied, setCopied] = useState<string | null>(null);

  // Constants
  const thumbStyles = [
    'Neon/Gaming',
    'Minimalist',
    'Reaction/Shock',
    '3D Render',
    'Comic Book'
  ];

  const handleGenerateThumbnail = async () => {
    if (loadingThumb) return;
    setLoadingThumb(true);
    try {
        const url = await generateThumbnail(topic, thumbText, thumbStyle);
        setThumbnailUrl(url);
    } catch (e) {
        console.error("Thumbnail gen failed", e);
    } finally {
        setLoadingThumb(false);
    }
  };

  const handleGenerateMetadata = async () => {
    if (loadingMeta) return;
    setLoadingMeta(true);
    try {
        const data = await generateMetadata(topic, slideCount);
        setMetadata(data);
    } catch (e) {
        console.error("Metadata gen failed", e);
    } finally {
        setLoadingMeta(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
      navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
  };

  const handleDownloadThumbnail = () => {
      if (!thumbnailUrl) return;
      const a = document.createElement('a');
      a.href = thumbnailUrl;
      a.download = `thumbnail-${topic.toLowerCase().replace(/\s+/g, '-')}.png`;
      a.click();
  };

  return (
    <div className="w-full max-w-6xl mt-12 mb-20 animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center shadow-lg shadow-red-900/20">
                <Youtube size={24} className="text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white">Upload & Marketing Kit</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* THUMBNAIL GENERATOR */}
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 shadow-xl flex flex-col gap-6">
                <div className="flex items-center gap-2 mb-2">
                    <ImageIcon className="text-blue-500" size={20} />
                    <h3 className="text-lg font-bold text-white">Thumbnail Studio</h3>
                    <span className="text-xs text-blue-400 bg-blue-900/30 px-2 py-0.5 rounded border border-blue-900/50">Gemini 3 Pro</span>
                </div>

                {/* Preview Area */}
                <div className="aspect-video w-full bg-black rounded-xl border border-gray-700 overflow-hidden relative group">
                    {thumbnailUrl ? (
                        <img src={thumbnailUrl} alt="Generated Thumbnail" className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-600 gap-2">
                             <ImageIcon size={48} className="opacity-20" />
                             <p className="text-sm">Preview will appear here</p>
                        </div>
                    )}
                    {loadingThumb && (
                        <div className="absolute inset-0 bg-black/70 flex items-center justify-center backdrop-blur-sm z-10">
                            <Loader2 size={40} className="text-blue-500 animate-spin" />
                        </div>
                    )}
                </div>

                {/* Controls */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-semibold text-gray-400 uppercase">Text Overlay</label>
                        <input 
                            type="text" 
                            value={thumbText}
                            onChange={(e) => setThumbText(e.target.value)}
                            className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
                            placeholder="e.g. Impossible Quiz!"
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-semibold text-gray-400 uppercase">Visual Style</label>
                        <select 
                            value={thumbStyle}
                            onChange={(e) => setThumbStyle(e.target.value)}
                            className="bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
                        >
                            {thumbStyles.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 mt-auto">
                    <button 
                        onClick={handleGenerateThumbnail}
                        disabled={loadingThumb}
                        className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-500 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                        {loadingThumb ? <Loader2 size={18} className="animate-spin"/> : <Wand2 size={18} />}
                        Generate Thumbnail
                    </button>
                    {thumbnailUrl && (
                        <button 
                            onClick={handleDownloadThumbnail}
                            className="px-4 bg-gray-800 hover:bg-gray-700 text-white rounded-xl transition-colors border border-gray-700"
                        >
                            <Download size={20} />
                        </button>
                    )}
                </div>
            </div>


            {/* METADATA GENERATOR */}
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 shadow-xl flex flex-col gap-6">
                <div className="flex items-center gap-2 mb-2">
                    <FileText className="text-purple-500" size={20} />
                    <h3 className="text-lg font-bold text-white">SEO & Metadata</h3>
                    <span className="text-xs text-purple-400 bg-purple-900/30 px-2 py-0.5 rounded border border-purple-900/50">Gemini 3 Flash</span>
                </div>

                {!metadata && !loadingMeta ? (
                    <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-gray-800 rounded-xl min-h-[300px] gap-4">
                        <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center">
                            <Sparkles size={32} className="text-purple-500" />
                        </div>
                        <p className="text-gray-400 text-center max-w-xs">
                            Generate optimized titles, descriptions, and tags for your quiz video.
                        </p>
                        <button 
                            onClick={handleGenerateMetadata}
                            className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-6 py-2 rounded-lg transition-all"
                        >
                            Generate Metadata
                        </button>
                    </div>
                ) : loadingMeta ? (
                    <div className="flex-1 flex flex-col items-center justify-center min-h-[300px]">
                        <Loader2 size={40} className="text-purple-500 animate-spin mb-4" />
                        <p className="text-gray-400">Optimizing SEO...</p>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col min-h-[300px]">
                        {/* Tabs */}
                        <div className="flex border-b border-gray-800 mb-4">
                            <button 
                                onClick={() => setActiveTab('titles')}
                                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'titles' ? 'border-purple-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                            >
                                Titles
                            </button>
                            <button 
                                onClick={() => setActiveTab('description')}
                                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'description' ? 'border-purple-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                            >
                                Description
                            </button>
                            <button 
                                onClick={() => setActiveTab('tags')}
                                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'tags' ? 'border-purple-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                            >
                                Tags
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto max-h-[300px] pr-2 custom-scrollbar">
                            {activeTab === 'titles' && (
                                <div className="space-y-3">
                                    {metadata?.titles.map((title, idx) => (
                                        <div key={idx} className="bg-gray-950 p-3 rounded-lg border border-gray-800 flex justify-between items-center group">
                                            <p className="text-sm font-medium text-gray-200">{title}</p>
                                            <button 
                                                onClick={() => copyToClipboard(title, `title-${idx}`)}
                                                className="text-gray-500 hover:text-white transition-colors"
                                            >
                                                {copied === `title-${idx}` ? <Check size={16} className="text-green-500"/> : <Copy size={16} />}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {activeTab === 'description' && (
                                <div className="relative">
                                    <textarea 
                                        readOnly 
                                        value={metadata?.description + "\n\n" + metadata?.hashtags.join(' ')}
                                        className="w-full h-[280px] bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-gray-300 focus:outline-none resize-none"
                                    />
                                    <button 
                                        onClick={() => copyToClipboard(metadata?.description + "\n\n" + metadata?.hashtags.join(' ') || "", 'desc')}
                                        className="absolute top-2 right-2 bg-gray-800 p-2 rounded-md hover:bg-gray-700 transition-colors"
                                    >
                                        {copied === 'desc' ? <Check size={16} className="text-green-500"/> : <Copy size={16} className="text-gray-400"/>}
                                    </button>
                                </div>
                            )}

                            {activeTab === 'tags' && (
                                <div className="space-y-4">
                                    <div className="bg-gray-950 p-3 rounded-lg border border-gray-800 relative">
                                        <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase flex items-center gap-1"><Hash size={12}/> System Tags</h4>
                                        <p className="text-sm text-gray-300 break-words pr-8">{metadata?.tags}</p>
                                        <button 
                                            onClick={() => copyToClipboard(metadata?.tags || "", 'tags')}
                                            className="absolute top-2 right-2 text-gray-500 hover:text-white transition-colors"
                                        >
                                            {copied === 'tags' ? <Check size={16} className="text-green-500"/> : <Copy size={16} />}
                                        </button>
                                    </div>

                                    <div className="bg-gray-950 p-3 rounded-lg border border-gray-800">
                                        <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase flex items-center gap-1"><Tag size={12}/> Hashtags</h4>
                                        <div className="flex flex-wrap gap-2">
                                            {metadata?.hashtags.map((tag, idx) => (
                                                <span key={idx} className="bg-blue-900/30 text-blue-300 px-2 py-1 rounded text-xs border border-blue-900/50">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        <div className="mt-4 pt-4 border-t border-gray-800 flex justify-end">
                            <button 
                                onClick={handleGenerateMetadata}
                                className="text-xs text-gray-500 hover:text-white underline"
                            >
                                Regenerate Metadata
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};
