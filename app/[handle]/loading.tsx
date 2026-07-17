export default function PublicProfileLoading() {
  return (
    <main className="wrap publicProfileLoading" aria-label="プロフィールを読み込み中">
      <div className="top">
        <span className="logo" aria-hidden="true">via-mi</span>
      </div>
      <div className="card publicProfileLoadingCard" aria-hidden="true">
        <div className="profileLoadingHeader" />
        <div className="profileLoadingAvatar" />
        <div className="profileLoadingLine wide" />
        <div className="profileLoadingLine short" />
        <div className="profileLoadingBlock" />
      </div>
    </main>
  );
}
