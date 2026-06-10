/**
 * Demo content for the no-backend showcase build. The SaaS shell (login UI,
 * dashboard, project editor) runs without Gitea/Supabase: projects are a fixed
 * list and diagrams live in the browser's localStorage (see browser-host.ts).
 */

export interface DemoProject {
  id: string;
  name: string;
  workspace: string;
}

export const DEMO_PROJECTS: DemoProject[] = [
  { id: "onboarding", name: "Employee Onboarding", workspace: "Operations" },
  { id: "expenses", name: "Expense Approval", workspace: "Finance" },
  { id: "hiring", name: "Hiring Pipeline", workspace: "People" },
];

export function demoProjectName(id: string): string {
  return DEMO_PROJECTS.find((p) => p.id === id)?.name ?? "Project";
}

const onboarding = `@kai-swimlane

/page/
description: \`\`\`
全機能の動作確認用サンプル。ページ／オプション（ガター・ヘッダー等）／レーン／
ブロック／プロップ／排他・ループ・並行・section・branch・merge・矢印線種・
備考（右カラム）・インライン装飾を 1 本のフローで網羅します。
\`\`\`;
header-left: アクメ株式会社;
header-center: 注文フルフィルメント;
header-right: v2.0;
footer-left: 社外秘;
footer-center: 社内利用限定;
footer-right: 2026-06-02;

/title/
注文フルフィルメント（全機能テスト）

/option/
show-left-gutter: true;
show-right-gutter: true;
show-header: true;
show-footer: true;
show-description: true;
show-step-block-captions: true;
merge-at-previous-block: true;

left-title: Procedure;
left-subtitle: Description;
right-title: Remark;
right-subtitle: 補足・備考;

/role/
<customer>
label: 顧客;
background-color: #e0f2fe;
icon: ☎;

<frontend>
label: Webフロントエンド;
text-color: #1e3a5f;
background-color: #f1f5f9;
icon: #monitor;

<api>
label: APIゲートウェイ;
background-color: #ede9fe;
icon: #server;

<worker>
label: フルフィルメント担当;
icon: #cpu;

<db>
label: データベース;
background-color: #dcfce7;
icon: #database;

/block/

<start>
background-color: #dbeafe;
shape: ellipse;
icon: #play;

<terminal>
background-color: #dcfce7;
shape: ellipse;
icon: #check;

<gate>
border-color: #c2410c;
shape: hex;
icon: #shield-check;

<job>
shape: subroutine;

<notify>
shape: cloud;
icon: #mail;

<memo>
shape: note;

<rectsys>
shape: rect;
icon: #settings;

<rounded>
shape: rounded;

/prop/

<reqdoc>
label: 申請;
side: left;
title: 受信リクエストの内容;

<auditlog>
label: 監査;
side: right;
background-color: #f8fafc;
border-color: #64748b;
text-color: #0f172a;
title: 監査証跡（hint: は title と同義）;
max-chars: 8;

<receipt>
label: 受領;
side: right;
hint: 顧客向けレシート（hint: は title: の別名）;

/line/

// この行は // コメントとして無視されます（先頭の分岐から開始）
if (受付チャネルは？) is (Web) than #blue
  [frontend: Webフォームを開く] <rounded>
  skip;

elseif (モバイル) than #green
  [frontend: モバイルアプリを開く]
  skip;

else
  [customer: サポート窓口に電話]
  skip;
endif

*** 本流ここから（*** もコメント行として無視されます） ***
[customer: 注文を確定] <start>
label: 注文送信;
desc: \`\`\`
顧客がカートを送信します。**配送先住所** と
*暗号化された決済トークン* を含みます。
\`\`\`;
props: reqdoc;
remark: 冪等キーで二重送信を防止します。;
arrow: dotted;

[frontend: フォームを検証] <gate>
desc: \`\`\`
必須項目を確認し、不正な入力はAPIに到達する前に
ここで弾きます。
\`\`\`;
props: reqdoc,auditlog;

if (フォームは有効？) is (有効) than #green
  [api: リクエストを受理] <rectsys>
  desc: \`\`\`
呼び出し元を認証し、注文をフルフィルメント用の
キューに登録します。
  \`\`\`;
  props: auditlog;
  [worker: 在庫を確保] <job>
  desc: 出荷準備が完了するまで在庫を仮押さえします。;
  if (在庫はある？) is (在庫あり) than #blue
    [db: 在庫を減算]
    desc: \`\`\`
注文内の各明細について、引当可能在庫を
アトミックに減算します。
    \`\`\`;
    [worker: 出荷を作成] <job>
    desc: 配送業者を割り当て、配送ラベルを生成します。;
    props: receipt;

  elseif (取り寄せ) than #orange
    [worker: 取り寄せをキュー] <job>
    [customer: 遅延を通知] <notify>
    skip;

  else
    [customer: 返金]
    [db: 返金を記録] <memo>
  endif

  [api: 注文を確定]
  desc: \`\`\`
最終的な注文状態を永続化し、確定イベントを
下流の各サービスへ通知します。
  \`\`\`;

elseif (回復可能) than #orange
  [frontend: 再試行を表示]
  [customer: 再送信]
  [loop]

else
  [frontend: 致命的エラーを表示]
  skip;
  [api: 失敗メトリクスを送信]
  skip;
endif

[customer: 確認を受信] <terminal>
label: 確認済み;
desc: \`\`\`
注文サマリーと配送予定日を含む確認画面を
顧客に表示します。
\`\`\`;
remark: \`\`\`
配送予定日はSLAに基づく概算。
変更時はメールで再通知します。
\`\`\`;
remark-desc: 顧客満足度アンケートも同時送信。;
arrow: dashed;

if (レシートは必要？) is (はい) than #purple
  [api: レシートを生成]
  desc: \`\`\`
注文情報と決済記録からPDFレシートを
生成します。
  \`\`\`;
  props: receipt;
  [customer: レシートをダウンロード]
  skip;
endif

if (監査レベルは？) is (標準) than #gray
  [api: 標準監査ログを記録]
  skip;

elseif (強化) than #black
  [api: 強化監査ログを記録]
  props: auditlog;

else
  [api: 監査をスキップ]
  skip;
endif

[customer: 注文サマリーを表示]
remark: 画面下部にサポート窓口を併記。;
arrow: solid;

*** 枠（section）: 本流の流れは変えず、関連ステップを点線ボックスで囲うだけ ***
section (監査ブロック) #blue
  [db: 監査明細を永続化]
  desc: \`\`\`
section は本流の流れを変えず、関連ステップを
点線ボックスで視覚的にまとめるだけの枠です。
  \`\`\`;
  [api: 監査イベントを送信]
end-section

[api: 追跡イベントを準備]

*** 支線（branch）: 本流から分岐し、最後の手順で end-branch 直後のブロックへ合流 ***
branch (配送支線)
  [worker: ピッキング詳細を記録]
  [api: 追跡IDを通知]
end-branch

[frontend: 旧式互換テスト]

*** 支線の直後が fork のとき、合流先は fork ゲートウェイ ***
branch (レガシー支線)
  [db: レガシー形式の明細を保存]
end-branch

fork #purple
  [db: 在庫台帳を更新]
  desc: \`\`\`
販売実績を在庫台帳へ反映し、
集計用の数値を確定します。
  \`\`\`;
  props: auditlog;

and
  [api: レシートをメール送信] <notify>
  desc: \`\`\`
確定した注文のレシートを生成し、
顧客へメールで送付します。
  \`\`\`;
  props: receipt;

and
  [worker: 配送状況を初期化] <job>
  desc: \`\`\`
追跡番号を採番し、配送状況の
初期レコードを作成します。
  \`\`\`;
endfork

if (キャンセル要求は？) is (あり) than #red
  [customer: キャンセルを受付]
  desc: \`\`\`
顧客がキャンセルを要求。以降の通常処理を
スキップし、終端ステップへ直接合流します。
  \`\`\`;
  arrow: dashed;
  merge: trans-comp;

else
  [api: 通常クローズ処理]
  desc: \`\`\`
請求を確定し、関連リソースを解放して
取引を正常に締めます。
  \`\`\`;
endif

[customer: 取引完了] <terminal>
id: trans-comp;
label: 取引完了;
desc: すべての記録が確定し、取引が完了します。;
remark: 監査ログは30日間保管。;

@end

`;

