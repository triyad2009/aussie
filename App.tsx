import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as fabric from 'fabric';
import { 
  Pencil, Eraser, Square, Circle, Type, Image as ImageIcon, Trash2, Download, Plus, Link as LinkIcon, Eye, EyeOff, ChevronLeft, ChevronRight, MousePointer2, Undo2, Redo2, UploadCloud, Sparkles
} from 'lucide-react';
import { cn } from './utils/cn';

type Tool = 'pencil' | 'eraser' | 'rect' | 'circle' | 'text' | 'select';
interface Page { id: string; data: string; }

const AussieAcademyWhiteboard: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [activeTool, setActiveTool] = useState<Tool>('pencil');
  const [color, setColor] = useState('#1e3a8a');
  const [brushSize, setBrushSize] = useState(5);
  const [isImmersive, setIsImmersive] = useState(false);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  
  // Smart Mode States
  const [isSmartMode, setIsSmartMode] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const smartModeRef = useRef(false);

  const [pages, setPages] = useState<Page[]>([{ id: '1', data: '' }]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const historyStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  
  const [mousePos, setMousePos] = useState({ x: -100, y: -100 });
  const [isHoveringBoard, setIsHoveringBoard] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);

  const pendingPaths = useRef<fabric.Path[]>([]);
  const recognitionTimer = useRef<NodeJS.Timeout | null>(null);

  const toggleSmartMode = () => {
    setIsSmartMode(prev => {
      const newVal = !prev;
      smartModeRef.current = newVal;
      return newVal;
    });
  };

  const saveHistory = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const json = JSON.stringify(canvas.toJSON());
    if (historyStack.current[historyStack.current.length - 1] !== json) {
      historyStack.current.push(json);
      if (historyStack.current.length > 50) historyStack.current.shift();
      redoStack.current = [];
      setCanUndo(historyStack.current.length > 1);
      setCanRedo(false);
    }
  }, []);

  const undo = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || historyStack.current.length <= 1) return;
    redoStack.current.push(historyStack.current.pop()!);
    canvas.loadFromJSON(JSON.parse(historyStack.current[historyStack.current.length - 1])).then(() => {
      canvas.renderAll(); setCanUndo(historyStack.current.length > 1); setCanRedo(true);
    });
  };

  const redo = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || redoStack.current.length === 0) return;
    const next = redoStack.current.pop()!;
    historyStack.current.push(next);
    canvas.loadFromJSON(JSON.parse(next)).then(() => {
      canvas.renderAll(); setCanUndo(true); setCanRedo(redoStack.current.length > 0);
    });
  };

  const enterImmersive = async () => { setIsImmersive(true); try { await document.documentElement.requestFullscreen(); } catch { } };
  const exitImmersive = async () => { setIsImmersive(false); if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch { } } };

  const updateCanvasSize = useCallback(() => {
    if (!fabricCanvasRef.current || !containerRef.current) return;
    fabricCanvasRef.current.setDimensions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
    fabricCanvasRef.current.renderAll();
  }, []);

  const performSmartRecognition = async () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || pendingPaths.current.length === 0) return;

    setIsProcessing(true);
    const paths = [...pendingPaths.current];
    pendingPaths.current = [];

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const strokesData: any[] = [];

    paths.forEach((path) => {
      const b = path.getBoundingRect();
      minX = Math.min(minX, b.left); minY = Math.min(minY, b.top);
      maxX = Math.max(maxX, b.left + b.width); maxY = Math.max(maxY, b.top + b.height);

      const pathStrokes: any[] = [[], [], []];
      path.path.forEach((seg: any, i: number) => {
        if (seg[1] !== undefined) {
          pathStrokes[0].push(Math.round(seg[1]));
          pathStrokes[1].push(Math.round(seg[2]));
          pathStrokes[2].push(i * 10);
        }
      });
      strokesData.push(pathStrokes);
    });

    const width = maxX - minX;
    const height = maxY - minY;

    try {
      const resp = await fetch('https://www.google.com.hk/inputtools/request?ime=handwriting&app=mobilesearch&cs=1&oe=UTF-8', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          options: 'enable_pre_space',
          requests: [{ writing_guide: { writing_area_width: 1000, writing_area_height: 1000 }, ink: strokesData, language: 'bn-t-i0-handwrit' }]
        })
      });
      const data = await resp.json();
      if (data[0] === 'SUCCESS' && data[1]?.[0]?.[1]?.[0]) {
        const textValue = data[1][0][1][0];
        paths.forEach(p => canvas.remove(p));
        canvas.add(new fabric.IText(textValue, {
          left: minX, top: minY, fontSize: Math.max(height * 0.9, 35), fill: paths[0].stroke, fontFamily: 'Arial, sans-serif'
        }));
        canvas.renderAll();
        saveHistory();
      }
    } catch (e) { } finally { setIsProcessing(false); }
  };

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    const canvas = new fabric.Canvas(canvasRef.current, { width: containerRef.current.clientWidth, height: containerRef.current.clientHeight, backgroundColor: '#ffffff', isDrawingMode: true });
    fabricCanvasRef.current = canvas;
    const brush = new fabric.PencilBrush(canvas); brush.color = color; brush.width = brushSize; canvas.freeDrawingBrush = brush;
    
    canvas.on('object:added', saveHistory); 
    canvas.on('object:modified', saveHistory); 
    canvas.on('object:removed', saveHistory);

    canvas.on('path:created', (e: any) => {
      if (!smartModeRef.current) return;
      pendingPaths.current.push(e.path);
      if (recognitionTimer.current) clearTimeout(recognitionTimer.current);
      recognitionTimer.current = setTimeout(performSmartRecognition, 1000);
    });

    historyStack.current = [JSON.stringify(canvas.toJSON())];
    window.addEventListener('resize', updateCanvasSize);
    return () => { canvas.dispose(); window.removeEventListener('resize', updateCanvasSize); };
  }, []);

  useEffect(() => { const t1 = setTimeout(updateCanvasSize, 100); const t2 = setTimeout(updateCanvasSize, 500); return () => { clearTimeout(t1); clearTimeout(t2); }; }, [isImmersive, updateCanvasSize]);
  
  useEffect(() => {
    const c = fabricCanvasRef.current; if (!c) return;
    c.isDrawingMode = activeTool === 'pencil' || activeTool === 'eraser';
    if (c.freeDrawingBrush) { c.freeDrawingBrush.color = activeTool === 'eraser' ? '#ffffff' : color; c.freeDrawingBrush.width = activeTool === 'eraser' ? brushSize * 5 : brushSize; }
    c.selection = activeTool === 'select';
    c.forEachObject(o => { o.selectable = activeTool === 'select'; o.evented = activeTool === 'select'; });
  }, [activeTool, color, brushSize]);

  const loadPage = (idx: number) => {
    const c = fabricCanvasRef.current; if (!c || idx === currentPageIndex) return;
    setPages(prev => { const n = [...prev]; n[currentPageIndex] = { ...n[currentPageIndex], data: JSON.stringify(c.toJSON()) }; return n; });
    const p = pages[idx];
    if (p.data) c.loadFromJSON(JSON.parse(p.data)).then(() => { c.renderAll(); historyStack.current = [p.data]; redoStack.current = []; setCanUndo(false); setCanRedo(false); setCurrentPageIndex(idx); });
    else { c.clear(); c.backgroundColor = '#ffffff'; c.renderAll(); historyStack.current = [JSON.stringify(c.toJSON())]; redoStack.current = []; setCanUndo(false); setCanRedo(false); setCurrentPageIndex(idx); }
  };

  const addNewPage = () => {
    const c = fabricCanvasRef.current; if (!c) return;
    setPages(prev => [...prev.map((p, i) => i === currentPageIndex ? {...p, data: JSON.stringify(c.toJSON())} : p), { id: Date.now().toString(), data: '' }]);
    c.clear(); c.backgroundColor = '#ffffff'; c.renderAll(); historyStack.current = [JSON.stringify(c.toJSON())]; redoStack.current = []; setCanUndo(false); setCanRedo(false); setCurrentPageIndex(pages.length);
  };

  const addImage = (src: string | File) => {
    const c = fabricCanvasRef.current; if (!c) return;
    const proc = (u: string) => { fabric.FabricImage.fromURL(u, { crossOrigin: 'anonymous' }).then(img => { const s = Math.min(c.width! / (img.width! * 1.5), c.height! / (img.height! * 1.5), 1); img.scale(s); c.add(img); c.centerObject(img); c.setActiveObject(img); setActiveTool('select'); saveHistory(); }).catch(() => {
      if (u.startsWith('http')) fabric.FabricImage.fromURL(`https://images.weserv.nl/?url=${encodeURIComponent(u.replace(/^https?:\/\//, ''))}`).then(img => { img.scale(0.5); c.add(img); c.centerObject(img); c.renderAll(); saveHistory(); });
    }); };
    if (typeof src === 'string') proc(src); else { const r = new FileReader(); r.onload = (f) => proc(f.target?.result as string); r.readAsDataURL(src); }
  };

  return (
    <div className={cn("h-screen flex flex-col overflow-hidden relative", isImmersive ? "bg-white" : "bg-slate-50")} onDragEnter={() => setIsDraggingOver(true)} onDragOver={e => e.preventDefault()}>
      {isDraggingOver && (
        <div className="fixed inset-0 z-[200] bg-[#1e3a8a]/40 backdrop-blur-md flex items-center justify-center p-12 border-8 border-dashed border-white/50 m-4 rounded-[3rem]" onDragLeave={e => e.currentTarget === e.target && setIsDraggingOver(false)} onDrop={e => { e.preventDefault(); setIsDraggingOver(false); if (e.dataTransfer.files[0]) addImage(e.dataTransfer.files[0]); else { const u = e.dataTransfer.getData('text/uri-list'); if (u) addImage(u); } }}>
          <div className="bg-white p-12 rounded-[2.5rem] shadow-2xl flex flex-col items-center gap-6 animate-bounce text-center">
            <UploadCloud size={64} className="text-[#1e3a8a]" />
            <h2 className="text-3xl font-black text-[#1e3a8a]">Drop to Add Picture</h2>
          </div>
        </div>
      )}
      {!isImmersive && (
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shadow-sm z-30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#1e3a8a] rounded-xl flex items-center justify-center shadow-lg"><span className="text-white font-black text-xl italic">A</span></div>
            <div className="hidden sm:block"><h1 className="text-base font-black text-[#1e3a8a] leading-none">AUSSIE ACADEMY</h1><p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1">Smart Interaction Board</p></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-slate-50 rounded-xl p-1 border border-slate-200">
              <button onClick={undo} disabled={!canUndo} className="p-2 hover:bg-white rounded-lg disabled:opacity-20 text-slate-600"><Undo2 size={18}/></button>
              <button onClick={redo} disabled={!canRedo} className="p-2 hover:bg-white rounded-lg disabled:opacity-20 text-slate-600"><Redo2 size={18}/></button>
            </div>
            
            <button onClick={toggleSmartMode} className={cn("flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all shadow-sm border", isSmartMode ? "bg-amber-500 text-white border-amber-600 shadow-amber-900/20" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50")}>
              <Sparkles size={16} className={cn(isSmartMode ? "animate-pulse" : "text-amber-500")} />
              <span className="hidden sm:inline">{isSmartMode ? "Magic ON" : "Smart Mode"}</span>
              {isProcessing && <div className="w-2 h-2 bg-white rounded-full animate-ping ml-1" />}
            </button>

            <button onClick={enterImmersive} className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg font-bold text-xs hover:bg-black transition-all shadow-md"><Eye size={16} /> <span className="hidden md:inline">Full Screen</span></button>
            <button onClick={() => { const c = fabricCanvasRef.current; if (c) { c.discardActiveObject(); c.renderAll(); try { const l = document.createElement('a'); l.download = `board-${currentPageIndex+1}.png`; l.href = c.toDataURL({format: 'png', multiplier: 2}); l.click(); } catch { alert('Export blocked by some web images.'); } } }} className="flex items-center gap-2 bg-[#1e3a8a] text-white px-4 py-2 rounded-lg font-bold text-xs hover:bg-blue-800 transition-all shadow-md active:scale-95"><Download size={16} /> <span className="hidden md:inline">Export</span></button>
          </div>
        </header>
      )}
      <div className="flex-1 flex overflow-hidden relative">
        {!isImmersive && (
          <aside className="w-20 bg-white border-r border-slate-200 flex flex-col items-center py-6 gap-4 z-20 shadow-sm overflow-y-auto no-scrollbar">
            {[{ id: 'select', icon: MousePointer2, label: 'Move' }, { id: 'pencil', icon: Pencil, label: 'Pen' }, { id: 'eraser', icon: Eraser, label: 'Eraser' }, { id: 'rect', icon: Square, label: 'Box' }, { id: 'circle', icon: Circle, label: 'Circle' }, { id: 'text', icon: Type, label: 'Text' }].map(t => (
              <button key={t.id} onClick={() => (t as any).id === 'rect' ? (fabricCanvasRef.current?.add(new fabric.Rect({ left: 100, top: 100, width: 100, height: 80, fill: 'transparent', stroke: color, strokeWidth: brushSize })), setActiveTool('select')) : (t as any).id === 'circle' ? (fabricCanvasRef.current?.add(new fabric.Circle({ left: 100, top: 100, radius: 50, fill: 'transparent', stroke: color, strokeWidth: brushSize })), setActiveTool('select')) : (t as any).id === 'text' ? (fabricCanvasRef.current?.add(new fabric.IText('Text', { left: 100, top: 100, fill: color })), setActiveTool('select')) : setActiveTool(t.id as Tool)} className={cn("w-14 h-14 flex flex-col items-center justify-center rounded-2xl transition-all border-2", activeTool === t.id ? "bg-[#1e3a8a] text-white border-[#1e3a8a] shadow-xl" : "text-slate-400 border-transparent hover:bg-slate-50")}>
                <t.icon size={22} /><span className="text-[8px] font-bold mt-1 uppercase tracking-tighter">{t.label}</span>
              </button>
            ))}
            <div className="h-px w-10 bg-slate-100 my-1" />
            <label className="w-14 h-14 flex flex-col items-center justify-center rounded-2xl text-slate-400 hover:bg-slate-50 cursor-pointer transition-all"><ImageIcon size={22} /><input type="file" accept="image/*" className="hidden" onChange={e => e.target.files && addImage(e.target.files[0])} /><span className="text-[8px] font-bold mt-1 uppercase tracking-tighter">Photo</span></label>
            <button onClick={() => setShowUrlModal(true)} className="w-14 h-14 flex flex-col items-center justify-center rounded-2xl text-slate-400 hover:bg-slate-50"><LinkIcon size={22} /><span className="text-[8px] font-bold mt-1 uppercase tracking-tighter">URL</span></button>
            <button onClick={() => { if (confirm('Clear board?')) { fabricCanvasRef.current?.clear(); fabricCanvasRef.current!.backgroundColor='#ffffff'; fabricCanvasRef.current?.renderAll(); saveHistory(); }}} className="w-14 h-14 flex items-center justify-center text-slate-300 hover:text-red-500 mt-auto"><Trash2 size={22} /></button>
          </aside>
        )}
        <main className="flex-1 flex flex-col relative overflow-hidden">
          {isHoveringBoard && (
            <div className="pointer-events-none fixed z-[99] flex items-center justify-center transition-transform duration-100 ease-out" style={{ left: mousePos.x + (isImmersive ? 0 : 80), top: mousePos.y + (isImmersive ? 0 : 64), transform: `translate(-50%, -50%) scale(${isDrawing ? 0.75 : 1})` }}>
              <div className="absolute w-12 h-12 rounded-full opacity-20 animate-pulse" style={{ backgroundColor: color }} />
              <div className="w-10 h-10 rounded-full border-2 shadow-2xl flex items-center justify-center backdrop-blur-[2px]" style={{ backgroundColor: `${color}15`, borderColor: color }}><div className="absolute w-[18px] h-[0.5px] bg-white/70" /><div className="absolute h-[18px] w-[0.5px] bg-white/70" /><div className="w-1 h-1 bg-white rounded-full shadow-[0_0_5px_white]" /></div>
            </div>
          )}
          {isImmersive && (
            <>
            <button onClick={exitImmersive} className="fixed top-6 right-6 z-50 bg-slate-900/10 hover:bg-slate-900 text-slate-900 hover:text-white px-4 h-12 rounded-full flex items-center gap-2 backdrop-blur-md shadow-sm transition-all group"><EyeOff size={22} /><span className="text-[10px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">Exit</span></button>
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-full p-2 shadow-2xl">
              <button onClick={() => currentPageIndex > 0 && loadPage(currentPageIndex - 1)} disabled={currentPageIndex === 0} className="w-11 h-11 rounded-full flex items-center justify-center text-white/80 hover:bg-white/10 disabled:opacity-20"><ChevronLeft size={26} /></button>
              <div className="flex items-center gap-1 px-3"><span className="text-[11px] font-black text-white/50 uppercase tracking-widest">Slot</span><span className="text-base font-black text-white">{currentPageIndex + 1}</span><span className="text-[11px] font-black text-white/40">/ {pages.length}</span></div>
              <button onClick={() => currentPageIndex < pages.length - 1 && loadPage(currentPageIndex + 1)} disabled={currentPageIndex === pages.length - 1} className="w-11 h-11 rounded-full flex items-center justify-center text-white/80 hover:bg-white/10 disabled:opacity-20"><ChevronRight size={26} /></button>
              <div className="w-px h-6 bg-white/20 mx-1" /><button onClick={addNewPage} className="w-11 h-11 rounded-full flex items-center justify-center bg-[#1e3a8a] hover:bg-blue-600 text-white shadow-lg"><Plus size={22} /></button>
            </div>
            </>
          )}
          <div ref={containerRef} className="flex-1 relative overflow-hidden bg-white cursor-none" onMouseEnter={() => setIsHoveringBoard(true)} onMouseLeave={() => { setIsHoveringBoard(false); setIsDrawing(false); }} onMouseDown={() => setIsDrawing(true)} onMouseUp={() => setIsDrawing(false)} onMouseMove={e => { if (containerRef.current) { const r = containerRef.current.getBoundingClientRect(); setMousePos({ x: e.clientX - r.left, y: e.clientY - r.top }); } }}><canvas ref={canvasRef} /></div>
          {!isImmersive && ['pencil', 'rect', 'circle', 'text', 'eraser'].includes(activeTool) && (
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl px-6 py-3 shadow-2xl flex items-center gap-5 z-30 animate-in slide-in-from-bottom-3 fade-in">
              <div className="flex items-center gap-2">
                {['#1e3a8a', '#000000', '#dc2626', '#16a34a', '#2563eb', '#ca8a04', '#7c3aed'].map(c => <button key={c} onClick={() => setColor(c)} className={cn("w-7 h-7 rounded-full border-2 transition-all", color === c ? "border-slate-500 scale-125 ring-2 ring-slate-200" : "border-white shadow-sm")} style={{ backgroundColor: c }} />)}
                <div className="relative w-7 h-7 rounded-full overflow-hidden border-2 border-slate-200 shadow-sm"><input type="color" value={color} onChange={e => setColor(e.target.value)} className="absolute inset-0 w-[200%] h-[200%] -top-1/2 -left-1/2 cursor-pointer" /></div>
              </div>
              <div className="w-px h-8 bg-slate-200" /><div className="flex items-center gap-3"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Size: {brushSize}px</span><input type="range" min="1" max="60" value={brushSize} onChange={e => setBrushSize(parseInt(e.target.value))} className="w-28 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#1e3a8a]" /></div>
            </div>
          )}
          {!isImmersive && (
            <div className="h-20 bg-white border-t border-slate-200 flex items-center justify-between px-8 z-20 flex-shrink-0">
               <div className="flex items-center gap-3 overflow-x-auto no-scrollbar max-w-[80%]">
                  <button onClick={addNewPage} className="min-w-[48px] h-12 rounded-2xl bg-[#1e3a8a] text-white flex items-center justify-center shadow-lg active:scale-90 transition-all"><Plus size={24} /></button>
                  <div className="h-8 w-px bg-slate-100 mx-2" />
                  {pages.map((p, idx) => <button key={p.id} onClick={() => loadPage(idx)} className={cn("min-w-[100px] h-12 rounded-2xl flex flex-col items-center justify-center transition-all border-2 text-[10px] font-black uppercase px-4", currentPageIndex === idx ? "bg-blue-50 border-[#1e3a8a] text-[#1e3a8a] shadow-inner" : "bg-slate-50 border-transparent text-slate-400 hover:bg-white")}>SLOT {idx + 1}<span className="text-[7px] opacity-60">Board View</span></button>)}
               </div>
               <div className="flex gap-3">
                  <button onClick={() => currentPageIndex > 0 && loadPage(currentPageIndex - 1)} className="p-3 text-slate-400 hover:bg-slate-50 rounded-xl transition-all disabled:opacity-0" disabled={currentPageIndex === 0}>
                    <ChevronLeft size={28}/>
                  </button>
                  <button onClick={() => currentPageIndex < pages.length - 1 && loadPage(currentPageIndex + 1)} className="p-3 text-slate-400 hover:bg-slate-50 rounded-xl transition-all disabled:opacity-0" disabled={currentPageIndex === pages.length - 1}>
                    <ChevronRight size={28}/>
                  </button>
               </div>
            </div>
          )}
        </main>
      </div>
      {showUrlModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/50 backdrop-blur-md animate-in fade-in">
           <div className="bg-white rounded-[2rem] p-10 w-full max-w-md shadow-2xl border border-slate-100">
              <h3 className="text-2xl font-black text-[#1e3a8a] mb-8 tracking-tight">Load Online Image</h3>
              <form onSubmit={e => { e.preventDefault(); if(imageUrl) { addImage(imageUrl); setImageUrl(''); setShowUrlModal(false); }}} className="space-y-6">
                <input type="url" required autoFocus value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://example.com/image.jpg" className="w-full px-6 py-4 rounded-2xl border-2 border-slate-100 bg-slate-50 focus:border-[#1e3a8a] focus:bg-white outline-none transition-all font-bold" />
                <div className="flex gap-4 pt-4"><button type="button" onClick={() => setShowUrlModal(false)} className="flex-1 py-4 text-slate-400 font-black text-xs uppercase tracking-widest">Cancel</button><button type="submit" className="flex-1 py-4 rounded-2xl bg-[#1e3a8a] text-white font-black text-xs uppercase tracking-widest shadow-xl active:scale-95">Load Link</button></div>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};
export default AussieAcademyWhiteboard;
