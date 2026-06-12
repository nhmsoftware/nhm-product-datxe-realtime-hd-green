# Sử dụng Node.js 20 bản Alpine để tối ưu dung lượng
FROM node:20-alpine

# Thiết lập thư mục làm việc
WORKDIR /app

# Sao chép package.json và package-lock.json (nếu có) trước để tận dụng Docker cache
COPY package*.json ./

# Cài đặt các phụ thuộc (dependencies)
# Dùng --omit=dev để chỉ cài những library cần thiết cho production
RUN npm install --omit=dev

# Sao chép toàn bộ mã nguồn vào container
COPY . .

# Mở cổng 3001 (cổng mặc định của service realtime)
EXPOSE 3001

# Lệnh khởi chạy ứng dụng
CMD ["npm", "start"]
