import type { Metadata } from "next";
import Link from "next/link";
import { NavIcon, type NavIconName } from "@/components/beacon/NavIcon";

export const metadata: Metadata = {
  title: "使い方ガイド · via-mi",
  description: "via-miのはじめかたから、ページづくり・共有・フォローまでをやさしく紹介します。",
};

/** 下部ナビのタブを、実物と同じアイコンだけで文中に示すチップ。label は読み上げ用。 */
function NavTab({ name, label }: { name: NavIconName; label: string }) {
  return (
    <span className="navTabRef" role="img" aria-label={label}>
      <NavIcon name={name} />
    </span>
  );
}

/**
 * 使い方マニュアル。/privacy・/terms と同じ静的ページ構成。
 * 文体は「短い一文・やわらかい語り・句点単位の改行」でそろえる。
 * 画像は後から各セクションに差し込む前提。
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
        はじめかたから、共有のしかたまで。
        <br />
        via-miの使い方を、やさしくご紹介します。
      </div>

      <div className="card guideManual">
        <h2 id="start">1. はじめる</h2>
        <p>
          via-miに、パスワードはありません。
          <br />
          IDを決めて、いつもの顔や指紋の認証を登録するだけ。
          <br />
          1分もかからずに始められます。
        </p>
        <ol>
          <li>トップページの「はじめる」を押します</li>
          <li>好きなIDを入力します（半角英数字）</li>
          <li>「パスキーで作成」を押します</li>
          <li>Face IDや指紋の画面が出たら、そのまま認証します</li>
        </ol>
        <p>
          これで、あなたのページができました。
          <br />
          IDはそのままページのURLになります。
          <br />
          （via-mi.com/@あなたのID）
        </p>
        <p>
          次からは「ログイン」を押して、いつもの認証をするだけ。
          <br />
          覚えるものは、何もありません。
        </p>

        <h2 id="build">2. ページをつくる</h2>
        <p>
          ログインしたら、下のメニューの<NavTab name="profile" label="me" />を開いてみましょう。
          <br />
          ここが、あなたのページの編集画面です。
        </p>
        <p>載せるものは、ぜんぶ自由。使いたいものだけ選んでください。</p>
        <ul>
          <li>
            <strong>リンク</strong>
            <br />
            XやInstagram、LINEなどのリンクを載せられます。
            並べ替えたり、一時的に隠したりもできます。
          </li>
          <li>
            <strong>ひとこと</strong>
            <br />
            ページの上に表示される、短いメッセージです。
            今日の気分やお知らせをどうぞ。
          </li>
          <li>
            <strong>カレンダー</strong>
            <br />
            イベントや予定を載せられます。
            予定ごとに公開・非公開を選べるので、自分だけのメモにも使えます。
          </li>
          <li>
            <strong>写真</strong>
            <br />
            お気に入りの写真を、5枚まで飾れます。
          </li>
          <li>
            <strong>プロフィール</strong>
            <br />
            名前や自己紹介、アイコン、ページの色。
            いつでも、何度でも変えられます。
          </li>
        </ul>

        <h2 id="share">3. だれかに渡す</h2>
        <p>ページができたら、だれかに渡してみましょう。</p>
        <p>
          <NavTab name="profile" label="me" />の「共有」から、URLをコピーできます。
          <br />
          メッセージに貼って送るだけで、相手に届きます。
        </p>
        <p>
          目の前にいる相手には、QRコードが便利です。
          <br />
          「QRコード」を押して、画面を見せるだけ。
        </p>
        <p>
          渡したページは、URLを知っている人ならだれでも見られます。
          <br />
          相手にアカウントは要りません。
        </p>

        <h2 id="follow">4. 相手をフォローする</h2>
        <p>
          <NavTab name="follows" label="Follow" />で相手のIDを入力すると、その人のページが開きます。
          <br />
          フォローしておくと、リンクや予定が新しくなったときに気づけます。
        </p>
        <p>
          プッシュ通知をオンにすれば、更新が通知で届きます。
          <br />
          設定は<NavTab name="help" label="ヘルプ" />のアカウント欄から。
        </p>
        <p className="guideNote">
          名前などでのあいまい検索はできません。
          IDがぴったり合ったときだけ、ページが表示されます。
          「知っている人にだけ届く」ための、via-miの設計です。
        </p>

        <h2 id="trouble">5. こまったとき</h2>
        <p>
          <strong>機種変更にそなえたい</strong>
          <br />
          <NavTab name="help" label="ヘルプ" />のアカウント欄から、復旧用のメールアドレスを登録できます。
          登録しておくと、端末をなくしてもアカウントを取り戻せます。
          数十秒で終わるので、早めの登録がおすすめです。
        </p>
        <p>
          <strong>ログインできなくなった</strong>
          <br />
          ログイン画面の案内から、復旧用メールアドレスで手続きできます。
          （復旧用メールアドレスを登録している場合）
        </p>
        <p>
          <strong>アカウントを消したい</strong>
          <br />
          <NavTab name="help" label="ヘルプ" />のアカウント欄の「アカウントを削除」から、いつでも消せます。
          ページとデータはすべて消え、元に戻せません。
        </p>

        <h2 id="faq">6. よくある質問</h2>
        <p>
          <strong>Q. お金はかかりますか？</strong>
          <br />
          かかりません。すべての機能を、無料で使えます。
        </p>
        <p>
          <strong>Q. 自分のページが検索に出ませんか？</strong>
          <br />
          出ません。検索エンジンにも、via-miの中にも、あなたを探す検索はありません。
          ページを見られるのは、IDやURLを知っている人だけです。
        </p>
        <p>
          <strong>Q. パスキーってなんですか？</strong>
          <br />
          パスワードの代わりに、顔や指紋で本人確認するしくみです。
          覚えるのは自分のIDだけ。盗まれて困るパスワードが、そもそも存在しません。
        </p>
        <p>
          <strong>Q. メールアドレスは必要ですか？</strong>
          <br />
          なくても始められます。機種変更にそなえたいときだけ、復旧用に登録してください。
        </p>

        <h2>お問い合わせ</h2>
        <p>
          解決しないときは、<Link href="/contact">お問い合わせフォーム</Link>からどうぞ。
        </p>
      </div>
    </main>
  );
}
