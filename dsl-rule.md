## 必須構文

```
@kai-swimlane
・・・
@end
```

`@kai-swimlane` 行と `@end` 行の**間**の文字列が処理されます（マーカー行自体は DSL の一部ではありません）。

Markdown の ` ```kai-swimlane ` フェンスでは、プレビュー用に `@kai-swimlane` / `@end` を省略できます。Web エディタや CLI ではマーカーが必要です。

スタイル断片だけを載せるときは ` ```kai-swimlane-parts ` フェンスに `/block/` や `/prop/` のみを書きます（フロー・レーンは不要）。

## セクション

```
/title/
/page/
/option/
/role/
/block/
/prop/
/line/
```

7つのセクションに分けて記述します。`/option/` は省略できます。

`/line/` はフロー（ステップと分岐）専用です。`/role/` で定義した**担当者（アクター）**のレーン ID だけを `[roleId: …]` に使います。区分・見出し用の別レーンは作りません。

## コメント

行頭（前後の空白を除く）が `//` の行、または行全体が `***` で始まる行はコメントです（図・実行モデルには入りません）。

| 場所 | 図への影響 | 保存・整形（シリアライズ） |
|------|------------|---------------------------|
| `/page/` など `/line/` 以外 | 無視（捨てられる） | 出力されない |
| `/line/` 内 | 無視 | **直後の行に付いて保持**（整形で消えない） |

```
// 受付チャネル分岐のメモ
if (チャネルは？) is (Web) than #blue
  [role01: Webフォーム]
endif
```

`desc:` / `remark:` など **`` ``` `` フェンス内**の行はコメント扱いになりません（`//` や `/title/` のような見た目の行もそのまま本文になります）。フェンス外の `***` 行はコメント、`desc:` 内の `***太字***` はインライン装飾です（下記）。

## フロー制御の一覧（`/line/` 内）

| 構文 | 意味 | 図での表現 |
|------|------|------------|
| `if` … `elseif` … `else` … `endif` | 排他分岐（いずれか1ケース） | 条件ダイヤモンド + endif 合流 |
| `[loop]` | ケース末尾。同じ `if` の条件へ戻る | 戻り矢印（`if` 内のみ） |
| `fork` … `and` … `endfork` | 並行分岐（全パス同時） | 分岐・結合のゲートウェイ |
| `section (名前) #色` … `end-section` | 枠（本流はそのまま。視覚的に囲うだけ） | 色付き点線ボックス |
| `branch (名前) #色` … `end-branch` | 支線（本流から分岐し、末尾で合流） | ボックス無し。末尾→直後ブロックまたは直後の `if` / `fork` へ矢印 |
| `merge: <id>;` | ケース末尾。`endif` を使わず `id:` の下流へ合流 | 前方矢印（直前ステップの `arrow:` に従う。`if` 内のみ） |
| `arrow: solid\|dashed\|dotted\|long-dash\|dash-dot;` | 直後に描くコネクタの線種 | 実線／破線／点線／長破線／一点鎖線 |

分岐ブロックは入れ子または直列にのみ配置できます（別ブロックの行を交互に挟めません）。ケース内ではレーンを自由に行き来できます。

## タイトル

```
/title/
Sample text
```

## ページ

```
/page/
description: タイトル下に表示する説明;
header-left: 左ヘッダー;
header-center: 中央ヘッダー;
header-right: 右ヘッダー;
footer-left: 左フッター;
footer-center: 中央フッター;
footer-right: 右フッター;
```