const expenses = `@kai-swimlane
/title/
Expense Approval
/option/
show-left-gutter: true;
show-right-gutter: true;
/role/
<emp>
label: Employee;
background-color: #dbeafe;
<mgr>
label: Manager;
background-color: #ffedd5;
<fin>
label: Finance;
background-color: #dcfce7;
/line/
[emp: Submit expense]
if (amount over limit?) is (yes) than
[mgr: Review request]
else
[fin: Auto-approve]
endif
[fin: Reimburse]
@end
`;

const hiring = `@kai-swimlane
/title/
Hiring Pipeline
/option/
show-left-gutter: true;
show-right-gutter: true;
/role/
<rec>
label: Recruiter;
background-color: #dbeafe;
<hm>
label: Hiring Manager;
background-color: #ffedd5;
<cand>
label: Candidate;
background-color: #dcfce7;
/line/
[rec: Screen applicants]
[hm: Phone interview]
[hm: On-site interview]
[rec: Make offer]
[cand: Accept offer]
@end
`;

const SEEDS: Record<string, Record<string, string>> = {
  onboarding: { "onboarding.txt": onboarding },
  expenses: { "expenses.txt": expenses },
  hiring: { "hiring.txt": hiring },
};

/** Seed files for a demo project (path → DSL), or a generic blank doc. */
export function demoSeed(projectId: string): Record<string, string> {
  return (
    SEEDS[projectId] ?? {
      "untitled.txt": `@kai-swimlane\n/title/\nUntitled\n/role/\n<role01>\nlabel: Team;\nbackground-color: #dbeafe;\n/line/\n[role01: Start]\n[role01: Done]\n@end\n`,
    }
  );
}
