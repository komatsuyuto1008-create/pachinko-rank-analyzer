import { useState, useRef, useCallback, useMemo, useEffect } from "react";

const RANKS = [
  { rank: "SS",  min: 25000,  color: "#FF0040", bg: "#FF004014" },
  { rank: "S+",  min: 22500,  color: "#FF1744", bg: "#FF174414" },
  { rank: "S",   min: 20000,  color: "#FF2D55", bg: "#FF2D5514" },
  { rank: "A+",  min: 17500,  color: "#FF6D00", bg: "#FF6D0014" },
  { rank: "A",   min: 15000,  color: "#FF9500", bg: "#FF950014" },
  { rank: "A-",  min: 12500,  color: "#FFB300", bg: "#FFB30014" },
  { rank: "B++", min: 10000,  color: "#FFC107", bg: "#FFC10714" },
  { rank: "B+",  min: 7500,   color: "#FFCC00", bg: "#FFCC0014" },
  { rank: "B",   min: 5000,   color: "#FFD740", bg: "#FFD74014" },
  { rank: "C+",  min: 2500,   color: "#69F0AE", bg: "#69F0AE14" },
  { rank: "C",   min: 0,      color: "#34C759", bg: "#34C75914" },
  { rank: "C-",  min: -2500,  color: "#00BFA5", bg: "#00BFA514" },
  { rank: "D",   min: -5000,  color: "#5AC8FA", bg: "#5AC8FA14" },
  { rank: "D-",  min: -7500,  color: "#40C4FF", bg: "#40C4FF14" },
  { rank: "E++", min: -10000, color: "#8E8E93", bg: "#8E8E9314" },
  { rank: "E+",  min: -12500, color: "#78909C", bg: "#78909C14" },
  { rank: "E",   min: -15000, color: "#607D8B", bg: "#607D8B14" },
  { rank: "E-",  min: -17500, color: "#546E7A", bg: "#546E7A14" },
  { rank: "F",   min: -20000, color: "#AF52DE", bg: "#AF52DE14" },
  { rank: "F-",  min: -22500, color: "#9C27B0", bg: "#9C27B014" },
  { rank: "G",   min: -Infinity, color: "#6A1B9A", bg: "#6A1B9A14" },
];
const getRank = (v) => RANKS.find((r) => v >= r.min) || RANKS[RANKS.length - 1];

