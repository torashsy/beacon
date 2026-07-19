import type { Metadata } from "next";
import Link from "next/link";
import { NavIcon, type NavIconName } from "@/components/beacon/NavIcon";

export const metadata: Metadata = {
  title: "使い方ガイド · via-mi",
  description: "via-miのはじめ方から、ページ作り・共有・フォローまでを順番に説明します。",
};

/** 下部ナビのタブを、実物と同じアイコンで文中に示すチップ。 */
function NavTab({ name, label }: { name: NavIconName; label: string }) {
  return (
    <span className="navTabRef">
      <NavIcon name={name} />
      {label}
    </span>
  );
}

/**
 * 使い方マニュアル。/privacy・/terms と同じ静的ページ構成。
 * 画像は後から各セクションに差し込む前提で、テキストのみで完結する内容にしている。
 */
export default function GuidePage() {
  return (
    <main className="wrap" style={{ paddingTop: 24, paddingBottom: 60 }}>
      <div className="top">
        <Link className="logo" href="/" aria-label="via-mi ホーム">
          via-mi
        </Link>
      </div>
      <h1>使い方ガイド</h1>
      <div className="lead">
        はじめ方からページ作り・共有・フォローまで、順番に説明します。
      </div>

      <div className="card" style={{ fontSize: 13.5, lineHeight: 1.9 }}>
        <h2 id="start" style={{ margin: "0 0 8px" }}>1. はじめる（アカウント作成）</h2>
        <p>
          via-miにパスワードはありません。IDを決めて、お使いの端末の生体認証
          （Face ID・指紋など）を登録するだけで始められます。
        </p>
        <ol style={{ margin: "8px 0 0 18px" }}>
          <li>トップページの「はじめる」を押す</li>
          <li>好きなID（半角英数字とアンダースコア）を入力する</li>
          <li>「パスキーで作成」を押す</li>
          <li>Face IDや指紋認証の画面が出たら、そのまま認証する</li>
        </ol>
        <p>
          これで完了です。IDは自分のページのURL（via-mi.com/@あなたのID）になるので、
          人に伝えやすいものがおすすめです。認証情報（パスキー）は登録した端末に保存され、
          次回からは「ログイン」を押して生体認証するだけで入れます。
        </p>

        <h2 id="build" style={{ margin: "20px 0 8px" }}>2. ページを作る</h2>
        <p>
          ログイン後、下のメニューの<NavTab name="profile" label="me" />タブが自分のページの編集画面です。
          載せたいものだけ選んで追加してください。すべて任意です。
        </p>
        <ul style={{ margin: "8px 0 0 18px" }}>
          <li>
            <strong>リンク</strong> — XやInstagram、LINEなどのリンクを追加できます。
            並べ替えや、一時的な非表示もできます。見出しを挟んでグループ分けも可能です。
          </li>
          <li>
            <strong>ひとこと</strong> — ページ上部の吹き出しに表示される短いメッセージです。
            近況やお知らせにどうぞ。
          </li>
          <li>
            <strong>カレンダー</strong> — イベントや予定を登録できます。予定ごとに
            公開・非公開を選べるので、自分用のメモとしても使えます。
          </li>
          <li>
            <strong>写真</strong> — ページに写真を載せられます（最大5枚）。
          </li>
          <li>
            <strong>プロフィール</strong> — 名前・自己紹介・アイコン・バナーの色などを
            自由に変えられます。
          </li>
        </ul>

        <h2 id="share" style={{ margin: "20px 0 8px" }}>3. ページを共有する</h2>
        <p>
          <NavTab name="profile" label="me" />タブの「共有」からページのURLをコピーできます。「QRコード」を押すと
          あなた専用のQRコードが表示されるので、その場で相手に見せて読み取ってもらえば
          すぐにページを渡せます。
        </p>
        <p>
          共有したページは、URLを知っている人なら誰でも（アカウントがなくても）見られます。
        </p>

        <h2 id="follow" style={{ margin: "20px 0 8px" }}>4. フォローする</h2>
        <p>
          下のメニューの<NavTab name="follows" label="Follow" />タブで、相手のIDを入力するとその人のページを開けます。
          フォローしておくと、相手がリンクや予定を更新したときに気づけます。
        </p>
        <p>
          プッシュ通知をオンにすると、フォロー中の人の更新が通知で届きます。
          設定は<NavTab name="help" label="ヘルプ" />タブのアカウント欄にあります。
        </p>
        <p>
          ※ 名前やキーワードでのあいまい検索はできません。IDが完全に一致した場合のみ
          ページが表示されます。これは「知っている人にだけ届く」ためのvia-miの設計です。
        </p>

        <h2 id="trouble" style={{ margin: "20px 0 8px" }}>5. 困ったとき</h2>
        <ul style={{ margin: "8px 0 0 18px" }}>
          <li>
            <strong>機種変更・ログインできないときに備える</strong> —
            <NavTab name="help" label="ヘルプ" />タブのアカウント欄から<strong>復旧用メールアドレス</strong>を登録しておくと、
            端末を失くしてもアカウントを取り戻せます。登録は数十秒で終わるので、
            早めの設定をおすすめします。確認が済むと、ページの名前の横に認証済みマークが付きます。
          </li>
          <li>
            <strong>ログインできなくなったら</strong> — ログイン画面の案内から、
            復旧用メールアドレスを使った復旧手続きができます
            （復旧用メールアドレスを登録済みの場合のみ）。
          </li>
          <li>
            <strong>アカウントを削除したいとき</strong> — <NavTab name="help" label="ヘルプ" />タブのアカウント欄の
            「アカウントを削除」から、いつでも削除できます。ページやデータは失われます。
          </li>
        </ul>

        <h2 id="faq" style={{ margin: "20px 0 8px" }}>6. よくある質問</h2>
        <p>
          <strong>Q. 料金はかかりますか?</strong>
          <br />
          A. かかりません。現在、via-miのすべての機能を無料で利用できます。
        </p>
        <p>
          <strong>Q. 自分のページが検索に出ることはありますか?</strong>
          <br />
          A. ありません。検索エンジンに載らない設定にしているほか、via-mi内にも
          ユーザーを探す検索機能はありません。あなたのページを見られるのは、
          IDまたはURLを知っている人だけです。
        </p>
        <p>
          <strong>Q. パスキーとは何ですか?</strong>
          <br />
          A. パスワードの代わりに、端末の生体認証（Face ID・指紋など）で本人確認する
          仕組みです。パスワードのように盗まれたり使い回されたりする心配がなく、
          覚えるものはあなたのIDだけです。
        </p>
        <p>
          <strong>Q. メールアドレスの登録は必要ですか?</strong>
          <br />
          A. 必須ではありません。アカウント作成にメールアドレスは不要です。
          機種変更やログインできなくなったときに備えたい場合のみ、復旧用として登録できます。
        </p>

        <h2 style={{ margin: "20px 0 8px" }}>お問い合わせ</h2>
        <p>
          解決しないときは<Link href="/contact">お問い合わせフォーム</Link>からご連絡ください。
        </p>
      </div>
    </main>
  );
}
