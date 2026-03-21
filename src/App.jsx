import React, { useState, useRef, useCallback } from "react";

/* ─── ランク定義 ─── */
const RANKS = [
  { rank: "S", min: 30000, color: "#ff2d55", label: "S  (+30,000〜)" },
  { rank: "A", min: 20000, color: "#ff9500", label: "A  (+20,000〜)" },
  { rank: "B", min: 10000, color: "#ffcc00", label: "B  (+10,000〜)" },
  { rank: "C", min: 5000,  color: "#34c759", label: "C  (+5,000〜)" },
  { rank: "D", min: 0,     color: "#30b0c7", label: "D  (±0〜)" },
  { rank: "E", min: -5000, color: "#5856d6", label: "E  (−5,000〜)" },
  { rank: "F", min: -20000,color: "#8e8e93", label: "F  (−20,000〜)" },
  { rank: "G", min: -Infinity, color: "#636366", label: "G  (−20,000未満)" },
];

function getRank(satama) {
  for (const r of RANKS) {
    if (satama >= r.min) return r;
  }
  return RANKS[RANKS.length - 1];
}

/* ─── グラフ解析 ─── */
function analyzeGraph(canvas, img) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  ctx.drawImage(img, 0, 0);

  const w = canvas.width;
  const h = canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // グラフ線の色を検出（最も多い鮮やかな色）
  const colorBuckets = {};
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // 鮮やかな色のみ（背景・グレー除外）
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max - min < 40) continue; // 彩度が低い
    if (max < 60) continue; // 暗すぎ
    const key = `${Math.round(r / 20)}-${Math.round(g / 20)}-${Math.round(b / 20)}`;
    colorBuckets[key] = (colorBuckets[key] || 0) + 1;
  }

  // 最頻色を特定
  let bestKey = null;
  let bestCount = 0;
  for (const [key, count] of Object.entries(colorBuckets)) {
    if (count > bestCount) {
      bestCount = count;
      bestKey = key;
    }
  }

  if (!bestKey) {
    return { error: "グラフ線の色を検出できませんでした" };
  }

  const [tr, tg, tb] = bestKey.split("-").map((v) => Number(v) * 20);

  // 各列でターゲット色のピクセルY位置を集める
  const lineY = new Array(w).fill(null);
  for (let x = 0; x < w; x++) {
    let sumY = 0;
    let count = 0;
    for (let y = 0; y < h; y++) {
      const idx = (y * w + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      const dr = Math.abs(r - tr);
      const dg = Math.abs(g - tg);
      const db = Math.abs(b - tb);
      if (dr < 40 && dg < 40 && db < 40) {
        sumY += y;
        count++;
      }
    }
    if (count > 0) {
      lineY[x] = sumY / count;
    }
  }

  // 有効なデータ範囲を取得
  const validPoints = lineY
    .map((y, x) => (y !== null ? { x, y } : null))
    .filter(Boolean);

  if (validPoints.length < 10) {
    return { error: "グラフ線が十分に検出できませんでした" };
  }

  // 開始点と終了点のY座標
  const startY = validPoints[0].y;
  const endY = validPoints[validPoints.length - 1].y;

  // 中央ライン（0ライン）を推定: グラフの中央付近
  const allY = validPoints.map((p) => p.y);
  const minY = Math.min(...allY);
  const maxY = Math.max(...allY);
  const centerY = (minY + maxY) / 2;

  // Y方向のピクセル差（上がプラス）
  const pixelDiff = startY - endY; // endが上（Y小さい）ならプラス

  // 差玉推定: グラフの高さをもとにスケーリング
  // 典型的なパチンコグラフでは全高が±30000程度をカバー
  const graphHeight = maxY - minY;
  const scalePerPixel = graphHeight > 0 ? 60000 / graphHeight : 100;

  // 最終位置と中央の差分から差玉を推定
  const satama = Math.round((centerY - endY) * scalePerPixel);

  return {
    satama,
    startY,
    endY,
    centerY,
    graphHeight,
    validPoints,
    lineColor: `rgb(${tr},${tg},${tb})`,
  };
}