// ============ Pixel Analysis (no OCR, returns raw slots) ============
function runAnalysis(data, w, h) {
  const logs = [];
  const log = (m) => logs.push(m);
  log(`画像: ${w}x${h}`);
  const rowBright = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let sum = 0; const base = y * w * 4;
    for (let x = 0; x < w; x++) { const i = base + x * 4; sum += (data[i]+data[i+1]+data[i+2])/3; }
    rowBright[y] = sum / w;
  }
  let inDark = false, dS = 0;
  const rawD = [];
  for (let y = 0; y < h; y++) {
    if (rowBright[y] < 80 && !inDark) { dS = y; inDark = true; }
    if ((rowBright[y] >= 80 || y === h-1) && inDark) { rawD.push([dS, y-1]); inDark = false; }
  }
  const merged = [];
  for (const [s,e] of rawD) {
    if (e-s < 15) continue;
    if (merged.length && s - merged[merged.length-1][1] < 25) merged[merged.length-1][1] = e;
    else merged.push([s, e]);
  }
  const graphRows = merged.filter(([s,e]) => e-s >= 60);
  log(`${graphRows.length}行 (${graphRows.length*2}台)`);
  if (!graphRows.length) return { results: [], logs, error: "グラフ行なし" };

  const midX = (w/2)|0;
  const [r0s, r0e] = graphRows[0];
  const bH = r0e - r0s + 1;
  const bB = new Float32Array(bH);
  for (let ly = 0; ly < bH; ly++) {
    let s = 0, c = 0;
    for (let x = 10; x < midX-5; x++) { const i = ((r0s+ly)*w+x)*4; s += (data[i]+data[i+1]+data[i+2])/3; c++; }
    bB[ly] = s / c;
  }
  const gls = [];
  for (let y = 3; y < bH-3; y++) {
    const nb = (bB[y-2]+bB[y-1])/2;
    if (bB[y] > Math.max(nb,25)*1.2 && bB[y] > 33) gls.push({y, b:bB[y]});
  }
  const mG = [];
  for (const g of gls) { if (mG.length && g.y-mG[mG.length-1].y<5) { if(g.b>mG[mG.length-1].b)mG[mG.length-1]=g; } else mG.push(g); }
  let zeroY, gridSp;
  if (mG.length >= 3) {
    const bs = mG.map(g=>g.b).sort((a,b)=>a-b);
    const medB = bs[(bs.length/2)|0];
    const maxI = mG.reduce((mi,g,i,a)=>(g.b>a[mi].b?i:mi),0);
    zeroY = mG[maxI].b > medB*2 ? mG[maxI].y : (() => { const sp=mG.slice(1).map((g,i)=>g.y-mG[i].y).sort((a,b)=>a-b); gridSp=sp[(sp.length/2)|0]; return mG[0].y+3*gridSp; })();
    const nS = mG.filter(g=>g.b<medB*2).map(g=>g.y);
    if (nS.length>=2) { const sp=nS.slice(1).map((y,i)=>y-nS[i]).sort((a,b)=>a-b); gridSp=sp[(sp.length/2)|0]; }
    else if (!gridSp) { const sp=mG.slice(1).map((g,i)=>g.y-mG[i].y).sort((a,b)=>a-b); gridSp=sp[(sp.length/2)|0]; }
  } else { zeroY=bH*0.54; gridSp=bH/6.5; }
  log(`zero=${zeroY|0} grid=${gridSp?.toFixed(1)}px`);

  const fm = Math.max(3, (w*0.015)|0);
  const results = [];
  for (let ri = 0; ri < graphRows.length; ri++) {
    for (let col = 0; col < 2; col++) {
      const [yS, yE] = graphRows[ri];
      const gH = yE-yS+1;
      const safeH = Math.min((gH*0.82)|0, gH-12);
      const xS = col===0 ? 5+fm : midX+2+fm;
      const xE = col===0 ? midX-2-fm : w-5-fm;
      const gW = xE-xS;
      const leftCut = (gW*0.08)|0;
      let maxYX=-1;
      const yByX = new Map();
      for (let ly=0; ly<safeH; ly++) {
        for (let lx=leftCut; lx<gW; lx++) {
          const i=((yS+ly)*w+(xS+lx))*4;
          const r=data[i],g=data[i+1],b=data[i+2];
          if (r>150&&g>150&&b<130&&(r+g)>b*3&&r>b+25) {
            if(!yByX.has(lx))yByX.set(lx,[]);
            yByX.get(lx).push(ly);
            if(lx>maxYX)maxYX=lx;
          }
        }
      }
      const totalPx=Array.from(yByX.values()).reduce((s,a)=>s+a.length,0);
      if (totalPx<5||maxYX<0) { results.push({val:0, px:0}); continue; }
      const endYs=[];
      for(let ex=Math.max(maxYX-6,0);ex<=maxYX;ex++) if(yByX.has(ex))endYs.push(...yByX.get(ex));
      endYs.sort((a,b)=>a-b);
      const epY=endYs[(endYs.length/2)|0];
      let sag=((zeroY-epY)/gridSp)*10000;
      sag=Math.round(sag/500)*500;
      results.push({val:sag, px:totalPx});
    }
  }
  log(`${results.length}台解析完了`);
  return { results, logs };
}

