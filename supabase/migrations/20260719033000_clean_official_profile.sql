-- Remove known launch-test copy from the official profile without touching
-- content the operator may have added since.

update profiles
set bio = 'SNSやリンク、予定をひとつにまとめられるプロフィールサービス、via-miの公式アカウントです。'
where handle = 'via_mi'
  and bio like '%800文字がどれぐらいなのかを検証しています%';

update profiles
set status = '',
    status_at = null
where handle = 'via_mi'
  and status = 'ただいま公開準備中';

delete from link_clicks
where handle = 'via_mi'
  and url = 'https://x.com/yuxijk';

delete from channels
where handle = 'via_mi'
  and url = 'https://x.com/yuxijk';