図全体のヘッダー・フッター（左・中央・右）と、タイトル直下の説明文を設定します。各行は `;` で終えます。複数行は `` ``` `` フェンスでも書けます。

```
description: ```
1行目
2行目
```;
```

## 図オプション

```
/option/
show-left-gutter: true;
show-right-gutter: true;
show-header: true;
show-footer: true;
show-description: true;
show-step-block-captions: true;
merge-at-previous-block: true;
left-title: 手続き;
left-subtitle: 説明;
right-title: 備考;
right-subtitle: メモ;
```

表示フラグ（`true` / `false` / `yes` / `no` / `on` / `off` / `1` / `0`）と、左右カラムの見出しを設定します。各行は `;` で終えます。未知のキーはエラーになります。

| キー | 意味 |
|------|------|
| `show-left-gutter` | 左カラム（段階番号・`label` / `desc`）を表示 |
| `show-right-gutter` | 右カラム（各ステップの `remark` 欄）を表示。`remark` の有無は問わない |
| `show-header` | ページヘッダーを表示 |
| `show-footer` | ページフッターを表示 |
| `show-description` | タイトル下の説明文を表示 |
| `show-step-block-captions` | ステップ本文と `<block>` 参照を出力に含める |
| `merge-at-previous-block` | `if` の合流ダイヤモンド／`fork` の結合ゲートウェイを、直前のステップ行の位置に寄せる（オフ時は従来どおり分岐開始付近） |
| `left-title` | 左カラム見出し（既定: `Procedure`） |
| `left-subtitle` | 左カラム副見出し（既定: `Description`） |
| `right-title` | 右カラム見出し（既定: `Remark`） |
| `right-subtitle` | 右カラム副見出し（既定: 空） |

- **左カラム**（`show-left-gutter`）: 段階番号・`label`・`desc` を表示。見出しは `left-title` / `left-subtitle`。
- **右カラム**（`show-right-gutter`）: 各ステップの `remark` を表示。見出しは `right-title` / `right-subtitle`。`show-right-gutter` が真のとき、ステップに `remark` がなくても右カラムと各行の備考欄が表示されます。
- **ヘッダー・フッター**（`show-header` / `show-footer`）: `/page/` の `header-*` / `footer-*` を表示。各フラグが偽なら非表示。
- **prop チップ**（`props:` で付ける `side: left` / `side: right` のドキュメント）は常に表示されます（表示／非表示オプションはありません）。
- すべての表示フラグの既定は `true`。GUI ではタイトル欄右の「設定」から編集できます。

互換のため、`left-title` など4項目は `/page/` に書いても読み込めます。同じキーが両方にある場合は `/option/` が優先されます。

## 役割(レーン)

```
/role/

<role01>
label: 営業;
text-color: #0066cc;
background-color: #e6f2ff;
icon: #user;
```

<roleId> の下にプロパティ。label / text-color / background-color / icon。各行は `;` で終えます。

レーンはフローの**担当者（アクター）**のみ定義します（申請者・承認者・システムなど）。区分や章見出し用のレーンは不要です。

## ブロック(再利用デザイン)

```
/block/

<block01>
background-color: #ffe0b3;
text-color: #6b2a00;
border-color: #aa5500;
shape: hex;
icon: #zap;
```

再利用可能なステップのスタイル定義。shape: rect / rounded / hex / ellipse / cloud / note / subroutine / arrow-down（矢印：五方向・下向き）。プロパティ行は `;` で終えます。

## プロップ(再利用ドキュメント)

```
/prop/

<RQ>
label: 申請書;
side: right;

<LG>
label: 承認ログ;
side: left;
background-color: #f1f5f9;
border-color: #64748b;
text-color: #0f172a;
title: 監査用に保存される承認履歴;
max-chars: 10;
```

ステップに紐づける再利用可能なドキュメント定義。プロパティ行は `;` で終えます。

- `label` — チップに表示する短い名前
- `side` — `left` / `right`（省略時 `right`）
- `background-color` — チップの塗り
- `border-color` — チップの枠線
- `text-color` — ラベル文字色
- `title` または `hint` — ホバー時の説明（SVG の `<title>`。未指定時は `label` などにフォールバック）
- `max-chars` — 表示名の最大文字数（正の整数。省略時は 9）

## アイコン (icon)

```
icon: #check;
icon: #alert-triangle;
icon: ★;
icon: 🔥;
```

`#` 付きで [Lucide アイコン名](https://lucide.dev/icons/) を指定(例: `#check`, `#star`, `#mail`, `#lock`, `#zap`, `#circle-check`, `#alert-triangle`, `#database`, `#cloud`, `#settings`, `#user`, `#file-text`, `#send`, `#rocket`, `#shield-check` など 100+ 種)。`#` 無しは絵文字・文字としてそのまま表示。

## ステップ

1 行目にレーンと本文。`[roleId: 本文]`。行末に `<blockId>` を付けると `/block/` のデザインが当たります。

次の行以降（必ず直後のステップにだけ効く）:

- `id: 名前;` — ステップの一意 ID（`merge: <id>;` の合流先。ファイル全体で重複不可）
- `label: 名前;` — 左カラム用の表示名（図上の見出し。`merge` の合流先には使えない）
- `desc: 説明;` — 左カラム用の小さめ説明（複数行は `` ``` `` フェンス）
- `remark: 備考;` — 右カラム（`right-title`）に表示する備考（複数行は `` ``` `` フェンス）。どのステップにも `remark` が無ければ右カラムは表示されません
- `remark-desc: 補足;` — 直前の `remark:` に追記（2行目以降の説明用。単独でも可。整形時は `remark:` にまとまって出力されます）
- `skip;` — 段階番号を付けない
- `arrow: solid|dashed|dotted|long-dash|dash-dot;` — **このステップの直後**に描く矢印の線種（既定は実線。`solid` は省略可）
- `props: A,B,C;` — `/prop/` のドキュメントをステップ下部の左右に表示

