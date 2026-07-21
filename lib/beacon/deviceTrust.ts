/**
 * 旧「この端末を信頼する」機能の後片付け専用。
 * かつてはパスコードを端末鍵で暗号化して localStorage に保存していたが、現行は
 * パスキー専用のためこの保存自体を廃止した。起動時に残骸を一度だけ消すための
 * clearTrustedDevice だけを残している（保存・読み出しの経路はもう存在しない）。
 */

const K_TRUST = "via-mi:trust:v1";

export function clearTrustedDevice(): void {
  try {
    window.localStorage.removeItem(K_TRUST);
  } catch {
    /* noop */
  }
}
