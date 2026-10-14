# METHOD — 判準怎麼算

<!-- 只放可移植的規則。實測數字進 LEDGER。 -->

插件（`../obsidian-vocab-tracker`）要能**照這份規則自己算出同樣的段落與指紋**，所以這裡寫的
是兩邊共用的合約。改任何一條，插件也要跟著改，屬於必停點 2。

## 1. 「段落」怎麼切

### BBC 6 Minute English
- 來源：節目頁 `https://www.bbc.co.uk/learningenglish/english/features/6-minute-english_<yyyy>/ep-<yymmdd>`
  的 transcript 區塊。
- 一個 `<p>` = 一段。開頭的 `<strong>名字</strong>` 是說話者，存成 `speaker`，不算進段落文字。
  沒有 `<strong>` 的 `<p>` 沿用上一段的 speaker。
- 跳過：空段落、只有說話者沒有內容的段落、transcript 區塊以外的 `<p>`（簡介、頁尾）。
- ⚠️ 確切的 transcript 容器 selector 在 P0 實作時確認後**寫回這裡**。

### TED
- 來源：talk 頁 `__NEXT_DATA__.props.pageProps.transcriptData.translation.paragraphs[]`。
- 一個 paragraph = 一段，文字 = 各 cue 的 `text` 以空白串接（cue 內的換行也換成空白）。
- `start` = 第一個 cue 的 `time`（毫秒換成秒），再依 §5 處理片頭偏移。

## 2. 指紋 `fp`（不發布原文，靠指紋讓插件確認是同一段）

```
text → Unicode NFKC → 小寫
     → ’ ‘ 換成 ' ；“ ” 換成 "
     → 只留 [a-z0-9 ]，其餘換成空白 → 連續空白壓成一個 → 去頭尾空白
     → UTF-8 → SHA-1 → 取前 8 個 hex 字元
```

插件端用 TypeScript 實作同一個函式。P0 要產出至少 5 組「原文 → fp」範例，放在
`tests/fixtures/fp_cases.json`，給插件當單元測試；範例要包含彎引號、破折號、數字、縮寫（it's）。

## 3. 時間戳 JSON 格式（`data/timings/<source>/<id>.json`）

```json
{
  "schema": 1,
  "id": "bbc-6min-261008",
  "source": "bbc",
  "url": "<節目頁網址>",
  "audio": { "url": "<官網音檔網址>", "duration": 372.4, "bytes": 6620434 },
  "paragraphs": [
    { "start": 0.0, "fp": "a1b2c3d4", "speaker": "Neil" }
  ],
  "aligned_by": "mlx-whisper large-v3-turbo + 序列比對",
  "quality": { "matched_ratio": 0.97, "low_confidence": [12, 13] }
}
```

- `audio.bytes` 和 `duration` 是**下載後實際量到的值**，不是 RSS 上寫的。插件下載後會比對，不符就不套用。
- `low_confidence`：列出開頭附近的字沒對上、時間是內插出來的段落索引。
- ⛔ 不放任何原文字串（憲法 1）。

另有 `data/timings/index.json`：`{ id: { source, date, title, paragraphs, updated } }`，讓插件一次知道有哪些。

## 4. 對齊演算法（BBC）

1. 原文段落：依 §1 切段，再切成字詞 token（用 §2 的正規化，再以空白切開）。
2. 音檔：用 mlx-whisper（`large-v3-turbo`、`word_timestamps=True`、`language="en"`）轉出字詞和各自的開始時間。
3. 兩串 token 做序列比對（`difflib.SequenceMatcher`，`autojunk=False`；效果不好再考慮 Needleman-Wunsch）。
4. 每段的 `start` = 該段**第一個對上的 token** 的 whisper 時間，往前扣掉段首沒對上的 token
   （扣掉的秒數 = 段首沒對上的 token 數 × 該段平均每字秒數）。
5. 整段都沒對上：在前後兩段之間依字數內插，並列入 `low_confidence`。
6. 結果必須單調遞增；不遞增的段落改用內插，並列入 `low_confidence`。

### 驗收（每集都自動檢查，不通過就不發布）
- `matched_ratio`（對上的 token 數 / 原文 token 數）≥ 0.85。
- `low_confidence` 的段數 ≤ 總段數的 10%。
- 抽查：每集隨機取 3 段，從 `start` 切 4 秒音訊重新轉寫，前 3 個字要出現在該段前 6 個 token 裡。

## 5. TED 片頭偏移
- TED 的 HLS 網址帶 `intro_master_id` 時，前面會多接一段片頭；不帶就沒有（見 PITFALLS）。
- 插件一律用**不帶片頭**的音軌。如果 cue 時間是以帶片頭的版本計算的，`start` 要扣掉片頭長度。
  實際是哪一種，由 P0 驗證後寫回本節。