```
[role02: ここに手続きを入れる]
label: Step name;
desc: 左カラムに表示される説明;
desc: ```
1行目
2行目
```;
props: A,B;

[role02: 終端ステップ] <block_terminal>
id: done;
label: 完了;
props: C;
```

`merge` で合流させるステップには、必ず `id: <合流名>;` を付けます。`label:` だけでは合流先として認識されません。

### インライン装飾（`desc:` / `remark:` / フェンス内の1行目）

`desc:`・`remark:`・`remark-desc:` の本文では、次の Markdown 風記法が使えます（左カラム・右カラムのテキストに反映）。

| 記法 | 効果 |
|------|------|
| `**text**` | 太字 |
| `*text*` | 斜体 |
| `***text***` | 太字＋斜体 |
| `~~text~~` | 取り消し線 |
| `\` + 任意の1文字 | エスケープ（記号をそのまま表示） |

## 分岐(split & merge)

分岐内の行は必須ではありませんが、可読性のため先頭に半角スペース2つのインデントを推奨します。

```
if (条件) is (成功) than #blue
  [role01: 成功処理] <block02>
elseif (失敗) than #gray
  [role02: エラー] <block03>
endif

if (○○有無) is (あり) than
  [role01: 成功処理] <block02>
elseif (なし) than
  [role02: エラー] <block03>
endif

if (再試行) is (する) than
  [role01: 項目を処理] <block02>
  [loop]
elseif (しない) than
  [role01: 完了] <block03>
endif
```

`if`〜`endif` で排他分岐。各ステップ行は `[roleId: 本文]` 形式。`than` の後ろに `#色名` を付けると条件ブロック色を指定できます（`else than #色名` も同様）。
色指定がない場合は現在のテーマ既定色を使います。使える色：blue, green, red, orange, purple, gray, black

分岐ケースの末尾に `[loop]` を置くと、そのケースは `endif` 合流へ進まず同じ `if` の条件ダイヤモンドへ戻る矢印を描きます（`if` の外では使えません）。直前のステップから矢印が出ます。ステップが無いケースではケース位置から戻ります。

## 並行処理(fork / and / endfork)

`if` が「いずれか一つ」を選ぶ排他分岐なのに対し、`fork` は「すべてを同時に」実行する並行分岐です。条件式やケースラベルは付けません。`fork` で分岐し、各 `and` で並行パスを追加し、`endfork` で全パスを結合します。

```
fork #purple
  [role_system: メール送信] <block_notify>
and
  [role_accounting: 台帳を更新] <block_system>
and
  [role_hr: 記録を保存] <block_approve>
endfork
```

- `fork` の直後から1本目の並行パスが始まります（`if` の最初のケースと同じ扱い）。
- `and` で2本目以降の並行パスを追加します（ラベル行は不要。空の `and` でも可）。
- `endfork` で全パスを結合します。
- `fork`／`and` の後ろに `#色名` を付けると分岐・パスの色を指定できます（`than #色名` と同じ色名）。
- `fork` 〜 `endfork` の中には通常のステップ、`props`、`desc`、ネストした `if` を書けます。
- `fork` と `endfork` は `if` と `endif` と同様にペアでネストする必要があります。

## 枠（section / end-section）

`section` は**本流の流れを変えず**、関連するステップを点線ボックスで視覚的にまとめるだけの枠です。内部のステップは通常どおり本流の一部として順に接続されます（見た目のグルーピングのみ）。

```
[role01: 注文を確定]
section (監査ブロック) #blue
  [role02: 監査明細を保存]
  [role03: 分析キューへ送信]
end-section
[role01: 確認画面を表示]
```

- `section (名前)` で開始、`end-section` で終了（ペア必須。未閉じはエラー）。名前省略時は `section` / `section #色` も可（表示名は既定の `Section`）。
- `#色名`（任意）でボックス色を指定できます。色名は `if ... than #色名` と同じです。
- 内部の行は半角スペース2つでインデントするのが推奨です。
- `if` ケース内や `fork` パス内にも書けます。
- 互換: `section-start (名前)` / `start-point` は `section` と同義、`end-point` は `end-section` と同義です。

## 支線（branch / end-branch）

`branch` は本流から**分岐する支線**です。支線の**先頭ブロックは本流に接続されず**（本流の途中で新しい支線が始まります）、**末尾のブロックだけ**が `end-branch` の**直後のブロック**（次が枠／支線なら、その先頭ブロック。次が `if`／`fork` ならそのゲートウェイ）へ合流します。本流側は通常どおりそのまま次の手順へ進みます。ボックスは描かれません。

