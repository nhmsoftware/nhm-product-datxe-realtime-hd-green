# NHM Realtime Service

## 📋 Tổng quan

**NHM Realtime Service** là service Node.js chuyên xử lý tính năng **theo dõi tài xế theo thời gian thực (UC-13 Track Driver)** và **Chat/Call Driver (UC-14)**. Service này lắng nghe các sự kiện từ Laravel thông qua Redis, sau đó broadcast dữ liệu đến client qua Socket.IO.

---

## 🔄 Luồng hoạt động

```
┌─────────────┐     Redis Channel      ┌─────────────────┐   Socket.IO   ┌──────────────┐
│   Laravel    │ ──────────────────────▶│  Node Service   │ ────────────▶│    Client     │
│ RideService  │ tracking / communication│  (this service) │              │ (Mobile/Web)  │
└─────────────┘                         └─────────────────┘              └──────────────┘
      │                                        │
      │  1. Write to DB                        │  2. Update in-memory snapshot
      │  2. Publish event to Redis            │  3. Emit to room ride:{rideId}
```

### Chi tiết từng bước:

1. **Laravel** — `RideService` / `RideCommunicationService` ghi database thành công → publish event vào Redis channel `ride.tracking.events` hoặc `ride.communication.events`.

2. **Node Service** — Nhận event từ Redis:
   - Tracking event: cập nhật snapshot in-memory theo `ride_id`
   - Communication event: broadcast thẳng tới room của ride

3. **Socket.IO** — Emit `ride:tracking.updated` tới room `ride:{rideId}` để client nhận dữ liệu GPS real-time.

4. **Tracking Lost** — Nếu quá `LOCATION_STALE_AFTER_MS` mà không có GPS mới → service emit `tracking.lost`.

---

## ⚙️ Cấu hình

Các biến môi trường cần thiết:

| Biến                       | Mô tả                                    | Mặc định                  |
|----------------------------|------------------------------------------|---------------------------|
| `PORT`                     | Cổng chạy HTTP server                    | `3000`                    |
| `REDIS_HOST`               | Địa chỉ Redis server                     | `localhost`               |
| `REDIS_PORT`               | Cổng Redis                               | `6379`                    |
| `REDIS_CHANNEL`            | Channel Redis cho tracking               | `ride.tracking.events`    |
| `REDIS_COMMUNICATION_CHANNEL` | Channel Redis cho chat/call          | `ride.communication.events` |
| `LOCATION_STALE_AFTER_MS`  | Thời gian (ms) để coi GPS là "lỗi thời"  | `30000` (30s)             |

---

## 🚀 Cách chạy

```bash
# Cài đặt dependencies
npm install

# Chạy service
npm start

# Hoặc chạy ở chế độ development (nếu có nodemon)
npm run dev
```

---

## 🧪 Mock Driver Sender

Nếu màn hình customer báo `Chuyến đi hiện chưa có tài xế nhận.` thì nghĩa là bạn mới chỉ có booking/customer side, chưa có actor tài xế gọi vào các endpoint driver-side.

Tôi đã thêm 4 script để giả lập app tài xế:

```bash
npm run mock:accept
npm run mock:stream
npm run mock:arrived
npm run mock:cancel
```

### Chuẩn bị biến môi trường

```bash
set BACKEND_URL=http://127.0.0.1:8000
set RIDE_ID=123456
set DRIVER_TOKEN=your_driver_sanctum_token
```

### Luồng test tối thiểu

1. Tài xế nhận chuyến:
```bash
npm run mock:accept
```

2. Tài xế bắn GPS liên tục:
```bash
npm run mock:stream
```

3. Khi gần điểm đón, báo đã đến nơi:
```bash
npm run mock:arrived
```

4. Nếu muốn test nhánh hủy:
```bash
npm run mock:cancel
```

### Tùy chỉnh route GPS giả lập

```bash
set STREAM_INTERVAL_MS=2000
set DRIVER_ROUTE=[{"lat":10.776889,"lng":106.700806},{"lat":10.777402,"lng":106.699884},{"lat":10.778003,"lng":106.698901}]
```

`DRIVER_ROUTE` là JSON array các điểm `lat/lng` mà script sẽ gửi lần lượt lên backend.

---

## 🔌 Socket.IO Contract

### Kết nối & Xác thực

Client kết nối Socket.IO và thực hiện một trong hai cách:

**Cách 1:** Gửi `auth.rideId` kèm theo khi kết nối:

```javascript
const socket = io({
  auth: {
    rideId: 'ride_12345'
  }
});
```

**Cách 2:** Emit sự kiện `ride:join` sau khi kết nối:

```javascript
socket.emit('ride:join', { rideId: 'ride_12345' });
```

---

### Sự kiện nhận từ Server

| Sự kiện                  | Mô tả                                                    |
|---------------------------|----------------------------------------------------------|
| `ride:tracking.state`     | Trạng thái GPS hiện tại của chuyến xe                   |
| `ride:tracking.updated`   | Cập nhật vị trí GPS mới từ tài xế                       |
| `ride:communication.updated` | Event chat/call mới của ride                         |
| `communication.chat.message.sent` | Một chat message mới đã được gửi               |
| `communication.call.initiated` | Một cuộc gọi mới được khởi tạo                    |
| `communication.call.status.updated` | Trạng thái cuộc gọi được cập nhật          |
| `tracking.lost`           | Mất tín hiệu GPS — không có GPS trong thời gian quy định |

#### Ví dụ dữ liệu `ride:tracking.updated`:

```json
{
  "rideId": "ride_12345",
  "driverId": "driver_001",
  "latitude": 10.776886,
  "longitude": 106.700982,
  "heading": 45,
  "speed": 35,
  "timestamp": 1700000000000
}
```

---

## 🏥 Health Check

Endpoint kiểm tra trạng thái service:

```
GET /health
```

**Response thành công:**

```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

## 📁 Cấu trúc dự án

```
nhm-product-datxe-realtime/
├── src/
│   ├── index.js              # Entry point — khởi tạo server & socket
│   ├── redisSubscriber.js    # Subscribe Redis channel & xử lý event
│   ├── socketHandlers.js     # Xử lý kết nối & sự kiện Socket.IO
│   └── config.js             # Cấu hình từ environment variables
├── package.json
└── README.md
```

---

## 🛠 Công nghệ sử dụng

| Công nghệ   | Phiên bản   | Mục đích                          |
|-------------|-------------|-----------------------------------|
| Node.js     | >= 18.x     | Runtime                           |
| Express     | ^4.x        | HTTP server & routing             |
| Socket.IO   | ^4.x        | Real-time communication           |
| ioredis     | ^5.x        | Redis client                      |
| dotenv      | ^16.x       | Quản lý biến môi trường           |

---

## 📝 Ghi chú

- Service này **không ghi vào database** — chỉ đọc event từ Redis và broadcast qua Socket.IO.
- Dữ liệu GPS được lưu **in-memory** theo `ride_id` để emit nhanh mà không cần query DB.
- Phù hợp triển khai trên **Kubernetes** hoặc **PM2** cluster mode nếu cần scale.

---

## 📧 Liên hệ

- **Hotline hỗ trợ:** 1900 xxxx
- **Email:** support@nhm-datxe.com

---

**MIT License** — © 2024 NHM Datxe
# nhm-product-datxe-realtime-hd-green