// ============ Number Segment Builder with Presets ============
function NumberBuilder({ totalSlots, onConfirm, onCancel, presets, onSavePreset, onDeletePreset }) {
  const [segments, setSegments] = useState([{ start: "", count: String(totalSlots) }]);
  const [presetName, setPresetName] = useState("");
  const [showSave, setShowSave] = useState(false);

  const saveCurrentAsPreset = async () => {
    if (!presetName.trim()) return;
    const newPreset = { name: presetName.trim(), segments: segments.map(s => ({ start: s.start, count: s.count })), totalSlots };
    onSavePreset(newPreset);
    setShowSave(false);
    setPresetName("");
  };

  const loadPreset = (preset) => {
    const segs = preset.segments.map(s => ({ ...s }));
    const presetTotal = segs.reduce((s, seg) => s + (parseInt(seg.count, 10) || 0), 0);
    if (presetTotal !== totalSlots && segs.length > 0) {
      const diff = totalSlots - presetTotal;
      const lastCount = parseInt(segs[segs.length - 1].count, 10) || 0;
      segs[segs.length - 1].count = String(Math.max(1, lastCount + diff));
    }
    setSegments(segs);
  };

  const updateSeg = (idx, field, val) => {
    setSegments(p => { const n = [...p]; n[idx] = { ...n[idx], [field]: val }; return n; });
  };
  const addSegment = () => {
    const used = segments.reduce((s, seg) => s + (parseInt(seg.count, 10) || 0), 0);
    const rem = totalSlots - used;
    if (rem > 0) setSegments(p => [...p, { start: "", count: String(rem) }]);
  };
  const removeSeg = (idx) => {
    if (segments.length <= 1) return;
    setSegments(p => p.filter((_, i) => i !== idx));
  };
  const generateNums = () => {
    const nums = [];
    for (const seg of segments) {
      const start = parseInt(seg.start, 10);
      const count = parseInt(seg.count, 10) || 0;
      if (isNaN(start) || count <= 0) continue;
      for (let i = 0; i < count; i++) nums.push(String(start + i));
    }
    return nums;
  };

  const assigned = segments.reduce((s, seg) => s + (parseInt(seg.count, 10) || 0), 0);
  const remaining = totalSlots - assigned;
  const preview = generateNums();
  const isValid = preview.length === totalSlots && segments.every(s => parseInt(s.start, 10) > 0);

  return (
    <div style={{ background: "#ffffff08", borderRadius: 14, padding: "16px", border: "1px solid #FF950040", marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#FF9500" }}>台番号の設定</div>
        <div style={{ fontSize: 11, color: "#888" }}>検出: {totalSlots}台</div>
      </div>

      {presets.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 6, fontWeight: 600 }}>保存済みプリセット</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {presets.map((p) => (
              <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 0, background: "#FF950015", borderRadius: 7, border: "1px solid #FF950030", overflow: "hidden" }}>
                <button onClick={() => loadPreset(p)}
                  style={{ padding: "6px 10px", border: "none", background: "transparent", color: "#FF9500", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  {p.name}
                </button>
                <button onClick={() => onDeletePreset(p.name)}
                  style={{ padding: "6px 6px", border: "none", borderLeft: "1px solid #FF950030", background: "transparent", color: "#FF6B8A80", fontSize: 10, cursor: "pointer" }}>
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {segments.map((seg, i) => (
        <div key={i} style={{ background: "#ffffff06", borderRadius: 10, padding: "10px 12px", marginBottom: 8, border: "1px solid #ffffff10" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "#aaa", fontWeight: 600, minWidth: 60 }}>{i === 0 ? "先頭" : `${i + 1}番目`}</span>
            {segments.length > 1 && (
              <button onClick={() => removeSeg(i)} style={{ marginLeft: "auto", padding: "2px 8px", borderRadius: 4, border: "1px solid #FF2D5540", background: "#FF2D5510", color: "#FF6B8A", fontSize: 10, cursor: "pointer" }}>削除</button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 10, color: "#888", display: "block", marginBottom: 2 }}>開始番号</label>
              <input value={seg.start} onChange={e => updateSeg(i, "start", e.target.value)} type="number" inputMode="numeric" placeholder="例: 777"
                style={{ width: "100%", padding: "7px 8px", borderRadius: 6, border: "1px solid #ffffff20", background: "#ffffff08", color: "#e8e8ed", fontSize: 14, fontWeight: 700, boxSizing: "border-box" }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 10, color: "#888", display: "block", marginBottom: 2 }}>連番台数</label>
              <input value={seg.count} onChange={e => updateSeg(i, "count", e.target.value)} type="number" inputMode="numeric" placeholder="台数"
                style={{ width: "100%", padding: "7px 8px", borderRadius: 6, border: "1px solid #ffffff20", background: "#ffffff08", color: "#e8e8ed", fontSize: 14, fontWeight: 700, boxSizing: "border-box" }} />
            </div>
          </div>
          {parseInt(seg.start, 10) > 0 && parseInt(seg.count, 10) > 0 && (
            <div style={{ fontSize: 10, color: "#666", marginTop: 4 }}>→ {parseInt(seg.start, 10)} 〜 {parseInt(seg.start, 10) + parseInt(seg.count, 10) - 1}</div>
          )}
        </div>
      ))}

      {remaining > 0 && (
        <button onClick={addSegment} style={{ width: "100%", padding: "8px", borderRadius: 8, border: "1px dashed #FF950040", background: "transparent", color: "#FF9500", fontSize: 12, cursor: "pointer", marginBottom: 10, fontWeight: 600 }}>
          + 番号が飛ぶ区間を追加（残り{remaining}台）
        </button>
      )}
      {remaining < 0 && (
        <div style={{ fontSize: 11, color: "#FF6B8A", marginBottom: 8 }}>台数が{assigned - totalSlots}台多い</div>
      )}

      {preview.length > 0 && (
        <div style={{ background: "#ffffff04", borderRadius: 8, padding: "8px 10px", marginBottom: 10, border: "1px solid #ffffff08" }}>
          <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>プレビュー ({preview.length}/{totalSlots}台)</div>
          <div style={{ fontSize: 11, color: "#ccc", wordBreak: "break-all", lineHeight: 1.5 }}>
            {preview.map((n, i) => (
              <span key={i}>
                {i > 0 && preview[i] !== String(parseInt(preview[i-1])+1) ? <span style={{ color: "#FF9500", fontWeight: 700 }}> | </span> : i > 0 ? ", " : ""}
                {n}
              </span>
            ))}
          </div>
        </div>
      )}

      {isValid && !showSave && (
        <button onClick={() => setShowSave(true)} style={{ width: "100%", padding: "7px", borderRadius: 7, border: "1px dashed #34C75940", background: "transparent", color: "#34C759", fontSize: 11, cursor: "pointer", marginBottom: 8, fontWeight: 600 }}>
          この台番号設定を保存する
        </button>
      )}
      {showSave && (
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <input value={presetName} onChange={e => setPresetName(e.target.value)} placeholder="名前（例: PAO e東京喰種）" autoFocus
            style={{ flex: 1, padding: "7px 8px", borderRadius: 6, border: "1px solid #34C75940", background: "#34C75910", color: "#e8e8ed", fontSize: 12, boxSizing: "border-box" }}
            onKeyDown={e => { if (e.key === "Enter") saveCurrentAsPreset(); }} />
          <button onClick={saveCurrentAsPreset} disabled={!presetName.trim()}
            style={{ padding: "7px 12px", borderRadius: 6, border: "none", background: presetName.trim() ? "#34C759" : "#333", color: "#fff", fontSize: 12, fontWeight: 700, cursor: presetName.trim() ? "pointer" : "default" }}>保存</button>
          <button onClick={() => setShowSave(false)} style={{ padding: "7px 8px", borderRadius: 6, border: "1px solid #ffffff20", background: "transparent", color: "#888", fontSize: 11, cursor: "pointer" }}>×</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid #ffffff20", background: "transparent", color: "#888", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>キャンセル</button>
        <button onClick={() => onConfirm(preview)} disabled={!isValid}
          style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: isValid ? "linear-gradient(135deg, #FF2D55, #FF9500)" : "#333", color: isValid ? "#fff" : "#888", fontSize: 13, fontWeight: 700, cursor: isValid ? "pointer" : "default" }}>
          この台番号で確定
        </button>
      </div>
    </div>
  );
}

// ============ ResultsView ============
function ResultsView({ items, title }) {
  const [sortBy, setSortBy] = useState("rank");
  const sorted = useMemo(() => [...items].sort((a,b) =>
    sortBy==="rank" ? b.val-a.val : a.num.localeCompare(b.num,undefined,{numeric:true})
  ), [items, sortBy]);
  const summary = useMemo(() => RANKS.map(r=>({...r, count:items.filter(i=>i.rank.rank===r.rank).length})).filter(s=>s.count>0), [items]);
  const active = items.filter(i=>i.val!==0||i.px>10);
  const avg = active.length ? Math.round(active.reduce((s,i)=>s+i.val,0)/active.length) : 0;
  const plus = active.filter(i=>i.val>0).length;
  const minus = active.filter(i=>i.val<0).length;
  const [copied, setCopied] = useState(false);
  const doCopy = () => {
    const tsv = sorted.map(r=>`${r.val}\t${r.rank.rank}`).join("\n");
    navigator.clipboard?.writeText(tsv).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);});
  };

  return (
    <>
      {title && (
        <div style={{background:"#ffffff08",borderRadius:12,padding:"12px 16px",marginBottom:10,border:"1px solid #ffffff10",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <div style={{fontSize:14,fontWeight:700,color:"#eee"}}>{title}</div>
          <div style={{fontSize:11,color:"#888"}}>{items.length}台{active.length!==items.length?`(稼働${active.length})`:""} / 平均{avg>=0?"+":""}{avg.toLocaleString()}玉 / <span style={{color:"#34C759"}}>勝{plus}</span> <span style={{color:"#FF375F"}}>負{minus}</span></div>
        </div>
      )}
      <div style={{background:"#ffffff08",borderRadius:12,padding:"12px 16px",marginBottom:10,border:"1px solid #ffffff10"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:6}}>
          <span style={{fontSize:12,fontWeight:600,color:"#aaa"}}>ランク分布</span>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {["rank","number"].map(s=>(
              <button key={s} onClick={()=>setSortBy(s)} style={{padding:"3px 8px",borderRadius:5,border:`1px solid ${sortBy===s?"#FF9500":"#ffffff20"}`,background:sortBy===s?"#FF950020":"transparent",color:sortBy===s?"#FF9500":"#888",fontSize:10,cursor:"pointer",fontWeight:600}}>{s==="rank"?"差玉順":"台番号順"}</button>
            ))}
            <button onClick={doCopy} style={{padding:"3px 8px",borderRadius:5,border:`1px solid ${copied?"#34C759":"#ffffff20"}`,background:copied?"#34C75920":"transparent",color:copied?"#34C759":"#888",fontSize:10,cursor:"pointer",fontWeight:600}}>{copied?"✓ コピー済":"コピー"}</button>
          </div>
        </div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {summary.map(s=>(<div key={s.rank} style={{display:"flex",alignItems:"center",gap:4,background:s.bg,padding:"3px 8px",borderRadius:6,border:`1px solid ${s.color}25`}}><span style={{fontWeight:800,fontSize:13,color:s.color}}>{s.rank}</span><span style={{fontSize:10,color:"#aaa"}}>{s.count}台</span></div>))}
        </div>
        <div style={{display:"flex",height:5,borderRadius:3,overflow:"hidden",marginTop:8}}>
          {summary.map(s=><div key={s.rank} style={{width:`${(s.count/items.length)*100}%`,background:s.color}}/>)}
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))",gap:6}}>
        {sorted.map((r,i)=>(<div key={i} style={{background:"#ffffff06",border:`1px solid ${r.rank.color}20`,borderRadius:10,padding:"10px 12px",display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:40,height:40,borderRadius:8,background:r.rank.bg,border:`2px solid ${r.rank.color}30`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:16,fontWeight:900,color:r.rank.color}}>{r.rank.rank}</span></div>
          <div style={{flex:1,minWidth:0}}>
            <span style={{fontSize:12,fontWeight:700,color:"#ddd"}}>台{r.num}</span>
            <div style={{fontSize:17,fontWeight:800,color:r.val>=0?r.rank.color:"#FF375F",marginTop:1}}>{r.val>=0?"+":""}{r.val.toLocaleString()}玉</div>
          </div>
        </div>))}
      </div>
    </>
  );
}

