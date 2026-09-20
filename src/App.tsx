import React, { useCallback, useEffect, useRef, useState } from "react";
import * as fabric from "fabric";
import {
  Pencil, Eraser, Square, Circle, Type, Image as ImageIcon, Trash2,
  Download, Plus, Link as LinkIcon, Eye, EyeOff, ChevronLeft,
  ChevronRight, MousePointer2, Undo2, Redo2, UploadCloud
} from "lucide-react";

type Tool = "select" | "pencil" | "eraser";
type Page = { id: string; data: string };

const AussieAcademyWhiteboard: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fc = useRef<fabric.Canvas | null>(null);
  const history = useRef<string[]>([]);
  const redoHistory = useRef<string[]>([]);
  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState("#1e3a8a");
  const [size, setSize] = useState(5);
  const [immersive, setImmersive] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [pages, setPages] = useState<Page[]>([{ id: "1", data: "" }]);
  const [page, setPage] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [dragging, setDragging] = useState(false);

  const snapshot = useCallback(() => {
    const c = fc.current;
    if (!c) return;
    const json = JSON.stringify(c.toJSON());
    if (history.current.at(-1) !== json) {
      history.current.push(json);
      if (history.current.length > 60) history.current.shift();
      redoHistory.current = [];
      setCanUndo(history.current.length > 1);
      setCanRedo(false);
    }
  }, []);

  const resize = useCallback(() => {
    if (!fc.current || !wrapRef.current) return;
    fc.current.setDimensions({
      width: wrapRef.current.clientWidth,
      height: wrapRef.current.clientHeight
    });
    fc.current.renderAll();
  }, []);

  useEffect(() => {
    if (!canvasRef.current || !wrapRef.current) return;
    const c = new fabric.Canvas(canvasRef.current, {
      backgroundColor: "#fff",
      width: wrapRef.current.clientWidth,
      height: wrapRef.current.clientHeight,
      isDrawingMode: true
    });
    fc.current = c;
    c.freeDrawingBrush = new fabric.PencilBrush(c);
    c.freeDrawingBrush.color = color;
    c.freeDrawingBrush.width = size;
    c.on("object:added", snapshot);
    c.on("object:modified", snapshot);
    c.on("object:removed", snapshot);
    history.current = [JSON.stringify(c.toJSON())];
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      c.dispose();
      fc.current = null;
    };
  }, []);

  useEffect(() => {
    const c = fc.current;
    if (!c) return;
    c.isDrawingMode = tool === "pencil" || tool === "eraser";
    c.selection = tool === "select";
    if (c.freeDrawingBrush) {
      c.freeDrawingBrush.color = tool === "eraser" ? "#fff" : color;
      c.freeDrawingBrush.width = tool === "eraser" ? size * 5 : size;
    }
    c.forEachObject(o => {
      o.selectable = tool === "select";
      o.evented = tool === "select";
    });
  }, [tool, color, size]);

  useEffect(() => {
    const timers = [100, 400, 900].map(ms => window.setTimeout(resize, ms));
    return () => timers.forEach(clearTimeout);
  }, [immersive, resize]);

  const undo = async () => {
    const c = fc.current;
    if (!c || history.current.length <= 1) return;
    redoHistory.current.push(history.current.pop()!);
    await c.loadFromJSON(JSON.parse(history.current.at(-1)!));
    c.renderAll();
    setCanUndo(history.current.length > 1);
    setCanRedo(true);
  };

  const redo = async () => {
    const c = fc.current;
    if (!c || !redoHistory.current.length) return;
    const next = redoHistory.current.pop()!;
    history.current.push(next);
    await c.loadFromJSON(JSON.parse(next));
    c.renderAll();
    setCanUndo(true);
    setCanRedo(redoHistory.current.length > 0);
  };

  const addImage = (src: string | File) => {
    const c = fc.current;
    if (!c) return;
    const load = (data: string) => {
      fabric.FabricImage.fromURL(data, { crossOrigin: "anonymous" }).then(img => {
        const maxW = c.width! * .7, maxH = c.height! * .7;
        img.scale(Math.min(maxW / (img.width || 1), maxH / (img.height || 1), 1));
        c.add(img);
        c.centerObject(img);
        c.setActiveObject(img);
        c.renderAll();
        setTool("select");
        snapshot();
      }).catch(() => alert("Image could not be loaded. Try downloading it and uploading the file."));
    };
    if (typeof src === "string") load(src.trim());
    else {
      const reader = new FileReader();
      reader.onload = e => load(String(e.target?.result || ""));
      reader.readAsDataURL(src);
    }
  };

  const addShape = (kind: "rect" | "circle" | "text") => {
    const c = fc.current;
    if (!c) return;
    let obj: fabric.FabricObject;
    if (kind === "rect") obj = new fabric.Rect({ left: 80, top: 80, width: 180, height: 110, fill: "transparent", stroke: color, strokeWidth: size, rx: 8 });
    else if (kind === "circle") obj = new fabric.Circle({ left: 100, top: 80, radius: 70, fill: "transparent", stroke: color, strokeWidth: size });
    else obj = new fabric.IText("Double click to edit", { left: 80, top: 80, fill: color, fontSize: 28 });
    c.add(obj);
    c.setActiveObject(obj);
    c.renderAll();
    setTool("select");
    snapshot();
  };

  const clear = () => {
    if (!fc.current || !confirm("Clear this board?")) return;
    fc.current.clear();
    fc.current.backgroundColor = "#fff";
    fc.current.renderAll();
    snapshot();
  };

  const exportBoard = () => {
    const c = fc.current;
    if (!c) return;
    c.discardActiveObject();
    c.renderAll();
    const a = document.createElement("a");
    a.download = `aussie-board-${page + 1}.png`;
    a.href = c.toDataURL({ format: "png", multiplier: 2 });
    a.click();
  };

  const enterFullscreen = async () => {
    setImmersive(true);
    try { await document.documentElement.requestFullscreen(); } catch {}
  };
  const exitFullscreen = async () => {
    setImmersive(false);
    if (document.fullscreenElement) try { await document.exitFullscreen(); } catch {}
  };

  useEffect(() => {
    const fn = () => { if (!document.fullscreenElement) setImmersive(false); };
    document.addEventListener("fullscreenchange", fn);
    return () => document.removeEventListener("fullscreenchange", fn);
  }, []);

  const saveCurrentPage = () => {
    if (!fc.current) return;
    const data = JSON.stringify(fc.current.toJSON());
    setPages(ps => ps.map((p, i) => i === page ? { ...p, data } : p));
    return data;
  };

  const loadPage = async (index: number) => {
    if (!fc.current || index === page) return;
    const saved = saveCurrentPage();
    const target = pages[index];
    if (target.data) await fc.current.loadFromJSON(JSON.parse(target.data));
    else {
      fc.current.clear();
      fc.current.backgroundColor = "#fff";
    }
    fc.current.renderAll();
    setPage(index);
    history.current = [target.data || saved || JSON.stringify(fc.current.toJSON())];
    redoHistory.current = [];
    setCanUndo(false);
    setCanRedo(false);
  };

  const addPage = () => {
    saveCurrentPage();
    const next = { id: Date.now().toString(), data: "" };
    setPages(ps => [...ps, next]);
    fc.current?.clear();
    if (fc.current) { fc.current.backgroundColor = "#fff"; fc.current.renderAll(); }
    history.current = [JSON.stringify(fc.current?.toJSON() || {})];
    redoHistory.current = [];
    setCanUndo(false);
    setCanRedo(false);
    setPage(pages.length);
  };

  const drop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files[0]) return addImage(e.dataTransfer.files[0]);
    const html = e.dataTransfer.getData("text/html");
    const match = html.match(/src=["']([^"']+)["']/i);
    if (match) return addImage(match[1]);
    const u = (e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain")).split("\n")[0];
    if (u.startsWith("http")) addImage(u);
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-slate-50">
      {!immersive && <header className="h-16 shrink-0 bg-white border-b border-slate-200 px-5 flex items-center justify-between shadow-sm z-30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#1e3a8a] text-white flex items-center justify-center font-black text-xl italic shadow">A</div>
          <div className="hidden sm:block">
            <h1 className="text-base font-black text-[#1e3a8a] leading-none">AUSSIE ACADEMY</h1>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">Smart Interaction Board</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-50 rounded-xl p-1 border">
            <button onClick={undo} disabled={!canUndo} className="p-2 disabled:opacity-20 hover:bg-white rounded-lg"><Undo2 size={18}/></button>
            <button onClick={redo} disabled={!canRedo} className="p-2 disabled:opacity-20 hover:bg-white rounded-lg"><Redo2 size={18}/></button>
          </div>
          <button onClick={enterFullscreen} className="hidden sm:flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-bold"><Eye size={16}/> Full Screen</button>
          <button onClick={exportBoard} className="flex items-center gap-2 bg-[#1e3a8a] text-white px-4 py-2 rounded-lg text-xs font-bold"><Download size={16}/> <span className="hidden sm:inline">Export</span></button>
        </div>
      </header>}

      <div className="flex-1 flex overflow-hidden relative" onDragEnter={e => {e.preventDefault();setDragging(true)}} onDragOver={e=>e.preventDefault()} onDrop={drop}>
        {!immersive && <aside className="w-20 shrink-0 bg-white border-r border-slate-200 flex flex-col items-center py-5 gap-3 z-20">
          {[
            ["select", MousePointer2, "Move"],
            ["pencil", Pencil, "Pen"],
            ["eraser", Eraser, "Erase"]
          ].map(([id, Icon, label]) => (
            <button key={String(id)} onClick={()=>setTool(id as Tool)} className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center border-2 ${tool===id ? "bg-[#1e3a8a] text-white border-[#1e3a8a]" : "border-transparent text-slate-400 hover:bg-slate-50"}`}>
              {React.createElement(Icon as any,{size:22})}<span className="text-[8px] font-bold mt-1 uppercase">{String(label)}</span>
            </button>
          ))}
          <div className="h-px w-10 bg-slate-100 my-1"/>
          <button onClick={()=>addShape("rect")} className="w-14 h-14 rounded-2xl flex flex-col items-center justify-center text-slate-400 hover:bg-slate-50"><Square size={22}/><span className="text-[8px] font-bold mt-1">BOX</span></button>
          <button onClick={()=>addShape("circle")} className="w-14 h-14 rounded-2xl flex flex-col items-center justify-center text-slate-400 hover:bg-slate-50"><Circle size={22}/><span className="text-[8px] font-bold mt-1">CIRCLE</span></button>
          <button onClick={()=>addShape("text")} className="w-14 h-14 rounded-2xl flex flex-col items-center justify-center text-slate-400 hover:bg-slate-50"><Type size={22}/><span className="text-[8px] font-bold mt-1">TEXT</span></button>
          <label className="w-14 h-14 rounded-2xl flex flex-col items-center justify-center text-slate-400 hover:bg-slate-50 cursor-pointer"><ImageIcon size={22}/><span className="text-[8px] font-bold mt-1">PHOTO</span><input type="file" accept="image/*" className="hidden" onChange={e=>e.target.files?.[0]&&addImage(e.target.files[0])}/></label>
          <button onClick={()=>setUrlOpen(true)} className="w-14 h-14 rounded-2xl flex flex-col items-center justify-center text-slate-400 hover:bg-slate-50"><LinkIcon size={22}/><span className="text-[8px] font-bold mt-1">URL</span></button>
          <button onClick={clear} className="mt-auto w-14 h-14 text-slate-300 hover:text-red-500"><Trash2 size={22}/></button>
        </aside>}

        <main className="flex-1 flex flex-col min-w-0 relative">
          {immersive && <button onClick={exitFullscreen} className="fixed top-5 right-5 z-50 bg-white/80 backdrop-blur rounded-full h-12 px-4 flex items-center gap-2 shadow"><EyeOff size={20}/><span className="text-xs font-black">EXIT</span></button>}
          {dragging && <div className="absolute inset-4 z-40 rounded-[2rem] border-8 border-dashed border-white bg-[#1e3a8a]/80 flex items-center justify-center pointer-events-none"><div className="bg-white rounded-3xl p-10 text-center shadow-2xl"><UploadCloud className="mx-auto text-[#1e3a8a]" size={52}/><h2 className="text-2xl font-black text-[#1e3a8a] mt-4">Drop Image Here</h2><p className="text-slate-500 font-bold mt-2">Add it to your Aussie Academy board</p></div></div>}
          <div ref={wrapRef} className="flex-1 bg-white relative overflow-hidden cursor-crosshair"><canvas ref={canvasRef}/></div>

          {!immersive && <div className="absolute left-1/2 -translate-x-1/2 bottom-24 z-30 bg-white/95 backdrop-blur border rounded-2xl px-5 py-3 shadow-xl flex items-center gap-4">
            {["#1e3a8a","#000000","#dc2626","#16a34a","#2563eb","#ca8a04","#7c3aed"].map(c=><button key={c} onClick={()=>setColor(c)} style={{backgroundColor:c}} className={`w-7 h-7 rounded-full border-2 ${color===c?"border-slate-500 scale-125":"border-white"}`}/>)}
            <input type="color" value={color} onChange={e=>setColor(e.target.value)} className="w-8 h-8"/>
            <div className="w-px h-7 bg-slate-200"/>
            <span className="text-[10px] font-black text-slate-400 whitespace-nowrap">{size}px</span>
            <input type="range" min="1" max="60" value={size} onChange={e=>setSize(+e.target.value)} className="w-24"/>
          </div>}

          {!immersive && <div className="h-20 shrink-0 bg-white border-t flex items-center px-5 gap-3 overflow-x-auto">
            <button onClick={addPage} className="min-w-12 h-12 rounded-2xl bg-[#1e3a8a] text-white flex items-center justify-center shadow"><Plus/></button>
            {pages.map((p,i)=><button key={p.id} onClick={()=>loadPage(i)} className={`min-w-24 h-12 rounded-2xl border-2 text-[10px] font-black ${page===i?"bg-blue-50 border-[#1e3a8a] text-[#1e3a8a]":"bg-slate-50 border-transparent text-slate-400"}`}>SLOT {i+1}<span className="block text-[7px] opacity-60">BOARD VIEW</span></button>)}
            <div className="ml-auto flex gap-2">
              <button onClick={()=>page>0&&loadPage(page-1)} disabled={page===0} className="p-3 disabled:opacity-20"><ChevronLeft/></button>
              <button onClick={()=>page<pages.length-1&&loadPage(page+1)} disabled={page===pages.length-1} className="p-3 disabled:opacity-20"><ChevronRight/></button>
            </div>
          </div>}
          {immersive && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900/85 backdrop-blur rounded-full p-2 flex items-center gap-2 text-white">
            <button onClick={()=>page>0&&loadPage(page-1)} disabled={page===0} className="w-11 h-11 rounded-full disabled:opacity-20"><ChevronLeft/></button>
            <span className="px-3 text-xs font-black">SLOT {page+1} / {pages.length}</span>
            <button onClick={()=>page<pages.length-1&&loadPage(page+1)} disabled={page===pages.length-1} className="w-11 h-11 rounded-full disabled:opacity-20"><ChevronRight/></button>
            <button onClick={addPage} className="w-11 h-11 rounded-full bg-[#1e3a8a]"><Plus/></button>
          </div>}
        </main>
      </div>

      {urlOpen && <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur flex items-center justify-center p-6">
        <form onSubmit={e=>{e.preventDefault();if(url){addImage(url);setUrl("");setUrlOpen(false)}}} className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl">
          <h2 className="text-2xl font-black text-[#1e3a8a] mb-5">Load Online Image</h2>
          <input autoFocus required type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://example.com/image.jpg" className="w-full rounded-2xl bg-slate-50 border-2 border-slate-100 px-5 py-4 outline-none focus:border-[#1e3a8a]"/>
          <div className="flex gap-3 mt-5"><button type="button" onClick={()=>setUrlOpen(false)} className="flex-1 py-3 font-bold text-slate-400">Cancel</button><button className="flex-1 py-3 rounded-2xl bg-[#1e3a8a] text-white font-bold">Load Link</button></div>
        </form>
      </div>}
    </div>
  );
};

export default AussieAcademyWhiteboard;