```
[role01: 注文を確定]
branch (配送支線)
  [role02: ピッキング詳細を記録]
  [role03: 追跡IDを通知]
end-branch
[role01: 確認画面を表示]
```

- `branch (名前)` で開始、`end-branch` で終了（ペア必須）。名前省略時は `branch` / `branch #色` も可（表示名は既定の `Branch`）。`#色名` も指定できます。
- 先頭ブロックには入り矢印が付かず、末尾ブロックから合流先へ矢印が出ます。
- 合流先は `end-branch` の直後のブロック、または直後グループの先頭ブロックです。
- 直後が `if` / `fork` のときは、そのゲートウェイへ合流します。

## 途中マージ(merge)

`if` ケースの末尾に `merge: <id>;` を置くと、そのケースは `endif` の合流ダイヤモンドへ進まず、**下流**のステップで `id: <id>;` が一致するブロックへ直接合流します（合流矢印の線種は、ケース内の直前ステップに付けた `arrow:` に従います。未指定なら実線）。キャンセル時だけ終端へ飛ばす、といったケース向けです。`if` の外では使えません。

```
if (キャンセル要求は？) is (あり) than #red
  [role01: キャンセルを受付]
  merge: done;
else
  [role02: 通常クローズ処理]
endif

[role01: 取引完了] <block_terminal>
id: done;
label: 完了;
```

- `merge: <id>;` の `<id>` は、合流先ステップの `id: <id>;` と**完全一致**させます（`label:` は合流先になりません）。
- 各 `id:` はファイル内で**一意**である必要があります（重複するとエラー）。
- 合流先は**下流**（後方）のステップを想定しています。
- 一致する `id:` が無い場合は `merge: no step with id "…"` エラーになります。
- `merge` を `if` の外に書くとエラーになります。

## フロー記述の制約

- **排他と並行:** `if` / `elseif` / `else` はいずれか1ケース。`fork` / `and` / `endfork` は全パス同時。
- **再合流:** 通常は各ケースが `endif`（または `endfork`）で合流。`[loop]` は同じ `if` の条件へ戻る。`merge: <id>;` は下流の `id:` へ飛ぶ。
- **レーン:** 1ケース内でレーンを何度でも行き来できます（矢印は自動ルーティング）。
- **制御ブロックの入れ子:** `if` / `fork` / `section` / `branch` は入れ子か、終了してから次を書くかのどちらかです。別ブロックの行を交互に挟めません。
- **端点:** フローは分岐の前後から始めたり終えたりできます（周辺ステップが無い場合はゲートウェイに端子が付きます）。
- **幅:** `elseif` / `and` が多いとレーンが広がり、図全体が横に伸びることがあります。

## Web エディタ

| モード | パス | 主な操作 |
|--------|------|----------|
| **テキスト** | `/` | DSL を直接編集。**整形**でインデントを標準化（`/line/` の `//` コメントは次の行に付いて保持） |
| **GUI** | `/gui` | 手順一覧からステップ・条件・並行・枠・支線・ループ・合流を追加／並べ替え。タイトル横の **設定** で `/page/` と `/option/` を編集 |

共通: ツールバーの **構文**（本ヘルプと [template.md](./template.md) のロール／ブロック／プロップ／セット例）、**テーマ**（basic / washi / ink / mono）、**ファイル**（タブの新規・切替・削除。内容はブラウザのローカルストレージ）、**出力**（SVG / PNG / `.txt` DSL）。表示オプションは DSL の `/option/` のみが正（エディタに別の表示設定はありません）。

GUI 専用:

- **テンプレート** — ロール／ブロック／ドキュメントのカタログを別ウィンドウで開き、クリップボードにコピーして貼り付け
- **ステップ詳細** — 選択中の手順を別ウィンドウのインスペクターで編集（レーン・本文・ブロック・`label` / `desc` / `remark` / `props` など）
- 手順一覧の **＋** ボタン: 手順、条件、`elseif` 分岐、ループ、並行、枠、支線、並行パス、`merge`

## 構文エラーと GUI 編集

DSL に構文エラーがあるとき、**GUI エディタ**では続行方法を選びます。

- **テキストエディタで修正** — テキストモードへ移動し、エラー行を直す（GUI では構文エラー中は原則編集不可）
- **続行（エラー行のブロックのみ編集不可）** — プレビューは表示したまま、エラー行に紐づく手順だけロックし、他の手順は GUI で編集可能

テキストモードでは構文エラーがあっても常に編集できます。`show-step-block-captions` は `/option/` で切り替えます（出力 SVG/PNG にステップ本文・`<block>` 参照を含めるか）。

保存していない変更がある状態でページを再読み込みすると、ブラウザの確認ののち未保存の内容は破棄されます。
