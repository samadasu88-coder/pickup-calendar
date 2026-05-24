#!/bin/bash
# clasp v3 のログインアカウントを ~/.clasprc.json の id_token から取り出して
# 「お迎え予定表」用メインアカウントと一致するか確認する。

set -e

EXPECTED_EMAIL="masa73421017@gmail.com"

echo "=== Google ログインアカウント確認 ==="
echo "期待: $EXPECTED_EMAIL"
echo

CURRENT=$(python3 - <<'PY' 2>/dev/null || echo ""
import json, base64
try:
    with open('/Users/aokimasataka/.clasprc.json') as f:
        d = json.load(f)
    tok = d.get('tokens', {}).get('default', {}).get('id_token', '')
    if not tok:
        print('')
    else:
        payload = tok.split('.')[1]
        payload += '=' * (-len(payload) % 4)
        info = json.loads(base64.urlsafe_b64decode(payload))
        print(info.get('email', ''))
except Exception:
    print('')
PY
)

if [ -z "$CURRENT" ]; then
  echo "❌ clasp 未ログインまたは認証情報が読めません"
  echo "→ clasp login を実行してください"
  exit 1
fi

echo "現在: $CURRENT"
echo

if [ "$CURRENT" = "$EXPECTED_EMAIL" ]; then
  echo "✅ メインアカウントでログイン中。続行できます。"
  exit 0
fi

echo "❌ 想定アカウントではありません（サポアカウント等の可能性）"
echo
read -p "メインアカウントに切り替えますか？ (y/N) " ans
if [ "$ans" = "y" ] || [ "$ans" = "Y" ]; then
  clasp logout || true
  echo
  echo "ブラウザが開きます。$EXPECTED_EMAIL でログインしてください。"
  clasp login
else
  echo "中断しました。"
  exit 1
fi
