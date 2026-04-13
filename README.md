# 🌍 Location Sharing Backend
> Production Ready NestJS Monolith Architecture

Đây là hệ thống backend cho ứng dụng chia sẻ địa điểm (Location Sharing), được thiết kế theo kiến trúc Monolith có khả năng mở rộng tốt với đầy đủ các thành phần hạ tầng chuyên nghiệp.

## 🛠 Tech Stack & Versioning
- **Node.js**: `v20.x` (Khuyên dùng)
- **Framework**: `NestJS@10.3`
- **Database**: `MongoDB 7.0` (thông qua `@nestjs/mongoose@10.0.4` & `mongoose@8.2.1`)
- **Caching & WebSocket**: `Redis 7.2` (thông qua `ioredis` và `socket.io-redis`)
- **Message Broker**: `Kafka 7.6` (thông qua `kafkajs@2.2.4`)
- **Object Storage**: `MinIO` (S3 Compatible - `minio@7.1.3`)

---

## 🚀 Hướng dẫn Cài đặt & Chạy dự án (Setup)

### 1. Khởi chạy Hạ tầng (Infrastructure)
Dự án sử dụng cơ sở hạ tầng được ảo hóa bằng Docker, bao gồm MongoDB, Redis, Zookeeper, Kafka, Kafka UI, và MinIO. Đảm bảo bạn đã cài đặt Docker và Docker Compose trên máy tính:

```bash
# Khởi động toàn bộ hạ tầng (chạy ngầm)
docker-compose up -d
```

Sau khi chạy thành công, bạn có thể truy cập các dịch vụ:
- **MongoDB**: `localhost:27017`
- **Redis**: `localhost:6379`
- **Kafka**: `localhost:9092`
- **Kafka UI**: `http://localhost:8080/`
- **MinIO Dashboard**: `http://localhost:9001/` (Tài khoản/Mật khẩu mặc định: `minioadmin` / `minioadmin`)

### 2. Thiết lập Biến môi trường
Copy file example thành file chính thức:
```bash
cp .env.example .env
```
*(Bạn có thể giữ nguyên cấu hình mặc định trong `.env` vì nó đã khớp với cấu hình trong `docker-compose.yml`)*

### 3. Cài đặt thư viện và Chạy Backend
```bash
# Cài đặt các packages
npm install

# Khởi chạy server ở môi trường Dev
npm run start:dev
```

Server sẽ khởi chạy tại cổng **3000**. Swagger API Document có thể xem tại: `http://localhost:3000/api`

---

## 👥 Seed Data & Tài khoản Test

Để có các dữ liệu mẫu (Post, View, Comment, Review) và tài khoản, chạy lệnh seed:

```bash
# Chạy script sinh dữ liệu lúc server đang được bật
npm run seed
```

**Danh sách các tài khoản Seeded:**
Tất cả các tài khoản mặc định dùng chung mật khẩu: `Password@123`

| Vai trò | Email đăng nhập |
| --- | --- |
| Admin | `admin@locationshared.com` |
| User | `hoa@example.com` |
| User | `minh@example.com` |
| User | `lan@example.com` |

Bạn có thể dùng tài khoản `admin@locationshared.com` làm Default Data thử nghiệm ngay trên giao diện Swagger.