/* ─── CSS ─── */
const styles = {
  app: {
    minHeight: "100vh",
    background: "linear-gradient(180deg, #0a0a0f 0%, #1a1a2e 100%)",
    color: "#e0e0e0",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    paddingBottom: "env(safe-area-inset-bottom, 20px)",
  },
  header: {
    textAlign: "center",
    padding: "20px 16px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  title: {
    fontSize: "20px",
    fontWeight: 700,
    background: "linear-gradient(135deg, #ff2d55, #ff9500)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    margin: 0,
  },
  subtitle: {
    fontSize: "12px",
    color: "#8e8e93",
    marginTop: 4,
  },
  main: {
    padding: "16px",
    maxWidth: 480,
    margin: "0 auto",
  },
  dropZone: {
    border: "2px dashed rgba(255,255,255,0.2)",
    borderRadius: 16,
    padding: "40px 20px",
    textAlign: "center",
    cursor: "pointer",
    transition: "all 0.2s",
    background: "rgba(255,255,255,0.03)",
  },
  dropZoneActive: {
    border: "2px dashed #ff2d55",
    background: "rgba(255,45,85,0.08)",
  },
  dropIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  dropText: {
    fontSize: 14,
    color: "#8e8e93",
  },
  preview: {
    width: "100%",
    borderRadius: 12,
    marginTop: 16,
    boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
  },
  resultCard: {
    borderRadius: 16,
    padding: "24px",
    marginTop: 20,
    background: "rgba(255,255,255,0.06)",
    backdropFilter: "blur(10px)",
    textAlign: "center",
  },
  rankBadge: (color) => ({
    display: "inline-block",
    fontSize: 64,
    fontWeight: 900,
    color,
    textShadow: `0 0 30px ${color}60`,
    lineHeight: 1,
  }),
  satama: {
    fontSize: 28,
    fontWeight: 700,
    marginTop: 8,
  },
  rankLabel: {
    fontSize: 14,
    color: "#8e8e93",
    marginTop: 4,
  },
  error: {
    color: "#ff453a",
    fontSize: 14,
    marginTop: 12,
    padding: "12px",
    background: "rgba(255,69,58,0.1)",
    borderRadius: 8,
  },
  rankTable: {
    marginTop: 24,
    width: "100%",
    borderCollapse: "collapse",
  },
  rankTableHeader: {
    fontSize: 14,
    fontWeight: 600,
    textAlign: "left",
    padding: "8px 0",
    borderBottom: "1px solid rgba(255,255,255,0.1)",
    color: "#8e8e93",
  },
  rankRow: (isActive) => ({
    padding: "6px 0",
    fontSize: 14,
    opacity: isActive ? 1 : 0.5,
    fontWeight: isActive ? 700 : 400,
    transition: "all 0.3s",
  }),
  resetBtn: {
    display: "block",
    width: "100%",
    padding: "14px",
    marginTop: 20,
    border: "none",
    borderRadius: 12,
    background: "rgba(255,255,255,0.1)",
    color: "#e0e0e0",
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
  },
  footer: {
    textAlign: "center",
    padding: "20px 16px",
    fontSize: 11,
    color: "#636366",
  },
};

/* ─── メインコンポーネント ─── */
export default function App() {
  const [image, setImage] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [result, setResult] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);

  const handleFile = useCallback((file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setResult(null);
    setAnalyzing(true);
    const url = URL.createObjectURL(file);
    setImage(file);
    setImageUrl(url);

    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      const analysis = analyzeGraph(canvas, img);
      setResult(analysis);
      setAnalyzing(false);
    };
    img.onerror = () => {
      setResult({ error: "画像の読み込みに失敗しました" });
      setAnalyzing(false);
    };
    img.src = url;
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      handleFile(file);
    },
    [handleFile]
  );

  const handlePaste = useCallback(
    (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          handleFile(file);
          break;
        }
      }
    },
    [handleFile]
  );

  const reset = () => {
    setImage(null);
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(null);
    setResult(null);
  };

  const rankInfo = result && !result.error ? getRank(result.satama) : null;

  return (
    <div style={styles.app} onPaste={handlePaste}>
      {/* Header */}
      <header style={styles.header}>
        <h1 style={styles.title}>差玉ランクアナライザー</h1>
        <div style={styles.subtitle}>
          出玉推移グラフ画像からランクを自動判定
        </div>
      </header>

      <main style={styles.main}>
        {/* 画像入力エリア */}
        {!imageUrl && (
          <div
            style={{
              ...styles.dropZone,
              ...(dragOver ? styles.dropZoneActive : {}),
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div style={styles.dropIcon}>📊</div>
            <div style={styles.dropText}>
              出玉推移グラフの画像をタップして選択
              <br />
              またはドラッグ＆ドロップ / ペースト
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => handleFile(e.target.files[0])}
            />
          </div>
        )}

        {/* プレビュー */}
        {imageUrl && (
          <img src={imageUrl} alt="出玉推移グラフ" style={styles.preview} />
        )}

        {/* 解析中 */}
        {analyzing && (
          <div style={{ ...styles.resultCard, color: "#8e8e93" }}>
            解析中...
          </div>
        )}

        {/* エラー */}
        {result && result.error && <div style={styles.error}>{result.error}</div>}

        {/* 結果表示 */}
        {rankInfo && (
          <div style={styles.resultCard}>
            <div style={styles.rankBadge(rankInfo.color)}>{rankInfo.rank}</div>
            <div style={{ ...styles.satama, color: rankInfo.color }}>
              {result.satama > 0 ? "+" : ""}
              {result.satama.toLocaleString()} 玉
            </div>
            <div style={styles.rankLabel}>推定差玉</div>

            {/* ランク一覧テーブル */}
            <table style={styles.rankTable}>
              <thead>
                <tr>
                  <th style={styles.rankTableHeader}>ランク</th>
                  <th style={{ ...styles.rankTableHeader, textAlign: "right" }}>
                    条件
                  </th>
                </tr>
              </thead>
              <tbody>
                {RANKS.map((r) => (
                  <tr key={r.rank}>
                    <td
                      style={{
                        ...styles.rankRow(r.rank === rankInfo.rank),
                        color: r.color,
                      }}
                    >
                      {r.rank}
                    </td>
                    <td
                      style={{
                        ...styles.rankRow(r.rank === rankInfo.rank),
                        textAlign: "right",
                        color: r.color,
                      }}
                    >
                      {r.label}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* リセットボタン */}
        {imageUrl && !analyzing && (
          <button style={styles.resetBtn} onClick={reset}>
            別の画像を解析する
          </button>
        )}

        {/* 非表示Canvas */}
        <canvas ref={canvasRef} style={{ display: "none" }} />
      </main>

      <footer style={styles.footer}>
        差玉ランクアナライザー v1.0
      </footer>
    </div>
  );
}