// ============ Main App ============
export default function App() {
  const [images, setImages] = useState([]);
  const [rawSlots, setRawSlots] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [logs, setLogs] = useState([]);
  const [title, setTitle] = useState("");
  const [showNumBuilder, setShowNumBuilder] = useState(false);
  const [tab, setTab] = useState("analyze");
  const [manualInput, setManualInput] = useState("");
  const [manualResults, setManualResults] = useState(null);
  const [manualTitle, setManualTitle] = useState("");
  const [error, setError] = useState(null);
  const [presets, setPresets] = useState([]);
  const fileRef = useRef(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("sagyoku-presets");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) setPresets(parsed);
      }
    } catch (e) { /* no presets yet */ }
  }, []);

  const savePreset = useCallback((newPreset) => {
    const updated = [...presets.filter(p => p.name !== newPreset.name), newPreset];
    setPresets(updated);
    try { localStorage.setItem("sagyoku-presets", JSON.stringify(updated)); } catch (e) {}
  }, [presets]);

  const deletePreset = useCallback((name) => {
    const updated = presets.filter(p => p.name !== name);
    setPresets(updated);
    try { localStorage.setItem("sagyoku-presets", JSON.stringify(updated)); } catch (e) {}
  }, [presets]);

  const handleFiles = useCallback((files) => {
    const arr = Array.from(files).filter(f=>f.type.startsWith("image/"));
    if (!arr.length) return;
    setResults(null); setRawSlots(null); setError(null); setShowNumBuilder(false);
    let loaded = 0;
    const newImgs = [];
    arr.forEach((file, idx) => {
      const reader = new FileReader();
      reader.onload = (e) => { newImgs[idx]={dataUrl:e.target.result,name:file.name}; loaded++; if(loaded===arr.length)setImages(p=>[...p,...newImgs.filter(Boolean)]); };
      reader.readAsDataURL(file);
    });
  }, []);

  const analyze = useCallback(() => {
    if (!images.length) return;
    setLoading(true); setError(null); setResults(null); setRawSlots(null); setShowNumBuilder(false);
    setLogs([]); setProgress(`0/${images.length}`);
    const allResults = [], allLogs = [];
    let imgIdx = 0;
    const processNext = () => {
      if (imgIdx >= images.length) {
        setRawSlots(allResults);
        setLogs(allLogs);
        setLoading(false);
        setProgress("");
        if (allResults.length > 0) setShowNumBuilder(true);
        return;
      }
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        setProgress(`${imgIdx+1}/${images.length} (${img.width}x${img.height})`);
        requestAnimationFrame(()=>setTimeout(()=>{
          try {
            const c = document.createElement("canvas"); c.width=img.width; c.height=img.height;
            const ctx = c.getContext("2d",{willReadFrequently:true}); ctx.drawImage(img,0,0);
            const id = ctx.getImageData(0,0,img.width,img.height);
            const r = runAnalysis(id.data, img.width, img.height);
            allLogs.push(`--- 画像${imgIdx+1} ---`, ...(r.logs||[]));
            if (!r.error) allResults.push(...r.results);
            else allLogs.push(`ERROR: ${r.error}`);
          } catch(e) { allLogs.push(`ERROR: ${e.message}`); }
          imgIdx++; processNext();
        },50));
      };
      img.onerror = () => { allLogs.push(`画像${imgIdx+1}読み込み失敗`); imgIdx++; processNext(); };
      img.src = images[imgIdx].dataUrl;
    };
    processNext();
  }, [images]);

  const confirmNumbers = useCallback((numList) => {
    if (!rawSlots) return;
    const final = rawSlots.map((r, i) => ({
      num: numList[i] || String(i + 1),
      val: r.val,
      rank: getRank(r.val),
      px: r.px,
    }));
    setResults(final);
    setShowNumBuilder(false);
  }, [rawSlots]);

  const doManual = () => {
    setError(null); setManualResults(null);
    try {
      const items = manualInput.trim().split("\n").filter(l=>l.trim()).map(l=>{
        const p=l.trim().split(/[\s,\t]+/); if(p.length<2)throw new Error(`形式エラー: "${l}"`);
        const v=parseInt(p[1].replace(/[^0-9-]/g,""),10); if(isNaN(v))throw new Error(`数値エラー: "${l}"`);
        return {num:p[0].replace(/[^0-9]/g,""),val:v,rank:getRank(v),px:999};
      });
      if(!items.length)throw new Error("データなし");
      setManualResults(items);
    } catch(e){setError(e.message);}
  };

  const tS=a=>({padding:"7px 14px",borderRadius:7,border:"none",background:a?"#FF950025":"transparent",color:a?"#FF9500":"#777",fontSize:12,fontWeight:600,cursor:"pointer"});

  return (
    <div style={{minHeight:"100vh",background:"#0a0a0f",color:"#e8e8ed",fontFamily:"'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif"}}>
      <div style={{background:"linear-gradient(135deg,#1a1a2e,#16213e)",borderBottom:"1px solid #ffffff08",padding:"calc(env(safe-area-inset-top, 0px) + 12px) 20px 12px"}}>
        <div style={{maxWidth:900,margin:"0 auto",display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:34,height:34,borderRadius:8,background:"linear-gradient(135deg,#FF2D55,#FF9500)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,color:"#fff",flexShrink:0}}>差</div>
          <div><h1 style={{margin:0,fontSize:15,fontWeight:700}}>差玉ランクアナライザー</h1><p style={{margin:0,fontSize:9,color:"#8e8ea0",marginTop:1}}>出玉推移グラフ → ピクセル解析 → S〜Gランク判定</p></div>
        </div>
      </div>
      <div style={{maxWidth:900,margin:"0 auto",padding:"16px 14px"}}>
        <div style={{display:"flex",gap:3,marginBottom:14,background:"#ffffff08",borderRadius:9,padding:3}}>
          <button style={tS(tab==="analyze")} onClick={()=>setTab("analyze")}>画像解析</button>
          <button style={tS(tab==="manual")} onClick={()=>setTab("manual")}>手動入力</button>
          <button style={tS(tab==="legend")} onClick={()=>setTab("legend")}>基準</button>
        </div>

        {tab==="analyze"&&(<>
          <div onClick={()=>fileRef.current?.click()} onDrop={e=>{e.preventDefault();handleFiles(e.dataTransfer.files);}} onDragOver={e=>e.preventDefault()}
            style={{border:"1.5px dashed #ffffff15",borderRadius:14,padding:images.length?"12px":"32px 20px",textAlign:"center",cursor:"pointer",background:"#ffffff06",marginBottom:10}}>
            <input ref={fileRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={e=>{handleFiles(e.target.files);e.target.value="";}} />
            {!images.length?(<><div style={{fontSize:32,marginBottom:4}}>📊</div><p style={{fontSize:13,fontWeight:600,color:"#ccc",margin:"0 0 3px"}}>出玉推移グラフ画像をアップロード</p><p style={{fontSize:10,color:"#666",margin:0}}>複数ページまとめて選択可能</p></>):(
              <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"center",alignItems:"center"}}>
                {images.map((img,i)=>(<div key={i} style={{position:"relative"}}><img src={img.dataUrl} alt="" style={{height:60,borderRadius:6,border:"1px solid #ffffff15"}} /><div style={{position:"absolute",bottom:2,left:2,background:"#000a",borderRadius:3,padding:"0 4px",fontSize:9,color:"#fff"}}>{i+1}</div><button onClick={e=>{e.stopPropagation();setImages(p=>p.filter((_,j)=>j!==i));setResults(null);setRawSlots(null);setShowNumBuilder(false);}} style={{position:"absolute",top:-5,right:-5,width:16,height:16,borderRadius:"50%",border:"none",background:"#FF2D55",color:"#fff",fontSize:9,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button></div>))}
                <div style={{width:44,height:60,borderRadius:6,border:"1px dashed #ffffff30",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,color:"#666"}}>+</div>
              </div>
            )}
          </div>

          <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="タイトル（例: e東京喰種 PAO 2/14）" style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #ffffff15",background:"#ffffff08",color:"#e8e8ed",fontSize:12,boxSizing:"border-box",marginBottom:10}} />

          <button onClick={analyze} disabled={!images.length||loading} style={{width:"100%",padding:"12px",borderRadius:10,border:"none",background:images.length&&!loading?"linear-gradient(135deg,#FF2D55,#FF9500)":"#333",color:images.length&&!loading?"#fff":"#888",fontSize:14,fontWeight:700,cursor:images.length&&!loading?"pointer":"default",marginBottom:10}}>
            {loading?`${progress} 解析中...`:`差玉を解析する（${images.length}枚）`}
          </button>

          {logs.length>0&&(<details style={{marginBottom:10}}><summary style={{fontSize:10,color:"#666",cursor:"pointer"}}>処理ログ</summary><pre style={{fontSize:9,color:"#8f8",background:"#0a1a0a",padding:8,borderRadius:6,overflow:"auto",maxHeight:150,whiteSpace:"pre-wrap",border:"1px solid #1a3a1a",margin:"4px 0 0"}}>{logs.join("\n")}</pre></details>)}

          {showNumBuilder && rawSlots && (
            <NumberBuilder
              totalSlots={rawSlots.length}
              onConfirm={confirmNumbers}
              onCancel={() => { setShowNumBuilder(false); setRawSlots(null); }}
              presets={presets}
              onSavePreset={savePreset}
              onDeletePreset={deletePreset}
            />
          )}

          {results&&<ResultsView items={results} title={title||"解析結果"} />}
        </>)}

        {tab==="manual"&&(<>
          <div style={{background:"#ffffff08",borderRadius:12,padding:"12px 16px",marginBottom:10,border:"1px solid #ffffff10"}}>
            <p style={{fontSize:11,color:"#888",margin:"0 0 8px"}}>1行につき「台番号 差玉」を入力</p>
            <input value={manualTitle} onChange={e=>setManualTitle(e.target.value)} placeholder="タイトル" style={{width:"100%",padding:"7px 10px",borderRadius:7,border:"1px solid #ffffff15",background:"#ffffff08",color:"#e8e8ed",fontSize:12,boxSizing:"border-box",marginBottom:6}} />
            <textarea value={manualInput} onChange={e=>setManualInput(e.target.value)} placeholder={"777 9500\n778 14500\n779 -5000"} style={{width:"100%",minHeight:160,padding:10,borderRadius:8,border:"1px solid #ffffff15",background:"#ffffff08",color:"#e8e8ed",fontSize:12,fontFamily:"monospace",resize:"vertical",boxSizing:"border-box"}} />
          </div>
          <button onClick={doManual} disabled={!manualInput.trim()} style={{width:"100%",padding:"12px",borderRadius:10,border:"none",background:manualInput.trim()?"linear-gradient(135deg,#34C759,#30B0C7)":"#333",color:manualInput.trim()?"#fff":"#888",fontSize:14,fontWeight:700,cursor:manualInput.trim()?"pointer":"default",marginBottom:10}}>ランク判定する</button>
          {manualResults&&<ResultsView items={manualResults} title={manualTitle||"手動入力"} />}
        </>)}

        {tab==="legend"&&(
          <div style={{background:"#ffffff06",borderRadius:12,padding:"16px",border:"1px solid #ffffff10"}}>
            <h3 style={{margin:"0 0 12px",fontSize:13,fontWeight:600,color:"#aaa"}}>ランク基準（22段階）</h3>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(150px, 1fr))",gap:4}}>
              {RANKS.map(t=>(<div key={t.rank} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:7,background:t.bg,border:`1px solid ${t.color}18`}}><span style={{fontWeight:900,fontSize:15,color:t.color,width:30,textAlign:"center"}}>{t.rank}</span><span style={{fontSize:11,color:"#aaa"}}>{t.min===-Infinity?"〜":(t.min>=0?"+":"")+t.min.toLocaleString()}</span></div>))}
            </div>
          </div>
        )}

        {error&&<div style={{background:"#FF2D5520",border:"1px solid #FF2D5540",borderRadius:10,padding:"10px 14px",marginTop:10,fontSize:11,color:"#FF6B8A"}}>{error}</div>}
      </div>
    </div>
  );
}
