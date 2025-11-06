# DoorPhoneOSS
シンプルなドアホンシステム。

## 起動
1. /publicにpush.mp3[^1]とring.mp3[^2]を配置する。
2. 以下を実行する。
```sh
git clone https://github.com/makaseloli/DoorPhoneOSS.git
cd DoorPhoneOSS
echo "DISCORD_WEBHOOK_URL=<YOUR_DISCORD_WEBHOOK_URL_HERE>" > .env
docker compose up --build --no-cache
```

[^1]: ドアホン側で再生。
[^2]: ダッシュボード側で再生。

## 機能
http://0.0.0.0:34567/ ではデバイスの追加ができます。  
http://0.0.0.0:34567/doorphone/<id> でドアホン画面を表示できます。

## スクリーンショット
![ダッシュボード](./screenshot/dashboard.webp)
![ドアホン画面](./screenshot/doorphone.webp)
